'use client'

// Halaman Laporan — kelola laporan keuangan yang sudah masuk sistem (hapus /
// ganti file / ubah periode). Sebelumnya panel sempit "Riwayat Upload" di rail
// kanan /upload; dipindah ke halaman penuh sendiri karena di rail tidak
// kelihatan. Data GET /api/reports/list; aksi DELETE /api/reports/[id],
// PATCH /api/reports/period, dan re-upload via POST /api/upload (delete-first
// utk klien+tipe+periode sama). Logika sama persis, layout dilebarkan.

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import Link from 'next/link'
import {
  FileText, CheckCircle2, Clock, AlertCircle, Loader2, Trash2, RefreshCw,
  CalendarCog, X, Check, Inbox, RotateCw, Upload as UploadIcon, Eye,
} from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import { DateRangePicker } from '@/components/date-range-picker'
import type { RetryState } from '@/lib/reports/retry-policy'

type ReportType = 'laba_rugi' | 'neraca' | 'arus_kas'
type ReportMeta = {
  id: string
  reportType: ReportType
  periodStart: string
  periodEnd: string
  sourceFileName: string
  status: 'uploaded' | 'extracting' | 'review' | 'mapped' | 'confirmed'
  lineCount: number
  mappedCount: number
  /** Ada PDF sumber tersimpan? Menentukan tombol Preview inline muncul. */
  hasPdf: boolean
  /** Dihitung server (lib/reports/retry-policy) — jangan hitung ulang di sini. */
  retry: RetryState
}

const TYPE_LABEL: Record<ReportType, string> = { laba_rugi: 'Laba Rugi', neraca: 'Neraca', arus_kas: 'Arus Kas' }
const TYPE_ACCENT: Record<ReportType, string> = { laba_rugi: '#daf163', neraca: '#7dd3fc', arus_kas: '#bbb3f3' }
// Field form POST /api/upload per tipe (lihat FIELD_TO_TYPE di route upload).
const TYPE_FIELD: Record<ReportType, string> = { laba_rugi: 'pnl', neraca: 'neraca', arus_kas: 'cashflow' }
// Urutan tampil laporan dalam satu sesi.
const TYPE_ORDER: Record<ReportType, number> = { laba_rugi: 0, neraca: 1, arus_kas: 2 }

const STATUS_CONFIG: Record<ReportMeta['status'], { Icon: typeof CheckCircle2; label: string; bg: string; color: string; spin?: boolean }> = {
  uploaded:   { Icon: AlertCircle,  label: 'Belum diekstrak', bg: '#fffbeb', color: '#b45309' },
  extracting: { Icon: Loader2,      label: 'Proses',          bg: '#f0f9ff', color: '#0284c7', spin: true },
  review:     { Icon: Clock,        label: 'Perlu Review',    bg: '#f0f9ff', color: '#0284c7' },
  mapped:     { Icon: CheckCircle2, label: 'Ter-mapping',     bg: '#f0fdf4', color: '#15803d' },
  confirmed:  { Icon: CheckCircle2, label: 'Selesai',         bg: '#f0fdf4', color: '#15803d' },
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
/** '2026-03-01' → '1 Mar 2026'. Parse manual — new Date(ymd) = UTC midnight, bisa mundur sehari di WIB. */
const fmtTanggal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}
const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function StatusBadge({ status, retry }: { status: ReportMeta['status']; retry: RetryState }) {
  // Laporan 'extracting' yang sudah lewat ambang = yatim, bukan sedang jalan.
  // Menampilkan spinner "Proses" untuk itu justru menyembunyikan masalahnya —
  // inilah yang dulu bikin laporan terlihat "diproses" selamanya.
  const stuck = status === 'extracting' && retry === 'retriable'
  const cfg = stuck
    ? { Icon: AlertCircle, label: 'Macet', bg: '#fef2f2', color: '#b91c1c', spin: false }
    : STATUS_CONFIG[status]
  return (
    <div
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
      title={stuck ? 'Ekstraksi berhenti di tengah jalan — tekan "Coba lagi" untuk mengulang dari PDF yang sudah tersimpan.' : undefined}
    >
      <cfg.Icon className={`w-3 h-3 ${cfg.spin ? 'animate-spin' : ''}`} />
      <span>{cfg.label}</span>
    </div>
  )
}

