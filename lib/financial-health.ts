// Interpretasi rasio → tone (sehat/perhatian/risiko/netral/info), skor dimensi,
// skor keseluruhan, dan alert. Terpisah dari financial-agg.ts (agg = angka,
// health = penilaian angka). Murni, tanpa I/O — gampang diuji & di-tuning.
//
// Benchmark absolut disepakati dgn Ricko (JANGAN diubah tanpa tanya):
//   DER/NPM/ROA/ROE = Permenkop UKM No.06/Per/M.KUKM/V/2006 (threshold absolut)
//   CR/QR/Cash Ratio = UMKM dagang umum (bukan band koperasi Permenkop)
//   Inventory Turnover = retail umum
//   GPM-tren/OPM/AssetTurn/DSO/DIO/CCC = TREND-based (bukan patokan absolut)
//   DPO = info-only (arah ambigu, tidak dinilai)

import type { ToneKey } from '@/components/analytics/ratio-card'

// ── Konstanta tunable (bukan angka ajaib inline) ─────────────
// ±2% relatif dianggap "stabil" → netral. Default; silakan Ricko tuning.
export const TREND_EPS = 0.02

// Threshold absolut. Dinamai supaya gampang di-tuning.
export const THRESHOLDS = {
  der: { good: 0.7, warn: 1.5 }, // ≤good sehat · ≤warn perhatian · else risiko
  npm: { good: 10, warn: 5 }, // % · ≥good sehat · ≥warn perhatian · else risiko
  roa: { good: 7, warn: 3 }, // %
  roe: { good: 15, warn: 9 }, // %
  cr: { goodLo: 1.2, goodHi: 2.0, warnLo: 1.0, warnHi: 3.0 }, // banded (terlalu tinggi juga jelek)
  qr: { good: 1.0, warn: 0.7 },
  cashR: { good: 0.3, warn: 0.15 },
  invTurn: { goodLo: 8, goodHi: 12, warnLo: 4, warnHi: 20 }, // banded
}

// Cutoff skor → tone dimensi (untuk DIMS_PANEL).
const DIM_TONE = { sehat: 75, perhatian: 45 }

// ── Tone absolut per rasio ───────────────────────────────────
export const toneDER = (v: number): ToneKey => (v <= THRESHOLDS.der.good ? 'sehat' : v <= THRESHOLDS.der.warn ? 'perhatian' : 'risiko')
export const toneNPM = (v: number): ToneKey => (v >= THRESHOLDS.npm.good ? 'sehat' : v >= THRESHOLDS.npm.warn ? 'perhatian' : 'risiko')
export const toneROA = (v: number): ToneKey => (v >= THRESHOLDS.roa.good ? 'sehat' : v >= THRESHOLDS.roa.warn ? 'perhatian' : 'risiko')
export const toneROE = (v: number): ToneKey => (v >= THRESHOLDS.roe.good ? 'sehat' : v >= THRESHOLDS.roe.warn ? 'perhatian' : 'risiko')
export const toneQR = (v: number): ToneKey => (v >= THRESHOLDS.qr.good ? 'sehat' : v >= THRESHOLDS.qr.warn ? 'perhatian' : 'risiko')
export const toneCashR = (v: number): ToneKey => (v >= THRESHOLDS.cashR.good ? 'sehat' : v >= THRESHOLDS.cashR.warn ? 'perhatian' : 'risiko')
export const toneCR = (v: number): ToneKey => {
  const t = THRESHOLDS.cr
  if (v >= t.goodLo && v <= t.goodHi) return 'sehat'
  if ((v >= t.warnLo && v < t.goodLo) || (v > t.goodHi && v <= t.warnHi)) return 'perhatian'
  return 'risiko'
}
export const toneInvTurn = (v: number): ToneKey => {
  const t = THRESHOLDS.invTurn
  if (v >= t.goodLo && v <= t.goodHi) return 'sehat'
  if ((v >= t.warnLo && v < t.goodLo) || (v > t.goodHi && v <= t.warnHi)) return 'perhatian'
  return 'risiko'
}

