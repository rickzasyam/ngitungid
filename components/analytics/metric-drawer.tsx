'use client'

import { useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { Sparkline } from './sparkline'
import { TONES, Pill, type ToneKey } from './ratio-card'

// ── Format helpers ────────────────────────────────────────────
const fmtRp = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e9) return 'Rp ' + (v / 1e9).toFixed(2).replace('.', ',') + 'M'
  if (a >= 1e6) return 'Rp ' + Math.round(v / 1e6) + 'jt'
  if (a >= 1e3) return 'Rp ' + Math.round(v / 1e3) + 'rb'
  return 'Rp ' + Math.round(v)
}
const fmtFull  = (v: number) => 'Rp ' + Math.round(v).toLocaleString('id-ID')
const fmtPct   = (v: number, d = 1) => v.toFixed(d).replace('.', ',') + '%'
const fmtRatio = (v: number) => v.toFixed(2).replace('.', ',')
const fmtDays  = (v: number) => Math.round(v) + ' hari'
const fmtX     = (v: number) => v.toFixed(2).replace('.', ',') + '×'

// ── Types ─────────────────────────────────────────────────────
export interface ComputedMetrics {
  totRev: number; totNP: number; totGP: number; totOI: number
  totHPP: number; totExp: number
  pc: { days: number; tot: string }
  periodMonths: number
  aktivaLancar: number; hutangLancar: number; persediaan: number
  kas: number; piutang: number; totalModal: number; totalAset: number
  totalHutang: number
  cr: number; qr: number; cashR: number; der: number; wc: number
  gpm: number; npm: number; opm: number; roe: number; roa: number
  dso: number; dio: number; dpo: number; invTurn: number; assetTurn: number; ccc: number
}

export interface TrendArrays {
  rev: number[]; gp: number[]; np: number[]; gpm: number[]; npm: number[]
  opm: number[]; roe: number[]; roa: number[]; dso: number[]; dio: number[]
  dpo: number[]; invTurn: number[]; assetTurn: number[]; ccc: number[]
  cr: number[]; qr: number[]; cashR: number[]; der: number[]; wc: number[]
}

interface MetricEntry {
  grp: string; label: string; value: string; tone: ToneKey; status: string
  benchmark: string; formula: string; comp: [string, string][]
  trend: number[]; tUnit: 'money' | 'pct' | 'ratio' | 'days' | 'x'
  interp: string; recos: string[]
}

// ── Dimension data ────────────────────────────────────────────
const DIMS: Record<string, { label: string; score: number; tone: ToneKey; status: string; reason: string; metrics: string[] }> = {
  likuiditas:     { label: 'Likuiditas',     score: 95, tone: 'info',      status: 'Sangat Tinggi',   reason: 'CR 33,16 · QR 4,34 · Cash 1,79 — likuiditas berlebih, cek optimalisasi aset',  metrics: ['cr','qr','cash','wc'] },
  profitabilitas: { label: 'Profitabilitas', score: 88, tone: 'sehat',     status: 'Sangat Baik',     reason: 'NPM 27,7% · ROE 63,5% — profitabilitas kuat dan konsisten',                    metrics: ['roe','roa','gpm','npm','opm'] },
  leverage:       { label: 'Leverage',       score: 98, tone: 'sehat',     status: 'Konservatif',     reason: 'DER 0,03 — hutang hanya 2,9% total aset, struktur sangat aman',                metrics: ['der','wc'] },
  efisiensi:      { label: 'Efisiensi',      score: 60, tone: 'perhatian', status: 'Perlu Perhatian', reason: 'DIO 68 hari · Inv. turnover 5,4× — persediaan lambat mengikat kas',            metrics: ['dio','dso','dpo','invturn','assetturn','ccc'] },
}

