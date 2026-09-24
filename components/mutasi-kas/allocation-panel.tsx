'use client'

// Panel alokasi satu mutasi — isi baris yang ter-expand di tabel /mutasi-kas.
//
// ══ SISA SELALU TERLIHAT ═════════════════════════════════════════════════
// Angka yang paling menentukan saat mengalokasikan adalah "berapa yang belum
// dialokasikan", dan ia berubah tiap kali satu alokasi ditambah atau dihapus.
// Menyembunyikannya di balik penutup berarti akunting menghitung sendiri —
// dan hitungannya akan berbeda dari server, yang menolak tanpa ia mengerti
// kenapa.
//
// ══ PEMILIH CICILAN BAWAANNYA "OTOMATIS (FIFO)" (D40) ════════════════════
// Nol input untuk kasus lazim. Memilih cicilan tertentu adalah PENIMPAAN, dan
// alokasi yang menimpa diberi tanda supaya terlihat menyimpang dari FIFO —
// bukan karena ia salah, tapi karena ia keputusan seseorang yang harus bisa
// ditelusuri saat angka umur hutang dipertanyakan.

import { useEffect, useMemo, useState } from 'react'
import { Link2, Loader2, Pin, Trash2 } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import { GalatNominal, merahBila } from '@/components/ui/galat-nominal'
import { NominalInput } from '@/components/ui/nominal-input'
import { pesanGalatNominal } from '@/lib/nominal'

export interface AlokasiRow {
  id: string
  invoiceId: string
  noInvoice: string | null
  supplierNama: string
  nominal: string
  terminUrutan: number | null
}

export interface InvoiceBersisa {
  id: string
  noInvoice: string | null
  supplierNama: string
  jumlahTermin: number
  sisa: string
  total: string
}

