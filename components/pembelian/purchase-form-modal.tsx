'use client'

// Form invoice pembelian — buat & ubah. Dipakai halaman /pembelian.
//
// ══ ANGKA DIHITUNG DENGAN MODUL YANG SAMA DENGAN SERVER ═══════════════════
// Panel total memakai computeInvoiceTotals, dan pratinjau jadwal cicilan
// memakai buildTerminSchedule — keduanya modul murni yang juga dipakai route.
// Menghitungnya sendiri di sini berarti dua jawaban untuk satu pertanyaan, dan
// yang di layar yang akan dipercaya akunting saat menekan Simpan.
//
// Subtotal per baris DIISI OTOMATIS dari qty × harga saat keduanya diketik,
// tapi tetap BISA disunting: ia yang disimpan (D28), dan ada pembelian yang
// subtotalnya memang bukan hasil perkalian bulat (pembulatan supplier, diskon
// yang sementara digabung netto).

import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import { useRupiah } from '@/lib/preferences-context'
import { computeInvoiceTotals, NO_INVOICE_MAX, PURCHASE_PAYMENT_LABEL } from '@/lib/purchase'
import { buildTerminSchedule } from '@/lib/termin'
import { toMinorUnits, fromMinorUnits } from '@/lib/journal'
import { pesanGalatNominal } from '@/lib/nominal'
import { GalatNominal, merahBila } from '@/components/ui/galat-nominal'
import { fmtTanggal } from '@/components/jurnal/journal-detail'
import { todayYmd } from '@/lib/ymd'

export interface SupplierOption {
  id: string
  nama: string
  akunHutangDefaultId: string | null
}

export interface AkunOption {
  id: string
  kode: string
  nama: string
  kelompok: string
  resolvedIsKas?: boolean | null
}

export interface PurchaseFormLine {
  key: string
  namaBarang: string
  qty: string
  satuan: string
  hargaSatuan: string
  subtotal: string
}

export interface PurchaseFormValue {
  tanggal: string
  supplierId: string
  noInvoice: string
  caraBayar: 'kredit' | 'tunai'
  akunTujuanId: string
  akunKasId: string
  ppn: string
  jumlahTermin: string
  jatuhTempoAkhir: string
  keterangan: string
  lines: PurchaseFormLine[]
}

export function blankPurchaseForm(tanggal: string): PurchaseFormValue {
  return {
    tanggal,
    supplierId: '',
    noInvoice: '',
    caraBayar: 'kredit',
    akunTujuanId: '',
    akunKasId: '',
    ppn: '',
    jumlahTermin: '1',
    jatuhTempoAkhir: '',
    keterangan: '',
    lines: [blankLine()],
  }
}

export function blankLine(): PurchaseFormLine {
  return {
    key: `l-${Math.random().toString(36).slice(2, 9)}`,
    namaBarang: '',
    qty: '1',
    satuan: '',
    hargaSatuan: '',
    subtotal: '',
  }
}

/** qty × harga dalam SEN — dasar pengisian otomatis subtotal. */
function hitungSubtotal(qty: string, harga: string): string {
  const q = Number(String(qty).replace(',', '.'))
  const hMinor = toMinorUnits(harga)
  if (!Number.isFinite(q) || q <= 0 || hMinor === null) return ''
  // Dibulatkan ke sen terdekat SEKALI, di sini — bukan dibiarkan jadi pecahan
  // sen yang akan dibulatkan lagi entah di mana.
  return fromMinorUnits(Math.round(q * hMinor))
}

