'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/sidebar'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import {
  ChevronDown,
  ChevronUp,
  Check,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Search,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react'

// ============================================================
// MOCK DATA
// ============================================================

const SESSION = {
  clientName: 'Rasyuka',
  periode: '1 Jan 2026 – 31 Jan 2026',
  reportType: 'Laba Rugi',
  totalLines: 24,
  autoMatchedCount: 21,
}

type UnmappedItem = {
  id: string
  rawName: string
  amount: number
  confidence: number
  suggestedCOA?: { kode: string; name: string }
}

const UNMAPPED_ITEMS: UnmappedItem[] = [
  {
    id: 'u1',
    rawName: 'Beban Ads Meta',
    amount: 1674449,
    confidence: 42,
  },
  {
    id: 'u2',
    rawName: 'Biaya Gaji Karyawan Staf',
    amount: 19767100,
    confidence: 78,
    suggestedCOA: { kode: '24-0001', name: 'Beban Gaji' },
  },
  {
    id: 'u3',
    rawName: 'Biaya Sewa Kantor',
    amount: 2666667,
    confidence: 72,
    suggestedCOA: { kode: '25-0001', name: 'Biaya Sewa Kantor' },
  },
]

type COAOption = { kode: string; name: string }
type COAGroup = { group: string; options: COAOption[] }

const MASTER_COA_GROUPS: COAGroup[] = [
  {
    group: 'PENERIMAAN',
    options: [
      { kode: '04-0001', name: 'Penjualan Bruto - Shopee' },
      { kode: '04-0002', name: 'Penjualan Bruto - Tiktok' },
      { kode: '04-0003', name: 'Penjualan Bruto - Offline' },
      { kode: '04-0004', name: 'Retur Penjualan - Shopee' },
      { kode: '04-0005', name: 'Retur Penjualan - Tiktok' },
      { kode: '04-0006', name: 'Potongan Harga - Shopee' },
      { kode: '04-0007', name: 'Potongan Harga - Tiktok' },
    ],
  },
  {
    group: 'BIAYA VARIABEL',
    options: [
      { kode: '11-0001', name: 'Biaya Admin Marketplace - Shopee' },
      { kode: '11-0002', name: 'Biaya Admin Marketplace - Tiktok' },
      { kode: '11-0003', name: 'Beban Iklan - Shopee' },
      { kode: '11-0004', name: 'Beban Iklan - Tiktok' },
      { kode: '11-0005', name: 'Beban Iklan - Meta' },
      { kode: '11-0006', name: 'Biaya Pengiriman' },
      { kode: '11-0007', name: 'Biaya Photoshoot' },
      { kode: '11-0008', name: 'Biaya Promosi Lainnya' },
    ],
  },
  {
    group: 'BIAYA FIXED',
    options: [
      { kode: '24-0001', name: 'Beban Gaji' },
      { kode: '24-0002', name: 'Tunjangan Karyawan' },
      { kode: '25-0001', name: 'Biaya Sewa Kantor' },
      { kode: '25-0002', name: 'Biaya Utilitas' },
      { kode: '26-0001', name: 'Biaya Konsultan Manajemen' },
      { kode: '27-0001', name: 'Biaya Konsumsi dan Entertainment' },
      { kode: '28-0001', name: 'Biaya Perjalanan Dinas' },
      { kode: '29-0001', name: 'Biaya IT dan Software' },
      { kode: '30-0001', name: 'Biaya Operasional Umum' },
    ],
  },
  {
    group: 'BIAYA LAIN-LAIN',
    options: [
      { kode: '31-0001', name: 'Infaq dan Shodaqoh' },
      { kode: '32-0001', name: 'Beban Penyusutan Peralatan' },
    ],
  },
]

const AUTO_MATCHED_ITEMS = [
  { rawName: 'Penjualan Shopee Rasyuka Official', masterCOA: 'Penjualan Bruto - Shopee', kode: '04-0001', confidence: 98 },
  { rawName: 'Penjualan Tiktok', masterCOA: 'Penjualan Bruto - Tiktok', kode: '04-0002', confidence: 97 },
  { rawName: 'Penjualan Offline', masterCOA: 'Penjualan Bruto - Offline', kode: '04-0003', confidence: 95 },
  { rawName: 'Retur Penjualan - Tiktok', masterCOA: 'Retur Penjualan - Tiktok', kode: '04-0005', confidence: 93 },
  { rawName: 'Retur Penjualan - Shopee Rasyuka Official', masterCOA: 'Retur Penjualan - Shopee', kode: '04-0004', confidence: 92 },
  { rawName: 'Potongan Harga - Tiktok', masterCOA: 'Potongan Harga - Tiktok', kode: '04-0007', confidence: 90 },
  { rawName: 'Potongan Harga - Shopee Rasyuka Official', masterCOA: 'Potongan Harga - Shopee', kode: '04-0006', confidence: 91 },
  { rawName: 'HPP - Shopee Rasyuka Official', masterCOA: 'HPP - Shopee', kode: '05-0001', confidence: 96 },
  { rawName: 'HPP - Tiktok', masterCOA: 'HPP - Tiktok', kode: '05-0002', confidence: 95 },
  { rawName: 'HPP - Offline', masterCOA: 'HPP - Offline', kode: '05-0003', confidence: 94 },
  { rawName: 'Biaya Admin MP - Shopee Rasyuka Official', masterCOA: 'Biaya Admin Marketplace - Shopee', kode: '11-0001', confidence: 88 },
  { rawName: 'Beban Ads Shopee', masterCOA: 'Beban Iklan - Shopee', kode: '11-0003', confidence: 85 },
  { rawName: 'Biaya Admin MP - Tiktok', masterCOA: 'Biaya Admin Marketplace - Tiktok', kode: '11-0002', confidence: 87 },
  { rawName: 'Beban Ads Tiktok', masterCOA: 'Beban Iklan - Tiktok', kode: '11-0004', confidence: 84 },
  { rawName: 'Biaya Konsultan', masterCOA: 'Biaya Konsultan Manajemen', kode: '26-0001', confidence: 65 },
  { rawName: 'Biaya Konsumsi', masterCOA: 'Biaya Konsumsi dan Entertainment', kode: '27-0001', confidence: 82 },
  { rawName: 'Biaya Perjalanan Dinas', masterCOA: 'Biaya Perjalanan Dinas', kode: '28-0001', confidence: 94 },
  { rawName: 'Biaya Listrik, Telp, Air', masterCOA: 'Biaya Utilitas', kode: '25-0002', confidence: 88 },
  { rawName: 'Biaya Internet', masterCOA: 'Biaya IT dan Software', kode: '29-0001', confidence: 79 },
  { rawName: 'Infaq Shadaqah', masterCOA: 'Infaq dan Shodaqoh', kode: '31-0001', confidence: 99 },
  { rawName: 'Biaya Penyusutan Peralatan Kantor', masterCOA: 'Beban Penyusutan Peralatan', kode: '32-0001', confidence: 96 },
]

// ============================================================
// HELPERS
// ============================================================

const formatRupiah = (amount: number) => {
  const abs = Math.abs(amount)
  const formatted = new Intl.NumberFormat('id-ID').format(abs)
  return amount < 0 ? `(Rp ${formatted})` : `Rp ${formatted}`
}

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 90) return '#15803d'
  if (confidence >= 70) return '#b45309'
  return '#dc2626'
}

