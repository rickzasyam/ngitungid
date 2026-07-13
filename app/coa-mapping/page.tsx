'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRequireClient } from '@/lib/use-require-client'
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
  ArrowRightLeft,
  Loader2,
  Inbox,
} from 'lucide-react'

// ============================================================
// TYPES
// ============================================================

type COAOption = { id: string; kode: string; name: string }
type COAGroup = { group: string; options: COAOption[] }

type UnmappedItem = {
  id: string
  rawName: string
  amount: number
  confidence: number
  suggestedCOA?: COAOption
}

type AutoMatchedItem = {
  id: string
  rawName: string
  masterCOA: string
  kode: string
  confidence: number
}

type Period = { periodStart: string; periodEnd: string }

// Bentuk mentah dari API
type CoaAccount = {
  id: string
  kode: string
  nama: string
  subKelompok: string
}

type ApiLineItem = {
  id: string
  rawName: string
  amount: number
  confidence: number
  masterCoaId: string | null
  suggestedCoaId: string | null
  isSubtotal: boolean
  status: string
}

type ApiReport = {
  id: string
  reportType: 'laba_rugi' | 'neraca' | 'arus_kas'
  lineItems: ApiLineItem[]
}

const REPORT_TYPE_LABEL: Record<ApiReport['reportType'], string> = {
  laba_rugi: 'Laba Rugi',
  neraca: 'Neraca',
  arus_kas: 'Arus Kas',
}

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

/** '2026-01-01' → '1 Jan 2026'. Sengaja parse manual: `new Date('2026-01-01')`
 *  di-treat sebagai UTC midnight, bisa mundur sehari di timezone WIB. */