// ── Tone berbasis tren (2 checkpoint terakhir) ───────────────
// <2 checkpoint → netral (data tren tidak cukup).
export function toneTrend(arr: number[], dir: 'higher' | 'lower'): ToneKey {
  if (arr.length < 2) return 'netral'
  const cur = arr[arr.length - 1]
  const prev = arr[arr.length - 2]
  if (prev === 0) return 'netral'
  const pct = (cur - prev) / Math.abs(prev)
  if (Math.abs(pct) < TREND_EPS) return 'netral'
  const up = pct > 0
  return dir === 'higher' ? (up ? 'sehat' : 'risiko') : up ? 'risiko' : 'sehat'
}

// ── Skor ─────────────────────────────────────────────────────
// info dikembalikan null → dikeluarkan dari rata-rata dimensi.
export function scoreFromTone(t: ToneKey): number | null {
  switch (t) {
    case 'sehat': return 100
    case 'perhatian': return 60
    case 'netral': return 50
    case 'risiko': return 20
    case 'info': return null
  }
}

// ── Metadata rasio (label, peran, unit) untuk alert & tampilan ─
type Unit = 'pct' | 'ratio' | 'x' | 'days' | 'money'
const META: Record<string, { label: string; role: string; unit: Unit }> = {
  cr: { label: 'Current Ratio', role: 'kemampuan menutup hutang jangka pendek', unit: 'ratio' },
  qr: { label: 'Quick Ratio', role: 'likuiditas tanpa mengandalkan persediaan', unit: 'ratio' },
  cashR: { label: 'Cash Ratio', role: 'ketersediaan kas untuk hutang lancar', unit: 'ratio' },
  der: { label: 'Debt-to-Equity', role: 'struktur pendanaan & beban hutang', unit: 'ratio' },
  wc: { label: 'Modal Kerja', role: 'buffer aset lancar di atas hutang lancar', unit: 'money' },
  gpm: { label: 'Gross Margin', role: 'tren efisiensi biaya pokok', unit: 'pct' },
  npm: { label: 'Net Margin', role: 'laba bersih terhadap pendapatan', unit: 'pct' },
  opm: { label: 'Operating Margin', role: 'tren margin operasi', unit: 'pct' },
  roe: { label: 'Return on Equity', role: 'imbal hasil atas modal', unit: 'pct' },
  roa: { label: 'Return on Assets', role: 'imbal hasil atas aset', unit: 'pct' },
  dso: { label: 'DSO', role: 'tren umur piutang', unit: 'days' },
  dio: { label: 'DIO', role: 'tren umur persediaan', unit: 'days' },
  dpo: { label: 'DPO', role: 'umur hutang usaha', unit: 'days' },
  ccc: { label: 'Cash Conversion Cycle', role: 'tren siklus kas', unit: 'days' },
  invTurn: { label: 'Inventory Turnover', role: 'perputaran persediaan per tahun', unit: 'x' },
  assetTurn: { label: 'Asset Turnover', role: 'tren perputaran aset', unit: 'x' },
}

const id = (v: number) => v.toFixed(2).replace('.', ',')
export function fmtVal(v: number, unit: Unit): string {
  if (unit === 'pct') return v.toFixed(1).replace('.', ',') + '%'
  if (unit === 'days') return Math.round(v) + ' hari'
  if (unit === 'x') return id(v) + '×'
  if (unit === 'money') {
    const a = Math.abs(v)
    if (a >= 1e9) return 'Rp ' + (v / 1e9).toFixed(2).replace('.', ',') + 'M'
    if (a >= 1e6) return 'Rp ' + Math.round(v / 1e6) + 'jt'
    return 'Rp ' + Math.round(v)
  }
  return id(v)
}

// ── Bisnis tanpa persediaan ──────────────────────────────────
/**
 * Metrik berbasis persediaan TIDAK BERMAKNA kalau bisnisnya memang tidak punya
 * persediaan — mis. Graphicook yang menjual template digital: persediaan 0 dan
 * HPP 0, sehingga Inventory Turnover keluar 0,00× dan DIO 0 hari. Angka itu
 * bukan kinerja buruk, melainkan pertanyaan yang tidak berlaku, dan menampilkan
 * "Berisiko" untuk keduanya membuat klien mengejar masalah yang tidak ada.
 *
 * Syaratnya KEDUANYA nol. Persediaan 0 dengan HPP > 0 adalah cerita berbeda
 * (barang habis / dropship) dan di situ turnover memang bermakna.
 *
 * Ini murni penilaian TAMPILAN. Fungsi ini sengaja TIDAK dipakai di dalam
 * assessHealth: aritmetikanya tidak berubah sama sekali (lihat catatan di
 * ROADMAP 2026-08-05 tentang skor yang masih ikut menghitung DIO/invTurn).
 */
