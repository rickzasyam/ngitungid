import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contracts } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/contracts/badge?clientId=… — bahan badge sidebar Kontrak.
//
// Mengembalikan TANGGAL seluruh kontrak klien ini. Tiga kolom, tanpa nominal,
// tanpa nama dokumen, dan tentu tanpa byte dokumen.
//
// ══ KENAPA TIDAK DISARING DI SQL ═══════════════════════════════════════════
// Dulu (route /expiring) query ini menyaring ke jendela H-7 dan reducer tinggal
// menghitung. Aturan badge sekarang juga memuat "sudah berakhir TANPA
// pengganti", dan pengganti bisa MULAI kapan saja — termasuk kontrak yang baru
// berlaku tahun depan. Jendela tanggal apa pun akan membuang justru baris yang
// menentukan apakah sebuah kontrak kedaluwarsa sudah diperpanjang, sehingga
// kontrak yang sudah diperpanjang akan terus dihitung selamanya.
//
// Jadi pembagiannya berubah dengan sadar: SQL cuma mempersempit ke KLIEN, dan
// SELURUH keputusan ada di countNeedsAttention() (lib/contracts.ts). Efek
// sampingnya justru menyenangkan — tidak ada lagi predikat kembar antara SQL
// dan modul murni yang harus dijaga tetap sinkron (bandingkan needsMapping()
// vs kolom unmappedCount di /api/reports/list, yang masih punya kembaran).
//
// Volumenya tidak jadi soal: kontrak 1-2 per klien per TAHUN (lihat keputusan
// bytea 2026-08-06), jadi ini puluhan baris dua-kolom, bukan ribuan.
//
// `hariIni` TIDAK lagi ikut sebagai parameter: tidak ada satu pun logika
// tanggal yang tersisa di server. Jam yang dipakai badge tetap milik klien
// (browser), dibaca sekali lewat todayYmd() — keputusan 2026-08-09, alasannya
// Vercel berjalan UTC sementara penggunanya WIB.
//
// Guard SAMA dengan GET /api/contracts (requireUser + canAccessClientData),
// bukan canViewContracts: akunting boleh membaca daftar kontrak klien yang ia
// bukukan, dan endpoint ini tidak membuka apa pun yang daftar itu belum buka.
// Yang menahan badge muncul di sidebar akunting adalah canViewContracts di UI.
export async function GET(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const clientId = new URL(req.url).searchParams.get('clientId') ?? ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      clientId: contracts.clientId,
      tanggalMulai: contracts.tanggalMulai,
      tanggalAkhir: contracts.tanggalAkhir,
    })
    .from(contracts)
    .where(eq(contracts.clientId, clientId))
    .orderBy(asc(contracts.tanggalAkhir))

  return NextResponse.json({ contracts: rows })
}
