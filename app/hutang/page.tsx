'use client'

// Halaman Monitoring Hutang — umur hutang, cicilan yang mendekati jatuh tempo,
// dan rekap per supplier. Tata letaknya mengikuti /jurnal, /buku-besar,
// /pembelian, dan /mutasi-kas (shell tiga lapis).
//
// Akses: owner + akunting + finance (D45 — '/hutang' ada di
// INTERNAL_ONLY_PREFIXES). SELURUH route-nya baca-saja, jadi tidak ada tombol
// tulis yang perlu digerbangi di sini — yang mengubah angkanya adalah
// /pembelian dan /mutasi-kas.
//
// ══ TIDAK ADA SATU ANGKA PUN YANG DIHITUNG DI SINI ════════════════════════
// Ember umur, sisa, pembagian ke cicilan — semuanya datang JADI dari server,
// yang menurunkannya lewat lib/hutang.ts. Menghitung ulang di browser berarti
// dua jawaban yang bisa berbeda, dan yang di layar yang akan dipercaya.
//
// ══ YANG SUDAH TELAT ADA DI ATAS ══════════════════════════════════════════
// Daftar "mendekati jatuh tempo" yang menyembunyikan yang sudah lewat adalah
// daftar yang membuat orang merasa aman.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  RotateCw,
} from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useRupiah } from '@/lib/preferences-context'
import { todayYmd } from '@/lib/ymd'
import { AGE_BUCKETS, AGE_BUCKET_LABEL, type AgeBucket } from '@/lib/hutang'
import { fmtTanggal } from '@/components/jurnal/journal-detail'
import { SupplierDetail, type InvoiceDetail } from '@/components/hutang/supplier-detail'
import { ReconciliationPanel } from '@/components/hutang/reconciliation-panel'

type BucketMap = Record<AgeBucket, string>

interface AgingResponse {
  asOf: string
  buckets: BucketMap
  total: string
  invoiceBersisa: number
  pakuYatim: number
}

interface SupplierRow {
  supplierId: string
  supplierNama: string
  invoiceCount: number
  total: string
  dibayar: string
  sisa: string
  telat: string
  buckets: BucketMap
}

interface JatuhTempoItem {
  invoiceId: string
  noInvoice: string | null
  supplierId: string
  supplierNama: string
  terminUrutan: number
  tanggal: string
  sisa: string
  hariLagi: number
  telat: boolean
}

/** Warna per ember — dari token, bukan hex lepas (design system terkunci). */
const WARNA_EMBER: Record<AgeBucket, { bg: string; fg: string }> = {
  belumJatuhTempo: { bg: '#eaf7e8', fg: '#2f6d2a' },
  telat1_30: {
    bg: 'color-mix(in srgb, var(--color-accent-secondary) 28%, white)',
    fg: 'var(--color-text-primary)',
  },
  telat31_60: {
    bg: 'color-mix(in srgb, var(--color-accent-secondary) 48%, white)',
    fg: 'var(--color-text-primary)',
  },
  telat61_90: {
    bg: 'color-mix(in srgb, var(--color-accent-critical) 16%, white)',
    fg: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)',
  },
  telatLebih90: {
    bg: 'color-mix(in srgb, var(--color-accent-critical) 32%, white)',
    fg: 'color-mix(in srgb, var(--color-accent-critical) 60%, black)',
  },
}