export function isInventoryless(persediaan: number, totHPP: number): boolean {
  return persediaan === 0 && totHPP === 0
}

/** Label & keterangan seragam untuk metrik yang tidak berlaku. */
export const NA_LABEL = 'N/A'
export const NA_STATUS = 'Tidak berlaku'
export const NA_INVENTORY_NOTE = 'Bisnis tanpa persediaan'

// ── Keanggotaan dimensi (CCC sengaja di Likuiditas & Efisiensi) ─
export const DIMENSIONS: Record<string, { label: string; metrics: string[] }> = {
  likuiditas: { label: 'Likuiditas', metrics: ['cr', 'qr', 'cashR', 'wc', 'ccc'] },
  profitabilitas: { label: 'Profitabilitas', metrics: ['roe', 'roa', 'gpm', 'npm', 'opm'] },
  leverage: { label: 'Leverage', metrics: ['der'] },
  efisiensi: { label: 'Efisiensi', metrics: ['dso', 'dio', 'invTurn', 'assetTurn', 'ccc'] }, // dpo info-only, di luar skor
}

export interface RatioValues {
  cr: number; qr: number; cashR: number; der: number; wc: number
  gpm: number; npm: number; opm: number; roe: number; roa: number
  dso: number; dio: number; dpo: number; invTurn: number; assetTurn: number; ccc: number
}
export interface TrendSubset {
  gpm: number[]; opm: number[]; assetTurn: number[]; dso: number[]; dio: number[]; ccc: number[]
}
export interface HealthAlert { severity: 'critical' | 'warning' | 'info'; title: string; desc: string; metric: string }
export interface DimensionResult { label: string; score: number; tone: ToneKey }
export interface HealthResult {
  tones: Record<string, ToneKey>
  dimensions: Record<string, DimensionResult>
  overall: number
  alerts: HealthAlert[]
}

const dimTone = (score: number): ToneKey => (score >= DIM_TONE.sehat ? 'sehat' : score >= DIM_TONE.perhatian ? 'perhatian' : 'risiko')

// Verdict ringkas dari skor keseluruhan (dipakai exec-panel & drawer overview).
// Ambang sama dgn DIM_TONE supaya label konsisten dgn warna dimensi.
export function healthVerdict(overall: number): string {
  return overall >= DIM_TONE.sehat ? 'Keuangan Sehat' : overall >= DIM_TONE.perhatian ? 'Perlu Perhatian' : 'Berisiko'
}

/** Metrik yang bergantung pada adanya persediaan. Dikecualikan dari skor saat
 *  isInventoryless() true — lihat HealthOptions. */
export const INVENTORY_METRICS = ['dio', 'invTurn'] as const

export interface HealthOptions {
  /**
   * Metrik yang TIDAK BERLAKU untuk klien ini pada periode ini, sehingga
   * dikeluarkan dari rata-rata dimensi DAN dari kandidat alert.
   *
   * Bukan "metrik yang disembunyikan" — visibilitas tampilan tidak pernah
   * sampai ke sini (lihat lib/analytics/metric-visibility.test.ts). Ini untuk
   * pertanyaan yang memang tidak berlaku bagi model bisnisnya: klien tanpa
   * persediaan tidak bisa memperbaiki DIO maupun Inventory Turnover, jadi
   * memotong skornya karena itu adalah cacat, bukan penilaian.
   */
  excludeMetrics?: readonly string[]
}

