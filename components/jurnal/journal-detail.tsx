'use client'

// Rincian baris satu jurnal — isi baris yang ter-expand di tabel /jurnal.
// Dipisah dari halamannya supaya page.tsx tetap soal daftar & aksi, bukan soal
// tata letak tabel bersarang.

import { AlertTriangle, History, Loader2 } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { computeTotals, labelEvent, TANPA_NO_BUKTI } from '@/lib/journal'

export interface JournalLineRow {
  id: string
  masterCoaId: string
  kode: string
  nama: string
  debit: string
  kredit: string
  keterangan: string | null
  lineOrder: number
  /** F1. Opsional supaya respons lama tetap terbaca. */
  supplierId?: string | null
  supplierNama?: string | null
}

export interface JournalEventRow {
  id: string
  event: string
  catatan: string | null
  at: string
  userName: string | null
}

export interface JournalRefRow {
  id: string
  noBukti: string | null
  tanggal: string
  status?: string
}

export interface JournalDetailData {
  id: string
  tanggal: string
  noBukti: string | null
  keterangan: string | null
  createdByName: string
  createdAt: string
  lines: JournalLineRow[]
  // ── Fase 2. Opsional supaya komponen ini tetap bisa membaca respons lama
  //    (dan supaya tidak ada layar kosong kalau salah satu query gagal).
  postedAt?: string | null
  postedByName?: string | null
  events?: JournalEventRow[]
  reversals?: JournalRefRow[]
  reversedBy?: JournalRefRow | null
  reversalOf?: JournalRefRow | null
  /** Mitigasi (c) D42 — diturunkan dari riwayat, tidak disimpan. */
  diubahSetelahPosting?: boolean
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
            Rincian baris jurnal {detail.noBukti ?? TANPA_NO_BUKTI}
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
                  {l.supplierNama && (
                    <span
                      className="ml-1.5 rounded-full px-2 py-0.5 text-[10.5px]"
                      style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }}
                      title="Supplier yang ditandai pada baris hutang ini"
                    >
                      {l.supplierNama}
                    </span>
                  )}
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
        {detail.postedAt && (
          <>
            {' · Diposting oleh '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {detail.postedByName ?? '—'}
            </strong>
            {' · '}
            {fmtWaktu(detail.postedAt)}
          </>
        )}
      </p>

      {/* Keterkaitan asli ↔ pembalik. Draf pembalik DITAMPILKAN terpisah: ia
          belum membalik apa pun, dan menyembunyikannya membuat orang membuat
          draf kedua tanpa tahu yang pertama masih menunggu diposting. */}
      {detail.diubahSetelahPosting && (
        <div
          role="note"
          className="mt-2 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
          style={{
            background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
            border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
          }}
        >
          <AlertTriangle
            className="w-4 h-4 flex-shrink-0 mt-0.5"
            style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
          />
          <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
            <strong>Jurnal ini diubah setelah diposting.</strong> Angka yang pernah dilaporkan dari
            jurnal ini bisa berbeda dari yang tampil sekarang — perubahannya tercatat lengkap di
            Riwayat di bawah.
          </p>
        </div>
      )}

      {(detail.reversedBy || detail.reversalOf || (detail.reversals?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {detail.reversalOf && (
            <span style={chip} title={`Jurnal aslinya ${fmtTanggal(detail.reversalOf.tanggal)}`}>
              Pembalik dari {detail.reversalOf.noBukti ?? TANPA_NO_BUKTI}
            </span>
          )}
          {detail.reversedBy && (
            <span style={chip} title={`Dibalik pada ${fmtTanggal(detail.reversedBy.tanggal)}`}>
              Dibalik oleh {detail.reversedBy.noBukti ?? TANPA_NO_BUKTI}
            </span>
          )}
          {detail.reversals
            ?.filter(r => r.status === 'draft')
            .map(r => (
              <span key={r.id} style={{ ...chip, opacity: 0.75 }}>
                Draf pembalik {r.noBukti ?? TANPA_NO_BUKTI} — belum diposting
              </span>
            ))}
        </div>
      )}

      {/* Riwayat. Append-only: yang tampil di sini tidak pernah bisa disunting
          dari mana pun di aplikasi. */}
      {detail.events && detail.events.length > 0 && (
        <div className="mt-3">
          <p
            className="flex items-center gap-1.5 text-[11px] font-semibold mb-1.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <History className="w-3.5 h-3.5" /> Riwayat
          </p>
          <ol className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {detail.events.map(e => (
              <li
                key={e.id}
                className="text-[11px] flex flex-wrap items-baseline gap-x-1.5"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {labelEvent(e.event)}
                </span>
                <span>{fmtWaktu(e.at)}</span>
                <span>· {e.userName ?? 'pengguna yang sudah dihapus'}</span>
                {e.catatan && <span>· {e.catatan}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  display: 'inline-block',
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 11,
  fontWeight: 600,
  background: 'color-mix(in srgb, var(--color-accent-secondary) 28%, white)',
  color: 'var(--color-text-primary)',
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
