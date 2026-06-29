'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
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
} from 'lucide-react'

// Mock extracted data — will be replaced with real Gemini API data in Phase 3
const MOCK_REPORT_META = {
  clientName: 'Rasyuka',
  reportType: 'Laba Rugi',
  periode: 'Januari 2026',
  fileName: '01. January - Laporan Keuangan Rasyuka 2026 - L_R.pdf',
  extractedAt: '2026-06-19 14:32',
  totalLines: 28,
  matchedLines: 25,
  unmatchedLines: 3,
}

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

const MOCK_LINES: ExtractedLine[] = [
  { id: '1', rawName: 'Penjualan Shopee Rasyuka Official', suggestedCOA: 'Penjualan Bruto - Shopee', masterCOACode: '04-0001', amount: 422597000, isSubtotal: false, confidence: 98, status: 'matched' },
  { id: '2', rawName: 'Penjualan Tiktok', suggestedCOA: 'Penjualan Bruto - Tiktok', masterCOACode: '04-0002', amount: 112199000, isSubtotal: false, confidence: 97, status: 'matched' },
  { id: '3', rawName: 'Penjualan Offline', suggestedCOA: 'Penjualan Bruto - Offline', masterCOACode: '04-0003', amount: 63804000, isSubtotal: false, confidence: 95, status: 'matched' },
  { id: '4', rawName: 'Retur Penjualan - Tiktok', suggestedCOA: 'Retur Penjualan - Tiktok', masterCOACode: '04-0005', amount: -534000, isSubtotal: false, confidence: 93, status: 'matched' },
  { id: '5', rawName: 'Retur Penjualan - Shopee Rasyuka Official', suggestedCOA: 'Retur Penjualan - Shopee', masterCOACode: '04-0004', amount: -2526000, isSubtotal: false, confidence: 92, status: 'matched' },
  { id: '6', rawName: 'Potongan Harga - Tiktok', suggestedCOA: 'Potongan Harga - Tiktok', masterCOACode: '04-0007', amount: -23815076, isSubtotal: false, confidence: 90, status: 'matched' },
  { id: '7', rawName: 'Potongan Harga - Shopee Rasyuka Official', suggestedCOA: 'Potongan Harga - Shopee', masterCOACode: '04-0006', amount: -86637993, isSubtotal: false, confidence: 91, status: 'matched' },
  { id: '8', rawName: 'PENERIMAAN BERSIH', suggestedCOA: null, masterCOACode: null, amount: 485086931, isSubtotal: true, confidence: 100, status: 'matched' },
  { id: '9', rawName: 'Harga Pokok Penjualan - Shopee Rasyuka Official', suggestedCOA: 'HPP - Shopee', masterCOACode: '05-0001', amount: 138697320, isSubtotal: false, confidence: 96, status: 'matched' },
  { id: '10', rawName: 'Harga Pokok Penjualan - Tiktok', suggestedCOA: 'HPP - Tiktok', masterCOACode: '05-0002', amount: 35120790, isSubtotal: false, confidence: 95, status: 'matched' },
  { id: '11', rawName: 'Harga Pokok Penjualan - Offline', suggestedCOA: 'HPP - Offline', masterCOACode: '05-0003', amount: 26636093, isSubtotal: false, confidence: 94, status: 'matched' },
  { id: '12', rawName: 'Biaya Admin MP - Shopee Rasyuka Official', suggestedCOA: 'Biaya Admin Marketplace - Shopee', masterCOACode: '11-0001', amount: 54103662, isSubtotal: false, confidence: 88, status: 'matched' },
  { id: '13', rawName: 'Beban Ads Shopee', suggestedCOA: 'Beban Iklan - Shopee', masterCOACode: '11-0003', amount: 38453972, isSubtotal: false, confidence: 85, status: 'matched' },
  { id: '14', rawName: 'Biaya Admin MP - Tiktok', suggestedCOA: 'Biaya Admin Marketplace - Tiktok', masterCOACode: '11-0002', amount: 16043662, isSubtotal: false, confidence: 87, status: 'matched' },
  { id: '15', rawName: 'Beban Ads Tiktok', suggestedCOA: 'Beban Iklan - Tiktok', masterCOACode: '11-0004', amount: 12297117, isSubtotal: false, confidence: 84, status: 'matched' },
  { id: '16', rawName: 'Beban Ads Meta', suggestedCOA: null, masterCOACode: null, amount: 1674449, isSubtotal: false, confidence: 42, status: 'unmatched' },
  { id: '17', rawName: 'Biaya Gaji Karyawan Staf', suggestedCOA: 'Beban Gaji', masterCOACode: '24-0001', amount: 19767100, isSubtotal: false, confidence: 78, status: 'unmatched' },
  { id: '18', rawName: 'Biaya Sewa Kantor', suggestedCOA: 'Biaya Sewa', masterCOACode: '25-0001', amount: 2666667, isSubtotal: false, confidence: 72, status: 'unmatched' },
  { id: '19', rawName: 'Biaya Konsultan', suggestedCOA: 'Biaya Konsultan Manajemen', masterCOACode: '26-0001', amount: 2375000, isSubtotal: false, confidence: 65, status: 'matched' },
  { id: '20', rawName: 'Biaya Konsumsi', suggestedCOA: 'Biaya Konsumsi dan Entertainment', masterCOACode: '27-0001', amount: 873000, isSubtotal: false, confidence: 82, status: 'matched' },
  { id: '21', rawName: 'Infaq Shadaqah', suggestedCOA: 'Infaq dan Shodaqoh', masterCOACode: '31-0001', amount: -1435000, isSubtotal: false, confidence: 99, status: 'matched' },
  { id: '22', rawName: 'Biaya Penyusutan Peralatan Kantor', suggestedCOA: 'Beban Penyusutan Peralatan', masterCOACode: '32-0001', amount: -2158020, isSubtotal: false, confidence: 96, status: 'matched' },
  { id: '23', rawName: 'LABA SEBELUM PAJAK', suggestedCOA: null, masterCOACode: null, amount: 127635672, isSubtotal: true, confidence: 100, status: 'matched' },
  { id: '24', rawName: 'LABA BERSIH SETELAH PAJAK', suggestedCOA: null, masterCOACode: null, amount: 127635672, isSubtotal: true, confidence: 100, status: 'matched' },
]

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