const getConfidenceBg = (confidence: number) => {
  if (confidence >= 90) return '#f0fdf4'
  if (confidence >= 70) return '#fffbeb'
  return '#fef2f2'
}

// ============================================================
// SESSION CONTEXT BAR
// ============================================================

function SessionContextBar({ mappedCount, clientName }: { mappedCount: number; clientName: string }) {
  const totalUnmapped = UNMAPPED_ITEMS.length
  const totalMapped = SESSION.autoMatchedCount + mappedCount
  const progressPct = Math.round((totalMapped / SESSION.totalLines) * 100)
  const remaining = totalUnmapped - mappedCount

  return (
    <div
      className="flex-shrink-0 px-4 sm:px-6 py-4 border-b"
      style={{ borderColor: '#f0f0f0', background: 'white' }}
    >
      <div className="flex items-center justify-between gap-6 flex-wrap">

        {/* Session info pills */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--color-accent-primary)', color: 'var(--color-bg-main)' }}
            >
              {clientName.charAt(0)}
            </div>
            <span className="text-sm font-semibold" style={{ color: '#2d2d2d' }}>
              {clientName}
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', background: '#e5e5e5' }} />

          <span className="text-xs" style={{ color: '#6b7280' }}>
            {SESSION.periode}
          </span>

          <div style={{ width: '1px', height: '16px', background: '#e5e5e5' }} />

          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: '#f0f0f0', color: '#2d2d2d' }}
          >
            {SESSION.reportType}
          </span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {remaining > 0
                ? `${remaining} akun belum dipetakan`
                : 'Semua akun terpetakan'
              }
            </p>
            <p className="text-xs font-semibold" style={{ color: '#2d2d2d' }}>
              {totalMapped} dari {SESSION.totalLines} akun
            </p>
          </div>
          <div style={{ width: '100px' }}>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: '#f0f0f0' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? 'var(--color-accent-primary)' : 'var(--color-accent-secondary)',
                }}
              />
            </div>
            <p className="text-[10px] text-right mt-0.5" style={{ color: '#9ca3af' }}>
              {progressPct}%
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