export function AllocationPanel({
  mutationId,
  clientId,
  alokasi,
  sisa,
  status,
  bolehTulis,
  onBerubah,
}: {
  mutationId: string
  clientId: string
  alokasi: AlokasiRow[]
  /** Sisa mutasi yang belum dialokasikan — datang JADI dari server. */
  sisa: string
  status: string
  bolehTulis: boolean
  onBerubah: () => void
}) {
  const { rupiahPersis } = useRupiah()

  const [invoices, setInvoices] = useState<InvoiceBersisa[]>([])
  const [invoiceId, setInvoiceId] = useState('')
  const [nominal, setNominal] = useState('')
  // Parser bersama (lib/nominal.ts) — yang sama dengan route alokasi.
  const galatNominal = pesanGalatNominal(nominal)
  const [terminUrutan, setTerminUrutan] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<string[]>([])

  // Daftar invoice bersisa. Diambil sekali per mutasi yang dibuka: panel ini
  // di-mount ulang tiap kali baris lain di-expand.
  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const qs = new URLSearchParams({
          clientId,
          periodStart: '1900-01-01',
          periodEnd: '2999-12-31',
        })
        const res = await fetch(`/api/purchase-invoices?${qs}`)
        const payload = (await res.json().catch(() => null)) as
          | { invoices?: (InvoiceBersisa & { caraBayar: string })[] }
          | null
        if (batal) return
        setInvoices(
          (payload?.invoices ?? []).filter(i => i.caraBayar === 'kredit' && Number(i.sisa) > 0)
        )
      } catch {
        if (!batal) setInvoices([])
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId])

  const terpilih = invoices.find(i => i.id === invoiceId) ?? null

  const opsiInvoice: StyledOption[] = useMemo(
    () =>
      invoices.map(i => ({
        value: i.id,
        // Diformat rupiah, bukan angka mentah dari DB: yang dibaca akunting
        // saat memilih invoice adalah nominalnya, dan "3630000.00" menuntut ia
        // menghitung digitnya sendiri. PERSIS, bukan dibulatkan (keputusan
        // Ricko di CP-8): sisa 100.000,01 yang tampil "Rp 100.000" membuat
        // alokasi sebesar angka itu meninggalkan satu sen yang tak terlihat.
        label: `${i.noInvoice ?? '(tanpa nomor)'} · sisa ${rupiahPersis(i.sisa)}`,
        badge: i.supplierNama,
      })),
    [invoices, rupiahPersis]
  )

  const opsiTermin: StyledOption[] = useMemo(() => {
    const dasar: StyledOption[] = [{ value: '', label: 'Otomatis (FIFO)', kind: 'placeholder' }]
    if (!terpilih) return dasar
    for (let n = 1; n <= terpilih.jumlahTermin; n++) {
      dasar.push({ value: String(n), label: `Cicilan ke-${n}` })
    }
    return dasar
  }, [terpilih])

  async function tambah() {
    if (!invoiceId || nominal.trim() === '' || galatNominal !== null) return
    setBusy(true)
    setError(null)
    setDetails([])
    try {
      const res = await fetch(`/api/cash-mutations/${mutationId}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          nominal,
          terminUrutan: terminUrutan === '' ? null : Number(terminUrutan),
        }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[] }
        | null
      if (!res.ok) {
        setError(payload?.error ?? 'Gagal menyimpan alokasi.')
        setDetails(payload?.details ?? [])
        return
      }
      setInvoiceId('')
      setNominal('')
      setTerminUrutan('')
      onBerubah()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  async function hapus(allocId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/cash-mutations/${mutationId}/allocations/${allocId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setError(payload?.error ?? 'Gagal menghapus alokasi.')
        return
      }
      onBerubah()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  const sisaAngka = Number(sisa)

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      {/* Sisa — selalu terlihat, tidak di balik penutup. */}
      <div
        className="rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: '#fafafa', border: '1px solid #ececec' }}
      >
        <div>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Belum dialokasikan
          </p>
          <p
            className="text-sm font-bold"
            style={{
              color: sisaAngka < 0 ? 'var(--color-accent-critical)' : 'var(--color-text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rupiahPersis(sisa)}
          </p>
        </div>
        <span className="text-[11px] rounded-full px-2.5 py-1" style={{ background: 'white', border: '1px solid #e5e7eb', color: 'var(--color-text-muted)' }}>
          status: {status}
        </span>
      </div>

      {sisaAngka < 0 && (
        <p role="alert" className="text-[11px]" style={{ color: 'var(--color-accent-critical)' }}>
          Alokasi melebihi nominal mutasinya. Angka ini sengaja tidak dibulatkan ke nol — kelebihan
          alokasi harus terlihat, bukan disembunyikan.
        </p>
      )}

      {/* Daftar alokasi */}
      {alokasi.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0', background: 'white' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <caption className="sr-only">Alokasi pembayaran mutasi ini</caption>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th scope="col" style={th}>Invoice</th>
                <th scope="col" style={th}>Cicilan</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Nominal</th>
                <th scope="col" style={{ ...th, width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {alokasi.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                  <td style={td}>
                    <span className="font-medium">{a.noInvoice ?? '(tanpa nomor)'}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}> · {a.supplierNama}</span>
                  </td>
                  <td style={td}>
                    {a.terminUrutan === null ? (
                      <span style={{ color: 'var(--color-text-muted)' }}>Otomatis (FIFO)</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: 'color-mix(in srgb, var(--color-accent-secondary) 30%, white)', color: 'var(--color-text-primary)' }}
                        title="Dipaku manual ke cicilan ini — menyimpang dari FIFO."
                      >
                        <Pin className="w-3 h-3" /> ke-{a.terminUrutan}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {rupiahPersis(a.nominal)}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {bolehTulis && (
                      <button
                        type="button"
                        onClick={() => void hapus(a.id)}
                        disabled={busy}
                        aria-label={`Hapus alokasi ke invoice ${a.noInvoice ?? '(tanpa nomor)'}`}
                        className="inline-flex items-center justify-center rounded-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                        style={{ width: 32, height: 32, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl px-3.5 py-2.5" style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)', border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{error}</p>
          {details.length > 0 && (
            <ul className="text-[11px] mt-1 flex flex-col gap-0.5" style={{ color: 'var(--color-text-muted)', margin: 0, paddingLeft: 16 }}>
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tambah alokasi */}
      {bolehTulis && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ border: '1px dashed #dcdcdc' }}>
          <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Alokasikan ke invoice hutang
          </p>
          {invoices.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Tidak ada invoice kredit bersisa pada klien ini.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <StyledSelect
                    options={opsiInvoice}
                    value={invoiceId}
                    onChange={v => setInvoiceId(v)}
                    placeholder="Pilih invoice…"
                    searchable
                    searchPlaceholder="Cari nomor invoice atau supplier…"
                    ariaLabel="Invoice yang dibayar"
                  />
                </div>
                <div>
                  <NominalInput
                    value={nominal}
                    onChange={setNominal}
                    placeholder="Nominal"
                    aria-label="Nominal alokasi"
                    aria-invalid={galatNominal !== null}
                    aria-describedby={galatNominal ? `alokasi-${mutationId}-galat` : undefined}
                    style={{ ...input, ...merahBila(galatNominal), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  />
                  <GalatNominal id={`alokasi-${mutationId}-galat`} pesan={galatNominal} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                <div className="sm:col-span-2">
                  <StyledSelect
                    options={opsiTermin}
                    value={terminUrutan}
                    onChange={v => setTerminUrutan(v)}
                    placeholder="Otomatis (FIFO)"
                    disabled={!terpilih}
                    ariaLabel="Cicilan yang dituju"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void tambah()}
                  disabled={busy || !invoiceId || nominal.trim() === '' || galatNominal !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-full text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ minHeight: 38, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Alokasikan
                </button>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Bawaannya <strong>Otomatis (FIFO)</strong> — cicilan terlama tertutup lebih dulu.
                Memilih cicilan tertentu adalah penimpaan manual, dan alokasinya diberi tanda.
              </p>
            </>
          )}
        </div>
      )}
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

const input: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  borderRadius: 14,
  border: '1px solid #e5e7eb',
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--color-text-primary)',
  background: 'white',
}
