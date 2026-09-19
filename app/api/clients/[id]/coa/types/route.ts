import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients, masterCoa } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { parseCoaWorkbook } from '@/lib/coa-import'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import type { AccountType } from '@/lib/coa/account-type'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024

// POST /api/clients/[id]/coa/types — "Isi tipe akun dari berkas".
//
// ══ NON-DESTRUKTIF, DAN ITU SELURUH ALASANNYA ADA ═════════════════════════
// Route ini HANYA `UPDATE tipe_akun, is_kas` **by kode**. Ia tidak pernah
// menyisipkan baris, tidak pernah menghapus baris, dan tidak pernah menyentuh
// satu pun kolom lain.
//
// Kenapa bukan lewat POST /coa yang sudah ada: itu ganti-massal (DELETE-all +
// INSERT-all) — operasi paling destruktif di aplikasi ini, yang memutus lalu
// menyambung ulang seluruh mapping laporan dan baris jurnal. Memakai jalur itu
// hanya untuk mengisi dua kolom berarti mempertaruhkan seluruh pembukuan klien
// demi perubahan yang, menurut definisinya, tidak mengubah daftar akunnya.
//
// Kode yang tidak ada di Master COA klien **dilaporkan, bukan dibuatkan**.
// Membuatkannya akan membuat route ini diam-diam menjadi jalur impor kedua —
// tanpa validasi kelompok/sub kelompok, dan tanpa re-link apa pun.
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
    return NextResponse.json({ error: 'File Excel tidak ditemukan di field "file".' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Ukuran file melebihi 10MB.' }, { status: 400 })
  }

  const dryRun = form.get('dryRun') === '1'

  // Parser yang SAMA dengan impor COA — bukan parser kedua. Berkasnya memang
  // berkas COA; yang berbeda cuma kolom mana yang dipakai.
  const { rows, errors } = parseCoaWorkbook(await file.arrayBuffer())
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Gagal memproses Excel — perbaiki file lalu upload ulang.', details: errors },
      { status: 400 }
    )
  }

  // Berkas yang sama sekali tidak memuat kedua kolom itu hampir pasti berkas
  // yang salah pilih. Menjalankannya akan "berhasil" dengan nol perubahan, dan
  // pengguna menyimpulkan fiturnya rusak.
  const adaKolom = rows.some(r => r.tipeAkun !== null || r.isKas !== null)
  if (!adaKolom) {
    return NextResponse.json(
      {
        error: 'Berkas tidak memuat kolom "Tipe Akun" maupun "Kas?".',
        details: [
          'Tambahkan salah satu kolom itu, atau ekspor Master COA dulu lewat tombol Ekspor — hasilnya sudah memuat keduanya.',
        ],
      },
      { status: 400 }
    )
  }

  const existing = await db
    .select({
      id: masterCoa.id,
      kode: masterCoa.kode,
      tipeAkun: masterCoa.tipeAkun,
      isKas: masterCoa.isKas,
    })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, id))

  const byKode = new Map(existing.map(a => [a.kode, a]))

  type Perubahan = {
    kode: string
    before: { tipeAkun: AccountType | null; isKas: boolean }
    after: { tipeAkun: AccountType | null; isKas: boolean }
  }

  const updated: Perubahan[] = []
  const unknownKode: string[] = []
  let unchanged = 0

  for (const r of rows) {
    const row = byKode.get(r.kode)
    if (!row) {
      unknownKode.push(r.kode)
      continue
    }
    // Sel KOSONG tidak menghapus — aturan yang sama dengan impor supplier dan
    // dengan carryAccountTypes. Berkas yang cuma mengisi sebagian kolom tidak
    // boleh mengosongkan sisanya.
    const tipeAkun = r.tipeAkun ?? row.tipeAkun
    const isKas = r.isKas ?? row.isKas

    if (tipeAkun === row.tipeAkun && isKas === row.isKas) {
      unchanged++
      continue
    }
    updated.push({
      kode: r.kode,
      before: { tipeAkun: row.tipeAkun, isKas: row.isKas },
      after: { tipeAkun, isKas },
    })
  }

  // Kode yang muncul dua kali di berkas sudah di-suffix parser (-2, -3, …), jadi
  // daftar unknownKode-nya ikut memuat suffix itu. Dideduplikasi supaya dialog
  // dampak tidak menampilkan kode yang sama berulang.
  const unknownUnik = [...new Set(unknownKode)].sort()

  const ringkasan = {
    updated,
    unknownKode: unknownUnik,
    unchanged,
    totalBaris: rows.length,
  }

  if (dryRun) return NextResponse.json({ dryRun: true, ...ringkasan })

  if (updated.length === 0) {
    return NextResponse.json({ dryRun: false, ...ringkasan, applied: 0 })
  }

  // Satu batch. UPDATE dikelompokkan per (tipe, kas) supaya jumlah statement
  // tidak ikut sebanyak baris COA: ratusan statement dalam satu batch adalah
  // satu permintaan HTTP raksasa yang tidak perlu.
  const groups = new Map<string, { tipeAkun: AccountType | null; isKas: boolean; kode: string[] }>()
  for (const u of updated) {
    const key = `${u.after.tipeAkun ?? ''}|${u.after.isKas}`
    const g0 = groups.get(key)
    if (g0) g0.kode.push(u.kode)
    else groups.set(key, { tipeAkun: u.after.tipeAkun, isKas: u.after.isKas, kode: [u.kode] })
  }

  const now = new Date()
  const statements: BatchItem<'pg'>[] = [...groups.values()].map(gr =>
    db
      .update(masterCoa)
      .set({ tipeAkun: gr.tipeAkun, isKas: gr.isKas, updatedAt: now })
      .where(and(eq(masterCoa.clientId, id), inArray(masterCoa.kode, gr.kode)))
  )

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan tipe akun. Coba lagi.')
  }

  return NextResponse.json({ dryRun: false, ...ringkasan, applied: updated.length })
}
