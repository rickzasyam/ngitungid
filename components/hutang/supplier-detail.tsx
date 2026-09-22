'use client'

// Rincian hutang satu supplier — isi baris yang ter-expand di tabel /hutang.
//
// ══ MENJAWAB "KENAPA SISANYA SEKIAN" ═════════════════════════════════════
// Tiap invoice ditampilkan bersama cicilan turunannya DAN pembayaran yang
// teralokasi ke sana. Tanpa keduanya berdampingan, satu-satunya cara menjawab
// pertanyaan itu adalah membuka modul Mutasi Kas dan mencocokkan sendiri —
// dan orang yang harus mencocokkan sendiri akan berhenti mempercayai angkanya.

import { AlertTriangle, Loader2, Pin } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { fmtTanggal } from '@/components/jurnal/journal-detail'

export interface CicilanDetail {
  urutan: number
  tanggal: string
  nominal: string
  tertutup: string
  sisa: string
  lunas: boolean
  dipakuManual: boolean
}

export interface PembayaranDetail {
  allocationId: string
  mutationId: string
  tanggal: string
  keterangan: string | null
  nominal: string
  terminUrutan: number | null
}

export interface InvoiceDetail {
  id: string
  noInvoice: string | null
  tanggal: string
  jatuhTempoAkhir: string | null
  jumlahTermin: number
  total: string
  sisa: string
  cicilan: CicilanDetail[]
  pembayaran: PembayaranDetail[]
  pakuYatim: { terminUrutan: number; nominal: string }[]
}

export function SupplierDetail({
  invoices,
  loading,
}: {
  invoices: InvoiceDetail[] | null
  loading: boolean
}) {
  const { rupiah } = useRupiah()

  if (loading || !invoices) {
    return (
      <div className="flex items-center gap-2 px-4 py-4" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Memuat rincian…</span>
      </div>
    )
  }

  if (invoices.length === 0) {
    return (
      <p className="px-4 py-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Supplier ini tidak punya invoice kredit.
      </p>
    )
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {invoices.map(inv => (
        <div key={inv.id} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0', background: 'white' }}>
          <div
            className="px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: '#fafafa', borderBottom: '1px solid #ececec' }}
          >
            <div>
              <p className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {inv.noInvoice ?? '(tanpa nomor)'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {fmtTanggal(inv.tanggal)} · {inv.jumlahTermin} cicilan
                {inv.jatuhTempoAkhir ? ` · jatuh tempo akhir ${fmtTanggal(inv.jatuhTempoAkhir)}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Sisa dari {rupiah(Number(inv.total))}
              </p>
              <p
                className="text-sm font-bold"
                style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}
              >
                {rupiah(Number(inv.sisa))}
              </p>
            </div>
          </div>

          {/* Paku yatim — ditampilkan, bukan ditelan (D40). */}
          {inv.pakuYatim.length > 0 && (
            <div
              role="note"
              className="px-3.5 py-2.5 flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                borderBottom: '1px solid #ececec',
              }}
            >
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
              />
              <p className="text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                {inv.pakuYatim.length === 1 ? 'Satu pembayaran' : `${inv.pakuYatim.length} pembayaran`} dipaku ke
                cicilan yang sudah tidak ada (
                {inv.pakuYatim.map(p => `ke-${p.terminUrutan}`).join(', ')}) — kemungkinan jumlah termin invoicenya
                diubah setelah pembayarannya dialokasikan. Pembayarannya <strong>tetap terhitung</strong>, dibagi
                mengikuti urutan cicilan.
              </p>
            </div>
          )}

          {inv.cicilan.length > 0 ? (
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <caption className="sr-only">Cicilan invoice {inv.noInvoice ?? '(tanpa nomor)'}</caption>
              <thead>
                <tr>
                  <th scope="col" style={th}>Cicilan</th>
                  <th scope="col" style={th}>Jatuh tempo</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Nominal</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Tertutup</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Sisa</th>
                </tr>
              </thead>
              <tbody>
                {inv.cicilan.map(c => (
                  <tr key={c.urutan} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={td}>
                      ke-{c.urutan}
                      {c.dipakuManual && (
                        <span
                          className="ml-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                          style={{
                            background: 'color-mix(in srgb, var(--color-accent-secondary) 30%, white)',
                            color: 'var(--color-text-primary)',
                          }}
                          title="Ada pembayaran yang dipaku manual ke cicilan ini — menyimpang dari FIFO."
                        >
                          <Pin className="w-3 h-3" /> dipaku
                        </span>
                      )}
                    </td>
                    <td style={td}>{fmtTanggal(c.tanggal)}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {rupiah(Number(c.nominal))}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(c.tertutup) > 0 ? rupiah(Number(c.tertutup)) : '—'}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: c.lunas ? '#2f6d2a' : 'var(--color-text-primary)',
                        fontWeight: c.lunas ? 600 : 400,
                      }}
                    >
                      {c.lunas ? 'lunas' : rupiah(Number(c.sisa))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-3.5 py-2.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Invoice ini belum punya tanggal jatuh tempo akhir, jadi jadwal cicilannya tidak bisa diturunkan.
            </p>
          )}

          {/* Pembayaran yang teralokasi — menjawab "kenapa sisanya sekian". */}
          <div className="px-3.5 py-2.5" style={{ borderTop: '1px solid #ececec', background: '#fcfcfc' }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Pembayaran teralokasi
            </p>
            {inv.pembayaran.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Belum ada pembayaran yang dialokasikan ke invoice ini.
              </p>
            ) : (
              <ul className="flex flex-col gap-1" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {inv.pembayaran.map(p => (
                  <li
                    key={p.allocationId}
                    className="text-[11px] flex flex-wrap items-baseline gap-x-1.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {rupiah(Number(p.nominal))}
                    </span>
                    <span>· {fmtTanggal(p.tanggal)}</span>
                    {p.keterangan && <span>· {p.keterangan}</span>}
                    <span>
                      ·{' '}
                      {p.terminUrutan === null
                        ? 'otomatis (FIFO)'
                        : `dipaku ke cicilan ke-${p.terminUrutan}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
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
