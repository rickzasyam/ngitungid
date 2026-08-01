'use client'

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronRight, AlertTriangle, Loader2, Inbox } from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import { DateRangePicker } from '@/components/date-range-picker'
import { Sparkline } from '@/components/analytics/sparkline'
import { RatioCard, TONES, Pill, statusFromTone, BENCHMARK, type ToneKey } from '@/components/analytics/ratio-card'
import { MetricDrawer, type ComputedMetrics, type TrendArrays, type DrawerHealth } from '@/components/analytics/metric-drawer'
import { assessHealth, healthVerdict, type RatioValues } from '@/lib/financial-health'
import { AKTIVA_CATS, PASIVA_CATS } from '@/lib/financial-agg'

// ── API response shapes (GET /api/analytics/[clientId]/ratios) ─
type MonthPoint = { m: string; rev: number; np: number; gp: number; exp: number }
type BsData = {
  aktivaLancar: number; hutangLancar: number; persediaan: number; kas: number
  piutang: number; totalModal: number; totalAset: number; totalHutang: number
}
// ratios dari API = 15 key (ccc diturunkan di klien: dio+dso−dpo).
type ApiRatios = {
  cr: number; qr: number; cashR: number; der: number; wc: number
  gpm: number; npm: number; opm: number; roe: number; roa: number
  dso: number; dio: number; dpo: number; invTurn: number; assetTurn: number
}
type BdItem = { name: string; subKelompok: string; amount: number }
type PnlBreakdown = { revenue: BdItem[]; hpp: BdItem[]; opex: BdItem[] }
type RatiosApi = {
  hasData: boolean
  monthly?: MonthPoint[]
  bs?: BsData | null
  ratios?: ApiRatios | null
  trendArrays?: TrendArrays
  trendMonths?: string[]
  pnlBreakdown?: PnlBreakdown
}

// ── API response shape (GET /api/analytics/[clientId]/neraca-detail) ─
type NdAccount = { kode: string; name: string; values: number[] }
type NdSection = { key: string; label: string; accounts: NdAccount[]; totals: number[] }
type NeracaDetailApi = {
  hasData: boolean
  periods: { periodStart: string; label: string }[]
  sections?: NdSection[]
  totalAktiva?: number[]
  totalPasiva?: number[]
  /** Optional: response lama (sebelum balance check) tidak membawanya. */
  balance?: {
    diff: number[]
    balanced: boolean[]
    tolerance: number
    unclassifiedCount: number[]
    unclassifiedTotal: number[]
  }
}

type Preset = '3m' | '6m' | 'all' | 'custom'

// ── Format helpers ────────────────────────────────────────────
const fmtRp = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e9) return 'Rp ' + (v / 1e9).toFixed(2).replace('.', ',') + 'M'
  if (a >= 1e6) return 'Rp ' + Math.round(v / 1e6) + 'jt'
  if (a >= 1e3) return 'Rp ' + Math.round(v / 1e3) + 'rb'
  return 'Rp ' + Math.round(v)
}
const fmtPct   = (v: number, d = 1) => v.toFixed(d).replace('.', ',') + '%'
const fmtRatio = (v: number) => v.toFixed(2).replace('.', ',')
const fmtDays  = (v: number) => Math.round(v) + ' hari'
const fmtX     = (v: number) => v.toFixed(2).replace('.', ',') + '×'

// ── Detail Neraca helpers ─────────────────────────────────────
// Angka PENUH (bukan singkatan jt/M) — tabel ini dipakai mencocokkan ke
// laporan manual klien; identitas AKTIVA = PASIVA harus terlihat persis.
// Negatif pakai kurung, mengikuti konvensi laporan akuntansi.
const fmtFull = (v: number) => {
  const s = Math.round(Math.abs(v)).toLocaleString('id-ID')
  return v < 0 ? `(${s})` : s
}
const pctOf = (v: number, total: number) => (total === 0 ? null : (v / total) * 100)
const fmtPct0 = (v: number | null) => (v === null ? '—' : Math.round(v) + '%')
// Diturunkan dari sumber tunggal di lib/financial-agg — dulu array literal
// tersendiri yang gampang ketinggalan saat kategori aset bertambah.
const ND_AKTIVA_KEYS: string[] = [...AKTIVA_CATS]
const ND_PASIVA_KEYS: string[] = [...PASIVA_CATS]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ymd2date = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

// ── Color / severity ──────────────────────────────────────────
const SEVERITY = {
  critical: { label: 'Kritis',     bg: '#fee2e2', fg: '#b91c1c', dot: '#dc2626' },
  warning:  { label: 'Peringatan', bg: '#fef3c7', fg: '#b45309', dot: '#d97706' },
  info:     { label: 'Info',       bg: '#dbeafe', fg: '#1d4ed8', dot: '#2563eb' },
} as const
type SeverityKey = keyof typeof SEVERITY

const getDimBarColor = (score: number): string => {
  if (score >= 80) return '#daf163'   // Lime — sangat baik
  if (score >= 60) return '#bbb3f3'   // Lilac — perlu perhatian
  return '#f472b6'                     // Bubblegum Pink — kritis
}

// ── P&L row + column helpers ─────────────────────────────────
type RowKey = 'rev' | 'hpp' | 'gp' | 'gpmr' | 'opex' | 'np' | 'npmr'
interface RowDef {
  key: RowKey; label: string; accent?: string; bold?: boolean; pct?: boolean
  muted?: boolean; neg?: boolean; divider?: boolean; ofRev?: boolean
  getVal: (c: Omit<ColData, 'label'>) => number
}
// Sub-baris (breakdown akun) tidak lagi hardcoded — diturunkan dari
// pnlBreakdown API per baris (rev/hpp/opex) di buildView().
const ROW_DEFS: RowDef[] = [
  { key: 'rev',  label: 'Pendapatan',        bold: true, getVal: c => c.rev },
  { key: 'hpp',  label: 'HPP',               muted: true, neg: true, getVal: c => c.hpp },
  { key: 'gp',   label: 'Laba Kotor',        bold: true, divider: true, getVal: c => c.gp },
  { key: 'gpmr', label: 'Gross Margin',      pct: true, ofRev: true, getVal: c => c.gp },
  { key: 'opex', label: 'Beban Operasional', muted: true, neg: true, getVal: c => c.exp },
  { key: 'np',   label: 'Laba Bersih',       accent: '#16a34a', bold: true, getVal: c => c.np },
  { key: 'npmr', label: 'Net Margin',        pct: true, ofRev: true, getVal: c => c.np },
]
type SubRow = { label: string; portion: number }