export default function ExtractionReviewPage() {
  const { activeClient, isLoaded } = useRequireClient()

  const [lines, setLines] = useState<ExtractedLine[]>(MOCK_LINES)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showSubtotals, setShowSubtotals] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'unmatched' | 'matched'>('all')
  const [activeTab, setActiveTab] = useState<'pnl' | 'neraca' | 'cashflow'>('pnl')

  const visibleLines = lines.filter(line => {
    if (!showSubtotals && line.isSubtotal) return false
    if (filterStatus === 'unmatched') return line.status === 'unmatched'
    if (filterStatus === 'matched') return line.status === 'matched' || line.status === 'edited'
    return true
  })

  const unmatchedCount = lines.filter(l => l.status === 'unmatched').length
  const confirmedCount = lines.filter(l => l.status === 'matched' || l.status === 'edited').length
  const rejectedCount = lines.filter(l => l.status === 'rejected').length

  const handleAccept = (id: string) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, status: 'matched' } : l))
  }

  const handleReject = (id: string) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, status: 'rejected' } : l))
  }

  const handleEdit = (line: ExtractedLine) => {
    setEditingId(line.id)
    setEditValue(line.suggestedCOA ?? line.rawName)
  }

  const handleSaveEdit = (id: string) => {
    setLines(prev => prev.map(l =>
      l.id === id ? { ...l, suggestedCOA: editValue, editedName: editValue, status: 'edited' } : l
    ))
    setEditingId(null)
  }

  const handleReset = (id: string) => {
    setLines(prev => prev.map(l =>
      l.id === id ? { ...l, status: l.confidence >= 70 ? 'matched' : 'unmatched', editedName: undefined } : l
    ))
  }

  const handleConfirmAll = () => {
    setLines(prev => prev.map(l =>
      l.status !== 'rejected' ? { ...l, status: 'matched' } : l
    ))
    console.log('[Review] All lines confirmed — TODO: POST to /api/reports/confirm')
  }

  const tabs = [
    { id: 'pnl', label: 'Laba Rugi', icon: '📈', count: 24 },
    { id: 'neraca', label: 'Neraca', icon: '⚖️', count: 0 },
    { id: 'cashflow', label: 'Arus Kas', icon: '💸', count: 0 },
  ]

  if (!isLoaded || !activeClient) return null

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
      <Sidebar activeItem="upload" />

      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl overflow-hidden flex flex-col"
          style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
        >
          <Header currentStep={2} />

          <main className="flex-1 overflow-hidden flex flex-col md:flex-row" style={{ background: '#f8f8f8' }}>

            {/* LEFT PANEL — PDF Preview */}
            <div
              className="w-full md:w-2/5 min-w-[280px] h-[300px] md:h-auto flex-shrink-0 flex flex-col border-r overflow-hidden"
              style={{ borderColor: '#e5e5e5', background: 'white' }}
            >
              {/* PDF panel header */}
              <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
                style={{ borderColor: '#f0f0f0' }}>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: '#2d2d2d' }}>Dokumen PDF</h3>
                  <p className="text-xs mt-0.5 truncate max-w-[240px]"
                    style={{ color: '#6b7280' }}>
                    {MOCK_REPORT_META.fileName}
                  </p>
                </div>
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: '#f0f0f0' }}
                >
                  <Eye className="w-3.5 h-3.5" style={{ color: '#6b7280' }} />
                  <span className="text-xs font-medium" style={{ color: '#6b7280' }}>Preview</span>
                </div>
              </div>

              {/* Report type tabs */}
              <div className="px-4 pt-3 pb-0 flex gap-2 flex-shrink-0">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                    style={{
                      background: activeTab === tab.id ? 'var(--color-accent-primary)' : '#f0f0f0',
                      color: activeTab === tab.id ? 'var(--color-bg-main)' : '#6b7280',
                    }}
                  >
                    <span>{tab.icon}</span>
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
              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'pnl' ? (
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid #e5e5e5' }}
                  >
                    {/* Mock PDF content — styled to look like the Rasyuka PnL PDF */}
                    <div className="p-4" style={{ background: '#fafafa' }}>
                      <div className="text-center mb-4">
                        <p className="text-sm font-bold" style={{ color: 'var(--color-bg-main)' }}>RASYUKA</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--color-bg-main)' }}>Laba Rugi</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--color-bg-main)' }}>January 2026</p>
                      </div>
                      <div className="space-y-0.5">
                        {[
                          { label: 'PENERIMAAN :', value: null, bold: true, indent: 0 },
                          { label: 'Penjualan Shopee Rasyuka Official', value: '422,597,000', bold: false, indent: 1 },
                          { label: 'Penjualan Tiktok', value: '112,199,000', bold: false, indent: 1 },
                          { label: 'Penjualan Offline', value: '63,804,000', bold: false, indent: 1 },
                          { label: 'Retur Penjualan - Tiktok', value: '(534,000)', bold: false, indent: 1 },
                          { label: 'Retur Penjualan - Shopee Rasyuka Official', value: '(2,526,000)', bold: false, indent: 1 },
                          { label: 'Potongan Harga - Tiktok', value: '(23,815,076)', bold: false, indent: 1 },
                          { label: 'Potongan Harga - Shopee Rasyuka Official', value: '(86,637,993)', bold: false, indent: 1 },
                          { label: 'PENERIMAAN BERSIH', value: '485,086,931', bold: true, indent: 0 },
                          { label: 'Total HPP', value: '200,454,203', bold: true, indent: 0 },
                          { label: 'LABA KOTOR', value: '284,632,728', bold: true, indent: 0 },
                          { label: 'Total Variabel Cost', value: '124,303,362', bold: true, indent: 0 },
                          { label: 'Total Fixed Cost', value: '29,100,674', bold: true, indent: 0 },
                          { label: 'TOTAL BIAYA OPERASIONAL', value: '153,404,036', bold: true, indent: 0 },
                          { label: 'LABA/RUGI OPERASI', value: '131,228,692', bold: true, indent: 0 },
                          { label: 'LABA SEBELUM PAJAK', value: '127,635,672', bold: true, indent: 0 },
                          { label: 'LABA BERSIH SETELAH PAJAK', value: '127,635,672', bold: true, indent: 0 },
                        ].map((row, i) => (
                          <div
                            key={i}
                            className="flex justify-between items-baseline py-0.5 px-2 rounded"
                            style={{
                              paddingLeft: row.indent ? '1.5rem' : '0.5rem',
                              background: row.bold ? '#f0f0f0' : 'transparent',
                            }}
                          >
                            <span
                              className="text-xs flex-1 pr-4"
                              style={{
                                color: '#2d2d2d',
                                fontWeight: row.bold ? 600 : 400,
                              }}
                            >
                              {row.label}
                            </span>
                            {row.value && (
                              <span
                                className="text-xs flex-shrink-0"
                                style={{
                                  color: '#2d2d2d',
                                  fontWeight: row.bold ? 600 : 400,
                                }}
                              >
                                {row.value}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#d4d4d4' }} />
                      <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
                        {tabs.find(t => t.id === activeTab)?.label} belum diupload
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                        Upload file di halaman sebelumnya
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL — Extracted Data */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Right panel header */}
              <div
                className="px-5 py-4 border-b flex-shrink-0"
                style={{ borderColor: '#f0f0f0', background: 'white' }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: '#2d2d2d' }}>
                      Hasil Ekstraksi AI
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                      {MOCK_REPORT_META.clientName} · {MOCK_REPORT_META.reportType} · {MOCK_REPORT_META.periode}
                    </p>
                  </div>
                  <button
                    onClick={handleConfirmAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200"
                    style={{
                      background: 'var(--color-accent-primary)',
                      color: 'var(--color-bg-main)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(218,241,99,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Konfirmasi Semua
                  </button>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                    style={{ background: '#f0fdf4' }}
                  >
                    <CheckCircle2 className="w-3 h-3" style={{ color: '#15803d' }} />
                    <span className="text-xs font-medium" style={{ color: '#15803d' }}>
                      {confirmedCount} matched
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                    style={{ background: '#fef2f2' }}
                  >
                    <AlertTriangle className="w-3 h-3" style={{ color: '#dc2626' }} />
                    <span className="text-xs font-medium" style={{ color: '#dc2626' }}>
                      {unmatchedCount} perlu review
                    </span>
                  </div>
                  {rejectedCount > 0 && (
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                      style={{ background: '#f9f9f9' }}
                    >
                      <XCircle className="w-3 h-3" style={{ color: '#6b7280' }} />
                      <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
                        {rejectedCount} ditolak
                      </span>
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
                    style={{
                      background: showSubtotals ? '#f0f0f0' : 'transparent',
                      color: '#6b7280',
                      border: '1px solid #e5e5e5',
                    }}
                  >
                    {showSubtotals ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showSubtotals ? 'Sembunyikan subtotal' : 'Tampilkan subtotal'}
                  </button>
                </div>
              </div>

              {/* Table header */}
              <div
                className="grid px-4 py-2 flex-shrink-0"
                style={{
                  gridTemplateColumns: '1fr 1fr 100px 80px 80px',
                  background: '#f8f8f8',
                  borderBottom: '1px solid #e5e5e5',
                }}
              >
                {['Nama di PDF', 'COA Master', 'Jumlah (Rp)', 'Conf.', 'Aksi'].map(h => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: '#9ca3af' }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Table rows — scrollable */}
              <div className="flex-1 overflow-y-auto">
                {visibleLines.map((line, idx) => {
                  const conf = getConfidenceStyle(line.confidence)
                  const isEditing = editingId === line.id
                  const isRejected = line.status === 'rejected'

                  return (
                    <div
                      key={line.id}
                      className="grid px-4 py-2.5 transition-colors"
                      style={{
                        gridTemplateColumns: '1fr 1fr 100px 80px 80px',
                        borderBottom: '1px solid #f5f5f5',
                        background: isRejected
                          ? '#fafafa'
                          : line.status === 'unmatched'
                            ? '#fffbeb'
                            : idx % 2 === 0 ? 'white' : '#fdfdfd',
                        opacity: isRejected ? 0.45 : 1,
                      }}
                      onMouseEnter={e => {
                        if (!isRejected) e.currentTarget.style.background = '#f9fff3'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isRejected
                          ? '#fafafa'
                          : line.status === 'unmatched'
                            ? '#fffbeb'
                            : idx % 2 === 0 ? 'white' : '#fdfdfd'
                      }}
                    >
                      {/* Col 1: Raw name */}
                      <div className="flex items-center gap-2 pr-2 min-w-0">
                        {line.isSubtotal && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ background: '#f0f0f0', color: '#9ca3af' }}
                          >
                            SUB
                          </span>
                        )}
                        <span
                          className="text-xs truncate"
                          style={{
                            color: '#2d2d2d',
                            fontWeight: line.isSubtotal ? 600 : 400,
                            textDecoration: isRejected ? 'line-through' : 'none',
                          }}
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
                              style={{
                                border: '1.5px solid var(--color-accent-primary)',
                                background: 'white',
                                color: '#2d2d2d',
                              }}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveEdit(line.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                            />
                            <button
                              onClick={() => handleSaveEdit(line.id)}
                              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                              style={{ background: 'var(--color-accent-primary)' }}
                            >
                              <Check className="w-2.5 h-2.5" style={{ color: 'var(--color-bg-main)' }} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                              style={{ background: '#f0f0f0' }}
                            >
                              <X className="w-2.5 h-2.5" style={{ color: '#6b7280' }} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            {line.suggestedCOA ? (
                              <>
                                <span className="text-xs truncate" style={{ color: '#2d2d2d' }}>
                                  {line.editedName ?? line.suggestedCOA}
                                </span>
                                {line.masterCOACode && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                                    style={{ background: '#f0f0f0', color: '#9ca3af' }}
                                  >
                                    {line.masterCOACode}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs italic" style={{ color: '#f59e0b' }}>
                                Belum dipetakan
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Col 3: Amount */}
                      <div className="flex items-center">
                        <span
                          className="text-xs font-medium tabular-nums"
                          style={{ color: line.amount < 0 ? '#dc2626' : '#2d2d2d' }}
                        >
                          {formatRupiah(line.amount)}
                        </span>
                      </div>

                      {/* Col 4: Confidence */}
                      <div className="flex items-center">
                        {!line.isSubtotal && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: conf.bg, color: conf.color }}
                          >
                            {line.confidence}%
                          </span>
                        )}
                      </div>

                      {/* Col 5: Actions */}
                      <div className="flex items-center gap-1">
                        {!line.isSubtotal && !isRejected && (
                          <>
                            <button
                              onClick={() => handleEdit(line)}
                              title="Edit COA"
                              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                              style={{ background: '#f0f0f0' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e5e5'}
                              onMouseLeave={e => e.currentTarget.style.background = '#f0f0f0'}
                            >
                              <Edit3 className="w-2.5 h-2.5" style={{ color: '#6b7280' }} />
                            </button>
                            <button
                              onClick={() => handleReject(line.id)}
                              title="Tolak baris ini"
                              className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                              style={{ background: '#fef2f2' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'}
                              onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}
                            >
                              <X className="w-2.5 h-2.5" style={{ color: '#dc2626' }} />
                            </button>
                          </>
                        )}
                        {!line.isSubtotal && isRejected && (
                          <button
                            onClick={() => handleReset(line.id)}
                            title="Batalkan penolakan"
                            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: '#f0f0f0' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#e5e5e5'}
                            onMouseLeave={e => e.currentTarget.style.background = '#f0f0f0'}
                          >
                            <RotateCcw className="w-2.5 h-2.5" style={{ color: '#6b7280' }} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Bottom action bar */}
              <div
                className="px-5 py-4 border-t flex items-center justify-between flex-shrink-0"
                style={{ borderColor: '#f0f0f0', background: 'white' }}
              >
                <p className="text-xs" style={{ color: '#6b7280' }}>
                  {visibleLines.length} baris ditampilkan · Diekstrak {MOCK_REPORT_META.extractedAt}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    className="px-4 py-2 rounded-full text-xs font-medium transition-colors"
                    style={{
                      background: '#f0f0f0',
                      color: '#6b7280',
                      border: '1px solid #e5e5e5',
                    }}
                    onClick={() => window.history.back()}
                  >
                    ← Kembali ke Upload
                  </button>
                  <button
                    onClick={handleConfirmAll}
                    className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold transition-all"
                    style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(218,241,99,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    Lanjut ke COA Mapping →
                  </button>
                </div>
              </div>

            </div>
          </main>
        </div>
      </div>
    </div>
  )
}