import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients, masterCoa, masterSupplier } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { isHutangAccount, namaSupplierKey, snapshotSupplier, supplierBerubah, type SupplierValue } from '@/lib/supplier'
import { parseSupplierWorkbook } from '@/lib/supplier-import'
import { KOLOM_SNAPSHOT_SUPPLIER } from '@/lib/api/supplier-queries'
import { recordSupplierEvents, type SupplierEventInput } from '@/lib/api/audit'
import { resolveUserId } from '@/lib/api/journal-queries'
import { CATATAN_MAX } from '@/lib/audit'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Dikirim di respons impor (dryRun maupun commit) supaya layar konfirmasi bisa
 * menyatakannya sebelum orang menekan lanjut. Aturan ini tidak bisa ditebak
 * dari angka "x diperbarui" saja, dan salah menebaknya mahal ke satu arah:
 * orang mengira kolom yang dikosongkan akan menghapus datanya.
 */
const CATATAN_SEL_KOSONG =
  'Sel kosong pada supplier yang SUDAH ada tidak mengubah nilai lamanya. Untuk mengosongkan sebuah kolom, sunting suppliernya langsung.'

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
    // Seluruh kolom data: `nilai_sebelum` riwayat supplier yang diperbarui.
    db
      .select({ id: masterSupplier.id, ...KOLOM_SNAPSHOT_SUPPLIER })
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
  const byNama = new Map(existing.map(s => [namaSupplierKey(s.nama), s]))
  const akunByKode = new Map(accounts.map(a => [a.kode, a]))

  const catatan = [...(warnings ?? [])]
  const toInsert: typeof rows = []
  const toUpdate: { id: string; nama: string }[] = []
  const nilai: { akunHutangDefaultId: string | null; akunDiputuskan: boolean }[] = []

  for (const r of rows) {
    const ada = byNama.get(namaSupplierKey(r.nama))

    // Kode akun yang tidak dikenal / bukan akun hutang → WARNING. Untuk
    // supplier yang SUDAH ADA, akun lamanya DIPERTAHANKAN: mengosongkannya
    // gara-gara satu kode salah ketik adalah kehilangan data yang tidak diminta
    // siapa pun. Untuk supplier baru tidak ada yang bisa dipertahankan, jadi
    // ia masuk tanpa akun default.
    let akunId: string | null = null
    let akunDiputuskan = false
    if (r.akunHutangKode) {
      const akun = akunByKode.get(r.akunHutangKode)
      if (!akun) {
        catatan.push(
          `"${r.nama}": kode akun "${r.akunHutangKode}" tidak ada di Master COA — ${ada ? 'akun lama dipertahankan' : 'dikosongkan'}.`
        )
      } else if (!isHutangAccount(akun.subKelompok)) {
        catatan.push(
          `"${r.nama}": akun "${r.akunHutangKode}" bukan akun hutang — ${ada ? 'akun lama dipertahankan' : 'dikosongkan'}.`
        )
      } else {
        akunId = akun.id
        akunDiputuskan = true
      }
    }
    nilai.push({ akunHutangDefaultId: akunId, akunDiputuskan })
    if (ada) toUpdate.push({ id: ada.id, nama: r.nama })
    else toInsert.push(r)
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      warnings: catatan,
      note: CATATAN_SEL_KOSONG,
    })
  }

  const now = new Date()
  const statements: BatchItem<'pg'>[] = []
  // Riwayat per supplier yang tersentuh — ditulis dalam SATU INSERT di batch
  // yang sama dengan impornya (P10), jadi impor yang gagal tidak meninggalkan
  // riwayat, dan riwayat tidak pernah hilang dari impor yang berhasil.
  const userId = await resolveUserId(g.user.email)
  const catatanImpor = `Impor berkas "${file.name}"`.slice(0, CATATAN_MAX)
  const riwayat: SupplierEventInput[] = []

  rows.forEach((r, i) => {
    const ada = byNama.get(namaSupplierKey(r.nama))

    if (!ada) {
      // Supplier BARU: sel kosong memang jadi null — tidak ada nilai lama yang
      // bisa dipertahankan. Id dibuat di sini supaya riwayatnya bisa menunjuknya.
      const baru: SupplierValue = {
        nama: r.nama,
        kontak: r.kontak,
        npwp: r.npwp,
        bankNama: r.bankNama,
        bankRekening: r.bankRekening,
        bankAtasNama: r.bankAtasNama,
        akunHutangDefaultId: nilai[i].akunHutangDefaultId,
      }
      const supplierId = randomUUID()
      statements.push(
        db.insert(masterSupplier).values({
          id: supplierId,
          clientId: id,
          nama: baru.nama,
          kontak: baru.kontak,
          npwp: baru.npwp,
          bankNama: baru.bankNama,
          bankRekening: baru.bankRekening,
          bankAtasNama: baru.bankAtasNama,
          akunHutangDefaultId: baru.akunHutangDefaultId,
        })
      )
      riwayat.push({ clientId: id, supplierId, event: 'created', userId, catatan: catatanImpor, nilaiSesudah: baru })
      return
    }

    // Supplier yang SUDAH ADA: hanya field yang TERISI di berkas yang ditulis.
    // Sel kosong berarti "tidak disebut", bukan "kosongkan" — berkas impor
    // lazimnya berisi sebagian kolom saja, dan memperlakukan kolom yang tidak
    // diisi sebagai perintah menghapus akan membuang data yang tidak diminta
    // siapa pun untuk dibuang. Mengosongkan sebuah kolom dilakukan lewat
    // formulir sunting, yang memang menampilkan nilai lamanya lebih dulu.
    const isi: Record<string, unknown> = { nama: r.nama, updatedAt: now }
    if (r.kontak !== null) isi.kontak = r.kontak
    if (r.npwp !== null) isi.npwp = r.npwp
    // Kolom rekening tunduk pada aturan yang SAMA: sel kosong tidak menghapus
    // nomor rekening yang sudah tersimpan.
    if (r.bankNama !== null) isi.bankNama = r.bankNama
    if (r.bankRekening !== null) isi.bankRekening = r.bankRekening
    if (r.bankAtasNama !== null) isi.bankAtasNama = r.bankAtasNama
    if (nilai[i].akunDiputuskan) isi.akunHutangDefaultId = nilai[i].akunHutangDefaultId

    statements.push(db.update(masterSupplier).set(isi).where(eq(masterSupplier.id, ada.id)))

    const sebelum = snapshotSupplier(ada)
    const sesudah = snapshotSupplier({ ...sebelum, ...(isi as Partial<SupplierValue>) })
    if (supplierBerubah(sebelum, sesudah)) {
      riwayat.push({ clientId: id, supplierId: ada.id, event: 'updated', userId, catatan: catatanImpor, nilaiSebelum: sebelum, nilaiSesudah: sesudah })
    }
  })

  const insertRiwayat = recordSupplierEvents(riwayat)
  if (insertRiwayat) statements.push(insertRiwayat)

  if (statements.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, warnings: catatan, note: CATATAN_SEL_KOSONG })
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
    note: CATATAN_SEL_KOSONG,
  })
}