interface ColData { label: string; rev: number; gp: number; np: number; exp: number; hpp: number }
const rowOf = (d: MonthPoint): Omit<ColData, 'label'> => ({ rev: d.rev, gp: d.gp, np: d.np, exp: d.exp, hpp: d.rev - d.gp })
const sumRows = (rows: MonthPoint[]): Omit<ColData, 'label'> => {
  const rev = rows.reduce((s, d) => s + d.rev, 0)
  const gp  = rows.reduce((s, d) => s + d.gp, 0)
  const np  = rows.reduce((s, d) => s + d.np, 0)
  const exp = rows.reduce((s, d) => s + d.exp, 0)
  return { rev, gp, np, exp, hpp: rev - gp }
}
const quarterOf = (label: string): string => {
  const i = MONTHS.indexOf(label)
  return i >= 0 ? 'Q' + (Math.floor(i / 3) + 1) : label
}
function buildPnlCols(monthly: MonthPoint[], view: 'bulanan' | 'kuartalan' | 'ytd'): ColData[] {
  if (view === 'bulanan') return monthly.map(d => ({ label: d.m, ...rowOf(d) }))
  if (view === 'kuartalan') {
    const groups = new Map<string, MonthPoint[]>()
    for (const d of monthly) {
      const q = quarterOf(d.m)
      const g = groups.get(q) ?? []
      g.push(d)
      groups.set(q, g)
    }
    return [...groups.entries()].map(([q, rows]) => ({ label: q, ...sumRows(rows) }))
  }
  // YTD kumulatif
  let rev = 0, gp = 0, np = 0, exp = 0
  return monthly.map(d => {
    rev += d.rev; gp += d.gp; np += d.np; exp += d.exp
    return { label: d.m, rev, gp, np, exp, hpp: rev - gp }
  })
}
// Sub-baris breakdown akun P&L (portion = akun ÷ subtotal induk). Module-level
// supaya dipakai view induk & Detail Laba Rugi (rentang terpisah).
function buildSubRows(bd: PnlBreakdown | undefined, pnlTotal: ColData): Record<string, SubRow[]> {
  const from = (items: BdItem[] | undefined, parentTotal: number): SubRow[] =>
    (items ?? []).filter(a => a.amount !== 0).map(a => ({ label: a.name, portion: parentTotal ? a.amount / parentTotal : 0 }))
  return { rev: from(bd?.revenue, pnlTotal.rev), hpp: from(bd?.hpp, pnlTotal.hpp), opex: from(bd?.opex, pnlTotal.exp) }
}

// assessHealth key → drawer registry key (untuk klik alert / kartu).
const drawerKeyForMetric = (k: string): string =>
  k === 'cashR' ? 'cash' : k === 'invTurn' ? 'invturn' : k === 'assetTurn' ? 'assetturn'
    : k === 'overall' || k === 'dim' ? 'dim:overview' : k
const momDelta = (arr: number[]) => {
  if (arr.length < 2) return null
  const cur = arr[arr.length - 1], prev = arr[arr.length - 2]
  return prev === 0 ? null : (cur - prev) / Math.abs(prev) * 100
}
function cellVal(row: RowDef, col: ColData, stmtMode: 'nominal' | 'pct'): string {
  const raw = row.getVal(col)
  if (row.pct) return fmtPct(raw / col.rev * 100)
  if (stmtMode === 'pct') return fmtPct(raw / col.rev * 100)
  return fmtRp(raw)
}
function rowDelta(row: RowDef, pnlCols: ColData[]) {
  if (pnlCols.length < 2) return null
  const prev = row.getVal(pnlCols[pnlCols.length - 2])
  const curr = row.getVal(pnlCols[pnlCols.length - 1])
  if (!prev) return null
  const pct = (curr - prev) / Math.abs(prev) * 100
  const isPos = curr >= prev
  const isGood = row.neg ? !isPos : isPos
  return { pct, isGood }
}

// ── Small shared components ───────────────────────────────────
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="animate-slide-up ng-card-lift"
      style={{ background: 'white', borderRadius: 18, padding: '18px 20px', border: '1px solid #ececec', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}
    >
      {children}
    </div>
  )
}

function SectionHeader({ title, subtitle, accent }: { title: string; subtitle: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 4, height: 20, borderRadius: 99, flexShrink: 0, background: accent }} />
      <div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2430' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>{subtitle}</span>
      </div>
    </div>
  )
}

