'use client'

// Halaman Laporan Pembelian — invoice pembelian per periode, plus buat, ubah,
// dan hapus. Tata letaknya mengikuti /jurnal dan /buku-besar (shell tiga lapis,
// tabel di dalamnya).
//
// Akses: owner + akunting + finance (D45 — '/pembelian' ada di
// INTERNAL_ONLY_PREFIXES). Finance MEMBACA dan mengunduh; tombol tulisnya
// digerbangi canDoAccounting di halaman ini DAN requireAkunting di API — tiga
// lapis yang sama seperti /jurnal, karena gerbang halaman saja tidak cukup.
//
// ══ TIDAK ADA ANGKA YANG DIHITUNG DI SINI ═════════════════════════════════
// Total, sisa, dan status datang JADI dari server. Yang dihitung di browser
// hanya pratinjau di dalam form (memakai modul murni yang sama dengan server),
// dan itu memang pratinjau — bukan yang disimpan.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import { useRupiah } from '@/lib/preferences-context'
import { ModalShell } from '@/components/ui/modal-portal'
import { DateRangePicker } from '@/components/date-range-picker'
import { localDateToYmd, ymdToLocalDate, hariIniJakarta } from '@/lib/ymd'
import { PURCHASE_PAYMENT_LABEL } from '@/lib/purchase'
import { fmtTanggal } from '@/components/jurnal/journal-detail'
import {
  PurchaseFormModal,
  blankPurchaseForm,
  type AkunOption,
  type PurchaseFormValue,
  type SupplierOption,
} from '@/components/pembelian/purchase-form-modal'

interface InvoiceRow {
  id: string
  tanggal: string
  noInvoice: string | null
  supplierId: string
  supplierNama: string
  caraBayar: 'kredit' | 'tunai'
  jumlahTermin: number
  jatuhTempoAkhir: string | null
  journalId: string | null
  createdByName: string
  lineCount: number
  subtotal: string
  total: string
  sisa: string
  status: string
}

interface InvoiceDetail {
  id: string
  tanggal: string
  noInvoice: string | null
  supplierNama: string
  caraBayar: 'kredit' | 'tunai'
  akunTujuanId: string
  akunKasId: string | null
  ppn: string
  jumlahTermin: number
  jatuhTempoAkhir: string | null
  keterangan: string | null
  journalId: string | null
  subtotal: string
  total: string
  supplierId: string
  lines: {
    id: string
    namaBarang: string
    qty: string
    satuan: string | null
    hargaSatuan: string
    subtotal: string
    lineOrder: number
  }[]
  termin: { urutan: number; tanggal: string; nominal: string; disesuaikan?: boolean }[]
}