// ── Metric registry builder ───────────────────────────────────
function buildRegistry(c: ComputedMetrics, t: TrendArrays): Record<string, MetricEntry> {
  return {
    rev: {
      grp: 'Performa', label: 'Pendapatan', value: fmtRp(c.totRev), tone: 'info', status: 'Tumbuh',
      benchmark: 'Tren positif', formula: 'Σ Penjualan periode', tUnit: 'money',
      comp: [['Total pendapatan', fmtFull(c.totRev)], ['Rata-rata / bulan', fmtFull(Math.round(c.totRev / c.periodMonths))], ['Bulan tertinggi', 'Mei · Rp 601.230.000']],
      trend: t.rev, interp: 'Pendapatan menunjukkan tren naik sepanjang periode dengan puncak di Mei.',
      recos: ['Pertahankan momentum kanal dengan kontribusi terbesar', 'Antisipasi musiman pada bulan dengan dip (Mar)', 'Kunci kontrak berulang untuk stabilkan baseline'],
    },
    gp: {
      grp: 'Performa', label: 'Laba Kotor', value: fmtRp(c.totGP), tone: 'sehat', status: 'Sehat',
      benchmark: 'GPM > 50%', formula: 'Pendapatan − HPP', tUnit: 'money',
      comp: [['Total laba kotor', fmtFull(c.totGP)], ['Gross margin', fmtPct(c.gpm)], ['HPP', fmtFull(c.totHPP)]],
      trend: t.gp, interp: 'Laba kotor bergerak searah dengan pendapatan — struktur biaya pokok terkendali.',
      recos: ['Jaga rasio HPP terhadap pendapatan', 'Negosiasi ulang harga pemasok utama', 'Tinjau produk margin rendah'],
    },
    np: {
      grp: 'Performa', label: 'Laba Bersih', value: fmtRp(c.totNP), tone: 'sehat', status: 'Sehat',
      benchmark: 'NPM > 10%', formula: 'Laba Kotor − Opex − Pajak', tUnit: 'money',
      comp: [['Total laba bersih', fmtFull(c.totNP)], ['Net margin', fmtPct(c.npm)], ['Opex', fmtFull(c.totExp)]],
      trend: t.np, interp: 'Laba bersih konsisten dengan net margin ' + fmtPct(c.npm) + ' — sangat sehat untuk UMKM.',
      recos: ['Lindungi margin saat scaling biaya', 'Alokasikan surplus kas ke aset produktif', 'Pantau beban tetap vs variabel'],
    },
    gpm: {
      grp: 'Performa', label: 'Gross Margin', value: fmtPct(c.gpm), tone: 'sehat', status: 'Sehat',
      benchmark: '> 50%', formula: 'Laba Kotor ÷ Pendapatan', tUnit: 'pct',
      comp: [['Laba kotor', fmtFull(c.totGP)], ['Pendapatan', fmtFull(c.totRev)], ['Margin', fmtPct(c.gpm)]],
      trend: t.gpm, interp: 'Margin kotor stabil di atas 56% — daya saing harga dan efisiensi produksi baik.',
      recos: ['Pertahankan disiplin pricing', 'Pantau kenaikan biaya bahan baku'],
    },
    npm: {
      grp: 'Performa', label: 'Net Margin', value: fmtPct(c.npm), tone: 'sehat', status: 'Sangat Baik',
      benchmark: '> 10%', formula: 'Laba Bersih ÷ Pendapatan', tUnit: 'pct',
      comp: [['Laba bersih', fmtFull(c.totNP)], ['Pendapatan', fmtFull(c.totRev)], ['Margin', fmtPct(c.npm)]],
      trend: t.npm, interp: 'Net margin ' + fmtPct(c.npm) + ' jauh di atas benchmark — setiap Rp 100 penjualan menghasilkan Rp ' + c.npm.toFixed(1) + ' laba bersih.',
      recos: ['Pertahankan struktur biaya ramping', 'Reinvestasi sebagian laba ke pertumbuhan'],
    },
    cr: {
      grp: 'Likuiditas', label: 'Current Ratio', value: fmtRatio(c.cr), tone: 'info', status: 'Terlalu Tinggi',
      benchmark: '1,5 – 3,0', formula: 'Aktiva Lancar ÷ Hutang Lancar', tUnit: 'ratio',
      comp: [['Aktiva lancar', fmtFull(c.aktivaLancar)], ['Hutang lancar', fmtFull(c.hutangLancar)], ['Rasio', fmtRatio(c.cr)]],
      trend: t.cr, interp: 'CR ' + fmtRatio(c.cr) + ' jauh di atas rentang sehat. Likuiditas berlebih — aset lancar belum dimanfaatkan optimal.',
      recos: ['Konversi sebagian persediaan menjadi kas', 'Pertimbangkan investasi dari kas menganggur', 'Distribusikan surplus bila tidak ada rencana belanja modal', 'Tetapkan target rasio likuiditas yang lebih efisien'],
    },
    qr: {
      grp: 'Likuiditas', label: 'Quick Ratio', value: fmtRatio(c.qr), tone: 'sehat', status: 'Sehat',
      benchmark: '> 1,0', formula: '(Aktiva Lancar − Persediaan) ÷ Hutang Lancar', tUnit: 'ratio',
      comp: [['Aktiva lancar', fmtFull(c.aktivaLancar)], ['Persediaan', fmtFull(c.persediaan)], ['Hutang lancar', fmtFull(c.hutangLancar)], ['Quick Ratio', fmtRatio(c.qr)]],
      trend: t.qr, interp: 'Tanpa persediaan, perusahaan mampu menutup kewajiban ' + fmtRatio(c.qr) + '×. Likuiditas inti aman.',
      recos: ['Pertahankan buffer kas wajar', 'Hindari idle cash berlebih'],
    },
    cash: {
      grp: 'Likuiditas', label: 'Cash Ratio', value: fmtRatio(c.cashR), tone: 'sehat', status: 'Sehat',
      benchmark: '> 0,5', formula: 'Kas & Setara Kas ÷ Hutang Lancar', tUnit: 'ratio',
      comp: [['Kas', fmtFull(c.kas)], ['Hutang lancar', fmtFull(c.hutangLancar)], ['Cash Ratio', fmtRatio(c.cashR)]],
      trend: t.cashR, interp: 'Kas saja menutup ' + fmtRatio(c.cashR) + '× kewajiban lancar — posisi kas sangat kuat.',
      recos: ['Optimalkan penempatan kas berbunga', 'Tetapkan kebijakan minimum cash'],
    },
    der: {
      grp: 'Likuiditas', label: 'Debt-to-Equity', value: fmtRatio(c.der), tone: 'netral', status: 'Konservatif',
      benchmark: '< 1,0', formula: 'Total Hutang ÷ Total Modal', tUnit: 'ratio',
      comp: [['Total hutang', fmtFull(c.totalHutang)], ['Total modal', fmtFull(c.totalModal)], ['DER', fmtRatio(c.der)]],
      trend: t.der, interp: 'Hutang hanya ' + (c.totalHutang / c.totalAset * 100).toFixed(1) + '% total aset. Ada ruang memakai leverage untuk akselerasi pertumbuhan.',
      recos: ['Evaluasi pembiayaan untuk ekspansi terukur', 'Manfaatkan pengungkit selama imbal hasil > bunga'],
    },
    wc: {
      grp: 'Likuiditas', label: 'Modal Kerja', value: fmtRp(c.wc), tone: 'info', status: 'Surplus Besar',
      benchmark: 'Positif', formula: 'Aktiva Lancar − Hutang Lancar', tUnit: 'money',
      comp: [['Aktiva lancar', fmtFull(c.aktivaLancar)], ['Hutang lancar', fmtFull(c.hutangLancar)], ['Modal Kerja', fmtFull(c.wc)]],
      trend: t.wc, interp: 'Modal kerja surplus sangat besar; sebagian besar tertanam di persediaan. Likuid namun kurang produktif.',
      recos: ['Alihkan modal kerja idle ke aset produktif', 'Optimalkan siklus persediaan'],
    },
    roe: {
      grp: 'Profitabilitas', label: 'Return on Equity', value: fmtPct(c.roe), tone: 'sehat', status: 'Sangat Baik',
      benchmark: '> 15%', formula: 'Laba Bersih ÷ Total Modal', tUnit: 'pct',
      comp: [['Laba bersih', fmtFull(c.totNP)], ['Total modal', fmtFull(c.totalModal)], ['ROE', fmtPct(c.roe)]],
      trend: t.roe, interp: 'ROE jauh di atas benchmark — modal pemilik bekerja sangat efektif menghasilkan laba.',
      recos: ['Pertahankan profitabilitas', 'Pertimbangkan reinvestasi vs distribusi kepada pemilik'],
    },
    roa: {
      grp: 'Profitabilitas', label: 'Return on Assets', value: fmtPct(c.roa), tone: 'sehat', status: 'Baik',
      benchmark: '> 5%', formula: 'Laba Bersih ÷ Total Aset', tUnit: 'pct',
      comp: [['Laba bersih', fmtFull(c.totNP)], ['Total aset', fmtFull(c.totalAset)], ['ROA', fmtPct(c.roa)]],
      trend: t.roa, interp: 'ROA sehat namun tertekan oleh aset persediaan besar. Optimasi persediaan akan menaikkan ROA.',
      recos: ['Kurangi aset tak produktif', 'Tingkatkan perputaran aset'],
    },
    opm: {
      grp: 'Profitabilitas', label: 'Operating Margin', value: fmtPct(c.opm), tone: 'sehat', status: 'Sehat',
      benchmark: '> 15%', formula: 'Laba Operasi ÷ Pendapatan', tUnit: 'pct',
      comp: [['Laba operasi', fmtFull(c.totOI)], ['Pendapatan', fmtFull(c.totRev)], ['Margin', fmtPct(c.opm)]],
      trend: t.opm, interp: 'Margin operasi solid — inti bisnis menghasilkan laba sebelum item non-operasional.',
      recos: ['Kendalikan beban tetap', 'Skala pendapatan tanpa proporsional menaikkan opex'],
    },
    dso: {
      grp: 'Efisiensi', label: 'DSO', value: fmtDays(c.dso), tone: 'sehat', status: 'Sangat Baik',
      benchmark: '< 30 hari', formula: 'Piutang ÷ Pendapatan × Hari', tUnit: 'days',
      comp: [['Piutang', fmtFull(c.piutang)], ['Pendapatan', fmtFull(c.totRev)], ['Periode', c.pc.days + ' hari'], ['DSO', fmtDays(c.dso)]],
      trend: t.dso, interp: 'Penagihan sangat cepat — kas masuk hampir seketika setelah penjualan. Risiko piutang macet minim.',
      recos: ['Pertahankan kebijakan kredit ketat', 'Jaga hubungan pelanggan pembayar cepat'],
    },
    dio: {
      grp: 'Efisiensi', label: 'DIO', value: fmtDays(c.dio), tone: 'perhatian', status: 'Perlu Perhatian',
      benchmark: '< 60 hari', formula: 'Persediaan ÷ Pendapatan × Hari', tUnit: 'days',
      comp: [['Persediaan', fmtFull(c.persediaan)], ['Pendapatan', fmtFull(c.totRev)], ['Periode', c.pc.days + ' hari'], ['DIO', fmtDays(c.dio)]],
      trend: t.dio, interp: 'DIO ' + fmtDays(c.dio) + ' melebihi benchmark 60 hari. Persediaan = ' + (c.persediaan / c.aktivaLancar * 100).toFixed(1) + '% aktiva lancar — mengikat kas.',
      recos: ['Review kategori stok slow-moving', 'Evaluasi strategi & frekuensi pembelian', 'Buat clearance atau bundling untuk produk lambat', 'Sesuaikan reorder point & safety stock'],
    },
    dpo: {
      grp: 'Efisiensi', label: 'DPO', value: fmtDays(c.dpo), tone: 'netral', status: 'Pendek',
      benchmark: '30 – 60 hari', formula: 'Hutang Usaha ÷ HPP × Hari', tUnit: 'days',
      comp: [['Hutang lancar', fmtFull(c.hutangLancar)], ['HPP', fmtFull(c.totHPP)], ['Periode', c.pc.days + ' hari'], ['DPO', fmtDays(c.dpo)]],
      trend: t.dpo, interp: 'Pembayaran ke pemasok sangat cepat. Ada peluang menahan kas lebih lama dengan negosiasi termin.',
      recos: ['Negosiasi termin pemasok 30–45 hari', 'Manfaatkan diskon pembayaran awal bila menguntungkan'],
    },
    invturn: {
      grp: 'Efisiensi', label: 'Inventory Turnover', value: fmtX(c.invTurn), tone: 'perhatian', status: 'Rendah',
      benchmark: '> 6×', formula: 'Pendapatan ÷ Persediaan (disetahunkan)', tUnit: 'x',
      comp: [['Pendapatan', fmtFull(c.totRev)], ['Persediaan', fmtFull(c.persediaan)], ['Faktor tahunan', '365/' + c.pc.days + ' = ' + (365 / c.pc.days).toFixed(2) + '×'], ['Turnover', fmtX(c.invTurn)]],
      trend: t.invTurn, interp: 'Persediaan hanya berputar ~' + c.invTurn.toFixed(1) + '× setahun, di bawah ideal. Stok terlalu banyak relatif terhadap penjualan.',
      recos: ['Turunkan level persediaan rata-rata', 'Tingkatkan akurasi forecast permintaan'],
    },
    assetturn: {
      grp: 'Efisiensi', label: 'Asset Turnover', value: fmtX(c.assetTurn), tone: 'sehat', status: 'Baik',
      benchmark: '> 1,0', formula: 'Pendapatan ÷ Total Aset (disetahunkan)', tUnit: 'x',
      comp: [['Pendapatan', fmtFull(c.totRev)], ['Total aset', fmtFull(c.totalAset)], ['Faktor tahunan', '365/' + c.pc.days + ' = ' + (365 / c.pc.days).toFixed(2) + '×'], ['Turnover', fmtX(c.assetTurn)]],
      trend: t.assetTurn, interp: 'Aset menghasilkan pendapatan secara efektif, meski tertahan oleh besarnya persediaan.',
      recos: ['Optimalkan aset menganggur', 'Naikkan utilisasi kapasitas produksi'],
    },
    ccc: {
      grp: 'Efisiensi', label: 'Cash Conversion Cycle', value: fmtDays(c.ccc), tone: 'perhatian', status: 'Perlu Perhatian',
      benchmark: 'Semakin pendek', formula: 'DIO + DSO − DPO', tUnit: 'days',
      comp: [['DIO', fmtDays(c.dio)], ['DSO', fmtDays(c.dso)], ['DPO', fmtDays(c.dpo)], ['CCC', fmtDays(c.ccc)]],
      trend: t.ccc, interp: 'Siklus konversi kas didominasi DIO. Kas tertahan ~' + Math.round(c.ccc) + ' hari sebelum kembali ke perusahaan.',
      recos: ['Fokus utama: pangkas DIO', 'Perpanjang DPO via negosiasi termin', 'Target CCC < 45 hari'],
    },
  }
}

