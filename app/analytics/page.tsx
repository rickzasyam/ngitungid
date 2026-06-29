'use client'

import { Fragment, useState } from 'react'
import { Calendar, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
import { Sidebar } from '@/components/sidebar'
import { useRequireClient } from '@/lib/use-require-client'
import { DateRangePicker } from '@/components/date-range-picker'
import { Sparkline } from '@/components/analytics/sparkline'
import { RatioCard, TONES, Pill, type ToneKey } from '@/components/analytics/ratio-card'
import { MetricDrawer, type ComputedMetrics, type TrendArrays } from '@/components/analytics/metric-drawer'

// ── Data ─────────────────────────────────────────────────────
const MONTHLY_DATA = [
  { m: 'Jan', rev: 485086931, np: 127635672, gp: 284632728, exp: 153404036 },
  { m: 'Feb', rev: 512340000, np: 141200000, gp: 298500000, exp: 157300000 },
  { m: 'Mar', rev: 498750000, np: 118900000, gp: 275600000, exp: 156700000 },
  { m: 'Apr', rev: 567890000, np: 165400000, gp: 320100000, exp: 154700000 },
  { m: 'Mei', rev: 601230000, np: 178300000, gp: 342800000, exp: 164500000 },
  { m: 'Jun', rev: 589450000, np: 169800000, gp: 335200000, exp: 165400000 },
]

const BS = {
  aktivaLancar: 1397767344,
  hutangLancar:   42142100,
  persediaan:   1214633693,
  kas:            75254490,
  piutang:        66794049,
  totalModal:   1419315950,
  totalAset:    1466658050,
}
const BS_TOTAL_HUTANG = BS.totalAset - BS.totalModal // 47342100

// ── Period map ────────────────────────────────────────────────
type PeriodKey = 'H1' | 'Q1' | 'Q2' | 'custom'
const PERIOD_MAP = {
  H1: { idx: [0,1,2,3,4,5], label: 'H1 2026', days: 181, tot: 'H1' },
  Q1: { idx: [0,1,2],       label: 'Q1 2026', days: 90,  tot: 'Q1' },
  Q2: { idx: [3,4,5],       label: 'Q2 2026', days: 91,  tot: 'Q2' },
}

// ── Color / severity ──────────────────────────────────────────
const SEVERITY = {
  critical: { label: 'Kritis',     bg: '#fee2e2', fg: '#b91c1c', dot: '#dc2626' },
  warning:  { label: 'Peringatan', bg: '#fef3c7', fg: '#b45309', dot: '#d97706' },
  info:     { label: 'Info',       bg: '#dbeafe', fg: '#1d4ed8', dot: '#2563eb' },
  review:   { label: 'Tinjau',     bg: '#eef2f7', fg: '#475569', dot: '#64748b' },
}
type SeverityKey = keyof typeof SEVERITY

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

// ── Synth trend for static BS ratios ─────────────────────────
const synth = (end: number, lift = 0.84): number[] =>
  [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => end * lift + (end - end * lift) * t)

// ── Aggregate helper ──────────────────────────────────────────
interface ColData { label: string; rev: number; gp: number; np: number; exp: number; hpp: number }

function sumIdx(indices: number[]): Omit<ColData, 'label'> {
  const rev = indices.reduce((s, i) => s + MONTHLY_DATA[i].rev, 0)
  const gp  = indices.reduce((s, i) => s + MONTHLY_DATA[i].gp, 0)
  const np  = indices.reduce((s, i) => s + MONTHLY_DATA[i].np, 0)
  const exp = indices.reduce((s, i) => s + MONTHLY_DATA[i].exp, 0)
  return { rev, gp, np, exp, hpp: rev - gp }
}

// ── Static drawer trend arrays (always all 6 months) ─────────
const dsoAll    = MONTHLY_DATA.map(d => BS.piutang / (d.rev * 12) * 365)
const dioAll    = MONTHLY_DATA.map(d => BS.persediaan / (d.rev * 12) * 365)
const dpoAll    = MONTHLY_DATA.map(d => BS.hutangLancar / ((d.rev - d.gp) * 12) * 365)

const DRAWER_TRENDS: TrendArrays = {
  rev:       MONTHLY_DATA.map(d => d.rev),
  gp:        MONTHLY_DATA.map(d => d.gp),
  np:        MONTHLY_DATA.map(d => d.np),
  gpm:       MONTHLY_DATA.map(d => d.gp / d.rev * 100),
  npm:       MONTHLY_DATA.map(d => d.np / d.rev * 100),
  opm:       MONTHLY_DATA.map(d => (d.gp - d.exp) / d.rev * 100),
  roe:       MONTHLY_DATA.map(d => d.np * 12 / BS.totalModal * 100),
  roa:       MONTHLY_DATA.map(d => d.np * 12 / BS.totalAset * 100),
  dso:       dsoAll,
  dio:       dioAll,
  dpo:       dpoAll,
  invTurn:   MONTHLY_DATA.map(d => d.rev * 12 / BS.persediaan),
  assetTurn: MONTHLY_DATA.map(d => d.rev * 12 / BS.totalAset),
  ccc:       MONTHLY_DATA.map((_, i) => dioAll[i] + dsoAll[i] - dpoAll[i]),
  cr:        synth(BS.aktivaLancar / BS.hutangLancar),
  qr:        synth((BS.aktivaLancar - BS.persediaan) / BS.hutangLancar),
  cashR:     synth(BS.kas / BS.hutangLancar),
  der:       synth(BS_TOTAL_HUTANG / BS.totalModal, 0.93),
  wc:        synth(BS.aktivaLancar - BS.hutangLancar),
}

// ── Alerts ───────────────────────────────────────────────────
const ALERTS: { severity: SeverityKey; title: string; desc: string; metric: string }[] = [
  { severity: 'warning', title: 'DIO 68 hari di atas benchmark',      desc: 'Persediaan tertahan rata-rata 68 hari (benchmark < 60). Berpotensi mengikat kas & risiko slow-moving.', metric: 'dio' },
  { severity: 'info',    title: 'Profitabilitas sangat baik',          desc: 'ROE 63,5% jauh di atas benchmark 15% dan net margin 27,7% — kinerja laba kuat.',                        metric: 'roe' },
  { severity: 'review',  title: 'Current Ratio 33,16 terlalu tinggi', desc: 'Likuiditas berlebih — aset lancar & persediaan kemungkinan belum dioptimalkan untuk imbal hasil.',       metric: 'cr'  },
]

// ── Financial Health dimensions (dark panel) ─────────────────
const DIMS_PANEL = [
  { key: 'likuiditas',     label: 'Likuiditas',     score: 95, tone: 'info'      as ToneKey, status: 'Sangat Tinggi',   reason: 'CR 33,16 · QR 4,34 · Cash 1,79 — likuiditas berlebih, cek optimalisasi aset' },
  { key: 'profitabilitas', label: 'Profitabilitas', score: 88, tone: 'sehat'     as ToneKey, status: 'Sangat Baik',     reason: 'NPM 27,7% · ROE 63,5% — profitabilitas kuat dan konsisten' },
  { key: 'leverage',       label: 'Leverage',       score: 98, tone: 'sehat'     as ToneKey, status: 'Konservatif',     reason: 'DER 0,03 — hutang hanya 2,9% total aset, struktur sangat aman' },
  { key: 'efisiensi',      label: 'Efisiensi',      score: 60, tone: 'perhatian' as ToneKey, status: 'Perlu Perhatian', reason: 'DIO 68 hari · Inv. turnover 5,4× — persediaan lambat mengikat kas' },
]

// ── P&L row definitions ───────────────────────────────────────
type RowKey = 'rev' | 'hpp' | 'gp' | 'gpmr' | 'opex' | 'np' | 'npmr'
interface RowDef {
  key: RowKey; label: string; accent?: string; bold?: boolean; pct?: boolean
  muted?: boolean; neg?: boolean; divider?: boolean; expandable?: boolean; ofRev?: boolean
  sub?: { label: string; portion: number }[]
  getVal: (c: Omit<ColData, 'label'>) => number
}
const ROW_DEFS: RowDef[] = [
  { key: 'rev',  label: 'Pendapatan',        accent: '#3b82f6', bold: true, expandable: true, getVal: c => c.rev,
    sub: [{ label: 'Produk', portion: 0.62 }, { label: 'Channel Online', portion: 0.26 }, { label: 'Customer B2B', portion: 0.12 }] },
  { key: 'hpp',  label: 'HPP',               muted: true, neg: true, expandable: true, getVal: c => c.hpp,
    sub: [{ label: 'Bahan Baku', portion: 0.58 }, { label: 'Tenaga Kerja Langsung', portion: 0.27 }, { label: 'Overhead Produksi', portion: 0.15 }] },
  { key: 'gp',   label: 'Laba Kotor',        bold: true, divider: true, getVal: c => c.gp },
  { key: 'gpmr', label: 'Gross Margin',      pct: true, ofRev: true, getVal: c => c.gp },
  { key: 'opex', label: 'Beban Operasional', muted: true, neg: true, expandable: true, getVal: c => c.exp,
    sub: [{ label: 'Marketing', portion: 0.34 }, { label: 'Gaji & SDM', portion: 0.46 }, { label: 'Operasional', portion: 0.20 }] },
  { key: 'np',   label: 'Laba Bersih',       accent: '#16a34a', bold: true, getVal: c => c.np },
  { key: 'npmr', label: 'Net Margin',        pct: true, ofRev: true, getVal: c => c.np },
]

// ── Small shared components ───────────────────────────────────
function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 18, padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #ececec' }}>
      {children}
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
            color: value === opt.value ? '#1f2430' : '#6b7280',
            boxShadow: value === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const OVERALL_SCORE = 82

// ════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const [period, setPeriod]         = useState<PeriodKey>('H1')
  const [cStart, setCStart]         = useState(0)
  const [cEnd, setCEnd]             = useState(5)
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined)
  const [drawer, setDrawer]         = useState<string | null>(null)
  const [stmtView, setStmtView]     = useState<'bulanan' | 'kuartalan' | 'ytd'>('bulanan')
  const [stmtMode, setStmtMode]     = useState<'nominal' | 'pct'>('nominal')
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})

  if (!isLoaded || !activeClient) return null

  // ── Period config ────────────────────────────────────────────
  const pc = period === 'custom'
    ? { idx: Array.from({ length: Math.max(1, cEnd - cStart + 1) }, (_, i) => cStart + i), label: 'Custom', days: Math.max(1, cEnd - cStart + 1) * 30.4, tot: 'Custom' }
    : PERIOD_MAP[period as Exclude<PeriodKey, 'custom'>]

  // ── Aggregates ───────────────────────────────────────────────
  const data    = pc.idx.map(i => MONTHLY_DATA[i])
  const totRev  = data.reduce((s, d) => s + d.rev, 0)
  const totGP   = data.reduce((s, d) => s + d.gp, 0)
  const totNP   = data.reduce((s, d) => s + d.np, 0)
  const totExp  = data.reduce((s, d) => s + d.exp, 0)
  const totHPP  = totRev - totGP
  const totOI   = totGP - totExp

  // ── Ratios ───────────────────────────────────────────────────
  const cr        = BS.aktivaLancar / BS.hutangLancar
  const qr        = (BS.aktivaLancar - BS.persediaan) / BS.hutangLancar
  const cashR     = BS.kas / BS.hutangLancar
  const der       = BS_TOTAL_HUTANG / BS.totalModal
  const wc        = BS.aktivaLancar - BS.hutangLancar
  const gpm       = totGP / totRev * 100
  const npm       = totNP / totRev * 100
  const opm       = totOI / totRev * 100
  const roe       = totNP / BS.totalModal * 100
  const roa       = totNP / BS.totalAset * 100
  const dso       = BS.piutang / totRev * pc.days
  const dio       = BS.persediaan * pc.days / totRev
  const dpo       = BS.hutangLancar * pc.days / totHPP
  const invTurn   = (totRev / BS.persediaan) * (365 / pc.days)
  const assetTurn = (totRev / BS.totalAset) * (365 / pc.days)
  const ccc       = dio + dso - dpo

  // ── Period sparkline arrays (filtered) ──────────────────────
  const pRevArr  = data.map(d => d.rev)
  const pGPArr   = data.map(d => d.gp)
  const pNPArr   = data.map(d => d.np)
  const pGPMArr  = data.map(d => d.gp / d.rev * 100)
  const pNPMArr  = data.map(d => d.np / d.rev * 100)

  const momDelta = (arr: number[]) => {
    if (arr.length < 2) return null
    const cur = arr[arr.length - 1], prev = arr[arr.length - 2]
    return (cur - prev) / Math.abs(prev) * 100
  }

  // ── Computed for drawer ──────────────────────────────────────
  const computed: ComputedMetrics = {
    totRev, totNP, totGP, totOI, totHPP, totExp,
    pc: { days: pc.days, tot: pc.tot }, periodMonths: pc.idx.length,
    aktivaLancar: BS.aktivaLancar, hutangLancar: BS.hutangLancar,
    persediaan: BS.persediaan, kas: BS.kas, piutang: BS.piutang,
    totalModal: BS.totalModal, totalAset: BS.totalAset, totalHutang: BS_TOTAL_HUTANG,
    cr, qr, cashR, der, wc, gpm, npm, opm, roe, roa,
    dso, dio, dpo, invTurn, assetTurn, ccc,
  }

  // ── Drawer trend arrays filtered to active period ────────────
  const drawerMonths = pc.idx.map(i => MONTHLY_DATA[i]?.m).filter(Boolean) as string[]
  const drawerTrends = Object.fromEntries(
    Object.entries(DRAWER_TRENDS).map(([k, arr]) => [
      k,
      pc.idx.map(i => arr[i]).filter((v): v is number => v !== undefined),
    ])
  ) as unknown as TrendArrays

  // ── P&L table columns ────────────────────────────────────────
  const getPnLCols = (): ColData[] => {
    if (stmtView === 'bulanan') {
      return pc.idx.map(i => ({ label: MONTHLY_DATA[i].m, ...sumIdx([i]) }))
    }
    if (stmtView === 'kuartalan') {
      const cols: ColData[] = []
      const q1 = pc.idx.filter(i => i < 3)
      const q2 = pc.idx.filter(i => i >= 3)
      if (q1.length) cols.push({ label: 'Q1', ...sumIdx(q1) })
      if (q2.length) cols.push({ label: 'Q2', ...sumIdx(q2) })
      return cols
    }
    let accRev = 0, accGp = 0, accNp = 0, accExp = 0
    return pc.idx.map(i => {
      const d = MONTHLY_DATA[i]
      accRev += d.rev; accGp += d.gp; accNp += d.np; accExp += d.exp
      return { label: d.m, rev: accRev, gp: accGp, np: accNp, exp: accExp, hpp: accRev - accGp }
    })
  }
  const pnlCols = getPnLCols()
  const pnlTotal: ColData = { label: 'Total ' + pc.tot, ...sumIdx(pc.idx) }

  const getCellVal = (row: RowDef, col: ColData | Omit<ColData,'label'>) => {
    const raw = row.getVal(col as Omit<ColData,'label'>)
    if (row.pct) return fmtPct(raw / (col as ColData).rev * 100)
    if (stmtMode === 'pct') return fmtPct(raw / (col as ColData).rev * 100)
    return fmtRp(raw)
  }

  const getDelta = (row: RowDef) => {
    if (pnlCols.length < 2) return null
    const prev = row.getVal(pnlCols[pnlCols.length - 2])
    const curr = row.getVal(pnlCols[pnlCols.length - 1])
    if (!prev) return null
    const pct = (curr - prev) / Math.abs(prev) * 100
    const isPos = curr >= prev
    const isGood = row.neg ? !isPos : isPos
    return { pct, isGood }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
      <Sidebar activeItem="analytics" />

      <div className="flex-1 min-w-0 overflow-hidden" style={{ padding: 10 }}>
        <div className="h-full flex flex-col rounded-3xl overflow-hidden" style={{ background: 'white', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 flex items-center justify-between" style={{ padding: '15px 22px', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1f2430', margin: 0 }}>Analytics</h1>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
                {activeClient.name} · Analisis keuangan mendalam
              </p>
            </div>

            {/* Period tabs + custom date range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {period === 'custom' && (
                <div style={{ width: 248 }}>
                  <DateRangePicker
                    value={customRange}
                    onChange={(range) => {
                      setCustomRange(range)
                      if (range?.from && range?.to) {
                        const maxIdx = MONTHLY_DATA.length - 1
                        const fromM = Math.min(Math.max(range.from.getMonth(), 0), maxIdx)
                        const toM   = Math.min(Math.max(range.to.getMonth(), 0), maxIdx)
                        setCStart(Math.min(fromM, toM))
                        setCEnd(Math.max(fromM, toM))
                      }
                    }}
                    placeholder="Pilih periode custom"
                  />
                </div>
              )}
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 11, padding: 3, gap: 2 }}>
                {(['H1', 'Q1', 'Q2'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: '5px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12,
                      background: period === p ? 'var(--color-accent-primary)' : 'transparent',
                      fontWeight: period === p ? 700 : 500,
                      color: period === p ? 'var(--color-accent-primary-fg)' : '#6b7280',
                      boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {p === 'H1' ? 'H1 2026' : p}
                  </button>
                ))}
                <button
                  onClick={() => setPeriod('custom')}
                  style={{
                    padding: '5px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: period === 'custom' ? 'var(--color-accent-primary)' : 'transparent',
                    fontWeight: period === 'custom' ? 700 : 500,
                    color: period === 'custom' ? 'var(--color-accent-primary-fg)' : '#6b7280',
                    boxShadow: period === 'custom' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  <Calendar style={{ width: 12, height: 12 }} />
                  Custom
                </button>
              </div>
            </div>
          </div>

          {/* ── Scrollable body ──────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto" style={{ background: '#f3f4f6' }}>
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
                        background: `conic-gradient(var(--color-accent-primary) ${OVERALL_SCORE * 3.6}deg, rgba(255,255,255,0.1) 0deg)`,
                      }} />
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        width: 84, height: 84, borderRadius: '50%', background: '#202024',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 30, fontWeight: 700, color: 'white', lineHeight: 1 }}>{OVERALL_SCORE}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>/100</span>
                      </div>
                    </div>
                    {/* Insight */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3, marginBottom: 4 }}>SKOR KESEHATAN KEUANGAN</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-accent-primary)', marginBottom: 6 }}>● Keuangan Sehat</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                        Profitabilitas sangat baik dengan NPM {fmtPct(npm)} dan ROE {fmtPct(roe)}. Perlu perhatian pada efisiensi persediaan (DIO {fmtDays(dio)}).
                      </div>
                    </div>
                  </div>

                  {/* 3 KPI minis */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { label: 'Laba Bersih', value: fmtRp(totNP),  key: 'np' },
                      { label: 'Net Margin',  value: fmtPct(npm),   key: 'npm' },
                      { label: 'Posisi Kas',  value: fmtRp(BS.kas), key: 'cash' },
                    ].map(item => (
                      <div
                        key={item.key}
                        onClick={() => setDrawer(item.key)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 11, padding: '10px 12px', cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.09)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)' }}
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
                      { label: 'Pendapatan', value: fmtRp(totRev), sub: pc.label,        tone: 'info'  as ToneKey },
                      { label: 'Laba Kotor', value: fmtRp(totGP),  sub: 'GPM ' + fmtPct(gpm), tone: 'sehat' as ToneKey },
                    ].map(item => {
                      const t = TONES[item.tone]
                      return (
                        <div key={item.label} style={{ flex: 1, padding: '13px 15px', borderRadius: 13, background: 'white', border: '1px solid #ececec', borderTop: `3px solid ${t.bar}` }}>
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>{item.value}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{item.sub}</div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Top 3 Alerts */}
                  <div style={{ flex: 1, background: 'white', borderRadius: 14, border: '1px solid #ececec', padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1f2430', marginBottom: 10 }}>Top 3 Alerts</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {ALERTS.map((alert, i) => {
                        const s = SEVERITY[alert.severity]
                        return (
                          <div
                            key={i}
                            onClick={() => setDrawer(alert.metric)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: s.bg, borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.82' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
                          >
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 4 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: s.fg, textTransform: 'uppercase' }}>{s.label}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: s.fg }}>{alert.title}</span>
                              </div>
                              <div style={{ fontSize: 10.5, color: '#6b7280', lineHeight: 1.4 }}>{alert.desc}</div>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>Performa Keuangan</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>{pc.label} · 5 indikator utama · Klik untuk detail</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
                    {[
                      { label: 'Pendapatan',   value: fmtRp(totRev), tone: 'info'  as ToneKey, arr: pRevArr,  key: 'rev' },
                      { label: 'Laba Kotor',   value: fmtRp(totGP),  tone: 'sehat' as ToneKey, arr: pGPArr,   key: 'gp' },
                      { label: 'Laba Bersih',  value: fmtRp(totNP),  tone: 'sehat' as ToneKey, arr: pNPArr,   key: 'np' },
                      { label: 'Gross Margin', value: fmtPct(gpm),   tone: 'sehat' as ToneKey, arr: pGPMArr,  key: 'gpm' },
                      { label: 'Net Margin',   value: fmtPct(npm),   tone: 'sehat' as ToneKey, arr: pNPMArr,  key: 'npm' },
                    ].map(card => {
                      const t = TONES[card.tone]
                      const delta = momDelta(card.arr)
                      const isUp = delta !== null && delta >= 0
                      return (
                        <div
                          key={card.key}
                          onClick={() => setDrawer(card.key)}
                          style={{ padding: 14, borderRadius: 13, background: '#fafafa', border: '1px solid #efefef', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = 'white'; el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.07)'; el.style.transform = 'translateY(-1px)' }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.background = '#fafafa'; el.style.boxShadow = 'none'; el.style.transform = 'none' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>{card.label}</span>
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
                              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>MoM</div>
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
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Skor {OVERALL_SCORE}/100</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 22px' }}>
                  {DIMS_PANEL.map(dim => {
                    const t = TONES[dim.tone]
                    return (
                      <div
                        key={dim.key}
                        onClick={() => setDrawer('dim:' + dim.key)}
                        style={{ cursor: 'pointer', borderRadius: 10, padding: '10px 12px', transition: 'background 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'white' }}>{dim.label}</span>
                            <Pill tone={dim.tone} label={dim.status} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.bar }}>{dim.score}</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 99, marginBottom: 5, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: dim.score + '%', background: t.bar, borderRadius: 99 }} />
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>Rasio Likuiditas</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Kemampuan menutup kewajiban jangka pendek · Klik kartu untuk detail →</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <RatioCard label="Current Ratio"          value={fmtRatio(cr)}    tone="info"      status="Terlalu Tinggi"   formula="Aktiva Lancar ÷ Hutang Lancar"                        benchmark="1,5 – 3,0"        trend={DRAWER_TRENDS.cr}        onClick={() => setDrawer('cr')} />
                    <RatioCard label="Quick Ratio"            value={fmtRatio(qr)}    tone="sehat"     status="Sehat"            formula="(Aktiva Lancar − Persediaan) ÷ Hutang Lancar"         benchmark="> 1,0"            trend={DRAWER_TRENDS.qr}        onClick={() => setDrawer('qr')} />
                    <RatioCard label="Cash Ratio"             value={fmtRatio(cashR)} tone="sehat"     status="Sehat"            formula="Kas ÷ Hutang Lancar"                                  benchmark="> 0,5"            trend={DRAWER_TRENDS.cashR}     onClick={() => setDrawer('cash')} />
                    <RatioCard label="Debt-to-Equity"         value={fmtRatio(der)}   tone="netral"    status="Konservatif"      formula="Total Hutang ÷ Total Modal"                           benchmark="< 1,0"            trend={DRAWER_TRENDS.der}       onClick={() => setDrawer('der')} />
                    <RatioCard label="Modal Kerja"            value={fmtRp(wc)}       tone="info"      status="Surplus Besar"    formula="Aktiva Lancar − Hutang Lancar"                        benchmark="Positif"          trend={DRAWER_TRENDS.wc}        onClick={() => setDrawer('wc')} />
                    <RatioCard label="Cash Conversion Cycle"  value={fmtDays(ccc)}    tone="perhatian" status="Perlu Perhatian" formula="DIO + DSO − DPO"                                      benchmark="Semakin pendek"   trend={DRAWER_TRENDS.ccc}       onClick={() => setDrawer('ccc')} />
                  </div>
                </SectionCard>
              </div>

              {/* ═══ 5. PROFITABILITAS ═════════════════════════════ */}
              <div id="sec-profitabilitas">
                <SectionCard>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>Rasio Profitabilitas</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Kemampuan menghasilkan laba dari investasi dan pendapatan · Klik kartu untuk detail →</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <RatioCard label="Return on Equity"   value={fmtPct(roe)} tone="sehat" status="Sangat Baik" formula="Laba Bersih ÷ Total Modal"       benchmark="> 15%"  trend={DRAWER_TRENDS.roe} onClick={() => setDrawer('roe')} />
                    <RatioCard label="Return on Assets"   value={fmtPct(roa)} tone="sehat" status="Baik"        formula="Laba Bersih ÷ Total Aset"        benchmark="> 5%"   trend={DRAWER_TRENDS.roa} onClick={() => setDrawer('roa')} />
                    <RatioCard label="Gross Margin"       value={fmtPct(gpm)} tone="sehat" status="Sehat"       formula="Laba Kotor ÷ Pendapatan"         benchmark="> 50%"  trend={DRAWER_TRENDS.gpm} onClick={() => setDrawer('gpm')} />
                    <RatioCard label="Net Margin"         value={fmtPct(npm)} tone="sehat" status="Sangat Baik" formula="Laba Bersih ÷ Pendapatan"        benchmark="> 10%"  trend={DRAWER_TRENDS.npm} onClick={() => setDrawer('npm')} />
                    <RatioCard label="Operating Margin"   value={fmtPct(opm)} tone="sehat" status="Sehat"       formula="Laba Operasi ÷ Pendapatan"       benchmark="> 15%"  trend={DRAWER_TRENDS.opm} onClick={() => setDrawer('opm')} />
                  </div>
                </SectionCard>
              </div>

              {/* ═══ 6. EFISIENSI ══════════════════════════════════ */}
              <div id="sec-efisiensi">
                <SectionCard>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>Rasio Efisiensi</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Efektivitas aset dan operasional · Klik kartu untuk detail →</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
                    <RatioCard label="DSO"                    value={fmtDays(dso)}      tone="sehat"     status="Sangat Baik"    formula="Piutang ÷ Pendapatan × Hari"              benchmark="< 30 hari"      trend={DRAWER_TRENDS.dso}       onClick={() => setDrawer('dso')} />
                    <RatioCard label="DIO"                    value={fmtDays(dio)}      tone="perhatian" status="Perlu Perhatian" formula="Persediaan ÷ Pendapatan × Hari"           benchmark="< 60 hari"      trend={DRAWER_TRENDS.dio}       onClick={() => setDrawer('dio')} />
                    <RatioCard label="DPO"                    value={fmtDays(dpo)}      tone="netral"    status="Pendek"         formula="Hutang Usaha ÷ HPP × Hari"                benchmark="30 – 60 hari"   trend={DRAWER_TRENDS.dpo}       onClick={() => setDrawer('dpo')} />
                    <RatioCard label="Inventory Turnover"     value={fmtX(invTurn)}     tone="perhatian" status="Rendah"         formula="Pendapatan ÷ Persediaan (disetahunkan)"   benchmark="> 6×"          trend={DRAWER_TRENDS.invTurn}   onClick={() => setDrawer('invturn')} />
                    <RatioCard label="Asset Turnover"         value={fmtX(assetTurn)}   tone="sehat"     status="Baik"           formula="Pendapatan ÷ Total Aset (disetahunkan)"   benchmark="> 1,0"         trend={DRAWER_TRENDS.assetTurn} onClick={() => setDrawer('assetturn')} />
                    <RatioCard label="Cash Conversion Cycle"  value={fmtDays(ccc)}      tone="perhatian" status="Perlu Perhatian" formula="DIO + DSO − DPO"                         benchmark="Semakin pendek" trend={DRAWER_TRENDS.ccc}       onClick={() => setDrawer('ccc')} />
                  </div>
                  {/* DIO Warning Banner */}
                  <div
                    onClick={() => setDrawer('dio')}
                    style={{ background: '#fef3c7', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>Persediaan perlu perhatian.</span>
                      {' '}
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        DIO {fmtDays(dio)} melebihi benchmark 60 hari — Rp {(BS.persediaan / 1e9).toFixed(2).replace('.', ',')}M persediaan mengikat kas.
                      </span>
                      {' '}
                      <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600, textDecoration: 'underline' }}>
                        Lihat rekomendasi →
                      </span>
                    </div>
                  </div>
                </SectionCard>
              </div>

              {/* ═══ 7. TABEL P&L ════════════════════════════════════ */}
              <div id="sec-detail">
                <SectionCard>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>Detail Laba Rugi</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{pc.label}</div>
                    </div>
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
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '2px solid #efefef' }}>
                          <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', minWidth: 180 }}>Akun</th>
                          {pnlCols.map(col => (
                            <th key={col.label} style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>{col.label}</th>
                          ))}
                          <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', borderLeft: '1px solid #f0f0f0' }}>Δ</th>
                          <th style={{ width: 68, padding: '8px 6px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>Tren</th>
                          <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderLeft: '2px solid #efefef', whiteSpace: 'nowrap' }}>
                            Total {pc.tot}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROW_DEFS.map(row => {
                          const isExp = !!expanded[row.key]
                          const rowBg = (row.bold && !row.pct) ? '#fcfcfd' : 'white'
                          const color = row.pct ? '#6b7280' : row.muted ? '#9ca3af' : '#1f2430'
                          const fw = row.pct ? 500 : row.bold ? 700 : 400
                          const fi = row.pct ? 'italic' as const : 'normal' as const
                          const bl = row.accent ? `3px solid ${row.accent}` : '3px solid transparent'
                          const delta = getDelta(row)
                          const showTrend = row.key === 'rev' || row.key === 'np'
                          const trendColor = row.key === 'rev' ? '#3b82f6' : '#16a34a'
                          const trendArr = row.key === 'rev' ? pRevArr : pNPArr
                          const totalVal = row.getVal(pnlTotal)
                          return (
                            <Fragment key={row.key}>
                              <tr
                                style={{
                                  background: rowBg,
                                  borderBottom: row.divider ? '2px solid #eee' : '1px solid #f5f5f5',
                                  cursor: row.expandable ? 'pointer' : 'default',
                                }}
                                onClick={row.expandable ? () => setExpanded(p => ({ ...p, [row.key]: !p[row.key] })) : undefined}
                              >
                                <td style={{ padding: '9px 12px', borderLeft: bl }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {row.expandable && (
                                      <ChevronRight style={{ width: 13, height: 13, color: '#9ca3af', flexShrink: 0, transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                                    )}
                                    <span style={{ fontSize: 12, fontWeight: fw, fontStyle: fi, color }}>{row.neg && '−'}{row.label}</span>
                                  </div>
                                </td>
                                {pnlCols.map(col => (
                                  <td key={col.label} style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12, fontWeight: fw, fontStyle: fi, color }}>
                                    {getCellVal(row, col)}
                                  </td>
                                ))}
                                <td style={{ padding: '9px 10px', textAlign: 'right', borderLeft: '1px solid #f0f0f0', fontSize: 11, fontWeight: 600, color: delta === null ? '#9ca3af' : delta.isGood ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
                                  {delta === null ? '—' : (delta.isGood ? '+' : '') + delta.pct.toFixed(1).replace('.', ',') + '%'}
                                </td>
                                <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                                  {showTrend && trendArr.length >= 2
                                    ? <Sparkline values={trendArr} color={trendColor} width={56} height={18} fill={false} />
                                    : <span style={{ color: '#e5e7eb' }}>·</span>
                                  }
                                </td>
                                <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12, fontWeight: fw, fontStyle: fi, color, background: '#fafafa', borderLeft: '2px solid #efefef' }}>
                                  {row.pct
                                    ? fmtPct(totalVal / pnlTotal.rev * 100)
                                    : stmtMode === 'pct'
                                      ? fmtPct(totalVal / pnlTotal.rev * 100)
                                      : fmtRp(totalVal)
                                  }
                                </td>
                              </tr>

                              {isExp && row.sub?.map(sub => (
                                <tr key={sub.label} style={{ background: '#f7f8fa', borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '7px 12px 7px 38px', fontSize: 11, color: '#6b7280', borderLeft: '3px solid transparent' }}>
                                    └ {sub.label} <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>{(sub.portion * 100).toFixed(0)}%</span>
                                  </td>
                                  {pnlCols.map(col => {
                                    const subVal = row.getVal(col) * sub.portion
                                    return (
                                      <td key={col.label} style={{ padding: '7px 10px', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
                                        {stmtMode === 'pct' ? fmtPct(subVal / col.rev * 100) : fmtRp(subVal)}
                                      </td>
                                    )
                                  })}
                                  <td style={{ padding: '7px 10px', borderLeft: '1px solid #f0f0f0' }} />
                                  <td />
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 11, color: '#6b7280', background: '#fafafa', borderLeft: '2px solid #efefef' }}>
                                    {stmtMode === 'pct'
                                      ? fmtPct(row.getVal(pnlTotal) * sub.portion / pnlTotal.rev * 100)
                                      : fmtRp(row.getVal(pnlTotal) * sub.portion)
                                    }
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>

            </div>
          </main>
        </div>
      </div>

      {drawer && (
        <MetricDrawer
          drawerKey={drawer}
          onClose={() => setDrawer(null)}
          onNavigate={key => setDrawer(key)}
          computed={computed}
          trends={drawerTrends}
          months={drawerMonths}
        />
      )}
    </div>
  )
}
