'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import { useRequireClient } from '@/lib/use-require-client'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Check,
  X,
  Edit3,
  RotateCcw,
  TrendingUp,
  Scale,
  Waves,
  Loader2,
  Upload,
} from 'lucide-react'

type LineStatus = 'matched' | 'unmatched' | 'edited' | 'rejected'

type ExtractedLine = {
  id: string
  rawName: string
  suggestedCOA: string | null
  masterCOACode: string | null
  amount: number
  isSubtotal: boolean
  confidence: number
  status: LineStatus
  editedName?: string
}

type ReportType = 'laba_rugi' | 'neraca' | 'arus_kas'
type TabId = 'pnl' | 'neraca' | 'cashflow'

type ReportData = {
  id: string
  reportType: ReportType
  sourceFileName: string
  status: string
  extractedAt: string | null
  lineItems: ExtractedLine[]
}

const TYPE_TO_TAB: Record<ReportType, TabId> = {
  laba_rugi: 'pnl',
  neraca: 'neraca',
  arus_kas: 'cashflow',
}
const TAB_ORDER: TabId[] = ['pnl', 'neraca', 'cashflow']
const TAB_META: Record<TabId, { label: string; Icon: typeof TrendingUp }> = {
  pnl: { label: 'Laba Rugi', Icon: TrendingUp },
  neraca: { label: 'Neraca', Icon: Scale },
  cashflow: { label: 'Arus Kas', Icon: Waves },
}

const formatRupiah = (amount: number) => {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('id-ID')
  return amount < 0 ? `(${formatted})` : formatted
}

const getConfidenceStyle = (confidence: number) => {
  if (confidence >= 90) return { color: '#15803d', bg: '#f0fdf4', label: 'Tinggi' }
  if (confidence >= 70) return { color: '#b45309', bg: '#fffbeb', label: 'Sedang' }
  return { color: '#dc2626', bg: '#fef2f2', label: 'Rendah' }
}