/** Awal & akhir bulan berjalan, sebagai string — tanpa objek Date (P2). */
function bulanBerjalan(): { start: string; end: string } {
  const [y, m] = hariIniJakarta().split('-').map(Number)
  const akhir = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(akhir).padStart(2, '0')}` }
}

export default function PembelianPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { canDoAccounting } = useClient()
  const { rupiahPersis } = useRupiah()

  const awal = useMemo(() => bulanBerjalan(), [])
  const [periode, setPeriode] = useState(awal)
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [accounts, setAccounts] = useState<AkunOption[]>([])
  const [akunPpnTersedia, setAkunPpnTersedia] = useState(false)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [formInitial, setFormInitial] = useState<PurchaseFormValue | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])

  const [hapusTarget, setHapusTarget] = useState<InvoiceRow | null>(null)
  const [hapusBusy, setHapusBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const clientId = activeClient?.id ?? null

  const muat = useCallback(async () => {
    if (!clientId) return
    try {
      const qs = new URLSearchParams({
        clientId,
        periodStart: periode.start,
        periodEnd: periode.end,
      })
      const res = await fetch(`/api/purchase-invoices?${qs}`)
      const payload = (await res.json().catch(() => null)) as
        | { invoices?: InvoiceRow[]; error?: string }
        | null
      if (!res.ok) {
        setLoadError(payload?.error ?? 'Gagal memuat invoice pembelian.')
        setRows([])
        return
      }
      setLoadError(null)
      setRows(payload?.invoices ?? [])
    } catch {
      setLoadError('Gagal menghubungi server.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [clientId, periode.start, periode.end])

  useEffect(() => {
    void (async () => {
      await muat()
    })()
  }, [muat])

  // Data pendukung form: supplier, Master COA, dan setelan akun PPN.
  useEffect(() => {
    if (!clientId) return
    let batal = false
    void (async () => {
      try {
        const [sRes, cRes, setRes] = await Promise.all([
          fetch(`/api/clients/${clientId}/suppliers`),
          fetch(`/api/clients/${clientId}/coa`),
          fetch(`/api/clients/${clientId}/accounting-settings`),
        ])
        const s = (await sRes.json().catch(() => null)) as { suppliers?: SupplierOption[] } | null
        const c = (await cRes.json().catch(() => null)) as { accounts?: AkunOption[] } | null
        const st = (await setRes.json().catch(() => null)) as
          | { akunPpnMasukanId?: string | null }
          | null
        if (batal) return
        setSuppliers(s?.suppliers ?? [])
        setAccounts(c?.accounts ?? [])
        setAkunPpnTersedia(Boolean(st?.akunPpnMasukanId))
      } catch {
        if (!batal) {
          setSuppliers([])
          setAccounts([])
        }
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId])

  async function bukaDetail(id: string) {
    setExpanded(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/purchase-invoices/${id}`)
      const payload = (await res.json().catch(() => null)) as InvoiceDetail | null
      setDetail(res.ok ? payload : null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function toggleRow(row: InvoiceRow) {
    if (expanded === row.id) {
      setExpanded(null)
      return
    }
    await bukaDetail(row.id)
  }

  function bukaBuat() {
    setActionError(null)
    setFormErrors([])
    setEditingId(null)
    setFormInitial(blankPurchaseForm(hariIniJakarta()))
    setFormMode('create')
  }

  async function bukaUbah(row: InvoiceRow) {
    setActionError(null)
    setFormErrors([])
    setEditingId(row.id)
    setFormMode('edit')
    setFormInitial(null)
    try {
      const res = await fetch(`/api/purchase-invoices/${row.id}`)
      const d = (await res.json().catch(() => null)) as InvoiceDetail | null
      if (!res.ok || !d) {
        setActionError('Gagal memuat invoice untuk diubah.')
        setFormMode(null)
        return
      }
      setFormInitial({
        tanggal: d.tanggal,
        supplierId: d.supplierId,
        noInvoice: d.noInvoice ?? '',
        caraBayar: d.caraBayar,
        akunTujuanId: d.akunTujuanId,
        akunKasId: d.akunKasId ?? '',
        ppn: Number(d.ppn) > 0 ? d.ppn : '',
        jumlahTermin: String(d.jumlahTermin),
        jatuhTempoAkhir: d.jatuhTempoAkhir ?? '',
        keterangan: d.keterangan ?? '',
        lines: d.lines.map(l => ({
          key: l.id,
          namaBarang: l.namaBarang,
          qty: l.qty,
          satuan: l.satuan ?? '',
          hargaSatuan: l.hargaSatuan,
          subtotal: l.subtotal,
        })),
      })
    } catch {
      setActionError('Gagal menghubungi server.')
      setFormMode(null)
    }
  }

  async function simpan(value: PurchaseFormValue) {
    if (!clientId) return
    setSubmitting(true)
    setFormErrors([])
    const body = {
      clientId,
      tanggal: value.tanggal,
      supplierId: value.supplierId,
      noInvoice: value.noInvoice,
      caraBayar: value.caraBayar,
      akunTujuanId: value.akunTujuanId,
      akunKasId: value.caraBayar === 'tunai' ? value.akunKasId : undefined,
      ppn: value.ppn,
      jumlahTermin: Number(value.jumlahTermin) || 1,
      jatuhTempoAkhir: value.caraBayar === 'kredit' ? value.jatuhTempoAkhir : undefined,
      keterangan: value.keterangan,
      lines: value.lines.map(l => ({
        namaBarang: l.namaBarang,
        qty: l.qty,
        satuan: l.satuan,
        hargaSatuan: l.hargaSatuan,
        subtotal: l.subtotal,
      })),
    }
    try {
      const url =
        formMode === 'edit' && editingId
          ? `/api/purchase-invoices/${editingId}`
          : '/api/purchase-invoices'
      const res = await fetch(url, {
        method: formMode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[] }
        | null
      if (!res.ok) {
        setFormErrors(
          payload?.details?.length ? payload.details : [payload?.error ?? 'Gagal menyimpan invoice.']
        )
        return
      }
      setFormMode(null)
      setFormInitial(null)
      setEditingId(null)
      setExpanded(null)
      await muat()
    } catch {
      setFormErrors(['Gagal menghubungi server.'])
    } finally {
      setSubmitting(false)
    }
  }

  async function hapus() {
    if (!hapusTarget) return
    setHapusBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/purchase-invoices/${hapusTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; details?: string[] }
          | null
        setActionError(
          payload?.details?.length
            ? `${payload.error} ${payload.details.join(' ')}`
            : (payload?.error ?? 'Gagal menghapus invoice.')
        )
        return
      }
      setHapusTarget(null)
      setExpanded(null)
      await muat()
    } catch {
      setActionError('Gagal menghubungi server.')
    } finally {
      setHapusBusy(false)
    }
  }

  if (!isLoaded || !activeClient) {
    return (
      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl flex items-center justify-center gap-2"
          style={{ background: 'white', color: 'var(--color-text-muted)' }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat…</span>
        </div>
      </div>
    )
  }

  const bolehTulis = canDoAccounting

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 flex-wrap"
          style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: 0 }}>
              Laporan Pembelian
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {activeClient.name} · {rows.length} invoice pada periode ini
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ width: 260 }}>
              <DateRangePicker
                value={{ from: ymdToLocalDate(periode.start), to: ymdToLocalDate(periode.end) }}
                onChange={r => {
                  if (!r?.from) return
                  setLoading(true)
                  setExpanded(null)
                  setPeriode({ start: localDateToYmd(r.from), end: localDateToYmd(r.to ?? r.from) })
                }}
                placeholder="Filter periode"
              />
            </div>
            <button
              onClick={() => { setLoading(true); void muat() }}
              disabled={loading}
              aria-label="Muat ulang daftar invoice"
              className="inline-flex items-center gap-2 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 14px', fontSize: 12.5, minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
            {bolehTulis && (
              <button
                onClick={bukaBuat}
                disabled={suppliers.length === 0 || accounts.length === 0}
                title={
                  suppliers.length === 0
                    ? 'Belum ada supplier — tambahkan dulu di Settings.'
                    : accounts.length === 0
                      ? 'Master COA klien ini masih kosong — impor dulu di Settings.'
                      : undefined
                }
                className="inline-flex items-center gap-2 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ padding: '8px 16px', fontSize: 12.5, minHeight: 34, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Invoice Baru
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          {actionError && (
            <div
              role="alert"
              className="mx-4 mt-4 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
              }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }} />
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{actionError}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 h-full" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Memuat invoice…</span>
            </div>
          ) : loadError ? (
            <p className="px-6 py-8 text-sm" style={{ color: '#b91c1c' }}>{loadError}</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <Inbox className="w-10 h-10" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Belum ada invoice pembelian pada periode ini
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {bolehTulis
                    ? 'Catat invoice pertama, atau ganti periodenya di filter di atas.'
                    : 'Coba ganti periodenya di filter di atas.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 py-4">
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <caption className="sr-only">
                    Daftar invoice pembelian {activeClient.name} periode {fmtTanggal(periode.start)} sampai {fmtTanggal(periode.end)}
                  </caption>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th scope="col" style={{ ...th, width: 34 }} />
                      <th scope="col" style={th}>Tanggal</th>
                      <th scope="col" style={th}>No. Invoice</th>
                      <th scope="col" style={th}>Supplier</th>
                      <th scope="col" style={th}>Cara Bayar</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Sisa</th>
                      <th scope="col" style={th}>Jatuh Tempo</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const open = expanded === r.id
                      return (
                        <Fragment key={r.id}>
                          <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                            <td style={{ ...td, paddingRight: 0 }}>
                              <button
                                type="button"
                                onClick={() => void toggleRow(r)}
                                aria-expanded={open}
                                aria-label={`${open ? 'Tutup' : 'Buka'} rincian invoice ${r.noInvoice ?? '(tanpa nomor)'}`}
                                className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                              >
                                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTanggal(r.tanggal)}</td>
                            <td
                              style={{
                                ...td,
                                whiteSpace: 'nowrap',
                                fontWeight: r.noInvoice ? 600 : 400,
                                color: r.noInvoice ? undefined : 'var(--color-text-muted)',
                              }}
                            >
                              {r.noInvoice ?? '—'}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.supplierNama}</td>
                            <td style={td}>
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={
                                  r.caraBayar === 'tunai'
                                    ? { background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }
                                    : { background: 'color-mix(in srgb, var(--color-accent-secondary) 28%, white)', color: 'var(--color-text-primary)' }
                                }
                              >
                                {PURCHASE_PAYMENT_LABEL[r.caraBayar]}
                                {r.caraBayar === 'kredit' && r.jumlahTermin > 1 ? ` · ${r.jumlahTermin}×` : ''}
                              </span>
                            </td>
                            <td style={angka}>{rupiahPersis(r.total)}</td>
                            <td style={{ ...angka, fontWeight: Number(r.sisa) > 0 ? 600 : 400 }}>
                              {Number(r.sisa) > 0 ? rupiahPersis(r.sisa) : '—'}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                              {r.jatuhTempoAkhir ? fmtTanggal(r.jatuhTempoAkhir) : '—'}
                            </td>
                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {bolehTulis ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void bukaUbah(r)}
                                    aria-label={`Ubah invoice ${r.noInvoice ?? '(tanpa nomor)'}`}
                                    className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                    style={iconBtn}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setHapusTarget(r)}
                                    aria-label={`Hapus invoice ${r.noInvoice ?? '(tanpa nomor)'}`}
                                    className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                    style={iconBtn}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              ) : (
                                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={9} style={{ background: '#fbfbfb', padding: 0 }}>
                                <DetailPanel detail={detail} loading={detailLoading} rupiahPersis={rupiahPersis} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {formMode && formInitial && (
        <PurchaseFormModal
          mode={formMode}
          suppliers={suppliers}
          accounts={accounts}
          akunPpnTersedia={akunPpnTersedia}
          initial={formInitial}
          submitting={submitting}
          serverErrors={formErrors}
          onSubmit={simpan}
          onCancel={() => {
            setFormMode(null)
            setFormInitial(null)
            setEditingId(null)
            setFormErrors([])
          }}
        />
      )}

      {hapusTarget && (
        <ModalShell
          labelledBy="inv-hapus-title"
          className="max-w-md"
          onDismiss={hapusBusy ? null : () => setHapusTarget(null)}
        >
          <div className="px-5 sm:px-6 py-5">
            <h2 id="inv-hapus-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Hapus invoice ini?
            </h2>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>{hapusTarget.noInvoice ?? '(tanpa nomor)'}</strong>{' '}
              · {hapusTarget.supplierNama} · {fmtTanggal(hapusTarget.tanggal)} ·{' '}
              {rupiahPersis(hapusTarget.total)}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>Jurnal yang dibuat dari invoice ini ikut terhapus.</strong>{' '}
              Isi invoice sebelum dihapus tetap tersimpan di riwayat.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0', background: 'white' }}>
            <button
              type="button"
              onClick={() => setHapusTarget(null)}
              disabled={hapusBusy}
              className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void hapus()}
              disabled={hapusBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)', minHeight: 34 }}
            >
              {hapusBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menghapus…
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </>
              )}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

function DetailPanel({
  detail,
  loading,
  rupiahPersis,
}: {
  detail: InvoiceDetail | null
  loading: boolean
  rupiahPersis: (v: string) => string
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-4" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Memuat rincian…</span>
      </div>
    )
  }
  if (!detail) {
    return (
      <p className="px-4 py-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Rincian invoice tidak bisa dimuat.
      </p>
    )
  }

  return (
    <div className="px-4 py-3">
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0', background: 'white' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <caption className="sr-only">Rincian barang invoice {detail.noInvoice ?? '(tanpa nomor)'}</caption>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th scope="col" style={th}>Barang</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th scope="col" style={th}>Satuan</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Harga</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map(l => (
              <tr key={l.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                <td style={td}>{l.namaBarang}</td>
                <td style={angka}>{Number(l.qty)}</td>
                <td style={{ ...td, color: 'var(--color-text-muted)' }}>{l.satuan ?? '—'}</td>
                <td style={angka}>{rupiahPersis(l.hargaSatuan)}</td>
                <td style={{ ...angka, fontWeight: 600 }}>{rupiahPersis(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
              <th scope="row" colSpan={4} style={{ ...td, fontWeight: 700 }}>
                Subtotal · PPN {rupiahPersis(detail.ppn)} · Total
              </th>
              <td style={{ ...angka, fontWeight: 700 }}>{rupiahPersis(detail.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {detail.termin.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Jadwal cicilan
          </p>
          <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {detail.termin.map(c => (
              <li
                key={c.urutan}
                className="rounded-full px-2.5 py-1 text-[11px]"
                style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
              >
                #{c.urutan} · {fmtTanggal(c.tanggal)} · {rupiahPersis(c.nominal)}
                {c.disesuaikan ? ' · disesuaikan' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
        {detail.journalId
          ? 'Jurnal draf sudah dibuat otomatis dari invoice ini — posting lewat halaman Jurnal.'
          : 'Invoice ini belum punya jurnal.'}
        {detail.keterangan ? ` · ${detail.keterangan}` : ''}
      </p>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12.5,
  color: 'var(--color-text-primary)',
}

const angka: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
}
