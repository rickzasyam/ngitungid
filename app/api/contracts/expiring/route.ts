import { NextResponse } from 'next/server'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contracts } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { expiringWindow, isValidYmd } from '@/lib/contracts'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/contracts/expiring?clientId=…&hariIni=YYYY-MM-DD
//
// Sumber badge sidebar Kontrak. Mengikuti preseden badge COA Mapping
// (GET /api/reports/list → unmappedCount → sumUnmapped): SQL yang MEMPERSEMPIT,
// modul murni yang MEMUTUSKAN. Yang dikembalikan cuma dua kolom tanggal per
// kontrak yang lolos filter — bukan angka jadi — supaya `countExpiringSoon()`
// di lib/contracts.ts tetap satu-satunya definisi "akan berakhir", dipakai
// sama persis oleh badge sidebar dan badge per baris di /kontrak.
//
// ⚠️ KEMBARAN: predikat WHERE di bawah adalah padanan SQL dari
// contractDisplayStatus(...) === 'akan_berakhir' —
//   sudah mulai   : tanggal_mulai <= hariIni
//   belum berakhir: tanggal_akhir >= hariIni
//   dalam jendela : tanggal_akhir <= hariIni + EXPIRING_SOON_DAYS
// Kalau aturan di lib/contracts.ts berubah, UBAH DI SINI JUGA. Tidak ada yang
// menegakkannya otomatis — sama seperti needsMapping() vs kolom unmappedCount.
// Ambang 7 harinya sendiri TIDAK ditulis di sini: ia datang dari
// expiringWindow(), jadi angkanya hanya hidup di modul murni itu.
//
// `hariIni` DIKIRIM PEMANGGIL, bukan dibaca dari jam server. Vercel berjalan
// UTC sementara penggunanya WIB (UTC+7), jadi selama tujuh jam setiap hari
// "hari ini" versi server adalah kemarin versi pengguna — badge sidebar akan
// berbeda dari badge di baris kontraknya sendiri. Nilainya cuma menggeser
// hitungan badge, jadi tidak ada yang bisa disalahgunakan dengan mengarangnya.
//
// Guard-nya sengaja SAMA dengan GET /api/contracts (requireUser +
// canAccessClientData), bukan canViewContracts: akunting boleh membaca daftar
// kontrak klien yang ia bukukan, dan endpoint ini tidak membuka apa pun yang
// daftar itu belum buka. Yang menahan badge muncul di sidebar akunting adalah
// canViewContracts di sisi UI.
export async function GET(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const hariIni = url.searchParams.get('hariIni') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!isValidYmd(hariIni)) {
    return NextResponse.json({ error: 'hariIni tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { from, to } = expiringWindow(hariIni)

  const rows = await db
    .select({
      tanggalMulai: contracts.tanggalMulai,
      tanggalAkhir: contracts.tanggalAkhir,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.clientId, clientId),
        lte(contracts.tanggalMulai, hariIni),
        gte(contracts.tanggalAkhir, from),
        lte(contracts.tanggalAkhir, to)
      )
    )
    .orderBy(asc(contracts.tanggalAkhir))

  return NextResponse.json({ contracts: rows })
}