function SegCtrl<T extends string>({
  options, value, onChange,
}: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 9, padding: 3, gap: 2 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11,
            background: value === opt.value ? 'white' : 'transparent',
            fontWeight: value === opt.value ? 700 : 500,
            color: value === opt.value ? '#1f2430' : 'var(--color-text-muted)',
            boxShadow: value === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const { activeClient, isLoaded } = useRequireClient()
  // Balance check hanya untuk staf — lihat alasannya di banner Detail Neraca.
  const { isStaff } = useClient()
  const clientId = activeClient?.id ?? null

  // Period selection
  const [periods, setPeriods] = useState<{ periodStart: string; periodEnd: string }[]>([])
  const [periodsLoaded, setPeriodsLoaded] = useState(false)
  const [preset, setPreset] = useState<Preset>('all')
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined)

  // Data
  const [data, setData] = useState<RatiosApi | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // UI
  const [drawer, setDrawer] = useState<string | null>(null)
  const [stmtView, setStmtView] = useState<'bulanan' | 'kuartalan' | 'ytd'>('bulanan')
  const [stmtMode, setStmtMode] = useState<'nominal' | 'pct'>('nominal')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Detail Laporan (Laba Rugi + Neraca) — punya filter rentang SENDIRI, terpisah
  // dari filter induk (yang mengendalikan rasio/health/performa). Default =
  // seluruh periode klien. `expanded`/`stmtView`/`stmtMode` di atas dipakai
  // ulang oleh tabel Detail Laba Rugi.
  const [detailRange, setDetailRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined)
  const [detailPnl, setDetailPnl] = useState<RatiosApi | null>(null)
  const [detailNeraca, setDetailNeraca] = useState<NeracaDetailApi | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailError, setDetailError] = useState(false)
  const [neracaExpanded, setNeracaExpanded] = useState<Record<string, boolean>>({})

  const periodsAsc = useMemo(
    () => [...periods].sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
    [periods]
  )
  const nP = periodsAsc.length
  const show3m = nP > 3
  const show6m = nP > 6

  // Rentang tanggal untuk preset terpilih (atau custom).
  const rangeFor = useCallback((p: Preset): { start: string; end: string } | null => {
    if (p === 'custom') {
      if (customRange?.from && customRange?.to) {
        const a = toYMD(customRange.from), b = toYMD(customRange.to)
        return a <= b ? { start: a, end: b } : { start: b, end: a }
      }
      return null
    }
    if (nP === 0) return null
    const n = p === '3m' ? 3 : p === '6m' ? 6 : nP
    const slice = periodsAsc.slice(Math.max(0, nP - n))
    return { start: slice[0].periodStart, end: slice[slice.length - 1].periodEnd }
  }, [customRange, periodsAsc, nP])

  const range = rangeFor(preset)
  const startKey = range?.start ?? ''
  const endKey = range?.end ?? ''

  // Nilai DateRangePicker header: saat preset shortcut aktif, tampilkan rentang
  // preset itu (biar user lihat tanggalnya); saat custom, tampilkan pilihannya.
  const headerPickerValue = preset === 'custom'
    ? customRange
    : (range ? { from: ymd2date(range.start), to: ymd2date(range.end) } : undefined)

  // Rentang Detail Laporan (filter terpisah). Default = seluruh periode klien.
  const detailKeys = detailRange?.from && detailRange?.to
    ? (() => { const a = toYMD(detailRange.from!), b = toYMD(detailRange.to!); return a <= b ? { start: a, end: b } : { start: b, end: a } })()
    : (nP > 0 ? { start: periodsAsc[0].periodStart, end: periodsAsc[nP - 1].periodEnd } : null)
  const detailStart = detailKeys?.start ?? ''
  const detailEnd = detailKeys?.end ?? ''
  const detailPickerValue = detailRange ?? (detailKeys ? { from: ymd2date(detailKeys.start), to: ymd2date(detailKeys.end) } : undefined)

  // Reset saat klien berganti.
  useEffect(() => {
    setPreset('all')
    setCustomRange(undefined)
    setData(null)
    setLoading(true)
    setDetailRange(undefined)
    setDetailPnl(null)
    setDetailNeraca(null)
    setDetailLoading(true)
    setNeracaExpanded({})
  }, [clientId])

  // Fetch data Detail Laporan (Laba Rugi via /ratios + Neraca via /neraca-detail)
  // untuk rentang filter TERPISAH. Independen dari fetch rasio induk di atas.
  useEffect(() => {
    if (!clientId || !detailStart || !detailEnd) return
    let alive = true
    setDetailLoading(true)
    setDetailError(false)
    Promise.all([
      fetch(`/api/analytics/${clientId}/ratios?periodStart=${detailStart}&periodEnd=${detailEnd}`).then(r => (r.ok ? r.json() : null)),
      fetch(`/api/analytics/${clientId}/neraca-detail?periodStart=${detailStart}&periodEnd=${detailEnd}`).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([pnl, ner]) => { if (alive) { setDetailPnl(pnl); setDetailNeraca(ner) } })
      .catch(() => { if (alive) setDetailError(true) })
      .finally(() => { if (alive) setDetailLoading(false) })
    return () => { alive = false }
  }, [clientId, detailStart, detailEnd])

  // Daftar periode → preset adaptif.
  useEffect(() => {
    if (!clientId) return
    let alive = true
    setPeriodsLoaded(false)
    fetch(`/api/reports/periods?clientId=${clientId}`)
      .then(r => (r.ok ? r.json() : { periods: [] }))
      .then(d => { if (alive) { setPeriods(d.periods ?? []); setPeriodsLoaded(true) } })
      .catch(() => { if (alive) { setPeriods([]); setPeriodsLoaded(true) } })
    return () => { alive = false }
  }, [clientId])

  // Kalau preset terpilih jadi tak tersedia (klien lain punya lebih sedikit periode).
  useEffect(() => {
    if (preset === '3m' && !show3m) setPreset('all')
    else if (preset === '6m' && !show6m) setPreset('all')
  }, [preset, show3m, show6m])

  // Fetch rasio untuk rentang terpilih.
  const load = useCallback(async () => {
    if (!clientId || !startKey || !endKey) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/analytics/${clientId}/ratios?periodStart=${startKey}&periodEnd=${endKey}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setLoadError('Gagal memuat data analytics.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [clientId, startKey, endKey])

  useEffect(() => {
    if (!periodsLoaded) return
    if (!startKey || !endKey) { setLoading(false); return }
    void load()
  }, [periodsLoaded, startKey, endKey, load])

  if (!isLoaded || !activeClient) return null

  const busy = !periodsLoaded || loading
  const noRange = preset === 'custom' && !range
  const hasData = !!data?.hasData && !!data.ratios && !!data.bs && (data.monthly?.length ?? 0) > 0

  const presetLabel = preset === '3m' ? '3 Bulan Terakhir' : preset === '6m' ? '6 Bulan Terakhir' : preset === 'all' ? 'Semua Periode' : 'Custom'

  // ── Semua turunan dari data nyata (hanya saat siap) ──────────
  const buildView = () => {
    const monthly = data!.monthly!
    const bs = data!.bs!
    const api = data!.ratios!
    const ta = data!.trendArrays!
    const drawerMonths = data!.trendMonths ?? monthly.map(d => d.m)

    const ccc = api.dio + api.dso - api.dpo
    const ratios: RatioValues = { ...api, ccc }

    const totRev = monthly.reduce((s, d) => s + d.rev, 0)
    const totGP  = monthly.reduce((s, d) => s + d.gp, 0)
    const totNP  = monthly.reduce((s, d) => s + d.np, 0)
    const totExp = monthly.reduce((s, d) => s + d.exp, 0)
    const totHPP = totRev - totGP
    const totOI  = totGP - totExp

    const periodMonths = monthly.length
    const days = Math.round(Math.max(1, periodMonths) * 30.4)
    const monthsArr = monthly.map(d => d.m)
    const rangeLabel = monthsArr.length
      ? (monthsArr.length === 1 ? monthsArr[0] : `${monthsArr[0]}–${monthsArr[monthsArr.length - 1]}`)
      : ''

    const health = assessHealth(ratios, { gpm: ta.gpm, opm: ta.opm, assetTurn: ta.assetTurn, dso: ta.dso, dio: ta.dio, ccc: ta.ccc })

    const computed: ComputedMetrics = {
      totRev, totNP, totGP, totOI, totHPP, totExp,
      pc: { days, tot: rangeLabel }, periodMonths,
      aktivaLancar: bs.aktivaLancar, hutangLancar: bs.hutangLancar, persediaan: bs.persediaan,
      kas: bs.kas, piutang: bs.piutang, totalModal: bs.totalModal, totalAset: bs.totalAset, totalHutang: bs.totalHutang,
      cr: ratios.cr, qr: ratios.qr, cashR: ratios.cashR, der: ratios.der, wc: ratios.wc,
      gpm: ratios.gpm, npm: ratios.npm, opm: ratios.opm, roe: ratios.roe, roa: ratios.roa,
      dso: ratios.dso, dio: ratios.dio, dpo: ratios.dpo, invTurn: ratios.invTurn, assetTurn: ratios.assetTurn, ccc: ratios.ccc,
    }

    // Reason per dimensi — format sama seperti panel lama, tapi nilai asli.
    const hutangPct = bs.totalAset ? (bs.totalHutang / bs.totalAset * 100).toFixed(1).replace('.', ',') : '0'
    const reasonOf: Record<string, string> = {
      likuiditas: `CR ${fmtRatio(ratios.cr)} · QR ${fmtRatio(ratios.qr)} · Cash ${fmtRatio(ratios.cashR)}`,
      profitabilitas: `NPM ${fmtPct(ratios.npm)} · ROE ${fmtPct(ratios.roe)}`,
      leverage: `DER ${fmtRatio(ratios.der)} — hutang ${hutangPct}% total aset`,
      efisiensi: `DIO ${fmtDays(ratios.dio)} · Inv. turnover ${fmtX(ratios.invTurn)}`,
    }
    const dimOrder = ['likuiditas', 'profitabilitas', 'leverage', 'efisiensi'] as const
    const dimsPanel = dimOrder.map(k => {
      const d = health.dimensions[k]
      return { key: k, label: d.label, score: d.score, tone: d.tone, status: statusFromTone(d.tone), reason: reasonOf[k] }
    })
    const drawerHealth: DrawerHealth = {
      tones: health.tones,
      overall: health.overall,
      dims: Object.fromEntries(dimOrder.map(k => {
        const d = health.dimensions[k]
        return [k, { score: d.score, tone: d.tone, status: statusFromTone(d.tone), reason: reasonOf[k] }]
      })),
    }
    const alerts = health.alerts.map(a => ({ ...a, drawerKey: drawerKeyForMetric(a.metric) }))

    // Sparkline performa (per bulan).
    const pRevArr = monthly.map(d => d.rev)
    const pGPArr  = monthly.map(d => d.gp)
    const pNPArr  = monthly.map(d => d.np)
    const pGPMArr = monthly.map(d => (d.rev ? d.gp / d.rev * 100 : 0))
    const pNPMArr = monthly.map(d => (d.rev ? d.np / d.rev * 100 : 0))

    const pnlCols = buildPnlCols(monthly, stmtView)
    const pnlTotal: ColData = { label: 'Total ' + rangeLabel, ...sumRows(monthly) }

    // Sub-baris breakdown akun asli (portion = akun ÷ subtotal induk kumulatif).
    const subRows = buildSubRows(data!.pnlBreakdown, pnlTotal)

    // Props RatioCard: tone dari health, status generik, benchmark jujur, trend asli.
    const rc = (key: keyof TrendArrays & string, drawerK: string) => {
      const tone = (health.tones[key] ?? 'netral') as ToneKey
      return { tone, status: statusFromTone(tone), benchmark: BENCHMARK[drawerK] ?? '', trend: ta[key] }
    }

    return {
      monthly, bs, ratios, ta, totRev, totGP, totNP, totExp, rangeLabel,
      health, computed, dimsPanel, drawerHealth, alerts,
      pRevArr, pGPArr, pNPArr, pGPMArr, pNPMArr, pnlCols, pnlTotal, subRows, drawerMonths, rc,
    }
  }

  const view = (!busy && !loadError && !noRange && hasData) ? buildView() : null

  // Detail Laba Rugi — data dari rentang filter TERPISAH (detailPnl), bukan view induk.
  const detailPnlView = (() => {
    const d = detailPnl
    if (!d?.hasData || !d.monthly?.length) return null
    const monthly = d.monthly
    const monthsArr = monthly.map(m => m.m)
    const rangeLabel = monthsArr.length === 1 ? monthsArr[0] : `${monthsArr[0]}–${monthsArr[monthsArr.length - 1]}`
    const pnlCols = buildPnlCols(monthly, stmtView)
    const pnlTotal: ColData = { label: 'Total ' + rangeLabel, ...sumRows(monthly) }
    return {
      pnlCols, pnlTotal, rangeLabel,
      subRows: buildSubRows(d.pnlBreakdown, pnlTotal),
      pRevArr: monthly.map(m => m.rev),
      pNPArr: monthly.map(m => m.np),
    }
  })()

  return (
    <>
      <div className="flex-1 min-w-0 overflow-hidden" style={{ padding: 10 }}>
        <div className="h-full flex flex-col rounded-3xl overflow-hidden" style={{ background: 'white', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 flex items-center justify-between" style={{ padding: '15px 22px', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1f2430', margin: 0 }}>Analytics</h1>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                {activeClient.name} · Analisis keuangan mendalam
              </p>
            </div>

            {/* Preset shortcut + date range picker langsung (seperti dashboard —
                tak perlu klik "Custom" dulu; pilih tanggal langsung memfilter). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 11, padding: 3, gap: 2 }}>
                {([
                  ...(show3m ? [{ label: '3 Bln', value: '3m' as Preset }] : []),
                  ...(show6m ? [{ label: '6 Bln', value: '6m' as Preset }] : []),
                  { label: 'Semua', value: 'all' as Preset },
                ]).map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPreset(p.value)}
                    style={{
                      padding: '5px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12,
                      background: preset === p.value ? 'var(--color-accent-primary)' : 'transparent',
                      fontWeight: preset === p.value ? 700 : 500,
                      color: preset === p.value ? 'var(--color-accent-primary-fg)' : 'var(--color-text-muted)',
                      boxShadow: preset === p.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{ width: 248 }}>
                <DateRangePicker
                  value={headerPickerValue}
                  onChange={(r) => { setCustomRange(r); setPreset('custom') }}
                  placeholder="Filter tanggal"
                />
              </div>
            </div>
          </div>

          {/* ── Scrollable body ──────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f3f4f6' }}>
            {busy ? (
              <div className="flex items-center justify-center gap-2 h-full" style={{ color: 'var(--color-text-muted)' }}>
                <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Memuat data…</span>
              </div>
            ) : loadError ? (
              <div className="flex items-center justify-center h-full"><p className="text-sm" style={{ color: '#dc2626' }}>{loadError}</p></div>
            ) : noRange ? (
              <div className="flex items-center justify-center h-full p-6">
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Pilih rentang tanggal untuk melihat analitik.</p>
              </div>
            ) : !view ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center" style={{ maxWidth: 360 }}>
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}>
                    <Inbox className="w-6 h-6" style={{ color: '#8aa32e' }} />
                  </div>
                  <p className="text-sm font-bold mb-1" style={{ color: '#2d2d2d' }}>Belum ada data untuk periode ini</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Analytics dihitung dari laporan Laba Rugi & Neraca {activeClient.name} yang sudah dipetakan ke COA. Upload & petakan lebih dulu, atau pilih periode lain.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1520, margin: '0 auto' }}>

                {/* ═══ 1. EXECUTIVE SUMMARY BAND ═════════════════════ */}
                <div id="sec-exec" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.15fr) minmax(300px,1fr)', gap: 14 }}>

                  {/* Left dark panel */}
                  <div style={{ background: 'linear-gradient(135deg,#202024,#2a2a30)', borderRadius: 18, padding: 18 }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
                      {/* Score ring */}
                      <div
                        onClick={() => setDrawer('dim:overview')}
                        style={{ position: 'relative', width: 104, height: 104, borderRadius: '50%', flexShrink: 0, cursor: 'pointer' }}
                      >
                        <div style={{
                          width: 104, height: 104, borderRadius: '50%',
                          background: `conic-gradient(var(--color-accent-primary) ${view.health.overall * 3.6}deg, rgba(255,255,255,0.1) 0deg)`,
                        }} />
                        <div style={{
                          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                          width: 84, height: 84, borderRadius: '50%', background: '#202024',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 30, fontWeight: 700, color: 'white', lineHeight: 1 }}>{view.health.overall}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>/100</span>
                        </div>
                      </div>
                      {/* Insight */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3, marginBottom: 4 }}>SKOR KESEHATAN KEUANGAN</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-accent-primary)', marginBottom: 6 }}>● {healthVerdict(view.health.overall)}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                          {view.alerts[0]?.desc ?? `Semua dimensi dalam kondisi baik pada ${presetLabel.toLowerCase()}.`}
                        </div>
                      </div>
                    </div>

                    {/* 3 KPI minis */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { label: 'Laba Bersih', value: fmtRp(view.totNP),        key: 'np' },
                        { label: 'Net Margin',  value: fmtPct(view.ratios.npm), key: 'npm' },
                        { label: 'Posisi Kas',  value: fmtRp(view.bs.kas),      key: 'cash' },
                      ].map(item => (
                        <div
                          key={item.key}
                          role="button"
                          tabIndex={0}
                          aria-label={`${item.label}: ${item.value}. Buka detail.`}
                          onClick={() => setDrawer(item.key)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer(item.key) } }}
                          className="ng-dark-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                          style={{ flex: 1, borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}
                        >
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right — KPI cards + alerts */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { label: 'Pendapatan', value: fmtRp(view.totRev), sub: view.rangeLabel,                 tone: 'info'  as ToneKey },
                        { label: 'Laba Kotor', value: fmtRp(view.totGP),  sub: 'GPM ' + fmtPct(view.ratios.gpm), tone: 'sehat' as ToneKey },
                      ].map(item => {
                        const t = TONES[item.tone]
                        return (
                          <div key={item.label} style={{ flex: 1, padding: '13px 15px', borderRadius: 13, background: 'white', border: '1px solid #ececec', borderTop: `3px solid ${t.bar}` }}>
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{item.label}</div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>{item.value}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{item.sub}</div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Top 3 Alerts */}
                    <div style={{ flex: 1, background: 'white', borderRadius: 14, border: '1px solid #ececec', padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1f2430', marginBottom: 10 }}>Top 3 Alerts</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {view.alerts.map((alert, i) => {
                          const s = SEVERITY[alert.severity as SeverityKey] ?? SEVERITY.info
                          return (
                            <div
                              key={i}
                              role="button"
                              tabIndex={0}
                              aria-label={`Alert: ${alert.title}. Buka detail metrik.`}
                              onClick={() => setDrawer(alert.drawerKey)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer(alert.drawerKey) } }}
                              className="ng-fade-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: s.bg, borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }}
                            >
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 4 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: s.fg, textTransform: 'uppercase' }}>{s.label}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: s.fg }}>{alert.title}</span>
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{alert.desc}</div>
                              </div>
                              <ChevronRight style={{ width: 14, height: 14, color: s.fg, flexShrink: 0, marginTop: 2 }} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ═══ 2. PERFORMANCE KPI CARDS ══════════════════════ */}
                <div id="sec-performa">
                  <SectionCard>
                    <SectionHeader title="Performa Keuangan" subtitle={`${presetLabel} · 5 indikator utama · Klik untuk detail`} accent="linear-gradient(180deg, #daf163, #bef264)" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
                      {[
                        { label: 'Pendapatan',   value: fmtRp(view.totRev),        tone: 'info'  as ToneKey, arr: view.pRevArr, key: 'rev' },
                        { label: 'Laba Kotor',   value: fmtRp(view.totGP),         tone: 'sehat' as ToneKey, arr: view.pGPArr,  key: 'gp' },
                        { label: 'Laba Bersih',  value: fmtRp(view.totNP),         tone: 'sehat' as ToneKey, arr: view.pNPArr,  key: 'np' },
                        { label: 'Gross Margin', value: fmtPct(view.ratios.gpm),   tone: 'sehat' as ToneKey, arr: view.pGPMArr, key: 'gpm' },
                        { label: 'Net Margin',   value: fmtPct(view.ratios.npm),   tone: 'sehat' as ToneKey, arr: view.pNPMArr, key: 'npm' },
                      ].map(card => {
                        const t = TONES[card.tone]
                        const delta = momDelta(card.arr)
                        const isUp = delta !== null && delta >= 0
                        return (
                          <div
                            key={card.key}
                            role="button"
                            tabIndex={0}
                            aria-label={`${card.label}: ${card.value}. Buka detail.`}
                            onClick={() => setDrawer(card.key)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer(card.key) } }}
                            className="ng-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            style={{ padding: 14, borderRadius: 13, border: '1px solid #efefef', cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>{card.label}</span>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.dot }} />
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2430', letterSpacing: -0.5, marginBottom: 8 }}>{card.value}</div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                              <div>
                                {delta !== null && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    {isUp
                                      ? <ChevronUp style={{ width: 12, height: 12, color: '#15803d' }} />
                                      : <ChevronDown style={{ width: 12, height: 12, color: '#b91c1c' }} />
                                    }
                                    <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#15803d' : '#b91c1c' }}>
                                      {Math.abs(delta).toFixed(1).replace('.', ',')}%
                                    </span>
                                  </div>
                                )}
                                <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 1 }}>MoM</div>
                              </div>
                              <Sparkline values={card.arr.length >= 2 ? card.arr : [0, 1]} color={t.bar} width={78} height={26} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </SectionCard>
                </div>

                {/* ═══ 3. FINANCIAL HEALTH SUMMARY (DARK) ═══════════ */}
                <div id="sec-skor" style={{ background: '#202024', borderRadius: 18, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Financial Health Summary</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Skor {view.health.overall}/100</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 22px' }}>
                    {view.dimsPanel.map(dim => {
                      const barColor = getDimBarColor(dim.score)
                      return (
                        <div
                          key={dim.key}
                          role="button"
                          tabIndex={0}
                          aria-label={`${dim.label}: skor ${dim.score}, ${dim.status}. Buka detail dimensi.`}
                          onClick={() => setDrawer('dim:' + dim.key)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer('dim:' + dim.key) } }}
                          className="ng-dim-row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                          style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 12px' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'white' }}>{dim.label}</span>
                              <Pill tone={dim.tone} label={dim.status} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: barColor }}>{dim.score}</span>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 99, marginBottom: 5, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: dim.score + '%', background: barColor, borderRadius: 99 }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{dim.reason}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ═══ 4. LIKUIDITAS ═════════════════════════════════ */}
                <div id="sec-likuiditas">
                  <SectionCard>
                    <SectionHeader title="Rasio Likuiditas" subtitle="Kemampuan menutup kewajiban jangka pendek · Klik kartu untuk detail" accent="linear-gradient(180deg, #daf163, #bef264)" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                      <RatioCard label="Current Ratio"          value={fmtRatio(view.ratios.cr)}    formula="Aktiva Lancar ÷ Hutang Lancar"                {...view.rc('cr', 'cr')}       onClick={() => setDrawer('cr')} />
                      <RatioCard label="Quick Ratio"            value={fmtRatio(view.ratios.qr)}    formula="(Aktiva Lancar − Persediaan) ÷ Hutang Lancar" {...view.rc('qr', 'qr')}       onClick={() => setDrawer('qr')} />
                      <RatioCard label="Cash Ratio"             value={fmtRatio(view.ratios.cashR)} formula="Kas ÷ Hutang Lancar"                          {...view.rc('cashR', 'cash')}  onClick={() => setDrawer('cash')} />
                      <RatioCard label="Debt-to-Equity"         value={fmtRatio(view.ratios.der)}   formula="Total Hutang ÷ Total Modal"                   {...view.rc('der', 'der')}     onClick={() => setDrawer('der')} />
                      <RatioCard label="Modal Kerja"            value={fmtRp(view.ratios.wc)}       formula="Aktiva Lancar − Hutang Lancar"                {...view.rc('wc', 'wc')}       onClick={() => setDrawer('wc')} />
                      <RatioCard label="Cash Conversion Cycle"  value={fmtDays(view.ratios.ccc)}    formula="DIO + DSO − DPO"                              {...view.rc('ccc', 'ccc')}     onClick={() => setDrawer('ccc')} />
                    </div>
                  </SectionCard>
                </div>

                {/* ═══ 5. PROFITABILITAS ═════════════════════════════ */}
                <div id="sec-profitabilitas">
                  <SectionCard>
                    <SectionHeader title="Rasio Profitabilitas" subtitle="Kemampuan menghasilkan laba dari investasi dan pendapatan · Klik kartu untuk detail" accent="linear-gradient(180deg, #bbb3f3, #a5b4fc)" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                      <RatioCard label="Return on Equity"   value={fmtPct(view.ratios.roe)} formula="Laba Bersih ÷ Total Modal"       {...view.rc('roe', 'roe')} onClick={() => setDrawer('roe')} />
                      <RatioCard label="Return on Assets"   value={fmtPct(view.ratios.roa)} formula="Laba Bersih ÷ Total Aset"        {...view.rc('roa', 'roa')} onClick={() => setDrawer('roa')} />
                      <RatioCard label="Gross Margin"       value={fmtPct(view.ratios.gpm)} formula="Laba Kotor ÷ Pendapatan"         {...view.rc('gpm', 'gpm')} onClick={() => setDrawer('gpm')} />
                      <RatioCard label="Net Margin"         value={fmtPct(view.ratios.npm)} formula="Laba Bersih ÷ Pendapatan"        {...view.rc('npm', 'npm')} onClick={() => setDrawer('npm')} />
                      <RatioCard label="Operating Margin"   value={fmtPct(view.ratios.opm)} formula="Laba Operasi ÷ Pendapatan"       {...view.rc('opm', 'opm')} onClick={() => setDrawer('opm')} />
                    </div>
                  </SectionCard>
                </div>

                {/* ═══ 6. EFISIENSI ══════════════════════════════════ */}
                <div id="sec-efisiensi">
                  <SectionCard>
                    <SectionHeader title="Rasio Efisiensi" subtitle="Efektivitas aset dan operasional · Klik kartu untuk detail" accent="linear-gradient(180deg, #fdba74, #f59e0b)" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
                      <RatioCard label="DSO"                    value={fmtDays(view.ratios.dso)}      formula="Piutang ÷ Pendapatan × Hari"            {...view.rc('dso', 'dso')}             onClick={() => setDrawer('dso')} />
                      <RatioCard label="DIO"                    value={fmtDays(view.ratios.dio)}      formula="Persediaan ÷ Pendapatan × Hari"         {...view.rc('dio', 'dio')}             onClick={() => setDrawer('dio')} />
                      <RatioCard label="DPO"                    value={fmtDays(view.ratios.dpo)}      formula="Hutang Usaha ÷ HPP × Hari"              {...view.rc('dpo', 'dpo')}             onClick={() => setDrawer('dpo')} />
                      <RatioCard label="Inventory Turnover"     value={fmtX(view.ratios.invTurn)}     formula="HPP ÷ Persediaan (disetahunkan)"        {...view.rc('invTurn', 'invturn')}     onClick={() => setDrawer('invturn')} />
                      <RatioCard label="Asset Turnover"         value={fmtX(view.ratios.assetTurn)}   formula="Pendapatan ÷ Total Aset (disetahunkan)" {...view.rc('assetTurn', 'assetturn')} onClick={() => setDrawer('assetturn')} />
                      <RatioCard label="Cash Conversion Cycle"  value={fmtDays(view.ratios.ccc)}      formula="DIO + DSO − DPO"                        {...view.rc('ccc', 'ccc')}             onClick={() => setDrawer('ccc')} />
                    </div>
                    {/* DIO Warning Banner — hanya bila DIO benar-benar dinilai bermasalah */}
                    {(view.health.tones.dio === 'risiko' || view.health.tones.dio === 'perhatian') && (
                      <div
                        onClick={() => setDrawer('dio')}
                        style={{ background: '#fef3c7', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                      >
                        <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: '#b45309', marginTop: 1 }} />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>Persediaan perlu perhatian.</span>
                          {' '}
                          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                            DIO {fmtDays(view.ratios.dio)} — {fmtRp(view.bs.persediaan)} persediaan mengikat kas.
                          </span>
                          {' '}
                          <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600, textDecoration: 'underline' }}>
                            Lihat rekomendasi →
                          </span>
                        </div>
                      </div>
                    )}
                  </SectionCard>
                </div>

                {/* ═══ 7. DETAIL LAPORAN — Laba Rugi + Neraca (filter rentang SENDIRI) ═══ */}
                <div id="sec-detail" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Filter rentang bersama — TERPISAH dari filter induk di atas */}
                  <SectionCard>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 4, height: 20, borderRadius: 99, flexShrink: 0, background: 'linear-gradient(180deg, #daf163, #bef264)' }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430' }}>Detail Laporan</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Laba Rugi &amp; Neraca per periode · filter tanggalnya terpisah dari rasio di atas</div>
                        </div>
                      </div>
                      <div style={{ width: 248 }}>
                        <DateRangePicker value={detailPickerValue} onChange={setDetailRange} placeholder="Filter tanggal detail" />
                      </div>
                    </div>
                  </SectionCard>

                  {detailLoading ? (
                    <SectionCard>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', fontSize: 12, padding: '6px 0' }}>
                        <Loader2 className="w-4 h-4 animate-spin" /> Memuat detail…
                      </div>
                    </SectionCard>
                  ) : detailError ? (
                    <SectionCard>
                      <p style={{ fontSize: 12, color: '#dc2626', padding: '6px 0' }}>Gagal memuat detail. Coba ubah rentang atau muat ulang.</p>
                    </SectionCard>
                  ) : (
                    <>
                      {/* Detail Laba Rugi */}
                      <SectionCard>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 4, height: 20, borderRadius: 99, flexShrink: 0, background: 'linear-gradient(180deg, #daf163, #bef264)' }} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430' }}>Detail Laba Rugi</div>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{detailPnlView ? detailPnlView.rangeLabel : '—'}</div>
                            </div>
                          </div>
                          {detailPnlView && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <SegCtrl
                                options={[{ label: 'Bulanan', value: 'bulanan' as const }, { label: 'Kuartalan', value: 'kuartalan' as const }, { label: 'YTD', value: 'ytd' as const }]}
                                value={stmtView}
                                onChange={setStmtView}
                              />
                              <SegCtrl
                                options={[{ label: 'Nominal', value: 'nominal' as const }, { label: '% Pendapatan', value: 'pct' as const }]}
                                value={stmtMode}
                                onChange={setStmtMode}
                              />
                            </div>
                          )}
                        </div>

                        {!detailPnlView ? (
                          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '6px 0' }}>Belum ada laporan Laba Rugi ter-mapping untuk rentang ini.</p>
                        ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                            <thead>
                              <tr style={{ background: '#fafafa', borderBottom: '2px solid #efefef' }}>
                                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', minWidth: 180 }}>Akun</th>
                                {detailPnlView.pnlCols.map(col => (
                                  <th key={col.label} style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{col.label}</th>
                                ))}
                                <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', borderLeft: '1px solid #f0f0f0' }}>Δ</th>
                                <th style={{ width: 68, padding: '8px 6px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Tren</th>
                                <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', background: '#f3f4f6', borderLeft: '2px solid #efefef', whiteSpace: 'nowrap' }}>
                                  {detailPnlView.pnlTotal.label}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {ROW_DEFS.map(row => {
                                const rowSub = detailPnlView.subRows[row.key] ?? []
                                const isExpandable = rowSub.length > 0
                                const isExp = !!expanded[row.key] && isExpandable
                                const rowBg = (row.bold && !row.pct) ? '#fcfcfd' : 'white'
                                const color = row.pct ? 'var(--color-text-muted)' : row.muted ? 'var(--color-text-muted)' : '#1f2430'
                                const fw = row.pct ? 500 : row.bold ? 700 : 400
                                const fi = row.pct ? 'italic' as const : 'normal' as const
                                const bl = row.accent ? `3px solid ${row.accent}` : '3px solid transparent'
                                const delta = rowDelta(row, detailPnlView.pnlCols)
                                const showTrend = row.key === 'rev' || row.key === 'np'
                                const trendColor = row.key === 'rev' ? '#0284c7' : '#16a34a'
                                const trendArr = row.key === 'rev' ? detailPnlView.pRevArr : detailPnlView.pNPArr
                                return (
                                  <Fragment key={row.key}>
                                    <tr
                                      style={{ background: rowBg, borderBottom: row.divider ? '2px solid #eee' : '1px solid #f5f5f5', cursor: isExpandable ? 'pointer' : 'default' }}
                                      onClick={isExpandable ? () => setExpanded(p => ({ ...p, [row.key]: !p[row.key] })) : undefined}
                                    >
                                      <td style={{ padding: '9px 12px', borderLeft: bl }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          {isExpandable && (
                                            <ChevronRight style={{ width: 13, height: 13, color: 'var(--color-text-muted)', flexShrink: 0, transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                                          )}
                                          <span style={{ fontSize: 12, fontWeight: fw, fontStyle: fi, color }}>{row.neg && '−'}{row.label}</span>
                                        </div>
                                      </td>
                                      {detailPnlView.pnlCols.map(col => (
                                        <td key={col.label} style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12, fontWeight: fw, fontStyle: fi, color }}>
                                          {cellVal(row, col, stmtMode)}
                                        </td>
                                      ))}
                                      <td style={{ padding: '9px 10px', textAlign: 'right', borderLeft: '1px solid #f0f0f0', fontSize: 11, fontWeight: 600, color: delta === null ? 'var(--color-text-muted)' : delta.isGood ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
                                        {delta === null ? '—' : (delta.isGood ? '+' : '') + delta.pct.toFixed(1).replace('.', ',') + '%'}
                                      </td>
                                      <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                                        {showTrend && trendArr.length >= 2
                                          ? <Sparkline values={trendArr} color={trendColor} width={56} height={18} fill={false} />
                                          : <span style={{ color: '#e5e7eb' }}>·</span>}
                                      </td>
                                      <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12, fontWeight: fw, fontStyle: fi, color, background: '#fafafa', borderLeft: '2px solid #efefef' }}>
                                        {cellVal(row, detailPnlView.pnlTotal, stmtMode)}
                                      </td>
                                    </tr>
                                    {isExp && rowSub.map((sub, si) => (
                                      <tr key={row.key + '-' + si} style={{ background: '#f7f8fa', borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '7px 12px 7px 38px', fontSize: 11, color: 'var(--color-text-muted)', borderLeft: '3px solid transparent' }}>
                                          └ {sub.label} <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 4 }}>{(sub.portion * 100).toFixed(0)}%</span>
                                        </td>
                                        {detailPnlView.pnlCols.map(col => {
                                          const subVal = row.getVal(col) * sub.portion
                                          return (
                                            <td key={col.label} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 11, color: 'var(--color-text-muted)' }}>
                                              {stmtMode === 'pct' ? fmtPct(subVal / col.rev * 100) : fmtRp(subVal)}
                                            </td>
                                          )
                                        })}
                                        <td style={{ padding: '7px 10px', borderLeft: '1px solid #f0f0f0' }} />
                                        <td />
                                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 11, color: 'var(--color-text-muted)', background: '#fafafa', borderLeft: '2px solid #efefef' }}>
                                          {stmtMode === 'pct'
                                            ? fmtPct(row.getVal(detailPnlView.pnlTotal) * sub.portion / detailPnlView.pnlTotal.rev * 100)
                                            : fmtRp(row.getVal(detailPnlView.pnlTotal) * sub.portion)}
                                        </td>
                                      </tr>
                                    ))}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        )}
                      </SectionCard>

                      {/* Detail Neraca — saldo akhir per periode (gaya P&L, tanpa akumulasi antar periode) */}
                      <SectionCard>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                          <div style={{ width: 4, height: 20, borderRadius: 99, flexShrink: 0, background: 'linear-gradient(180deg, #7dd3fc, #38bdf8)' }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430' }}>Detail Neraca</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Saldo akhir per periode · % = porsi dari total section · klik kelompok untuk detail akun</div>
                          </div>
                        </div>

                        {(() => {
                          const nd = detailNeraca
                          if (!nd?.hasData || !nd.sections?.length || !nd.periods.length || !nd.totalAktiva || !nd.totalPasiva) {
                            return <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '6px 0' }}>Belum ada laporan Neraca ter-mapping untuk rentang ini.</p>
                          }
                          const periods = nd.periods
                          const nPer = periods.length
                          const TA = nd.totalAktiva, TP = nd.totalPasiva
                          const aktivaSecs = nd.sections.filter(s => ND_AKTIVA_KEYS.includes(s.key))
                          const pasivaSecs = nd.sections.filter(s => ND_PASIVA_KEYS.includes(s.key))
                          const otherSec = nd.sections.find(s => s.key === 'other')
                          // Balance check datang dari server (lib/neraca-compare),
                          // bukan dihitung ulang di sini dengan ambang sendiri —
                          // dulu baris ini memakai `> 100` yang tidak nyambung
                          // dengan definisi mana pun. Fallback hanya untuk
                          // response lama yang belum membawa `balance`.
                          const bal = nd.balance
                          const unbalanced = bal
                            ? bal.balanced.some(b => !b)
                            : periods.some((_, i) => Math.abs(TA[i] - TP[i]) > 1000)
                          const toggle = (k: string) => setNeracaExpanded(p => ({ ...p, [k]: !p[k] }))

                          const sectionBlock = (sec: NdSection, denom: number[] | null) => {
                            const isExp = !!neracaExpanded[sec.key]
                            return (
                              <Fragment key={sec.key}>
                                <tr
                                  role="button" tabIndex={0} aria-expanded={isExp}
                                  aria-label={`${sec.label}: ${sec.accounts.length} akun. ${isExp ? 'Tutup' : 'Buka'} detail.`}
                                  onClick={() => toggle(sec.key)}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(sec.key) } }}
                                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                  style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                                >
                                  <td style={{ padding: '9px 12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <ChevronRight style={{ width: 13, height: 13, color: 'var(--color-text-muted)', flexShrink: 0, transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2430' }}>{sec.label}</span>
                                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{sec.accounts.length} akun</span>
                                    </div>
                                  </td>
                                  {periods.map((_, i) => (
                                    <td key={i} style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', ...(i === nPer - 1 ? { background: '#fafafa', borderLeft: '2px solid #efefef' } : {}) }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2430', fontVariantNumeric: 'tabular-nums' }}>{fmtFull(sec.totals[i])}</div>
                                      {denom && <div style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>{fmtPct0(pctOf(sec.totals[i], denom[i]))}</div>}
                                    </td>
                                  ))}
                                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                    {sec.totals.length >= 2 ? <Sparkline values={sec.totals} color="#0284c7" width={56} height={18} fill={false} /> : <span style={{ color: '#e5e7eb' }}>·</span>}
                                  </td>
                                </tr>
                                {isExp && sec.accounts.map(a => (
                                  <tr key={a.kode} style={{ background: '#f7f8fa', borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '7px 12px 7px 38px', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>└ {a.name}</td>
                                    {periods.map((_, i) => (
                                      <td key={i} style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', ...(i === nPer - 1 ? { background: '#fafafa', borderLeft: '2px solid #efefef' } : {}) }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtFull(a.values[i])}</div>
                                        <div style={{ fontSize: 9, color: '#c0c4cc' }}>{fmtPct0(pctOf(a.values[i], sec.totals[i]))}</div>
                                      </td>
                                    ))}
                                    <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                      {a.values.length >= 2 ? <Sparkline values={a.values} color="#94a3b8" width={48} height={14} fill={false} /> : <span style={{ color: '#e5e7eb' }}>·</span>}
                                    </td>
                                  </tr>
                                ))}
                              </Fragment>
                            )
                          }

                          const grandRow = (label: string, arr: number[], accent: string) => (
                            <tr style={{ background: '#e9edf2', borderTop: '2px solid #d7dde5', borderBottom: '2px solid #d7dde5' }}>
                              <td style={{ padding: '10px 12px', borderLeft: `3px solid ${accent}`, fontSize: 12, fontWeight: 700, color: '#1f2430', whiteSpace: 'nowrap' }}>{label}</td>
                              {arr.map((v, i) => (
                                <td key={i} style={{ padding: '10px 10px', textAlign: 'right', whiteSpace: 'nowrap', ...(i === nPer - 1 ? { background: '#dfe5ec' } : {}) }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2430', fontVariantNumeric: 'tabular-nums' }}>{fmtFull(v)}</div>
                                  <div style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>100%</div>
                                </td>
                              ))}
                              <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                                {arr.length >= 2 ? <Sparkline values={arr} color={accent} width={56} height={18} fill={false} /> : <span style={{ color: '#e5e7eb' }}>·</span>}
                              </td>
                            </tr>
                          )

                          return (
                            <>
                              {/* Balance check STAF SAJA. Buat klien, selisih
                                  pembulatan beberapa rupiah cuma menimbulkan
                                  keraguan pada laporannya sendiri padahal mereka
                                  tak punya wewenang memperbaikinya; buat admin,
                                  angka yang sama adalah petunjuk kerja. */}
                              {isStaff && unbalanced && bal && (
                                <div style={{ background: '#fef3c7', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                                  <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: '#b45309', marginTop: 1 }} />
                                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                    <span style={{ fontWeight: 700, color: '#b45309' }}>Total Aktiva ≠ Total Pasiva.</span>{' '}
                                    Selisih di luar toleransi {fmtFull(bal.tolerance)}:
                                    <span style={{ display: 'block', marginTop: 4 }}>
                                      {periods.map((p, i) => (
                                        bal.balanced[i] ? null : (
                                          <span key={i} style={{ display: 'inline-block', marginRight: 12, fontVariantNumeric: 'tabular-nums' }}>
                                            <strong style={{ color: '#1f2430' }}>{p.label}</strong>{' '}
                                            <strong style={{ color: '#b45309' }}>{fmtFull(bal.diff[i])}</strong>
                                            {bal.unclassifiedCount[i] > 0 && (
                                              <span> · {bal.unclassifiedCount[i]} akun tak terklasifikasi ({fmtFull(bal.unclassifiedTotal[i])})</span>
                                            )}
                                          </span>
                                        )
                                      ))}
                                    </span>
                                    <span style={{ display: 'block', marginTop: 4 }}>
                                      Laporan tetap bisa dipakai — periksa subKelompok COA di Settings kalau ada akun tak terklasifikasi.
                                    </span>
                                  </div>
                                </div>
                              )}
                              {isStaff && otherSec && (
                                <div style={{ background: '#fef3c7', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                                  <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: '#b45309', marginTop: 1 }} />
                                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                    <span style={{ fontWeight: 700, color: '#b45309' }}>{otherSec.accounts.length} akun tidak terklasifikasi</span>{' '}
                                    — subKelompok COA-nya tidak dikenali sebagai Aktiva/Hutang/Modal, ditampilkan terpisah &amp; TIDAK ikut total.
                                  </span>
                                </div>
                              )}
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 240 + nPer * 110 }}>
                                  <thead>
                                    <tr style={{ background: '#fafafa', borderBottom: '2px solid #efefef' }}>
                                      <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', minWidth: 180 }}>Akun</th>
                                      {periods.map((p, i) => (
                                        <th key={p.periodStart} style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', ...(i === nPer - 1 ? { background: '#f3f4f6', borderLeft: '2px solid #efefef' } : {}) }}>{p.label}</th>
                                      ))}
                                      <th style={{ width: 68, padding: '8px 6px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Tren</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {aktivaSecs.map(s => sectionBlock(s, TA))}
                                    {grandRow('Total Aktiva', TA, '#0284c7')}
                                    {pasivaSecs.map(s => sectionBlock(s, TP))}
                                    {grandRow('Total Pasiva', TP, '#8b5cf6')}
                                    {otherSec && sectionBlock(otherSec, null)}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )
                        })()}
                      </SectionCard>
                    </>
                  )}
                </div>

              </div>
            )}
          </main>
        </div>
      </div>

      {drawer && view && (
        <MetricDrawer
          drawerKey={drawer}
          onClose={() => setDrawer(null)}
          onNavigate={key => setDrawer(key)}
          computed={view.computed}
          trends={view.ta}
          months={view.drawerMonths}
          health={view.drawerHealth}
        />
      )}
    </>
  )
}
