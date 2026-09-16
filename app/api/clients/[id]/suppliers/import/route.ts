import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients, masterCoa, masterSupplier } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { isHutangAccount } from '@/lib/supplier'
import { parseSupplierWorkbook } from '@/lib/supplier-import'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024

// POST /api/clients/[id]/suppliers/import — multipart { file, dryRun? }
//
// ══ UPSERT BY NAMA (D8), bukan replace-all ════════════════════════════════
// Beda mendasar dari impor Master COA yang DELETE-all + INSERT-all. Supplier
// bukan klasifikasi yang harus konsisten satu sama lain — ia daftar rekanan
// yang tumbuh sedikit demi sedikit. Berkas impor lazimnya berisi TAMBAHAN,
// bukan seluruh daftar, jadi replace-all akan menghapus supplier yang kebetulan
// tidak ikut di berkas terakhir.
//
// Akibatnya juga: impor ini TIDAK PERNAH MENGHAPUS apa pun. Supplier yang tidak
// ada di berkas dibiarkan apa adanya, dan menghapus dilakukan satu per satu
// lewat tombol hapus yang punya konfirmasinya sendiri.
//
// `dryRun=1` menghitung dampaknya tanpa menulis — sumber angka layar
// konfirmasi. Flag pada route yang SAMA, bukan endpoint terpisah, supaya
// pratinjau dan eksekusi memakai parser serta aturan pencocokan yang persis
// sama (pola yang sudah dipakai impor COA).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body harus multipart/form-data.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File tidak ditemukan di field "file".' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Ukuran file melebihi 10MB.' }, { status: 400 })
  }

  const dryRun = form.get('dryRun') === '1'

  const { rows, errors, warnings } = parseSupplierWorkbook(await file.arrayBuffer())
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Gagal memproses file — perbaiki lalu unggah ulang.', details: errors },
      { status: 400 }
    )
  }

  // ── Baca semua yang dibutuhkan SEBELUM menulis ──────────────────────
  const [existing, accounts] = await Promise.all([
    db
      .select({ id: masterSupplier.id, nama: masterSupplier.nama })
      .from(masterSupplier)
      .where(eq(masterSupplier.clientId, id)),
    db
      .select({ id: masterCoa.id, kode: masterCoa.kode, subKelompok: masterCoa.subKelompok })
      .from(masterCoa)
      .where(eq(masterCoa.clientId, id))
      .orderBy(asc(masterCoa.kode)),
  ])

  // Pencocokan nama TIDAK peduli besar-kecil huruf, sama seperti pemeriksaan
  // dobel di parser. Kalau di sini case-sensitive sementara di parser tidak,
  // "Toko Jaya" dan "TOKO JAYA" akan lolos parser sebagai satu baris lalu
  // membentur unique constraint di DB.
  const byNama = new Map(existing.map(s => [s.nama.toLowerCase(), s]))
  const akunByKode = new Map(accounts.map(a => [a.kode, a]))

  const catatan = [...(warnings ?? [])]
  const toInsert: typeof rows = []
  const toUpdate: { id: string; nama: string }[] = []
  const nilai: { akunHutangDefaultId: string | null }[] = []

  for (const r of rows) {
    // Kode akun yang tidak dikenal / bukan akun hutang → WARNING, supplier
    // tetap masuk tanpa akun default. Lihat catatan di lib/supplier-import.ts:
    // menggagalkan seluruh berkas karena satu kode salah ketik memaksa orang
    // mengulang dari awal.
    let akunId: string | null = null
    if (r.akunHutangKode) {
      const akun = akunByKode.get(r.akunHutangKode)
      if (!akun) {
        catatan.push(`"${r.nama}": kode akun "${r.akunHutangKode}" tidak ada di Master COA — dikosongkan.`)
      } else if (!isHutangAccount(akun.subKelompok)) {
        catatan.push(`"${r.nama}": akun "${r.akunHutangKode}" bukan akun hutang — dikosongkan.`)
      } else {
        akunId = akun.id
      }
    }
    nilai.push({ akunHutangDefaultId: akunId })

    const ada = byNama.get(r.nama.toLowerCase())
    if (ada) toUpdate.push({ id: ada.id, nama: r.nama })
    else toInsert.push(r)
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      warnings: catatan,
    })
  }

  const now = new Date()
  const statements: BatchItem<'pg'>[] = []

  rows.forEach((r, i) => {
    const ada = byNama.get(r.nama.toLowerCase())
    const isi = {
      nama: r.nama,
      kontak: r.kontak,
      npwp: r.npwp,
      terminPembayaran: r.terminPembayaran,
      akunHutangDefaultId: nilai[i].akunHutangDefaultId,
    }
    if (ada) {
      statements.push(
        db.update(masterSupplier).set({ ...isi, updatedAt: now }).where(eq(masterSupplier.id, ada.id))
      )
    } else {
      statements.push(db.insert(masterSupplier).values({ clientId: id, ...isi }))
    }
  })

  if (statements.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, warnings: catatan })
  }

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan impor supplier. Coba lagi.')
  }

  return NextResponse.json({
    inserted: toInsert.length,
    updated: toUpdate.length,
    warnings: catatan,
  })
}
