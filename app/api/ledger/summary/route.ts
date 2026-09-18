import { NextResponse } from 'next/server'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import { fromMinorUnits } from '@/lib/journal'
import { summarizeByAccount } from '@/lib/ledger'
import { loadAccountRefs, loadPostedLines } from '@/lib/api/ledger-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/ledger/summary?clientId&periodEnd — neraca saldo ringkas: total debit,
// total kredit, dan saldo SETIAP akun sampai tanggal itu.
//
// Gerbangnya sama dengan /api/ledger (requireAkunting) — ini data yang sama,
// dijumlahkan. Gerbang yang berbeda untuk dua tampilan dari satu sumber adalah
// gerbang yang lebih longgar dari keduanya.
//
// Tidak ada periodStart: neraca saldo menurut definisinya adalah keadaan pada
// SATU tanggal, bukan mutasi dalam rentang.
export async function GET(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!isValidYmd(periodEnd)) {
    return NextResponse.json(
      { error: 'Tanggal acuan tidak valid (format YYYY-MM-DD).' },
      { status: 400 }
    )
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [accounts, lines] = await Promise.all([
    loadAccountRefs(clientId),
    loadPostedLines({ clientId, periodEnd }),
  ])

  const ringkasan = summarizeByAccount(lines, accounts)

  // Total D dan total K dijumlahkan dari hasil yang SAMA dengan yang ditampilkan
  // — bukan dari query agregat terpisah. Dua sumber untuk angka yang seharusnya
  // sama persis adalah cara paling mudah membuat total tidak cocok dengan
  // rinciannya, dan "totalnya beda dengan penjumlahan barisnya" adalah laporan
  // keuangan yang tidak bisa dipertahankan di depan klien.
  let totalDebit = 0
  let totalKredit = 0
  for (const r of ringkasan) {
    totalDebit += r.debit
    totalKredit += r.kredit
  }

  return NextResponse.json({
    periodEnd,
    count: ringkasan.length,
    totalDebit: fromMinorUnits(totalDebit),
    totalKredit: fromMinorUnits(totalKredit),
    seimbang: totalDebit === totalKredit,
    accounts: ringkasan.map(r => ({
      id: r.akun.id,
      kode: r.akun.kode,
      nama: r.akun.nama,
      posisi: r.akun.posisi,
      debit: fromMinorUnits(r.debit),
      kredit: fromMinorUnits(r.kredit),
      saldo: fromMinorUnits(r.saldo),
    })),
  })
}
