'use client'

// Rincian baris satu jurnal — isi baris yang ter-expand di tabel /jurnal.
// Dipisah dari halamannya supaya page.tsx tetap soal daftar & aksi, bukan soal
// tata letak tabel bersarang.

import { Loader2 } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { computeTotals } from '@/lib/journal'

export interface JournalLineRow {
  id: string
  masterCoaId: string
  kode: string
  nama: string
  debit: string
  kredit: string
  keterangan: string | null
  lineOrder: number
}

export interface JournalDetailData {
  id: string
  tanggal: string
  noBukti: string
  keterangan: string
  createdByName: string
  createdAt: string
  lines: JournalLineRow[]
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** 'YYYY-MM-DD' → '15 Sep 2026'. Dipecah sebagai STRING, tanpa objek Date (P2). */
export function fmtTanggal(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}

/** Timestamp ISO dari server → '15 Sep 2026, 14:30'. Ini JAM, bukan tanggal
 *  kalender, jadi Date memang alat yang benar di sini — beda dari `tanggal`. */
function fmtWaktu(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const jam = String(dt.getHours()).padStart(2, '0')
  const menit = String(dt.getMinutes()).padStart(2, '0')
  return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}, ${jam}:${menit}`
}

export function JournalDetail({
  detail,
  loading,
}: {
  detail: JournalDetailData | null
  loading: boolean
}) {
  const { rupiah } = useRupiah()

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-4"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Memuat rincian…</span>
      </div>
    )
  }

  if (!detail) {
    return (
      <p className="px-4 py-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Rincian jurnal tidak bisa dimuat.
      </p>
    )
  }

  const totals = computeTotals(detail.lines)

  return (
    <div className="px-4 py-3">
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0', background: 'white' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <caption className="sr-only">
            Rincian baris jurnal {detail.noBukti}
          </caption>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th scope="col" style={th}>Akun</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Debit</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Kredit</th>
              <th scope="col" style={th}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map(l => (
              <tr key={l.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                <td style={td}>
                  <span
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded-full mr-1.5"
                    style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
                  >
                    {l.kode}
                  </span>
                  {l.nama}
                </td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(l.debit) > 0 ? rupiah(Number(l.debit)) : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(l.kredit) > 0 ? rupiah(Number(l.kredit)) : '—'}
                </td>
                <td style={{ ...td, color: 'var(--color-text-muted)' }}>{l.keterangan ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
              <th scope="row" style={{ ...td, fontWeight: 700 }}>Total</th>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {rupiah(totals.debit / 100)}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {rupiah(totals.kredit / 100)}
              </td>
              <td style={td} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
        Dibuat oleh <strong style={{ color: 'var(--color-text-primary)' }}>{detail.createdByName}</strong>
        {' · '}
        {fmtWaktu(detail.createdAt)}
      </p>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const td: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12.5,
  color: 'var(--color-text-primary)',
}