export default function HutangPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { rupiah } = useRupiah()

  const [asOf, setAsOf] = useState(() => todayYmd())
  const [aging, setAging] = useState<AgingResponse | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [jatuhTempo, setJatuhTempo] = useState<JatuhTempoItem[]>([])
  const [dalamHari, setDalamHari] = useState(30)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const clientId = activeClient?.id ?? null

  const muat = useCallback(async () => {
    if (!clientId) return
    try {
      const qs = new URLSearchParams({ clientId, asOf })
      const qsJt = new URLSearchParams({ clientId, asOf, dalamHari: String(dalamHari) })
      const [rAging, rSup, rJt] = await Promise.all([
        fetch(`/api/hutang/aging?${qs}`),
        fetch(`/api/hutang/suppliers?${qs}`),
        fetch(`/api/hutang/jatuh-tempo?${qsJt}`),
      ])
      const pAging = (await rAging.json().catch(() => null)) as (AgingResponse & { error?: string }) | null
      if (!rAging.ok) {
        setLoadError(pAging?.error ?? 'Gagal memuat umur hutang.')
        return
      }
      const pSup = (await rSup.json().catch(() => null)) as { suppliers?: SupplierRow[] } | null
      const pJt = (await rJt.json().catch(() => null)) as { items?: JatuhTempoItem[] } | null
      setLoadError(null)
      setAging(pAging)
      setSuppliers(pSup?.suppliers ?? [])
      setJatuhTempo(pJt?.items ?? [])
    } catch {
      setLoadError('Gagal menghubungi server.')
    } finally {
      setLoading(false)
    }
  }, [clientId, asOf, dalamHari])

  useEffect(() => {
    void (async () => {
      await muat()
    })()
  }, [muat])

  const muatDetail = useCallback(
    async (supplierId: string) => {
      if (!clientId) return
      setDetailLoading(true)
      try {
        const qs = new URLSearchParams({ clientId, asOf })
        const res = await fetch(`/api/hutang/suppliers/${supplierId}?${qs}`)
        const payload = (await res.json().catch(() => null)) as { invoices?: InvoiceDetail[] } | null
        setDetail(res.ok ? (payload?.invoices ?? []) : null)
      } catch {
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [clientId, asOf]
  )

  useEffect(() => {
    if (!expanded) return
    void (async () => {
      await muatDetail(expanded)
    })()
  }, [expanded, muatDetail])

  function toggle(supplierId: string) {
    setDetail(null)
    setExpanded(lama => (lama === supplierId ? null : supplierId))
  }

  /**
   * Unduh rekap per supplier sebagai CSV (D45 — finance membaca DAN mengunduh).
   *
   * Dibentuk dari data yang SUDAH di layar, bukan permintaan kedua ke server:
   * berkas yang isinya berbeda dari yang barusan dibaca orangnya adalah berkas
   * yang tidak bisa dipertanggungjawabkan saat dikirim ke luar.
   */
  function unduhCsv() {
    const sel = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = [
      'Supplier',
      'Jumlah invoice',
      'Total',
      'Dibayar',
      'Sisa',
      ...AGE_BUCKETS.map(k => AGE_BUCKET_LABEL[k]),
    ]
    const baris = suppliers.map(s => [
      sel(s.supplierNama),
      String(s.invoiceCount),
      s.total,
      s.dibayar,
      s.sisa,
      ...AGE_BUCKETS.map(k => s.buckets[k]),
    ])
    const csv = [header.map(sel).join(','), ...baris.map(r => r.join(','))].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hutang-${activeClient?.name ?? 'klien'}-${asOf}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalSisa = useMemo(
    () => suppliers.reduce((s, r) => s + Number(r.sisa), 0),
    [suppliers]
  )

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
              Monitoring Hutang
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {activeClient.name} · sisa {rupiah(totalSisa)} dari {suppliers.length} supplier
              {aging && aging.invoiceBersisa > 0 && ` · ${aging.invoiceBersisa} invoice bersisa`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="asof" className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Per tanggal
            </label>
            <input
              id="asof"
              type="date"
              value={asOf}
              onChange={e => {
                setLoading(true)
                setExpanded(null)
                setAsOf(e.target.value)
              }}
              style={{
                minHeight: 34,
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                padding: '6px 12px',
                fontSize: 12.5,
                background: 'white',
                color: 'var(--color-text-primary)',
              }}
            />
            <button
              onClick={() => {
                setLoading(true)
                void muat()
              }}
              disabled={loading}
              aria-label="Muat ulang monitoring hutang"
              className="inline-flex items-center gap-2 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 14px', fontSize: 12.5, minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
            <button
              onClick={unduhCsv}
              disabled={suppliers.length === 0}
              aria-label="Unduh rekap hutang per supplier sebagai CSV"
              className="inline-flex items-center gap-2 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 16px', fontSize: 12.5, minHeight: 34, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
            >
              <Download className="w-3.5 h-3.5" /> Unduh CSV
            </button>
          </div>
        </div>

        {/* Isi */}
        <div className="flex-1 overflow-y-auto min-h-0" style={{ background: '#f8f8f8' }}>
          <div className="p-3 sm:p-4 flex flex-col gap-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16" style={{ color: 'var(--color-text-muted)' }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Memuat monitoring hutang…</span>
              </div>
            ) : loadError ? (
              <p role="alert" className="text-sm text-center py-16" style={{ color: 'var(--color-accent-critical)' }}>
                {loadError}
              </p>
            ) : (
              <>
                {/* ── Kartu ember umur ── */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {AGE_BUCKETS.map(k => {
                    const warna = WARNA_EMBER[k]
                    const nilai = Number(aging?.buckets[k] ?? '0')
                    return (
                      <div
                        key={k}
                        className="rounded-3xl p-4"
                        style={{ background: 'white', border: '1px solid #f0f0f0' }}
                      >
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                          style={{ background: warna.bg, color: warna.fg }}
                        >
                          {AGE_BUCKET_LABEL[k]}
                        </span>
                        <p
                          className="text-lg font-bold mt-2"
                          style={{
                            color: nilai > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {rupiah(nilai)}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {aging && aging.pakuYatim > 0 && (
                  <div
                    role="note"
                    className="rounded-2xl px-3.5 py-2.5 flex items-start gap-2"
                    style={{
                      background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                      border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
                    }}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }} />
                    <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                      <strong>{aging.pakuYatim} pembayaran</strong> dipaku ke cicilan yang sudah tidak ada —
                      kemungkinan jumlah termin invoicenya diubah setelah pembayarannya dialokasikan.
                      Pembayarannya tetap terhitung; rinciannya ada di supplier masing-masing.
                    </p>
                  </div>
                )}

                {/* ── Mendekati jatuh tempo, PER CICILAN ── */}
                <div className="rounded-3xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                  <div
                    className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                    style={{ borderBottom: '1px solid #f0f0f0' }}
                  >
                    <div>
                      <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        Mendekati jatuh tempo
                      </h2>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                        Per CICILAN, bukan per invoice — yang sudah lewat ikut tampil di atas
                      </p>
                    </div>
                    <div role="group" aria-label="Rentang hari" className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--color-muted-bg)' }}>
                      {[7, 30, 60].map(n => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={dalamHari === n}
                          onClick={() => {
                            setLoading(true)
                            setDalamHari(n)
                          }}
                          className="px-3 py-1 rounded-full text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                          style={{
                            minHeight: 32,
                            background: dalamHari === n ? 'white' : 'transparent',
                            color: dalamHari === n ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            fontWeight: dalamHari === n ? 600 : 400,
                          }}
                        >
                          {n} hari
                        </button>
                      ))}
                    </div>
                  </div>

                  {jatuhTempo.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Tidak ada cicilan yang jatuh tempo dalam {dalamHari} hari ke depan.
                    </p>
                  ) : (
                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                      <caption className="sr-only">Cicilan yang mendekati jatuh tempo</caption>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          <th scope="col" style={th}>Jatuh tempo</th>
                          <th scope="col" style={th}>Supplier</th>
                          <th scope="col" style={th}>Invoice</th>
                          <th scope="col" style={th}>Cicilan</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>Sisa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jatuhTempo.map(i => (
                          <tr key={`${i.invoiceId}-${i.terminUrutan}`} style={{ borderTop: '1px solid #f5f5f5' }}>
                            <td style={td}>
                              {fmtTanggal(i.tanggal)}
                              <span
                                className="ml-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                style={
                                  i.telat
                                    ? {
                                        background: 'color-mix(in srgb, var(--color-accent-critical) 16%, white)',
                                        color: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)',
                                      }
                                    : { background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }
                                }
                              >
                                {i.telat ? `telat ${Math.abs(i.hariLagi)} hari` : `${i.hariLagi} hari lagi`}
                              </span>
                            </td>
                            <td style={td}>{i.supplierNama}</td>
                            <td style={td}>{i.noInvoice ?? '(tanpa nomor)'}</td>
                            <td style={td}>ke-{i.terminUrutan}</td>
                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {rupiah(Number(i.sisa))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ── Rekap per supplier ── */}
                <div className="rounded-3xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      Hutang per supplier
                    </h2>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      Buka barisnya untuk melihat invoice, cicilan, dan pembayaran yang menutupnya
                    </p>
                  </div>

                  {suppliers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12" style={{ color: 'var(--color-text-muted)' }}>
                      <Inbox className="w-8 h-8" />
                      <p className="text-sm">Belum ada hutang pada klien ini.</p>
                      <p className="text-[11px]">Invoice tunai tidak masuk monitoring hutang.</p>
                    </div>
                  ) : (
                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                      <caption className="sr-only">Rekap hutang per supplier</caption>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          <th scope="col" style={{ ...th, width: 36 }} />
                          <th scope="col" style={th}>Supplier</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>Invoice</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>Dibayar</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>Sisa</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>Telat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppliers.map(s => {
                          const terbuka = expanded === s.supplierId
                          const telat = Number(s.telat)
                          return (
                            <Fragment key={s.supplierId}>
                              <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                                <td style={td}>
                                  <button
                                    type="button"
                                    onClick={() => toggle(s.supplierId)}
                                    aria-expanded={terbuka}
                                    aria-label={`${terbuka ? 'Tutup' : 'Buka'} rincian hutang ${s.supplierNama}`}
                                    className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                    style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'var(--color-text-muted)' }}
                                  >
                                    {terbuka ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </button>
                                </td>
                                <td style={{ ...td, fontWeight: 500 }}>{s.supplierNama}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{s.invoiceCount}</td>
                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {rupiah(Number(s.total))}
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>
                                  {rupiah(Number(s.dibayar))}
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                  {rupiah(Number(s.sisa))}
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                  {telat > 0 ? (
                                    <span
                                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                      style={{
                                        background: 'color-mix(in srgb, var(--color-accent-critical) 16%, white)',
                                        color: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)',
                                      }}
                                    >
                                      {rupiah(telat)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                              {terbuka && (
                                <tr style={{ background: '#fcfcfc' }}>
                                  <td colSpan={7} style={{ padding: 0 }}>
                                    <SupplierDetail invoices={detail} loading={detailLoading} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ── Rekonsiliasi (F4, D41/D44) ── Di halaman ini, bukan di
                    tab Supplier: yang dibandingkan adalah hutang yang berjalan,
                    dan tanggal acuannya sama dengan "Per tanggal" di atas. */}
                <ReconciliationPanel key={`${activeClient.id}-${asOf}`} clientId={activeClient.id} asOf={asOf} />
              </>
            )}
          </div>
        </div>
      </div>
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
