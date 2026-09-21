import { NextResponse } from 'next/server'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import { fromMinorUnits } from '@/lib/journal'
import { computeRunningBalance } from '@/lib/ledger'
import { loadAccountRef, loadPostedLines } from '@/lib/api/ledger-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/ledger?clientId&masterCoaId&periodStart&periodEnd — buku besar satu
// akun beserta saldo berjalannya.
//
// ══ requireAkunting, BUKAN requireUser ════════════════════════════════════
// Keputusan Ricko 2026-09-18, menyimpang dari MP §5.A yang menulis requireUser.
// `/buku-besar` staffOnly persis seperti `/jurnal` (D3), dan buku besar adalah
// jurnal yang sama dibaca per akun — API yang lebih longgar dari halamannya
// membuat gerbang halaman itu jadi kosmetik. canAccessClientData tetap
// dipanggil: batas antar-klien dinyatakan, bukan diwarisi dari daftar role.
export async function GET(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const masterCoaId = url.searchParams.get('masterCoaId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!UUID_RE.test(masterCoaId)) {
    return NextResponse.json({ error: 'masterCoaId tidak valid.' }, { status: 400 })
  }
  if (!isValidYmd(periodStart) || !isValidYmd(periodEnd)) {
    return NextResponse.json({ error: 'Periode tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }
  // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis (lib/contracts.ts).
  if (periodEnd < periodStart) {
    return NextResponse.json(
      { error: 'Periode akhir tidak boleh sebelum periode mulai.' },
      { status: 400 }
    )
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Akun dicari DENGAN clientId, bukan dicari lalu dibandingkan: id akun milik
  // klien lain tidak boleh membedakan "tidak ada" dari "bukan punyamu".
  const account = await loadAccountRef(clientId, masterCoaId)
  if (!account) {
    return NextResponse.json(
      { error: 'Akun tidak ditemukan pada Master COA klien ini.' },
      { status: 404 }
    )
  }

  const semua = await loadPostedLines({ clientId, masterCoaId, periodEnd })
  const openingLines = semua.filter(l => l.tanggal < periodStart)
  const lines = semua.filter(l => l.tanggal >= periodStart)

  const { opening, rows, closing } = computeRunningBalance({
    lines,
    openingLines,
    posisi: account.posisi,
  })

  // Sen → string 2 desimal HANYA di ujung, sama seperti route lain. debit/kredit
  // sudah string dari driver dan dilewatkan apa adanya; yang dikonversi cuma
  // saldo, karena saldolah satu-satunya angka yang dihitung di JS.
  return NextResponse.json({
    account,
    periodStart,
    periodEnd,
    opening: fromMinorUnits(opening),
    closing: fromMinorUnits(closing),
    count: rows.length,
    rows: rows.map(r => ({
      id: r.id,
      journalId: r.journalId,
      tanggal: r.tanggal,
      noBukti: r.noBukti,
      keterangan: r.keterangan,
      debit: r.debit,
      kredit: r.kredit,
      saldo: fromMinorUnits(r.saldo),
      diubahSetelahPosting: r.diubahSetelahPosting,
    })),
  })
}