const formatTanggal = (ymd: string) => {
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1]} ${y}`
}

const formatPeriode = (p: Period) => `${formatTanggal(p.periodStart)} – ${formatTanggal(p.periodEnd)}`

const periodKey = (p: Period) => `${p.periodStart}_${p.periodEnd}`

/** Master COA (urut kode) → grup dropdown berdasarkan subKelompok, urutan
 *  kemunculan pertama dipertahankan supaya stabil antar render. */
function buildCoaGroups(accounts: CoaAccount[]): COAGroup[] {
  const groups = new Map<string, COAOption[]>()
  for (const a of accounts) {
    const key = a.subKelompok.toUpperCase()
    const arr = groups.get(key) ?? []
    arr.push({ id: a.id, kode: a.kode, name: a.nama })
    groups.set(key, arr)
  }
  return [...groups].map(([group, options]) => ({ group, options }))
}

// ============================================================
// SESSION CONTEXT BAR
// ============================================================

function SessionContextBar({
  clientName,
  periods,
  selectedPeriod,
  onSelectPeriod,
  reportTypes,
  totalLines,
  autoMatchedCount,
  mappedCount,
  unmappedTotal,
}: {
  clientName: string
  periods: Period[]
  selectedPeriod: Period | null
  onSelectPeriod: (p: Period) => void
  reportTypes: string[]
  totalLines: number
  autoMatchedCount: number
  mappedCount: number
  unmappedTotal: number
}) {
  const totalMapped = autoMatchedCount + mappedCount
  const progressPct = totalLines > 0 ? Math.round((totalMapped / totalLines) * 100) : 0
  const remaining = unmappedTotal - mappedCount

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

          {/* Period selector */}
          {periods.length === 0 ? (
            <span className="text-xs" style={{ color: '#9ca3af' }}>
              Belum ada periode
            </span>
          ) : (
            <div className="relative">
              <label htmlFor="period-select" className="sr-only">
                Pilih periode laporan
              </label>
              <select
                id="period-select"
                value={selectedPeriod ? periodKey(selectedPeriod) : ''}
                onChange={e => {
                  const next = periods.find(p => periodKey(p) === e.target.value)
                  if (next) onSelectPeriod(next)
                }}
                className="text-xs rounded-full pl-3 pr-8 py-1.5 appearance-none cursor-pointer transition-colors hover:bg-[#f0f0f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ background: '#f8f8f8', color: '#2d2d2d', border: '1px solid #e5e5e5', minHeight: '32px' }}
              >
                {periods.map(p => (
                  <option key={periodKey(p)} value={periodKey(p)}>
                    {formatPeriode(p)}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#9ca3af' }}
              />
            </div>
          )}

          {reportTypes.length > 0 && (
            <>
              <div style={{ width: '1px', height: '16px', background: '#e5e5e5' }} />
              {reportTypes.map(t => (
                <span
                  key={t}
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: '#f0f0f0', color: '#2d2d2d' }}
                >
                  {t}
                </span>
              ))}
            </>
          )}
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
              {totalMapped} dari {totalLines} akun
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
  groups,
  value,
  onSelect,
  isOpen,
  onToggle,
  searchQuery,
  onSearchChange,
}: {
  groups: COAGroup[]
  value: COAOption | null
  onSelect: (option: COAOption) => void
  isOpen: boolean
  onToggle: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  const filteredGroups = groups.map(group => ({
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
            {groups.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  Master COA klien ini masih kosong
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
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
                      key={opt.id}
                      type="button"
                      onClick={() => onSelect(opt)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-inset ${
                        value?.id === opt.id ? 'bg-[#f9fff3]' : 'hover:bg-[#f8f8f8]'
                      }`}
                      style={{ borderBottom: '1px solid #f8f8f8' }}
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
                      {value?.id === opt.id && (
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
  groups,
  mappedValue,
  onMap,
  isDropdownOpen,
  onDropdownToggle,
  searchQuery,
  onSearchChange,
}: {
  item: UnmappedItem
  groups: COAGroup[]
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
    ? '2px solid #daf163'
    : hasSuggestion
      ? '2px dashed #bbb3f3'
      : '2px dashed #fde68a'

  const cardBg = isMapped
    ? 'linear-gradient(135deg, #f9fff0 0%, #f0fde4 100%)'
    : hasSuggestion
      ? 'linear-gradient(135deg, #faf9ff 0%, #f5f3ff 100%)'
      : 'linear-gradient(135deg, #fffdf0 0%, #fefce8 100%)'

  const cardShadow = isMapped ? '0 0 0 4px rgba(218,241,99,0.10)' : 'none'

  const arrowColor = isMapped ? '#daf163' : hasSuggestion ? '#bbb3f3' : '#f59e0b'

  return (
    <div
      className="rounded-3xl p-5"
      style={{ border: cardBorder, background: cardBg, boxShadow: cardShadow, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
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
                className="text-xs px-3 py-2 rounded-lg transition-colors flex-shrink-0 bg-(--color-muted-bg) hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ color: '#6b7280' }}
              >
                Ubah
              </button>
            </div>
          )}

          {(!isMapped || isDropdownOpen) && (
            <COADropdown
              groups={groups}
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
  items,
  isExpanded,
  onToggle,
}: {
  items: AutoMatchedItem[]
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
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 transition-colors bg-white hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-inset"
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
              {items.length} akun dicocokkan AI secara otomatis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: '#f0fdf4', color: '#15803d' }}
          >
            {items.length} akun
          </span>
          {isExpanded
            ? <ChevronUp className="w-4 h-4" style={{ color: '#9ca3af' }} />
            : <ChevronDown className="w-4 h-4" style={{ color: '#9ca3af' }} />
          }
        </div>
      </button>

      {/* Table */}
      {isExpanded && items.length > 0 && (
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
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="grid px-4 sm:px-6 py-2.5 items-center"
              style={{
                gridTemplateColumns: '1fr auto 1fr 72px 60px',
                borderBottom: idx < items.length - 1 ? '1px solid #f8f8f8' : 'none',
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
// STATE PANELS
// ============================================================

function CenteredState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      {icon}
      <p className="text-sm font-semibold" style={{ color: '#2d2d2d' }}>{title}</p>
      <p className="text-xs max-w-sm" style={{ color: '#6b7280' }}>{subtitle}</p>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function COAMappingPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const clientId = activeClient?.id ?? null

  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [accounts, setAccounts] = useState<CoaAccount[]>([])
  const [reports, setReports] = useState<ApiReport[]>([])

  const [loadingPeriods, setLoadingPeriods] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mappings, setMappings] = useState<Record<string, COAOption>>({})
  const [autoMatchedExpanded, setAutoMatchedExpanded] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Fetch periode tiap kali klien aktif berubah ────────────
  useEffect(() => {
    if (!clientId) return
    let cancelled = false

    setLoadingPeriods(true)
    setLoadError(null)
    // Reset state milik klien sebelumnya supaya tidak "bocor" ke klien baru.
    setPeriods([])
    setSelectedPeriod(null)
    setAccounts([])
    setReports([])
    setMappings({})
    setOpenDropdownId(null)

    fetch(`/api/reports/periods?clientId=${clientId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Gagal memuat periode.'))))
      .then((data: { periods: Period[] }) => {
        if (cancelled) return
        setPeriods(data.periods)
        setSelectedPeriod(data.periods[0] ?? null)
      })
      .catch(err => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoadingPeriods(false))

    return () => { cancelled = true }
  }, [clientId])

  // ── Fetch Master COA + line item tiap klien / periode berubah ──
  // Dipakai ulang setelah save supaya UI mencerminkan state yang benar-benar
  // tersimpan di DB, bukan optimistic state di memori.
  const loadData = useCallback(async () => {
    if (!clientId || !selectedPeriod) return

    setLoadingData(true)
    setLoadError(null)

    const qs = new URLSearchParams({
      clientId,
      periodStart: selectedPeriod.periodStart,
      periodEnd: selectedPeriod.periodEnd,
    })

    try {
      const [coaRes, reportRes]: [{ accounts: CoaAccount[] }, { reports: ApiReport[] }] =
        await Promise.all([
          fetch(`/api/clients/${clientId}/coa`).then(r =>
            r.ok ? r.json() : Promise.reject(new Error('Gagal memuat Master COA.'))
          ),
          fetch(`/api/reports?${qs}`).then(r =>
            r.ok ? r.json() : Promise.reject(new Error('Gagal memuat line item laporan.'))
          ),
        ])

      // Matching hanya berjalan saat upload — kalau Master COA di-import/di-
      // replace SETELAH laporan diunggah, hasil upload-time basi (0 match).
      // Backfill di sini: jalankan ulang engine (POST /suggest — idempoten,
      // tanpa Gemini, skip baris mapped/rejected/subtotal) untuk laporan yang
      // masih punya baris belum dipetakan, lalu muat ulang bila ada perubahan.
      let reports = reportRes.reports
      const needsSuggest = coaRes.accounts.length > 0
        ? reports.filter(r => r.lineItems.some(l => !l.isSubtotal && l.masterCoaId === null && l.status !== 'rejected'))
        : []
      if (needsSuggest.length > 0) {
        const results = await Promise.all(
          needsSuggest.map(r =>
            fetch(`/api/reports/${r.id}/suggest`, { method: 'POST' })
              .then(res => (res.ok ? (res.json() as Promise<{ changed: number }>) : null))
              .catch(() => null) // backfill gagal ≠ halaman gagal — lanjut dgn data awal
          )
        )
        const changed = results.reduce((s, x) => s + (x?.changed ?? 0), 0)
        if (changed > 0) {
          const again: { reports: ApiReport[] } = await fetch(`/api/reports?${qs}`).then(r =>
            r.ok ? r.json() : Promise.reject(new Error('Gagal memuat line item laporan.'))
          )
          reports = again.reports
        }
      }

      setAccounts(coaRes.accounts)
      setReports(reports)
      setMappings({})
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data.')
    } finally {
      setLoadingData(false)
    }
  }, [clientId, selectedPeriod])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // ── Turunan ────────────────────────────────────────────────
  const coaById = useMemo(
    () => new Map(accounts.map(a => [a.id, { id: a.id, kode: a.kode, name: a.nama }])),
    [accounts]
  )
  const coaGroups = useMemo(() => buildCoaGroups(accounts), [accounts])

  const allLines = useMemo(
    () => reports.flatMap(r => r.lineItems).filter(l => !l.isSubtotal),
    [reports]
  )

  const unmappedItems = useMemo<UnmappedItem[]>(
    () =>
      allLines
        .filter(l => l.masterCoaId === null)
        .map(l => ({
          id: l.id,
          rawName: l.rawName,
          amount: l.amount,
          confidence: l.confidence,
          suggestedCOA: l.suggestedCoaId ? coaById.get(l.suggestedCoaId) : undefined,
        })),
    [allLines, coaById]
  )

  const autoMatchedItems = useMemo<AutoMatchedItem[]>(
    () =>
      allLines
        .filter(l => l.masterCoaId !== null)
        .map(l => {
          const coa = coaById.get(l.masterCoaId!)
          return {
            id: l.id,
            rawName: l.rawName,
            masterCOA: coa?.name ?? '—',
            kode: coa?.kode ?? '—',
            confidence: l.confidence,
          }
        }),
    [allLines, coaById]
  )

  const reportTypes = useMemo(
    () => [...new Set(reports.map(r => REPORT_TYPE_LABEL[r.reportType]))],
    [reports]
  )

  // Line item bisa tersebar di beberapa laporan (Laba Rugi / Neraca / Arus Kas)
  // dalam satu periode. Endpoint mapping di-scope per laporan, jadi mapping
  // harus dikelompokkan dulu sebelum dikirim.
  const reportIdByLineItem = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reports) for (const li of r.lineItems) m.set(li.id, r.id)
    return m
  }, [reports])

  const mappedCount = Object.keys(mappings).length
  const isAllMapped = unmappedItems.length > 0 && mappedCount === unmappedItems.length

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

  const handleSave = useCallback(async () => {
    const byReport = new Map<string, { lineItemId: string; masterCoaId: string }[]>()
    for (const [lineItemId, opt] of Object.entries(mappings)) {
      const reportId = reportIdByLineItem.get(lineItemId)
      if (!reportId) continue
      const arr = byReport.get(reportId) ?? []
      arr.push({ lineItemId, masterCoaId: opt.id })
      byReport.set(reportId, arr)
    }
    if (byReport.size === 0) return

    setSaving(true)
    setSaveError(null)
    try {
      const responses = await Promise.all(
        [...byReport].map(([reportId, ms]) =>
          fetch(`/api/reports/${reportId}/mapping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings: ms }),
          })
        )
      )
      const failed = responses.find(r => !r.ok)
      if (failed) {
        const payload = (await failed.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Gagal menyimpan mapping.')
      }
      // Baca ulang dari server: line item yang baru dipetakan sekarang punya
      // masterCoaId, jadi pindah sendiri ke tabel "Ter-mapping Otomatis".
      await loadData()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan mapping.')
    } finally {
      setSaving(false)
    }
  }, [mappings, reportIdByLineItem, loadData])

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

  const busy = loadingPeriods || loadingData

  return (
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
          <SessionContextBar
            clientName={activeClient.name}
            periods={periods}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
            reportTypes={reportTypes}
            totalLines={allLines.length}
            autoMatchedCount={autoMatchedItems.length}
            mappedCount={mappedCount}
            unmappedTotal={unmappedItems.length}
          />

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }} data-testid="coa-main">
            {busy ? (
              <CenteredState
                icon={<Loader2 className="w-6 h-6 animate-spin" style={{ color: '#9ca3af' }} />}
                title="Memuat data klien..."
                subtitle={`Mengambil Master COA dan line item untuk ${activeClient.name}.`}
              />
            ) : loadError ? (
              <CenteredState
                icon={<AlertTriangle className="w-6 h-6" style={{ color: '#dc2626' }} />}
                title="Gagal memuat data"
                subtitle={loadError}
              />
            ) : periods.length === 0 ? (
              <CenteredState
                icon={<Inbox className="w-6 h-6" style={{ color: '#9ca3af' }} />}
                title="Belum ada laporan"
                subtitle={`${activeClient.name} belum punya laporan yang diunggah. Unggah dulu lewat halaman Upload.`}
              />
            ) : (
              <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">

                {/* Unmapped section */}
                <div
                  className="ng-rise rounded-3xl p-4 sm:p-6"
                  style={{
                    background: 'white',
                    boxShadow: '0 4px 20px rgb(0,0,0,0.05)',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #daf163 0%, #c8e000 100%)' }}
                    >
                      <ArrowRightLeft className="w-4 h-4" style={{ color: '#1a1a1a' }} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold" style={{ color: '#2d2d2d' }}>
                        Akun Belum Dipetakan
                      </h2>
                      <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
                        Petakan setiap akun ke Master COA {activeClient.name}
                      </p>
                    </div>
                  </div>

                  {unmappedItems.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-sm" style={{ color: '#6b7280' }}>
                        Tidak ada akun yang perlu dipetakan untuk periode ini.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4" data-testid="unmapped-list">
                      {unmappedItems.map((item, index) => (
                        <div
                          key={item.id}
                          data-dropdown
                          className="animate-slide-up relative"
                          style={{
                            animationDelay: `${index * 80}ms`,
                            // animate-slide-up (fill-mode both) meninggalkan transform yang membuat
                            // stacking context per-card — card dengan dropdown terbuka harus di atas
                            // sibling berikutnya supaya panel dropdown tidak tertimpa
                            zIndex: openDropdownId === item.id ? 30 : 0,
                          }}
                        >
                          <MappingCard
                            item={item}
                            groups={coaGroups}
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
                  )}
                </div>

                {/* Auto-matched section */}
                <div className="ng-rise" style={{ animationDelay: '120ms' }}>
                  <AutoMatchedTable
                    items={autoMatchedItems}
                    isExpanded={autoMatchedExpanded}
                    onToggle={() => setAutoMatchedExpanded(p => !p)}
                  />
                </div>

              </div>
            )}
          </main>

          {/* Sticky action bar */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-t"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <div className="flex items-center gap-2">
              {saveError ? (
                <>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#fef2f2' }}
                  >
                    <AlertTriangle className="w-3 h-3" style={{ color: '#dc2626' }} />
                  </div>
                  <span role="alert" className="text-sm font-medium" style={{ color: '#dc2626' }}>
                    {saveError}
                  </span>
                </>
              ) : isAllMapped ? (
                <>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#f0fdf4' }}
                  >
                    <Check className="w-3.5 h-3.5" style={{ color: '#15803d' }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: '#15803d' }}>
                    Semua akun telah dipetakan
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
                      {unmappedItems.length - mappedCount} akun
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
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors bg-(--color-muted-bg) hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{
                  color: '#6b7280',
                  border: '1px solid #e5e5e5',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali ke Review
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!isAllMapped || saving}
                data-testid="save-mapping"
                className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all enabled:hover:shadow-[0_4px_16px_rgba(218,241,99,0.4)] disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                style={{
                  background: isAllMapped && !saving ? 'var(--color-accent-primary)' : '#e5e5e5',
                  color: isAllMapped && !saving ? 'var(--color-bg-main)' : '#9ca3af',
                }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : saved ? (
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
  )
}