export function assessHealth(r: RatioValues, t: TrendSubset, opts: HealthOptions = {}): HealthResult {
  const excluded = new Set<string>(opts.excludeMetrics ?? [])
  const tones: Record<string, ToneKey> = {
    cr: toneCR(r.cr), qr: toneQR(r.qr), cashR: toneCashR(r.cashR), der: toneDER(r.der), wc: 'info',
    npm: toneNPM(r.npm), roa: toneROA(r.roa), roe: toneROE(r.roe), invTurn: toneInvTurn(r.invTurn),
    gpm: toneTrend(t.gpm, 'higher'), opm: toneTrend(t.opm, 'higher'), assetTurn: toneTrend(t.assetTurn, 'higher'),
    dso: toneTrend(t.dso, 'lower'), dio: toneTrend(t.dio, 'lower'), ccc: toneTrend(t.ccc, 'lower'),
    dpo: 'info',
  }

  const dimensions: Record<string, DimensionResult> = {}
  for (const [key, def] of Object.entries(DIMENSIONS)) {
    // Renormalisasi: rata-rata dihitung HANYA atas metrik yang berlaku, sehingga
    // nilai maksimum dimensi tetap bisa dicapai. Sebelum ini klien tanpa
    // persediaan permanen kehilangan poin di Efisiensi untuk dua metrik yang
    // tidak bisa ia perbaiki dengan cara apa pun.
    const applicable = def.metrics.filter(m => !excluded.has(m))
    if (applicable.length === 0) {
      // BERHENTI, jangan mengarang skor. Membagi nol atau diam-diam memakai 50
      // akan menyembunyikan daftar pengecualian yang salah di balik angka yang
      // terlihat masuk akal.
      throw new Error(
        `assessHealth: dimensi "${key}" kehilangan SELURUH metriknya setelah pengecualian ` +
          `[${[...excluded].join(', ')}]. Skor tidak dihitung — perbaiki daftar pengecualian ` +
          `atau DIMENSIONS, jangan mengembalikan skor default.`
      )
    }
    // Catatan: `: 50` di bawah menangani kasus BERBEDA — metriknya ada tapi
    // seluruhnya bertone 'info' (scoreFromTone → null). Perilaku lama, sengaja
    // tidak diubah supaya klien yang sudah ada tidak bergeser skornya.
    const scores = applicable.map(m => scoreFromTone(tones[m])).filter((s): s is number => s !== null)
    const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50
    dimensions[key] = { label: def.label, score, tone: dimTone(score) }
  }
  const dimScores = Object.values(dimensions).map(d => d.score)
  const overall = Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length)

  // ── Alerts ──
  const val: Record<string, number> = { ...r }
  const dimOf = (m: string) => Object.entries(DIMENSIONS).find(([, d]) => d.metrics.includes(m))?.[0] ?? ''
  const rank: Record<ToneKey, number> = { risiko: 0, perhatian: 1, netral: 2, sehat: 3, info: 4 }
  // Metrik yang dikecualikan juga TIDAK boleh memunculkan alert. Mengeluarkannya
  // dari skor tapi tetap menampilkan "DIO — perlu perhatian serius" hanya
  // memindahkan cacat yang sama ke panel lain: peringatan yang tidak bisa
  // ditindaklanjuti klien.
  const flagged = Object.entries(tones)
    .filter(([m, tone]) => !excluded.has(m) && (tone === 'risiko' || tone === 'perhatian'))
    .sort((a, b) => rank[a[1]] - rank[b[1]] || (dimensions[dimOf(a[0])]?.score ?? 99) - (dimensions[dimOf(b[0])]?.score ?? 99))

  const toAlert = ([m, tone]: [string, ToneKey]): HealthAlert => ({
    severity: tone === 'risiko' ? 'critical' : 'warning',
    title: `${META[m].label} ${fmtVal(val[m], META[m].unit)}`,
    desc: `${tone === 'risiko' ? 'Perlu perhatian serius' : 'Perlu dipantau'} — ${META[m].role}.`,
    metric: m,
  })

  const alerts: HealthAlert[] = flagged.slice(0, 3).map(toAlert)

  if (alerts.length === 0) {
    alerts.push({ severity: 'info', title: `Kesehatan keuangan baik (${overall}/100)`, desc: 'Semua dimensi dalam kondisi sehat pada periode ini.', metric: 'overall' })
  } else if (alerts.length < 3) {
    // Isi sisa slot dengan pesan positif untuk dimensi paling sehat.
    const healthy = Object.entries(dimensions).sort((a, b) => b[1].score - a[1].score)
    for (const [, d] of healthy) {
      if (alerts.length >= 3) break
      if (d.score >= DIM_TONE.sehat) alerts.push({ severity: 'info', title: `${d.label} sehat (${d.score}/100)`, desc: `Indikator ${d.label.toLowerCase()} dalam kondisi baik.`, metric: 'dim' })
    }
  }

  return { tones, dimensions, overall, alerts }
}