function formatPeriode(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  const sm = s.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const em = e.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  if (sm === em) return sm
  return `${s.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function formatExtractedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const EMPTY_LINES: Record<TabId, ExtractedLine[]> = { pnl: [], neraca: [], cashflow: [] }
const EMPTY_REPORTS: Record<TabId, ReportData | null> = { pnl: null, neraca: null, cashflow: null }

function ExtractionReviewInner() {
  const { activeClient, isLoaded } = useRequireClient()
  const searchParams = useSearchParams()
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  const [reports, setReports] = useState<Record<TabId, ReportData | null>>(EMPTY_REPORTS)
  const [linesByTab, setLinesByTab] = useState<Record<TabId, ExtractedLine[]>>(EMPTY_LINES)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showSubtotals, setShowSubtotals] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'unmatched' | 'matched'>('all')
  const [activeTab, setActiveTab] = useState<TabId>('pnl')

  useEffect(() => {
    if (!isLoaded || !activeClient || !start || !end) {
      if (isLoaded) setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/reports?clientId=${activeClient.id}&periodStart=${start}&periodEnd=${end}`
        )
        if (!res.ok) {
          if (!cancelled) {
            setLoadError('Gagal memuat laporan.')
            setLoading(false)
          }
          return
        }
        const data = (await res.json()) as { reports: ReportData[] }
        if (cancelled) return
        const r: Record<TabId, ReportData | null> = { pnl: null, neraca: null, cashflow: null }
        const l: Record<TabId, ExtractedLine[]> = { pnl: [], neraca: [], cashflow: [] }
        for (const rep of data.reports) {
          const tab = TYPE_TO_TAB[rep.reportType]
          if (tab) {
            r[tab] = rep
            l[tab] = rep.lineItems
          }
        }
        setReports(r)
        setLinesByTab(l)
        const firstAvail = TAB_ORDER.find(t => r[t])
        if (firstAvail) setActiveTab(firstAvail)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setLoadError('Terjadi kesalahan saat memuat.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLoaded, activeClient, start, end])

  const lines = linesByTab[activeTab]
  const activeReport = reports[activeTab]

  const updateActiveLines = (fn: (l: ExtractedLine) => ExtractedLine) =>
    setLinesByTab(prev => ({ ...prev, [activeTab]: prev[activeTab].map(fn) }))

  const visibleLines = lines.filter(line => {
    if (!showSubtotals && line.isSubtotal) return false
    if (filterStatus === 'unmatched') return line.status === 'unmatched'
    if (filterStatus === 'matched') return line.status === 'matched' || line.status === 'edited'
    return true
  })

  const unmatchedCount = lines.filter(l => l.status === 'unmatched').length
  const confirmedCount = lines.filter(l => l.status === 'matched' || l.status === 'edited').length
  const rejectedCount = lines.filter(l => l.status === 'rejected').length

  const handleReject = (id: string) =>
    updateActiveLines(l => (l.id === id ? { ...l, status: 'rejected' } : l))

  const handleEdit = (line: ExtractedLine) => {
    setEditingId(line.id)
    setEditValue(line.suggestedCOA ?? line.rawName)
  }

  const handleSaveEdit = (id: string) => {
    updateActiveLines(l =>
      l.id === id ? { ...l, suggestedCOA: editValue, editedName: editValue, status: 'edited' } : l
    )
    setEditingId(null)
  }

  const handleReset = (id: string) =>
    updateActiveLines(l =>
      l.id === id ? { ...l, status: l.confidence >= 70 ? 'matched' : 'unmatched', editedName: undefined } : l
    )

  const handleConfirmAll = () => {
    updateActiveLines(l => (l.status !== 'rejected' ? { ...l, status: 'matched' } : l))
    // TODO(2.5): persist review + POST /api/reports/[id]/confirm lalu ke COA Mapping.
  }

  const tabs = TAB_ORDER.map(id => ({
    id,
    label: TAB_META[id].label,
    Icon: TAB_META[id].Icon,
    count: linesByTab[id].filter(l => !l.isSubtotal).length,
    available: !!reports[id],
  }))

  if (!isLoaded || !activeClient) return null

  const noPeriod = !start || !end
  const noReports = !loading && !noPeriod && TAB_ORDER.every(t => !reports[t])

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >
        <Header currentStep={2} />

        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2" style={{ background: '#f8f8f8', color: '#9ca3af' }}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Memuat hasil ekstraksi…</span>
          </div>
        ) : noPeriod || noReports ? (
          <div className="flex-1 flex items-center justify-center p-6" style={{ background: '#f8f8f8' }}>
            <div className="text-center max-w-sm">
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}
              >
                <FileText className="w-6 h-6" style={{ color: '#8aa32e' }} />
              </div>
              <p className="text-sm font-bold mb-1" style={{ color: '#2d2d2d' }}>
                {loadError ?? 'Belum ada laporan untuk direview'}
              </p>
              <p className="text-xs mb-4" style={{ color: '#6b7280' }}>
                {noPeriod
                  ? 'Buka halaman ini lewat tombol "Proses Laporan" di Upload.'
                  : 'Upload & proses laporan untuk periode ini dulu.'}
              </p>
              <Link
                href="/upload"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-all hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
              >
                <Upload className="w-4 h-4" />
                Ke halaman Upload
              </Link>
            </div>
          </div>
        ) : (
          <main className="flex-1 overflow-hidden flex flex-col md:flex-row" style={{ background: '#f8f8f8' }}>
            {/* LEFT PANEL — PDF Preview */}
            <div
              className="ng-rise w-full md:w-2/5 min-w-[280px] h-[300px] md:h-auto flex-shrink-0 flex flex-col border-r overflow-hidden"
              style={{ borderColor: '#e5e5e5', background: 'white' }}
            >
              <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: '#f0f0f0' }}>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold" style={{ color: '#2d2d2d' }}>Dokumen PDF</h3>
                  <p className="text-xs mt-0.5 truncate max-w-[240px]" style={{ color: '#6b7280' }}>
                    {activeReport?.sourceFileName ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: '#f0f0f0' }}>
                  <Eye className="w-3.5 h-3.5" style={{ color: '#6b7280' }} />
                  <span className="text-xs font-medium" style={{ color: '#6b7280' }}>Preview</span>
                </div>
              </div>

              {/* Report type tabs */}
              <div className="px-4 pt-3 pb-0 flex gap-2 flex-shrink-0">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => tab.available && setActiveTab(tab.id)}
                    disabled={!tab.available}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: activeTab === tab.id ? 'var(--color-accent-primary)' : '#f0f0f0',
                      color: activeTab === tab.id ? 'var(--color-bg-main)' : '#6b7280',
                    }}
                  >
                    <tab.Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className="text-[10px] font-bold px-1 rounded-full"
                        style={{
                          background: activeTab === tab.id ? 'var(--color-bg-main)' : '#d4d4d4',
                          color: activeTab === tab.id ? 'var(--color-accent-primary)' : '#6b7280',
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* PDF viewer area */}
              <div className="flex-1 overflow-hidden p-4">
                {activeReport ? (
                  <iframe
                    key={activeReport.id}
                    src={`/api/reports/${activeReport.id}/pdf`}
                    title={`PDF ${TAB_META[activeTab].label}`}
                    className="w-full h-full rounded-2xl"
                    style={{ border: '1px solid #e5e5e5', background: 'white' }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4d4d4' }} />
                      <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
                        {TAB_META[activeTab].label} belum diupload
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Upload file di halaman sebelumnya</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL — Extracted Data */}
            <div className="ng-rise flex-1 flex flex-col overflow-hidden" style={{ animationDelay: '100ms' }}>
              <div className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: '#f0f0f0', background: 'white' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold" style={{ color: '#2d2d2d' }}>Hasil Ekstraksi AI</h3>
                    <p className="text-xs mt-0.5 truncate" style={{ color: '#6b7280' }}>
                      {activeClient.name} · {TAB_META[activeTab].label} · {formatPeriode(start, end)}
                    </p>
                  </div>
                  <button
                    onClick={handleConfirmAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold flex-shrink-0 transition-all duration-200 hover:shadow-[0_4px_12px_rgba(218,241,99,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                    style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Konfirmasi Semua
                  </button>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: '#f0fdf4' }}>
                    <CheckCircle2 className="w-3 h-3" style={{ color: '#15803d' }} />
                    <span className="text-xs font-medium" style={{ color: '#15803d' }}>{confirmedCount} matched</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: '#fef2f2' }}>
                    <AlertTriangle className="w-3 h-3" style={{ color: '#dc2626' }} />
                    <span className="text-xs font-medium" style={{ color: '#dc2626' }}>{unmatchedCount} perlu review</span>
                  </div>
                  {rejectedCount > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: '#f9f9f9' }}>
                      <XCircle className="w-3 h-3" style={{ color: '#6b7280' }} />
                      <span className="text-xs font-medium" style={{ color: '#6b7280' }}>{rejectedCount} ditolak</span>
                    </div>
                  )}
                </div>

                {/* Filter & toggle row */}
                <div className="flex items-center gap-2 mt-3">
                  {(['all', 'unmatched', 'matched'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterStatus(f)}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: filterStatus === f ? 'var(--color-bg-main)' : '#f0f0f0',
                        color: filterStatus === f ? 'white' : '#6b7280',
                      }}
                    >
                      {f === 'all' ? 'Semua' : f === 'unmatched' ? 'Perlu Review' : 'Matched'}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setShowSubtotals(!showSubtotals)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all"
                    style={{ background: showSubtotals ? '#f0f0f0' : 'transparent', color: '#6b7280', border: '1px solid #e5e5e5' }}
                  >
                    {showSubtotals ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showSubtotals ? 'Sembunyikan subtotal' : 'Tampilkan subtotal'}
                  </button>
                </div>
              </div>

              {/* Table header */}
              <div
                className="grid px-4 py-2 flex-shrink-0"
                style={{ gridTemplateColumns: '1fr 1fr 100px 80px 80px', background: '#f8f8f8', borderBottom: '1px solid #e5e5e5' }}
              >
                {['Nama di PDF', 'COA Master', 'Jumlah (Rp)', 'Conf.', 'Aksi'].map(h => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#9ca3af' }}>{h}</span>
                ))}
              </div>

              {/* Table rows */}
              <div className="flex-1 overflow-y-auto">
                {visibleLines.map((line, idx) => {
                  const conf = getConfidenceStyle(line.confidence)
                  const isEditing = editingId === line.id
                  const isRejected = line.status === 'rejected'

                  return (
                    <div
                      key={line.id}
                      className={`grid px-4 py-2.5 transition-colors ${
                        isRejected
                          ? 'bg-[#fafafa]'
                          : line.status === 'unmatched'
                            ? 'bg-[#fffbeb] hover:bg-[#f9fff3]'
                            : `${idx % 2 === 0 ? 'bg-white' : 'bg-[#fdfdfd]'} hover:bg-[#f9fff3]`
                      }`}
                      style={{ gridTemplateColumns: '1fr 1fr 100px 80px 80px', borderBottom: '1px solid #f5f5f5', opacity: isRejected ? 0.45 : 1 }}
                    >
                      {/* Col 1: Raw name */}
                      <div className="flex items-center gap-2 pr-2 min-w-0">
                        {line.isSubtotal && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#f0f0f0', color: '#9ca3af' }}>SUB</span>
                        )}
                        <span
                          className="text-xs truncate"
                          style={{ color: '#2d2d2d', fontWeight: line.isSubtotal ? 600 : 400, textDecoration: isRejected ? 'line-through' : 'none' }}
                        >
                          {line.rawName}
                        </span>
                      </div>

                      {/* Col 2: COA suggestion */}
                      <div className="flex items-center pr-2 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1 w-full">
                            <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="flex-1 text-xs px-2 py-1 rounded-lg outline-none min-w-0"
                              style={{ border: '1.5px solid var(--color-accent-primary)', background: 'white', color: '#2d2d2d' }}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveEdit(line.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                            />
                            <button onClick={() => handleSaveEdit(line.id)} className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-primary)' }}>
                              <Check className="w-2.5 h-2.5" style={{ color: 'var(--color-bg-main)' }} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: '#f0f0f0' }}>
                              <X className="w-2.5 h-2.5" style={{ color: '#6b7280' }} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {line.suggestedCOA ? (
                              <>
                                <span className="text-xs truncate" style={{ color: '#2d2d2d' }}>{line.editedName ?? line.suggestedCOA}</span>
                                {line.masterCOACode && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#f0f0f0', color: '#9ca3af' }}>{line.masterCOACode}</span>
                                )}
                              </>
                            ) : line.isSubtotal ? (
                              <span className="text-xs" style={{ color: '#d4d4d4' }}>—</span>
                            ) : (
                              <span className="text-xs italic" style={{ color: '#f59e0b' }}>Belum dipetakan</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Col 3: Amount */}
                      <div className="flex items-center">
                        <span className="text-xs font-medium tabular-nums" style={{ color: line.amount < 0 ? '#dc2626' : '#2d2d2d' }}>
                          {formatRupiah(line.amount)}
                        </span>
                      </div>

                      {/* Col 4: Confidence */}
                      <div className="flex items-center">
                        {!line.isSubtotal && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: conf.bg, color: conf.color }}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: conf.color }} />
                            {line.confidence}%
                          </div>
                        )}
                      </div>

                      {/* Col 5: Actions */}
                      <div className="flex items-center gap-1">
                        {!line.isSubtotal && !isRejected && (
                          <>
                            <button
                              onClick={() => handleEdit(line)}
                              title="Edit COA"
                              aria-label={`Edit COA untuk ${line.rawName}`}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-(--color-muted-bg) hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            >
                              <Edit3 className="w-3 h-3" style={{ color: '#6b7280' }} />
                            </button>
                            <button
                              onClick={() => handleReject(line.id)}
                              title="Tolak baris ini"
                              aria-label={`Tolak baris ${line.rawName}`}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-[#fef2f2] hover:bg-[#fee2e2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            >
                              <X className="w-3 h-3" style={{ color: '#dc2626' }} />
                            </button>
                          </>
                        )}
                        {!line.isSubtotal && isRejected && (
                          <button
                            onClick={() => handleReset(line.id)}
                            title="Batalkan penolakan"
                            aria-label={`Batalkan penolakan ${line.rawName}`}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors bg-(--color-muted-bg) hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                          >
                            <RotateCcw className="w-3 h-3" style={{ color: '#6b7280' }} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {visibleLines.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="text-sm" style={{ color: '#9ca3af' }}>Tidak ada baris untuk filter ini.</p>
                  </div>
                )}
              </div>

              {/* Bottom action bar */}
              <div className="px-5 py-4 border-t flex items-center justify-between flex-shrink-0" style={{ borderColor: '#f0f0f0', background: 'white' }}>
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  {visibleLines.length} baris ditampilkan
                  {activeReport?.extractedAt ? ` · Diekstrak ${formatExtractedAt(activeReport.extractedAt)}` : ''}
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href="/upload"
                    className="px-4 py-2 rounded-full text-xs font-medium transition-colors bg-(--color-muted-bg) hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                    style={{ color: '#6b7280', border: '1px solid #e5e5e5' }}
                  >
                    ← Kembali ke Upload
                  </Link>
                  <Link
                    href="/coa-mapping"
                    className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold transition-all hover:shadow-[0_4px_12px_rgba(218,241,99,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                    style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
                  >
                    Lanjut ke COA Mapping →
                  </Link>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  )
}

export default function ExtractionReviewPage() {
  return (
    <Suspense fallback={null}>
      <ExtractionReviewInner />
    </Suspense>
  )
}
