import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { layanan } from '@/lib/db/schema'
import { requireInternal, requireCommercial } from '@/lib/api/guards'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { validateLayanan } from '@/lib/layanan'

export const runtime = 'nodejs'

const cols = {
  id: layanan.id,
  nama: layanan.nama,
  deskripsi: layanan.deskripsi,
  aktif: layanan.aktif,
}

// GET /api/layanan — daftar master layanan (GLOBAL, bukan per-klien).
//
// requireInternal: owner, akunting, DAN finance boleh MEMBACA. Akunting perlu
// melihat katalog untuk memahami kontrak klien yang sedang ia bukukan, ia hanya
// tidak boleh mengubahnya.
//
// Mengembalikan yang aktif MAUPUN tidak — penyaringan untuk picker kontrak
// dilakukan di `selectableLayanan()` (lib/layanan.ts), bukan di sini. Kalau
// endpoint ini menyaring, kontrak lama yang memakai layanan nonaktif tidak akan
// bisa menampilkan namanya.
export async function GET() {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const rows = await db.select(cols).from(layanan).orderBy(asc(layanan.nama))
  return NextResponse.json({ layanan: rows })
}

// POST /api/layanan — buat layanan baru. owner + finance SAJA.
export async function POST(req: Request) {
  const g = await requireCommercial()
  if ('error' in g) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }

  const check = validateLayanan(body as Record<string, unknown>)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  try {
    const [created] = await db
      .insert(layanan)
      .values({ nama: check.nama, deskripsi: check.deskripsi, aktif: check.aktif })
      .returning(cols)
    return NextResponse.json({ layanan: created }, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Layanan "${check.nama}" sudah ada.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan layanan. Coba lagi.')
  }
}

// SENGAJA TIDAK ADA DELETE. Kontrak mencatat layanan apa yang dijual;
// menghapus satu baris akan melubangi setiap kontrak lama yang memuatnya.
// Nonaktifkan lewat PATCH { aktif: false } — itu menyembunyikannya dari picker
// tanpa menyentuh riwayat. Jangan tambahkan DELETE "demi kelengkapan".