// Progress bar ter-mapping.
function MapProgress({ mapped, total }: { mapped: number; total: number }) {
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0
  const done = total > 0 && mapped === total
  const color = done ? '#15803d' : mapped > 0 ? '#0284c7' : '#d1d5db'
  return (
    <div style={{ minWidth: 120 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: total > 0 ? '#374151' : 'var(--color-text-muted)' }}>
          {total > 0 ? `${mapped}/${total}` : '—'}
        </span>
        {total > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{pct}%</span>}
      </div>
      <div style={{ height: 5, borderRadius: 99, background: '#eef0f2', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

// Slide-over preview PDF inline (semua role) — iframe ke GET /api/reports/[id]/pdf
// (browser render PDF native, tanpa library). Tutup dengan Esc / tombol / klik
// backdrop. Pola konsisten dgn modal client-manage: fixed inset-0 z-[60],
// role="dialog" aria-modal, animate-* yang punya fallback reduced-motion.
function PdfPreview({ report, onClose }: { report: ReportMeta; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${TYPE_LABEL[report.reportType]} — ${report.sourceFileName}`}
        onClick={e => e.stopPropagation()}
        className="h-full flex flex-col animate-slide-in-right"
        style={{
          width: 'min(680px, 94vw)', background: 'white',
          borderTopLeftRadius: 24, borderBottomLeftRadius: 24,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.22)', overflow: 'hidden',
        }}
      >
        <div className="flex items-center justify-between gap-3 flex-shrink-0" style={{ padding: '15px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 9, background: TYPE_ACCENT[report.reportType] + '22' }}>
              <FileText className="w-4 h-4" style={{ color: '#1f2430' }} />
            </div>
            <div className="min-w-0">
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2430' }}>{TYPE_LABEL[report.reportType]}</div>
              <div className="truncate" style={{ fontSize: 11.5, color: 'var(--color-text-muted)', maxWidth: 440 }} title={report.sourceFileName}>{report.sourceFileName}</div>
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Tutup preview"
            className="inline-flex items-center justify-center rounded-full flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ width: 34, height: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0" style={{ background: '#525659' }}>
          <iframe
            src={`/api/reports/${report.id}/pdf`}
            title={`PDF ${TYPE_LABEL[report.reportType]} — ${report.sourceFileName}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

export default function LaporanPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { isStaff } = useClient()
  const clientId = activeClient?.id ?? null

  const [reports, setReports] = useState<ReportMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Satu aksi berjalan pada satu waktu: 'del:<id>' | 'replace:<id>' | 'period:<key>'
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editPeriodKey, setEditPeriodKey] = useState<string | null>(null)
  // PDF preview inline (semua role). null = tertutup.
  const [previewReport, setPreviewReport] = useState<ReportMeta | null>(null)
  const [editRange, setEditRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined)

  const fileRef = useRef<HTMLInputElement>(null)
  const replacingRef = useRef<ReportMeta | null>(null)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/reports/list?clientId=${clientId}`)
      if (!res.ok) throw new Error()
      const d: { reports: ReportMeta[] } = await res.json()
      setReports(d.reports)
    } catch {
      setLoadError(true)
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    setActionError(null)
    setConfirmDeleteId(null)
    setEditPeriodKey(null)
    void load()
  }, [load])

  // ── Aksi ─────────────────────────────────────────────────────
  const readError = async (res: Response, fallback: string) => {
    const p = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null
    return p?.details?.length ? p.details.join(' · ') : (p?.error ?? fallback)
  }

  const handleDelete = async (r: ReportMeta) => {
    setBusy(`del:${r.id}`)
    setActionError(null)
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Gagal menghapus laporan.'))
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal menghapus laporan.')
    } finally {
      setBusy(null)
      setConfirmDeleteId(null)
    }
  }

  // Ekstraksi ulang dari PDF yang SUDAH tersimpan — tidak perlu unggah lagi.
  // Server yang memutuskan boleh/tidaknya (retry-policy) & membersihkan line item
  // lama, jadi di sini cukup panggil lalu muat ulang.
  const handleRetry = async (r: ReportMeta) => {
    setBusy(`retry:${r.id}`)
    setActionError(null)
    try {
      const res = await fetch(`/api/reports/${r.id}/retry-extract`, { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'Gagal mengekstrak ulang.'))
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal mengekstrak ulang.')
    } finally {
      setBusy(null)
    }
  }

  const handleReplaceFile = async (file: File) => {
    const r = replacingRef.current
    if (!r || !clientId) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setActionError('File pengganti harus PDF.')
      return
    }
    setBusy(`replace:${r.id}`)
    setActionError(null)
    try {
      const fd = new FormData()
      fd.append('clientId', clientId)
      fd.append('periodStart', r.periodStart)
      fd.append('periodEnd', r.periodEnd)
      fd.append(TYPE_FIELD[r.reportType], file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await readError(res, 'Gagal mengganti laporan.'))
      const d: { reports: { error?: string }[] } = await res.json()
      const extractErr = d.reports.find(x => x.error)?.error
      if (extractErr) setActionError(`File tersimpan, tapi ekstraksi gagal: ${extractErr}`)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal mengganti laporan.')
    } finally {
      setBusy(null)
      replacingRef.current = null
    }
  }

  const handleMovePeriod = async (group: { periodStart: string; periodEnd: string }) => {
    if (!clientId || !editRange?.from || !editRange?.to) return
    const a = toYMD(editRange.from)
    const b = toYMD(editRange.to)
    setBusy(`period:${group.periodStart}|${group.periodEnd}`)
    setActionError(null)
    try {
      const res = await fetch('/api/reports/period', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          periodStart: group.periodStart,
          periodEnd: group.periodEnd,
          newPeriodStart: a <= b ? a : b,
          newPeriodEnd: a <= b ? b : a,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Gagal memindahkan periode.'))
      setEditPeriodKey(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal memindahkan periode.')
    } finally {
      setBusy(null)
    }
  }

  if (!isLoaded || !activeClient) return null

  // ── Grouping per periode (sesi), laporan terurut per tipe ────
  const groups: { key: string; periodStart: string; periodEnd: string; items: ReportMeta[] }[] = []
  for (const r of reports) {
    const key = `${r.periodStart}|${r.periodEnd}`
    let gr = groups.find(x => x.key === key)
    if (!gr) {
      gr = { key, periodStart: r.periodStart, periodEnd: r.periodEnd, items: [] }
      groups.push(gr)
    }
    gr.items.push(r)
  }
  for (const g of groups) g.items.sort((x, y) => TYPE_ORDER[x.reportType] - TYPE_ORDER[y.reportType])

  const th: React.CSSProperties = { textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#1f2430', verticalAlign: 'middle' }

  const ghostBtn = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
    border: '1px solid #e5e7eb', background: 'white', fontSize: 12, fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
  })

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div className="h-full rounded-3xl overflow-hidden flex flex-col" style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}>

        {/* Hidden file input untuk aksi Ganti */}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void handleReplaceFile(f)
            e.target.value = ''
          }}
        />

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-4" style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: 0 }}>Laporan</h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {isStaff
                ? `${activeClient.name} · Kelola laporan yang sudah masuk — ganti file, ubah periode, atau hapus`
                : `${activeClient.name} · Pantau laporan yang sudah masuk & status ekstraksinya`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading || busy !== null}
              aria-label="Muat ulang daftar laporan"
              style={{ ...ghostBtn(loading || busy !== null), color: 'var(--color-text-muted)' }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
            {/* Upload = aksi tulis, hanya staf. User (klien) read-only. */}
            {isStaff && (
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-full font-semibold"
                style={{ padding: '8px 16px', fontSize: 12.5, background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
              >
                <UploadIcon className="w-3.5 h-3.5" /> Upload Baru
              </Link>
            )}
          </div>
        </div>

        {/* Body */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-full" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Memuat laporan…</span>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: '#dc2626' }}>Gagal memuat laporan. Coba muat ulang.</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center" style={{ maxWidth: 380 }}>
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}>
                  <Inbox className="w-6 h-6" style={{ color: '#8aa32e' }} />
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: '#2d2d2d' }}>Belum ada laporan</p>
                <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  {isStaff
                    ? `Belum ada laporan ter-upload untuk ${activeClient.name}. Mulai dengan meng-upload Laba Rugi, Neraca, atau Arus Kas.`
                    : `Belum ada laporan ter-upload untuk ${activeClient.name}. Laporan akan muncul di sini setelah tim akunting mengunggahnya.`}
                </p>
                {isStaff && (
                  <Link
                    href="/upload"
                    className="inline-flex items-center gap-2 rounded-full font-semibold"
                    style={{ padding: '8px 16px', fontSize: 12.5, background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
                  >
                    <UploadIcon className="w-3.5 h-3.5" /> Upload Laporan
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1240, margin: '0 auto' }}>

              {/* Ringkasan + error banner */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  <span style={{ fontWeight: 700, color: '#1f2430' }}>{reports.length}</span> laporan dalam{' '}
                  <span style={{ fontWeight: 700, color: '#1f2430' }}>{groups.length}</span> periode
                </p>
              </div>
              {actionError && (
                <div style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: '#b91c1c' }}>
                  {actionError}
                </div>
              )}

              {/* Kartu per sesi (periode) */}
              {groups.map(group => {
                const isEditing = editPeriodKey === group.key
                const periodBusy = busy === `period:${group.key}`
                return (
                  <div key={group.key} className="ng-card-lift" style={{ background: 'white', borderRadius: 18, border: '1px solid #ececec', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden' }}>

                    {/* Header sesi */}
                    <div className="flex items-center justify-between flex-wrap gap-3" style={{ padding: '14px 18px', borderBottom: '1px solid #f2f2f4', background: '#fcfcfd' }}>
                      <div className="flex items-center" style={{ gap: 10 }}>
                        <div style={{ width: 4, height: 32, borderRadius: 99, background: 'linear-gradient(180deg,#bbb3f3,#a5b4fc)', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2430' }}>
                            {fmtTanggal(group.periodStart)} – {fmtTanggal(group.periodEnd)}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                            {group.items.length} laporan · Periode akuntansi
                          </div>
                        </div>
                      </div>
                      {!isEditing && isStaff && (
                        <button
                          disabled={busy !== null}
                          onClick={() => {
                            setEditPeriodKey(group.key)
                            setEditRange({ from: ymdToDate(group.periodStart), to: ymdToDate(group.periodEnd) })
                            setActionError(null)
                          }}
                          style={ghostBtn(busy !== null)}
                        >
                          <CalendarCog className="w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} /> Ubah Periode
                        </button>
                      )}
                    </div>

                    {/* Editor periode inline */}
                    {isEditing && (
                      <div style={{ background: '#fafafa', borderBottom: '1px solid #f2f2f4', padding: '14px 18px' }}>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                          Pindahkan <strong>semua {group.items.length} laporan</strong> periode ini ke periode baru:
                        </p>
                        <div className="flex items-end gap-3 flex-wrap">
                          <div style={{ width: 280 }}>
                            <DateRangePicker value={editRange} onChange={setEditRange} placeholder="Pilih periode baru" />
                          </div>
                          <button
                            disabled={periodBusy || !editRange?.from || !editRange?.to}
                            onClick={() => void handleMovePeriod(group)}
                            className="inline-flex items-center gap-1.5 rounded-full font-semibold"
                            style={{
                              padding: '8px 16px', fontSize: 12, border: 'none',
                              background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)',
                              cursor: periodBusy ? 'default' : 'pointer', opacity: !editRange?.from || !editRange?.to ? 0.5 : 1,
                            }}
                          >
                            {periodBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Simpan Periode
                          </button>
                          <button
                            disabled={periodBusy}
                            onClick={() => { setEditPeriodKey(null); setActionError(null) }}
                            className="inline-flex items-center gap-1.5 rounded-full"
                            style={{ padding: '8px 14px', fontSize: 12, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                          >
                            <X className="w-3.5 h-3.5" /> Batal
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tabel laporan sesi */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                        <thead>
                          <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                            <th style={{ ...th, minWidth: 150 }}>Tipe Laporan</th>
                            <th style={{ ...th, minWidth: 220 }}>File Sumber</th>
                            <th style={{ ...th, textAlign: 'right' }}>Baris</th>
                            <th style={th}>Ter-mapping</th>
                            <th style={th}>Status</th>
                            <th style={{ ...th, textAlign: 'right' }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map(r => {
                            const deleting = busy === `del:${r.id}`
                            const replacing = busy === `replace:${r.id}`
                            const retrying = busy === `retry:${r.id}`
                            const confirming = confirmDeleteId === r.id
                            return (
                              <Fragment key={r.id}>
                                <tr style={{ borderBottom: '1px solid #f5f5f6' }}>
                                  <td style={td}>
                                    <div className="flex items-center" style={{ gap: 9 }}>
                                      <div className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 8, background: TYPE_ACCENT[r.reportType] + '22' }}>
                                        <FileText className="w-4 h-4" style={{ color: '#1f2430' }} />
                                      </div>
                                      <span style={{ fontWeight: 600 }}>{TYPE_LABEL[r.reportType]}</span>
                                    </div>
                                  </td>
                                  <td style={{ ...td, color: 'var(--color-text-muted)', maxWidth: 320 }}>
                                    <span className="block truncate" title={r.sourceFileName}>{r.sourceFileName}</span>
                                  </td>
                                  <td style={{ ...td, textAlign: 'right', color: '#374151' }}>{r.lineCount}</td>
                                  <td style={td}>
                                    {replacing || retrying
                                      ? <span style={{ fontSize: 12, color: '#0284c7' }} className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengekstrak ulang…</span>
                                      : <MapProgress mapped={r.mappedCount} total={r.lineCount} />}
                                  </td>
                                  <td style={td}><StatusBadge status={r.status} retry={r.retry} /></td>
                                  <td style={{ ...td, textAlign: 'right' }}>
                                    <div className="inline-flex items-center gap-2">
                                      {/* Preview PDF inline — SEMUA role (perbaikan UX umum),
                                          hanya kalau PDF sumbernya memang tersimpan. */}
                                      {r.hasPdf && (
                                        <button
                                          aria-label={`Preview ${TYPE_LABEL[r.reportType]}`}
                                          title="Lihat PDF laporan (preview inline)"
                                          onClick={() => { setPreviewReport(r); setActionError(null) }}
                                          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                          style={{ ...ghostBtn(false), color: '#374151' }}
                                        >
                                          <Eye className="w-3.5 h-3.5" /> Preview
                                        </button>
                                      )}
                                      {/* Aksi TULIS (retry/ganti/hapus) — hanya staf. User read-only. */}
                                      {isStaff && r.retry === 'retriable' && (
                                        <button
                                          aria-label={`Coba lagi ekstraksi ${TYPE_LABEL[r.reportType]}`}
                                          title="Ekstrak ulang dari PDF yang sudah tersimpan (tanpa upload lagi)"
                                          disabled={busy !== null}
                                          onClick={() => void handleRetry(r)}
                                          style={{ ...ghostBtn(busy !== null), color: '#0284c7', borderColor: 'rgba(2,132,199,0.3)' }}
                                        >
                                          {retrying
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <RotateCw className="w-3.5 h-3.5" />}
                                          {retrying ? 'Mengekstrak…' : 'Coba lagi'}
                                        </button>
                                      )}
                                      {isStaff && (
                                        <>
                                          <button
                                            aria-label={`Ganti file ${TYPE_LABEL[r.reportType]}`}
                                            title="Ganti file (re-upload PDF → ekstraksi ulang)"
                                            disabled={busy !== null}
                                            onClick={() => { replacingRef.current = r; setActionError(null); fileRef.current?.click() }}
                                            style={{ ...ghostBtn(busy !== null), color: '#374151' }}
                                          >
                                            <RefreshCw className="w-3.5 h-3.5" /> Ganti
                                          </button>
                                          <button
                                            aria-label={`Hapus laporan ${TYPE_LABEL[r.reportType]}`}
                                            title="Hapus laporan"
                                            disabled={busy !== null}
                                            onClick={() => { setConfirmDeleteId(r.id); setActionError(null) }}
                                            style={{ ...ghostBtn(busy !== null), color: '#dc2626', borderColor: 'rgba(220,38,38,0.25)' }}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" /> Hapus
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {/* Konfirmasi hapus — baris inline penuh */}
                                {confirming && (
                                  <tr style={{ borderBottom: '1px solid #f5f5f6' }}>
                                    <td colSpan={6} style={{ padding: '10px 14px', background: '#fef2f2' }}>
                                      <div className="flex items-center justify-between flex-wrap gap-3">
                                        <span style={{ fontSize: 12.5, color: '#b91c1c' }}>
                                          Hapus <strong>{TYPE_LABEL[r.reportType]}</strong> ({r.lineCount} baris) periode {fmtTanggal(r.periodStart)}? Riwayat mapping yang sudah dipelajari tetap tersimpan untuk upload berikutnya.
                                        </span>
                                        <div className="inline-flex items-center gap-2 flex-shrink-0">
                                          <button
                                            disabled={deleting}
                                            onClick={() => void handleDelete(r)}
                                            className="inline-flex items-center gap-1.5 rounded-full font-semibold"
                                            style={{ padding: '7px 16px', fontSize: 12, border: 'none', background: '#dc2626', color: 'white', cursor: deleting ? 'default' : 'pointer' }}
                                          >
                                            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            {deleting ? 'Menghapus…' : 'Ya, hapus'}
                                          </button>
                                          <button
                                            disabled={deleting}
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="rounded-full"
                                            style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                          >
                                            Batal
                                          </button>
                                        </div>
                                      </div>
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
                )
              })}
            </div>
          )}
        </main>
      </div>

      {previewReport && (
        <PdfPreview report={previewReport} onClose={() => setPreviewReport(null)} />
      )}
    </div>
  )
}