export function PurchaseFormModal({
  mode,
  suppliers,
  accounts,
  akunPpnTersedia,
  initial,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit'
  suppliers: SupplierOption[]
  accounts: AkunOption[]
  /** Setelan klien sudah punya akun PPN Masukan? Menentukan field PPN aktif. */
  akunPpnTersedia: boolean
  initial: PurchaseFormValue
  submitting: boolean
  serverErrors: string[]
  onSubmit: (value: PurchaseFormValue) => void
  onCancel: () => void
}) {
  const { rupiahPersis } = useRupiah()
  // PERSIS, bukan dibulatkan (keputusan Ricko di CP-8): ringkasan ini
  // dicocokkan dengan invoice kertasnya, dan termin menaruh sisa sen di
  // cicilan terakhir — "Rp 100.000" untuk 100.000,01 menyembunyikan keduanya.
  const rpSen = (minor: number) => rupiahPersis(fromMinorUnits(minor))
  const [v, setV] = useState<PurchaseFormValue>(initial)

  const set = <K extends keyof PurchaseFormValue>(k: K, val: PurchaseFormValue[K]) =>
    setV(prev => ({ ...prev, [k]: val }))

  const setLine = (key: string, patch: Partial<PurchaseFormLine>) =>
    setV(prev => ({
      ...prev,
      lines: prev.lines.map(l => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        // Subtotal ikut saat qty/harga berubah — kecuali penggunanya memang
        // sedang menyunting subtotal itu sendiri.
        if (patch.subtotal === undefined && (patch.qty !== undefined || patch.hargaSatuan !== undefined)) {
          const otomatis = hitungSubtotal(next.qty, next.hargaSatuan)
          if (otomatis !== '') next.subtotal = otomatis
        }
        return next
      }),
    }))

  const supplierOpts: StyledOption[] = useMemo(
    () => suppliers.map(s => ({ value: s.id, label: s.nama })),
    [suppliers]
  )
  const akunOpts: StyledOption[] = useMemo(
    () => accounts.map(a => ({ value: a.id, label: a.nama, badge: a.kode, group: a.kelompok })),
    [accounts]
  )
  const akunKasOpts: StyledOption[] = useMemo(
    () =>
      accounts
        .filter(a => a.resolvedIsKas)
        .map(a => ({ value: a.id, label: a.nama, badge: a.kode, group: a.kelompok })),
    [accounts]
  )

  const supplier = suppliers.find(s => s.id === v.supplierId) ?? null
  const totals = computeInvoiceTotals(v.lines, v.ppn)

  // Nominal yang tidak terbaca ditunjuk di field-nya dan MENAHAN Simpan.
  // Tanpa ini harga "500.000,2x" membuat subtotal tidak terisi dan total
  // tampil Rp 0 tanpa satu pun tanda — persis yang ditemukan di gladi.
  const galatPpn = akunPpnTersedia ? pesanGalatNominal(v.ppn) : null
  const galatBaris = v.lines.map(l => ({
    harga: pesanGalatNominal(l.hargaSatuan),
    subtotal: pesanGalatNominal(l.subtotal),
  }))
  const adaGalatNominal = galatPpn !== null || galatBaris.some(g => g.harga !== null || g.subtotal !== null)

  const termin = useMemo(() => {
    if (v.caraBayar !== 'kredit' || v.jatuhTempoAkhir === '') return []
    return buildTerminSchedule({
      jatuhTempoAkhir: v.jatuhTempoAkhir,
      jumlahTermin: Number(v.jumlahTermin) || 1,
      totalMinor: totals.totalMinor,
    })
  }, [v.caraBayar, v.jatuhTempoAkhir, v.jumlahTermin, totals.totalMinor])

  const akunTujuan = accounts.find(a => a.id === v.akunTujuanId)
  const akunKas = accounts.find(a => a.id === v.akunKasId)

  return (
    <ModalShell
      labelledBy="pembelian-form-title"
      className="max-w-4xl"
      onDismiss={submitting ? null : onCancel}
    >
      <form
        onSubmit={e => {
          e.preventDefault()
          if (!submitting && !adaGalatNominal) onSubmit(v)
        }}
      >
        <div className="px-5 sm:px-6 py-5" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <h2
            id="pembelian-form-title"
            className="text-base font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {mode === 'create' ? 'Invoice Pembelian Baru' : 'Ubah Invoice Pembelian'}
          </h2>

          {serverErrors.length > 0 && (
            <div
              role="alert"
              className="mt-3 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
              }}
            >
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
              />
              <ul className="text-xs flex flex-col gap-0.5" style={{ color: 'var(--color-text-primary)' }}>
                {serverErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Header ── */}
          <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <Field label="Tanggal invoice" htmlFor="inv-tanggal">
              <input
                id="inv-tanggal"
                type="date"
                required
                value={v.tanggal}
                onChange={e => set('tanggal', e.target.value)}
                style={input}
              />
            </Field>

            <Field label="No. invoice vendor" hint="Opsional — kosongkan kalau vendor tidak memberi nomor.">
              <input
                type="text"
                maxLength={NO_INVOICE_MAX}
                value={v.noInvoice}
                onChange={e => set('noInvoice', e.target.value)}
                style={input}
              />
            </Field>

            <Field label="Supplier">
              <StyledSelect
                ariaLabel="Supplier"
                options={supplierOpts}
                value={v.supplierId}
                placeholder="— pilih supplier —"
                searchable
                onChange={val => set('supplierId', val)}
              />
              {supplier && !supplier.akunHutangDefaultId && (
                <span className="block text-[11px] mt-1" style={{ color: '#b45309' }}>
                  Supplier ini belum punya akun hutang default — atur dulu di Settings › Supplier
                  sebelum membuat invoice kredit.
                </span>
              )}
            </Field>

            <Field label="Cara bayar">
              <StyledSelect
                ariaLabel="Cara bayar"
                options={[
                  { value: 'kredit', label: PURCHASE_PAYMENT_LABEL.kredit },
                  { value: 'tunai', label: PURCHASE_PAYMENT_LABEL.tunai },
                ]}
                value={v.caraBayar}
                onChange={val => set('caraBayar', val === 'tunai' ? 'tunai' : 'kredit')}
              />
            </Field>

            <Field
              label="Akun tujuan"
              hint="Bebas akun apa pun — persediaan, beban jasa, dll."
            >
              <StyledSelect
                ariaLabel="Akun tujuan"
                options={akunOpts}
                value={v.akunTujuanId}
                placeholder="— pilih akun —"
                searchable
                onChange={val => set('akunTujuanId', val)}
              />
            </Field>

            {v.caraBayar === 'tunai' ? (
              <Field label="Akun kas" hint="Hanya akun bertanda kas di Master COA.">
                <StyledSelect
                  ariaLabel="Akun kas"
                  options={akunKasOpts}
                  value={v.akunKasId}
                  placeholder={
                    akunKasOpts.length === 0 ? 'Belum ada akun bertanda kas' : '— pilih akun kas —'
                  }
                  disabled={akunKasOpts.length === 0}
                  searchable
                  onChange={val => set('akunKasId', val)}
                />
              </Field>
            ) : (
              <Field label="Akun hutang" hint="Diambil dari default supplier — tidak bisa diubah di sini.">
                <div style={{ ...input, display: 'flex', alignItems: 'center', background: 'var(--color-muted-bg)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {supplier?.akunHutangDefaultId
                      ? (accounts.find(a => a.id === supplier.akunHutangDefaultId)?.nama ??
                        'Akun tidak ditemukan')
                      : '— belum disetel —'}
                  </span>
                </div>
              </Field>
            )}

            <Field
              label="PPN"
              hint={
                akunPpnTersedia
                  ? 'Nominal, terpisah dari subtotal barang.'
                  : 'Akun PPN Masukan belum disetel di Settings › Pembukuan.'
              }
            >
              <input
                type="text"
                inputMode="decimal"
                value={v.ppn}
                disabled={!akunPpnTersedia}
                placeholder={akunPpnTersedia ? '0' : 'tidak tersedia'}
                aria-label="PPN"
                aria-invalid={galatPpn !== null}
                aria-describedby={galatPpn ? 'inv-ppn-galat' : undefined}
                onChange={e => set('ppn', e.target.value)}
                style={{ ...input, ...merahBila(galatPpn), opacity: akunPpnTersedia ? 1 : 0.6 }}
              />
              <GalatNominal id="inv-ppn-galat" pesan={galatPpn} />
            </Field>

            {v.caraBayar === 'kredit' && (
              <>
                <Field label="Jumlah termin">
                  <input
                    type="number"
                    min={1}
                    value={v.jumlahTermin}
                    onChange={e => set('jumlahTermin', e.target.value)}
                    style={input}
                  />
                </Field>
                <Field label="Jatuh tempo akhir">
                  <input
                    type="date"
                    value={v.jatuhTempoAkhir}
                    onChange={e => set('jatuhTempoAkhir', e.target.value)}
                    style={input}
                  />
                </Field>
              </>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Keterangan" hint="Opsional.">
                <input
                  type="text"
                  value={v.keterangan}
                  onChange={e => set('keterangan', e.target.value)}
                  style={input}
                />
              </Field>
            </div>
          </div>

          {/* ── Baris barang ── */}
          <p className="text-xs font-semibold mt-5 mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            Barang
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th scope="col" style={th}>Nama barang</th>
                  <th scope="col" style={{ ...th, width: 90 }}>Qty</th>
                  <th scope="col" style={{ ...th, width: 90 }}>Satuan</th>
                  <th scope="col" style={{ ...th, width: 140, textAlign: 'right' }}>Harga satuan</th>
                  <th scope="col" style={{ ...th, width: 150, textAlign: 'right' }}>Subtotal</th>
                  <th scope="col" style={{ ...th, width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l, i) => (
                  <tr key={l.key} style={{ borderTop: '1px solid #f5f5f5', verticalAlign: 'top' }}>
                    <td style={td}>
                      <input
                        type="text"
                        value={l.namaBarang}
                        aria-label="Nama barang"
                        onChange={e => setLine(l.key, { namaBarang: e.target.value })}
                        style={inputSel}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.qty}
                        aria-label="Qty"
                        onChange={e => setLine(l.key, { qty: e.target.value })}
                        style={inputSel}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="text"
                        value={l.satuan}
                        aria-label="Satuan"
                        onChange={e => setLine(l.key, { satuan: e.target.value })}
                        style={inputSel}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.hargaSatuan}
                        aria-label="Harga satuan"
                        aria-invalid={galatBaris[i].harga !== null}
                        aria-describedby={galatBaris[i].harga ? `${l.key}-harga-galat` : undefined}
                        onChange={e => setLine(l.key, { hargaSatuan: e.target.value })}
                        style={{ ...inputSel, ...merahBila(galatBaris[i].harga), textAlign: 'right' }}
                      />
                      <GalatNominal id={`${l.key}-harga-galat`} pesan={galatBaris[i].harga} />
                    </td>
                    <td style={td}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.subtotal}
                        aria-label="Subtotal"
                        aria-invalid={galatBaris[i].subtotal !== null}
                        aria-describedby={galatBaris[i].subtotal ? `${l.key}-subtotal-galat` : undefined}
                        onChange={e => setLine(l.key, { subtotal: e.target.value })}
                        style={{ ...inputSel, ...merahBila(galatBaris[i].subtotal), textAlign: 'right', fontWeight: 600 }}
                      />
                      <GalatNominal id={`${l.key}-subtotal-galat`} pesan={galatBaris[i].subtotal} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setV(prev => ({
                            ...prev,
                            lines: prev.lines.length > 1 ? prev.lines.filter(x => x.key !== l.key) : prev.lines,
                          }))
                        }
                        disabled={v.lines.length <= 1}
                        aria-label={`Hapus baris ${l.namaBarang || '(tanpa nama)'}`}
                        className="inline-flex items-center justify-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                        style={{ width: 32, height: 32, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => setV(prev => ({ ...prev, lines: [...prev.lines, blankLine()] }))}
            className="inline-flex items-center gap-1.5 mt-2 rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ padding: '6px 12px', minHeight: 32, background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', border: 'none' }}
          >
            <Plus className="w-3.5 h-3.5" /> Tambah baris
          </button>

          {/* ── Total ── */}
          <div
            className="mt-4 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1"
            style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}
          >
            <Angka label="Subtotal" nilai={rpSen(totals.subtotalMinor)} />
            <Angka label="PPN" nilai={rpSen(totals.ppnMinor)} />
            <Angka label="Total" nilai={rpSen(totals.totalMinor)} tebal />
          </div>

          {/* ── Pratinjau jadwal termin ── */}
          {termin.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
                Pratinjau jadwal cicilan
              </p>
              <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {termin.map(c => (
                  <li
                    key={c.urutan}
                    className="rounded-full px-2.5 py-1 text-[11px]"
                    style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
                  >
                    #{c.urutan} · {fmtTanggal(c.tanggal)} · {rpSen(c.nominalMinor)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Pratinjau jurnal ── */}
          {totals.totalMinor > 0 && akunTujuan && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
                Pratinjau jurnal draf
              </p>
              <ul className="text-[11px] flex flex-col gap-0.5" style={{ color: 'var(--color-text-muted)', listStyle: 'none', margin: 0, padding: 0 }}>
                <li>
                  D · {akunTujuan.kode} {akunTujuan.nama} — {rpSen(totals.subtotalMinor)}
                </li>
                {totals.ppnMinor > 0 && <li>D · PPN Masukan — {rpSen(totals.ppnMinor)}</li>}
                <li>
                  K ·{' '}
                  {v.caraBayar === 'tunai'
                    ? `${akunKas?.kode ?? ''} ${akunKas?.nama ?? 'akun kas'}`
                    : 'akun hutang supplier'}{' '}
                  — {rpSen(totals.totalMinor)}
                </li>
              </ul>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
          style={{ borderColor: '#f0f0f0', background: 'white' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting || adaGalatNominal}
            title={adaGalatNominal ? 'Perbaiki nominal yang ditandai merah dulu.' : undefined}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', border: 'none', minHeight: 34 }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan…
              </>
            ) : (
              'Simpan invoice'
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={labelStyle} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && (
        <span className="block text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      )}
    </div>
  )
}

function Angka({ label, nilai, tebal }: { label: string; nilai: string; tebal?: boolean }) {
  return (
    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
      {label}:{' '}
      <strong
        style={{
          color: 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: tebal ? 13.5 : undefined,
        }}
      >
        {nilai}
      </strong>
    </span>
  )
}

export { todayYmd }

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  marginBottom: 4,
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 12.5,
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: 'var(--color-text-primary)',
  minHeight: 34,
}

const inputSel: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12.5,
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: 'var(--color-text-primary)',
  minHeight: 32,
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const td: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12.5,
  color: 'var(--color-text-primary)',
}