// ── Bar chart (trend per periode dalam drawer, dinamis) ──────
function TrendBars({ values, color, months }: { values: number[]; color: string; months: string[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = (max - min) || 1
  const scroll = values.length > 6
  return (
    <div style={{ background: '#fafafa', borderRadius: 11, ...(scroll ? { overflowX: 'auto', paddingBottom: 4 } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 54, padding: '10px 12px', ...(scroll ? { minWidth: 'max-content' } : {}) }}>
        {values.map((v, i) => {
          const h = 8 + ((v - min) / range) * 38
          const isLast = i === values.length - 1
          const fmtVal = values.some(x => x > 1000)
            ? (v >= 1e9 ? (v/1e9).toFixed(1)+'M' : v >= 1e6 ? Math.round(v/1e6)+'jt' : v >= 1e3 ? Math.round(v/1e3)+'rb' : Math.round(v).toString())
            : v.toFixed(1)
          return (
            <div key={i} style={{ ...(scroll ? { width: 40 } : { flex: 1 }), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{fmtVal}</span>
              <div style={{ width: scroll ? 22 : '62%', height: h, borderRadius: '4px 4px 0 0', background: isLast ? color : color + '66', minHeight: 8 }} />
              <span style={{ fontSize: 8.5, color: '#9ca3af', whiteSpace: 'nowrap' }}>{months[i]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Drawer panel ─────────────────────────────────────────────
export function MetricDrawer({
  drawerKey, onClose, onNavigate, computed, trends, months,
}: {
  drawerKey: string
  onClose: () => void
  onNavigate: (key: string) => void
  computed: ComputedMetrics
  trends: TrendArrays
  months: string[]
}) {
  const registry = buildRegistry(computed, trends)
  const OVERALL_SCORE = 82

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Determine view type
  const isDimOverview = drawerKey === 'dim:overview'
  const dimKey = drawerKey.startsWith('dim:') && !isDimOverview ? drawerKey.slice(4) : null
  const metric = !isDimOverview && !dimKey ? registry[drawerKey] : null

  const renderContent = () => {
    // ── View A: Overview all dimensions ───────────────────────
    if (isDimOverview) {
      const score = OVERALL_SCORE
      const angle = score * 3.6
      return (
        <div>
          {/* Ring + overall */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ position: 'relative', width: 74, height: 74, flexShrink: 0 }}>
              <div style={{
                width: 74, height: 74, borderRadius: '50%',
                background: `conic-gradient(var(--color-accent-primary) ${angle}deg, rgba(255,255,255,0.12) 0deg)`,
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: 56, height: 56, borderRadius: '50%', background: 'white',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#1f2430', lineHeight: 1 }}>{score}</span>
                <span style={{ fontSize: 9, color: '#9ca3af' }}>/100</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 2 }}>SKOR KESEHATAN KEUANGAN</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2430', marginBottom: 2 }}>Keuangan Sehat</div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>4 dimensi dianalisis · 19 rasio keuangan</div>
            </div>
          </div>

          {/* Dimension blocks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(DIMS).map(([key, dim]) => {
              const t = TONES[dim.tone]
              return (
                <button
                  key={key}
                  onClick={() => onNavigate('dim:' + key)}
                  style={{
                    padding: '12px 14px', borderRadius: 12, border: '1px solid #ececec',
                    background: '#fafafa', cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'white'; el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.background = '#fafafa'; el.style.boxShadow = 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1f2430' }}>{dim.label}</span>
                      <Pill tone={dim.tone} label={dim.status} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.bar }}>{dim.score}/100</span>
                  </div>
                  <div style={{ height: 5, background: 'rgba(0,0,0,0.06)', borderRadius: 99, marginBottom: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: dim.score + '%', background: t.bar, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>{dim.reason}</div>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    // ── View B: One dimension ─────────────────────────────────
    if (dimKey && DIMS[dimKey]) {
      const dim = DIMS[dimKey]
      const t = TONES[dim.tone]
      return (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ fontSize: 21, fontWeight: 700, color: '#1f2430', margin: 0 }}>{dim.label}</h2>
              <Pill tone={dim.tone} label={dim.status} />
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{dim.reason}</div>
          </div>

          {/* Score card */}
          <div style={{ background: '#fafafa', borderRadius: 12, border: '1px solid #ececec', padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>SKOR DIMENSI</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#1f2430', marginBottom: 8, lineHeight: 1 }}>{dim.score}<span style={{ fontSize: 14, color: '#9ca3af' }}>/100</span></div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: dim.score + '%', background: t.bar, borderRadius: 99 }} />
            </div>
          </div>

          {/* Metric list */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>METRIK PENDUKUNG</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dim.metrics.map(mk => {
              const m = registry[mk]
              if (!m) return null
              const mt = TONES[m.tone]
              return (
                <button
                  key={mk}
                  onClick={() => onNavigate(mk)}
                  style={{
                    padding: '10px 12px', borderRadius: 10, border: '1px solid #ececec',
                    background: '#fafafa', cursor: 'pointer', textAlign: 'left', width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'white'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)' }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.background = '#fafafa'; el.style.boxShadow = 'none' }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2430', marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>Benchmark {m.benchmark}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1f2430' }}>{m.value}</span>
                    <Pill tone={m.tone} label={m.status} />
                    <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    // ── View C: Metric detail ─────────────────────────────────
    if (!metric) return <div style={{ color: '#9ca3af', fontSize: 13 }}>Metrik tidak ditemukan.</div>
    const t = TONES[metric.tone]
    return (
      <div>
        {/* Group */}
        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.fg, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>{metric.grp}</div>

        {/* Title + pill */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontSize: 21, fontWeight: 700, color: '#1f2430', margin: 0 }}>{metric.label}</h2>
          <Pill tone={metric.tone} label={metric.status} />
        </div>

        {/* Value + sparkline */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 38, fontWeight: 700, color: '#1f2430', letterSpacing: -1 }}>{metric.value}</span>
          <Sparkline values={metric.trend} color={t.bar} width={130} height={42} />
        </div>

        {/* Formula box */}
        <div style={{ background: '#f3f6fb', border: '1px solid #e3eaf3', borderRadius: 10, padding: '10px 13px', fontFamily: 'monospace', fontSize: 13, color: '#475569', marginBottom: 14 }}>
          {metric.formula}
        </div>

        {/* Komponen perhitungan */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>KOMPONEN PERHITUNGAN</div>
        <div style={{ border: '1px solid #ececec', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          {metric.comp.map(([lbl, val], i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderBottom: i < metric.comp.length - 1 ? '1px solid #f3f4f6' : 'none',
              background: i % 2 === 0 ? 'white' : '#fafafa',
            }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{lbl}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1f2430' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Tren per periode */}
        <div style={{ marginBottom: 14 }}>
          <TrendBars values={metric.trend} color={t.bar} months={months} />
        </div>

        {/* Interpretasi */}
        <div style={{ background: t.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.fg, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>INTERPRETASI</div>
          <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6 }}>{metric.interp}</div>
        </div>

        {/* Rekomendasi */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>REKOMENDASI AKSI</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {metric.recos.map((rec, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 18, height: 18, borderRadius: 6, background: t.bg, color: t.fg,
                fontWeight: 800, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5 }}>{rec}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,18,25,0.45)', zIndex: 1000,
          animation: 'fadeIn 150ms ease forwards',
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100%',
          width: 'min(460px, 92vw)', background: 'white',
          padding: '22px 24px 40px', overflowY: 'auto', zIndex: 1001,
          animation: 'slideInRight 220ms cubic-bezier(0.2,0.8,0.2,1) forwards',
        }}
      >
        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 9, border: '1px solid #eee',
              background: '#fafafa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: 14, height: 14, color: '#6b7280' }} />
          </button>
        </div>
        {renderContent()}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(40px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </>
  )
}