// ============================================================
// COA DROPDOWN
// ============================================================

function COADropdown({
  value,
  onSelect,
  isOpen,
  onToggle,
  searchQuery,
  onSearchChange,
}: {
  value: COAOption | null
  onSelect: (option: COAOption) => void
  isOpen: boolean
  onToggle: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  const filteredGroups = MASTER_COA_GROUPS.map(group => ({
    ...group,
    options: group.options.filter(opt =>
      opt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.kode.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(group => group.options.length > 0)

  return (
    <div className="relative flex-1">
      {/* Trigger */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl text-left transition-all duration-200"
        style={{
          background: 'white',
          border: isOpen
            ? '1.5px solid var(--color-accent-secondary)'
            : value
              ? '1.5px solid var(--color-accent-primary)'
              : '1.5px solid #e5e5e5',
          boxShadow: isOpen ? '0 0 0 3px rgba(167,139,250,0.1)' : 'none',
        }}
      >
        {value ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: '#f0f0f0', color: '#6b7280' }}
            >
              {value.kode}
            </span>
            <span className="text-sm font-medium truncate" style={{ color: '#2d2d2d' }}>
              {value.name}
            </span>
          </div>
        ) : (
          <span className="flex-1 text-sm" style={{ color: '#9ca3af' }}>
            Pilih dari Master COA...
          </span>
        )}
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            color: '#9ca3af',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl overflow-hidden z-50"
          style={{
            background: 'white',
            border: '1px solid #e5e5e5',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: '240px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search */}
          <div className="p-2 flex-shrink-0" style={{ borderBottom: '1px solid #f0f0f0' }}>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
              style={{ background: '#f8f8f8' }}
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9ca3af' }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Cari nama atau kode COA..."
                className="flex-1 text-xs outline-none bg-transparent"
                style={{ color: '#2d2d2d' }}
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto flex-1">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs" style={{ color: '#9ca3af' }}>Tidak ditemukan</p>
              </div>
            ) : (
              filteredGroups.map(group => (
                <div key={group.group}>
                  <div
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: '#9ca3af', background: '#fafafa' }}
                  >
                    {group.group}
                  </div>
                  {group.options.map(opt => (
                    <button
                      key={opt.kode}
                      type="button"
                      onClick={() => onSelect(opt)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{
                        background: value?.kode === opt.kode ? '#f9fff3' : 'transparent',
                        borderBottom: '1px solid #f8f8f8',
                      }}
                      onMouseEnter={e => {
                        if (value?.kode !== opt.kode)
                          e.currentTarget.style.background = '#f8f8f8'
                      }}
                      onMouseLeave={e => {
                        if (value?.kode !== opt.kode)
                          e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span
                        className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: '#f0f0f0', color: '#6b7280' }}
                      >
                        {opt.kode}
                      </span>
                      <span className="text-xs flex-1" style={{ color: '#2d2d2d' }}>
                        {opt.name}
                      </span>
                      {value?.kode === opt.kode && (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// MAPPING CARD
// ============================================================

function MappingCard({
  item,
  mappedValue,
  onMap,
  isDropdownOpen,
  onDropdownToggle,
  searchQuery,
  onSearchChange,
}: {
  item: UnmappedItem
  mappedValue: COAOption | null
  onMap: (option: COAOption) => void
  isDropdownOpen: boolean
  onDropdownToggle: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  const isMapped = mappedValue !== null
  const hasSuggestion = !!item.suggestedCOA
  const confColor = getConfidenceColor(item.confidence)
  const confBg = getConfidenceBg(item.confidence)

  const cardBorder = isMapped
    ? '2px solid var(--color-accent-primary)'
    : hasSuggestion
      ? '2px dashed var(--color-accent-secondary)'
      : '2px dashed #f59e0b'

  const cardBg = isMapped
    ? 'rgba(218,241,99,0.03)'
    : hasSuggestion
      ? 'rgba(167,139,250,0.03)'
      : 'rgba(245,158,11,0.03)'

  const arrowColor = isMapped ? '#daf163' : hasSuggestion ? '#bbb3f3' : '#f59e0b'

  return (
    <div
      className="rounded-3xl p-5 transition-all duration-300"
      style={{ border: cardBorder, background: cardBg }}
    >
      <div className="flex items-start gap-4">

        {/* LEFT: Raw COA info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: confBg }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: confColor }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: '#2d2d2d' }}>
                {item.rawName}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs" style={{ color: '#9ca3af' }}>dari PDF</span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: confBg, color: confColor }}
                >
                  confidence {item.confidence}%
                </span>
              </div>
              <p className="text-sm font-semibold mt-1" style={{ color: '#6b7280' }}>
                {formatRupiah(item.amount)}
              </p>
            </div>
          </div>

          {/* AI suggestion hint */}
          {hasSuggestion && !isMapped && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mt-2"
              style={{
                background: 'rgba(167,139,250,0.08)',
                border: '1px solid rgba(167,139,250,0.2)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-accent-secondary)' }} />
              <p className="text-xs" style={{ color: 'var(--color-accent-secondary)' }}>
                Saran AI: <strong>{item.suggestedCOA?.name}</strong> ({item.suggestedCOA?.kode})
              </p>
            </div>
          )}
        </div>

        {/* CENTER: Arrow */}
        <div className="flex items-center justify-center flex-shrink-0 mt-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
            style={{ background: `${arrowColor}15` }}
          >
            <ArrowRight className="w-4 h-4" style={{ color: arrowColor }} />
          </div>
        </div>

        {/* RIGHT: COA Selector */}
        <div className="flex-1 min-w-0">
          {isMapped && (
            <div
              className="flex items-center gap-3 p-3 rounded-2xl mb-2"
              style={{
                background: 'rgba(218,241,99,0.08)',
                border: '1.5px solid var(--color-accent-primary)',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--color-accent-primary)' }}
              >
                <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-bg-main)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  {mappedValue.kode}
                </p>
                <p className="text-sm font-semibold truncate" style={{ color: '#2d2d2d' }}>
                  {mappedValue.name}
                </p>
              </div>
              <button
                type="button"
                onClick={onDropdownToggle}
                className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                style={{ color: '#6b7280', background: '#f0f0f0' }}
                onMouseEnter={e => e.currentTarget.style.background = '#e5e5e5'}
                onMouseLeave={e => e.currentTarget.style.background = '#f0f0f0'}
              >
                Ubah
              </button>
            </div>
          )}

          {(!isMapped || isDropdownOpen) && (
            <COADropdown
              value={mappedValue}
              onSelect={(opt) => { onMap(opt) }}
              isOpen={isDropdownOpen}
              onToggle={onDropdownToggle}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// AUTO MATCHED TABLE
// ============================================================

function AutoMatchedTable({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ border: '1px solid #f0f0f0', background: 'white' }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 transition-colors"
        style={{ background: 'white' }}
        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
        onMouseLeave={e => e.currentTarget.style.background = 'white'}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: '#f0fdf4' }}
          >
            <CheckCircle2 className="w-4 h-4" style={{ color: '#15803d' }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: '#2d2d2d' }}>
              Akun Ter-mapping Otomatis
            </p>
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {AUTO_MATCHED_ITEMS.length} akun dicocokkan AI secara otomatis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: '#f0fdf4', color: '#15803d' }}
          >
            {AUTO_MATCHED_ITEMS.length} akun
          </span>
          {isExpanded
            ? <ChevronUp className="w-4 h-4" style={{ color: '#9ca3af' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: '#9ca3af' }} />
          }
        </div>
      </button>

      {/* Table */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #f0f0f0' }}>
          {/* Table header */}
          <div
            className="grid px-4 sm:px-6 py-2"
            style={{
              gridTemplateColumns: '1fr auto 1fr 72px 60px',
              background: '#fafafa',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            {['Nama di PDF', '', 'Master COA', 'Kode', 'Conf.'].map(h => (
              <span
                key={h}
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: '#9ca3af' }}
              >
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {AUTO_MATCHED_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className="grid px-4 sm:px-6 py-2.5 items-center"
              style={{
                gridTemplateColumns: '1fr auto 1fr 72px 60px',
                borderBottom: idx < AUTO_MATCHED_ITEMS.length - 1 ? '1px solid #f8f8f8' : 'none',
                background: idx % 2 === 0 ? 'white' : '#fdfdfd',
                opacity: 0.7,
              }}
            >
              <span className="text-xs truncate pr-2" style={{ color: '#6b7280' }}>
                {item.rawName}
              </span>
              <ArrowRight className="w-3 h-3 mx-2 flex-shrink-0" style={{ color: '#d4d4d4' }} />
              <span className="text-xs font-medium truncate pr-2" style={{ color: '#2d2d2d' }}>
                {item.masterCOA}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: '#f0f0f0', color: '#9ca3af' }}
              >
                {item.kode}
              </span>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: getConfidenceBg(item.confidence),
                  color: getConfidenceColor(item.confidence),
                }}
              >
                {item.confidence}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function COAMappingPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { activeClient: client } = useClient()

  const [mappings, setMappings] = useState<Record<string, COAOption>>({})
  const [autoMatchedExpanded, setAutoMatchedExpanded] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const mappedCount = Object.keys(mappings).length
  const isAllMapped = mappedCount === UNMAPPED_ITEMS.length

  const handleMap = (itemId: string, option: COAOption) => {
    setMappings(prev => ({ ...prev, [itemId]: option }))
    setOpenDropdownId(null)
    setSearchQueries(prev => ({ ...prev, [itemId]: '' }))
  }

  const handleDropdownToggle = (itemId: string) => {
    setOpenDropdownId(prev => prev === itemId ? null : itemId)
    if (openDropdownId !== itemId) {
      setSearchQueries(prev => ({ ...prev, [itemId]: '' }))
    }
  }

  const handleSave = () => {
    console.log('[COA Mapping] Saving mappings:', mappings)
    // TODO: POST to /api/reports/[id]/mapping
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (openDropdownId) {
        const target = e.target as HTMLElement
        if (!target.closest('[data-dropdown]')) {
          setOpenDropdownId(null)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdownId])

  if (!isLoaded || !activeClient) return null

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
      <Sidebar activeItem="coa-mapping" />

      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl overflow-hidden flex flex-col"
          style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
        >

          {/* Page header */}
          <div
            className="flex-shrink-0 px-4 sm:px-6 py-5 border-b"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <h1 className="text-xl font-bold" style={{ color: '#2d2d2d' }}>
              COA Mapping
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
              Petakan akun mentah dari PDF ke Master COA klien
            </p>
          </div>

          {/* Session context bar */}
          <SessionContextBar mappedCount={mappedCount} clientName={client?.name ?? SESSION.clientName} />

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
            <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">

              {/* Unmapped section */}
              <div
                className="rounded-3xl p-4 sm:p-6"
                style={{
                  background: 'white',
                  boxShadow: '0 4px 20px rgb(0,0,0,0.05)',
                  border: '1px solid #f0f0f0',
                }}
              >
                <div className="mb-5">
                  <h2 className="text-base font-bold" style={{ color: '#2d2d2d' }}>
                    Akun Belum Dipetakan
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
                    Petakan setiap akun ke Master COA {client?.name ?? SESSION.clientName}
                  </p>
                </div>

                <div className="space-y-4">
                  {UNMAPPED_ITEMS.map(item => (
                    <div key={item.id} data-dropdown>
                      <MappingCard
                        item={item}
                        mappedValue={mappings[item.id] ?? null}
                        onMap={(opt) => handleMap(item.id, opt)}
                        isDropdownOpen={openDropdownId === item.id}
                        onDropdownToggle={() => handleDropdownToggle(item.id)}
                        searchQuery={searchQueries[item.id] ?? ''}
                        onSearchChange={(q) => setSearchQueries(prev => ({ ...prev, [item.id]: q }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-matched section */}
              <AutoMatchedTable
                isExpanded={autoMatchedExpanded}
                onToggle={() => setAutoMatchedExpanded(p => !p)}
              />

            </div>
          </main>

          {/* Sticky action bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-t"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <div className="flex items-center gap-2">
              {isAllMapped ? (
                <>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#f0fdf4' }}
                  >
                    <Check className="w-3.5 h-3.5" style={{ color: '#15803d' }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: '#15803d' }}>
                    Semua akun telah dipetakan ✓
                  </span>
                </>
              ) : (
                <>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#fffbeb' }}
                  >
                    <AlertTriangle className="w-3 h-3" style={{ color: '#f59e0b' }} />
                  </div>
                  <span className="text-sm" style={{ color: '#6b7280' }}>
                    <strong style={{ color: '#2d2d2d' }}>
                      {UNMAPPED_ITEMS.length - mappedCount} akun
                    </strong>{' '}
                    belum dipetakan
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors"
                style={{
                  color: '#6b7280',
                  background: '#f0f0f0',
                  border: '1px solid #e5e5e5',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#e5e5e5'}
                onMouseLeave={e => e.currentTarget.style.background = '#f0f0f0'}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali ke Review
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!isAllMapped}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: isAllMapped ? 'var(--color-accent-primary)' : '#e5e5e5',
                  color: isAllMapped ? 'var(--color-bg-main)' : '#9ca3af',
                  cursor: isAllMapped ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={e => {
                  if (isAllMapped) e.currentTarget.style.boxShadow = '0 4px 16px rgba(218,241,99,0.4)'
                }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
              >
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Tersimpan!
                  </>
                ) : (
                  <>
                    Simpan & Lanjut
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}