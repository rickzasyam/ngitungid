import { describe, it, expect } from 'vitest'
import {
  toneCR,
  toneQR,
  toneCashR,
  toneDER,
  toneNPM,
  toneROA,
  toneROE,
  toneInvTurn,
  toneTrend,
  scoreFromTone,
  assessHealth,
  healthVerdict,
  fmtVal,
  DIMENSIONS,
  isInventoryless,
  INVENTORY_METRICS,
  type RatioValues,
  type TrendSubset,
} from './financial-health'

// Rasio yang semuanya lolos benchmark absolut.
const healthyRatios = (): RatioValues => ({
  cr: 1.5,
  qr: 1.2,
  cashR: 0.4,
  der: 0.5,
  wc: 100_000_000,
  gpm: 40,
  npm: 15,
  opm: 20,
  roe: 20,
  roa: 10,
  dso: 30,
  dio: 40,
  dpo: 30,
  invTurn: 10,
  assetTurn: 1.5,
  ccc: 40,
})

// Rasio yang semuanya jatuh di band risiko.
const riskyRatios = (): RatioValues => ({
  cr: 0.6,
  qr: 0.4,
  cashR: 0.05,
  der: 3,
  wc: -50_000_000,
  gpm: 5,
  npm: 1,
  opm: 1,
  roe: 2,
  roa: 1,
  dso: 120,
  dio: 200,
  dpo: 10,
  invTurn: 1,
  assetTurn: 0.2,
  ccc: 300,
})

// higher-better naik, lower-better turun → semua tren sehat.
const bestTrend = (): TrendSubset => ({
  gpm: [30, 40],
  opm: [10, 20],
  assetTurn: [1, 1.5],
  dso: [40, 20],
  dio: [60, 30],
  ccc: [60, 30],
})

// Kebalikannya → semua tren risiko.
const worstTrend = (): TrendSubset => ({
  gpm: [40, 30],
  opm: [20, 10],
  assetTurn: [1.5, 1],
  dso: [20, 40],
  dio: [30, 60],
  ccc: [30, 60],
})

// Satu checkpoint saja → tren tak bisa dinilai.
const singleTrend = (): TrendSubset => ({
  gpm: [40],
  opm: [20],
  assetTurn: [1.5],
  dso: [30],
  dio: [40],
  ccc: [40],
})

describe('tone absolut per rasio', () => {
  it('DER: makin kecil makin sehat', () => {
    expect(toneDER(0.5)).toBe('sehat') // ≤ 0.7
    expect(toneDER(0.7)).toBe('sehat') // batas
    expect(toneDER(1.2)).toBe('perhatian') // ≤ 1.5
    expect(toneDER(2.0)).toBe('risiko')
  })

  it('NPM / ROA / ROE: makin besar makin sehat', () => {
    expect(toneNPM(12)).toBe('sehat')
    expect(toneNPM(7)).toBe('perhatian')
    expect(toneNPM(2)).toBe('risiko')
    expect(toneROA(8)).toBe('sehat')
    expect(toneROA(5)).toBe('perhatian')
    expect(toneROA(1)).toBe('risiko')
    expect(toneROE(20)).toBe('sehat')
    expect(toneROE(10)).toBe('perhatian')
    expect(toneROE(3)).toBe('risiko')
  })

  it('QR & Cash Ratio', () => {
    expect(toneQR(1.2)).toBe('sehat')
    expect(toneQR(0.8)).toBe('perhatian')
    expect(toneQR(0.5)).toBe('risiko')
    expect(toneCashR(0.4)).toBe('sehat')
    expect(toneCashR(0.2)).toBe('perhatian')
    expect(toneCashR(0.05)).toBe('risiko')
  })

  // CR & InvTurn BANDED — terlalu tinggi juga tidak sehat (aset nganggur /
  // stok terlalu tipis), jadi bukan sekadar "makin besar makin baik".
  it('CR banded: terlalu rendah DAN terlalu tinggi sama-sama tidak sehat', () => {
    expect(toneCR(1.5)).toBe('sehat') // 1.2–2.0
    expect(toneCR(1.1)).toBe('perhatian') // 1.0–1.2
    expect(toneCR(2.5)).toBe('perhatian') // 2.0–3.0 (kelebihan)
    expect(toneCR(0.8)).toBe('risiko')
    expect(toneCR(3.5)).toBe('risiko') // terlalu tinggi
  })

  it('Inventory Turnover banded', () => {
    expect(toneInvTurn(10)).toBe('sehat') // 8–12
    expect(toneInvTurn(5)).toBe('perhatian')
    expect(toneInvTurn(15)).toBe('perhatian')
    expect(toneInvTurn(2)).toBe('risiko')
    expect(toneInvTurn(25)).toBe('risiko')
  })
})

describe('toneTrend', () => {
  it('kurang dari 2 checkpoint → netral (data tren tak cukup)', () => {
    expect(toneTrend([], 'higher')).toBe('netral')
    expect(toneTrend([40], 'higher')).toBe('netral')
  })

  it('perubahan di bawah TREND_EPS (±2%) dianggap stabil → netral', () => {
    expect(toneTrend([100, 101], 'higher')).toBe('netral') // +1%
    expect(toneTrend([100, 99], 'lower')).toBe('netral') // −1%
  })

  it('higher-better: naik → sehat, turun → risiko', () => {
    expect(toneTrend([30, 40], 'higher')).toBe('sehat')
    expect(toneTrend([40, 30], 'higher')).toBe('risiko')
  })

  it('lower-better: turun → sehat, naik → risiko', () => {
    expect(toneTrend([40, 20], 'lower')).toBe('sehat')
    expect(toneTrend([20, 40], 'lower')).toBe('risiko')
  })

  it('pembagi nol → netral (tak bisa hitung perubahan relatif)', () => {
    expect(toneTrend([0, 40], 'higher')).toBe('netral')
  })

  it('hanya 2 checkpoint TERAKHIR yang dipakai', () => {
    expect(toneTrend([999, 30, 40], 'higher')).toBe('sehat')
  })
})

describe('scoreFromTone', () => {
  it('memetakan tone → skor; info dikecualikan (null)', () => {
    expect(scoreFromTone('sehat')).toBe(100)
    expect(scoreFromTone('perhatian')).toBe(60)
    expect(scoreFromTone('netral')).toBe(50)
    expect(scoreFromTone('risiko')).toBe(20)
    expect(scoreFromTone('info')).toBeNull()
  })
})

describe('assessHealth', () => {
  it('semua sehat → skor 100 & satu alert positif (bukan alert kosong)', () => {
    const h = assessHealth(healthyRatios(), bestTrend())
    expect(h.overall).toBe(100)
    for (const d of Object.values(h.dimensions)) expect(d.tone).toBe('sehat')
    expect(h.alerts).toHaveLength(1)
    expect(h.alerts[0].severity).toBe('info')
    expect(h.alerts[0].metric).toBe('overall')
  })

  it('semua risiko → skor 20, tepat 3 alert, semuanya critical', () => {
    const h = assessHealth(riskyRatios(), worstTrend())
    expect(h.overall).toBe(20)
    for (const d of Object.values(h.dimensions)) expect(d.tone).toBe('risiko')
    expect(h.alerts).toHaveLength(3) // dibatasi maksimal 3
    for (const a of h.alerts) expect(a.severity).toBe('critical')
  })

  // DPO arahnya ambigu (naik bisa bagus/jelek) → sengaja tidak dinilai.
  // WC info-only karena angkanya nominal, bukan rasio ber-benchmark.
  it('DPO & Modal Kerja selalu info dan tidak ikut skor dimensi', () => {
    const h = assessHealth(healthyRatios(), bestTrend())
    expect(h.tones.dpo).toBe('info')
    expect(h.tones.wc).toBe('info')
    // dpo tidak terdaftar di dimensi mana pun
    const allMetrics = Object.values(DIMENSIONS).flatMap(d => d.metrics)
    expect(allMetrics).not.toContain('dpo')
    // wc terdaftar di likuiditas tapi skornya null → tidak menurunkan rata-rata
    expect(DIMENSIONS.likuiditas.metrics).toContain('wc')
    expect(h.dimensions.likuiditas.score).toBe(100)
  })

  it('CCC sengaja dihitung di Likuiditas DAN Efisiensi', () => {
    expect(DIMENSIONS.likuiditas.metrics).toContain('ccc')
    expect(DIMENSIONS.efisiensi.metrics).toContain('ccc')
  })

  it('1 checkpoint → semua tone berbasis tren jadi netral', () => {
    const h = assessHealth(healthyRatios(), singleTrend())
    for (const m of ['gpm', 'opm', 'assetTurn', 'dso', 'dio', 'ccc']) {
      expect(h.tones[m]).toBe('netral')
    }
    // Rasio absolut tetap dinilai normal.
    expect(h.tones.cr).toBe('sehat')
    expect(h.tones.der).toBe('sehat')
  })

  it('campuran: alert risiko didahulukan sebelum perhatian', () => {
    const r = { ...healthyRatios(), der: 3, npm: 7 } // der risiko, npm perhatian
    const h = assessHealth(r, bestTrend())
    expect(h.alerts[0].metric).toBe('der')
    expect(h.alerts[0].severity).toBe('critical')
    const npmAlert = h.alerts.find(a => a.metric === 'npm')
    expect(npmAlert?.severity).toBe('warning')
  })

  it('sisa slot alert diisi pesan positif dimensi tersehat', () => {
    const h = assessHealth({ ...healthyRatios(), der: 3 }, bestTrend())
    expect(h.alerts[0].metric).toBe('der')
    // 1 masalah → sisanya diisi info, total tetap ≤ 3
    expect(h.alerts.length).toBeGreaterThan(1)
    expect(h.alerts.length).toBeLessThanOrEqual(3)
    expect(h.alerts.slice(1).every(a => a.severity === 'info')).toBe(true)
  })

  it('alert memuat label & nilai terformat', () => {
    const h = assessHealth({ ...healthyRatios(), der: 3 }, bestTrend())
    expect(h.alerts[0].title).toContain('Debt-to-Equity')
    expect(h.alerts[0].title).toContain('3,00')
  })
})

describe('healthVerdict', () => {
  it('memetakan skor → verdict ringkas', () => {
    expect(healthVerdict(100)).toBe('Keuangan Sehat')
    expect(healthVerdict(75)).toBe('Keuangan Sehat')
    expect(healthVerdict(60)).toBe('Perlu Perhatian')
    expect(healthVerdict(45)).toBe('Perlu Perhatian')
    expect(healthVerdict(20)).toBe('Berisiko')
  })
})

describe('fmtVal — format Indonesia (koma desimal)', () => {
  it.each([
    [15, 'pct', '15,0%'],
    [30.4, 'days', '30 hari'],
    [1.5, 'x', '1,50×'],
    [1.5, 'ratio', '1,50'],
    [1_500_000_000, 'money', 'Rp 1,50M'],
    [5_000_000, 'money', 'Rp 5jt'],
    [750, 'money', 'Rp 750'],
  ] as const)('fmtVal(%s, %s) → %s', (v, unit, out) => {
    expect(fmtVal(v, unit)).toBe(out)
  })
})

// ── Bisnis tanpa persediaan ──────────────────────────────────────
// Graphicook menjual template digital: persediaan 0 & HPP 0, sehingga
// Inventory Turnover keluar 0,00x dan DIO 0 hari. Itu pertanyaan yang tidak
// berlaku, bukan kinerja buruk.
describe('isInventoryless', () => {
  it('true hanya kalau persediaan DAN HPP dua-duanya nol', () => {
    expect(isInventoryless(0, 0)).toBe(true)
  })

  it('persediaan 0 tapi HPP > 0 → BUKAN kasus ini', () => {
    // Barang habis / dropship: turnover di sini justru bermakna.
    expect(isInventoryless(0, 50_000_000)).toBe(false)
  })

  it('persediaan > 0 → selalu false, berapa pun HPP-nya', () => {
    expect(isInventoryless(10_000_000, 0)).toBe(false)
    expect(isInventoryless(10_000_000, 50_000_000)).toBe(false)
  })
})

describe('skor: metrik persediaan dikecualikan untuk bisnis tanpa persediaan', () => {
  // MENGGANTIKAN blok "aritmetika tidak berubah" dari 6dcac0e, yang dulu
  // menegaskan skor TIDAK berubah. Itu memang perilaku saat itu, dan itulah
  // cacatnya: klien tanpa persediaan dipotong permanen di Efisiensi untuk dua
  // metrik yang tidak bisa ia perbaiki. Sekarang assertion-nya kebalikannya.

  /** Angka identik; yang membedakan hanya ADA/TIDAKNYA persediaan & HPP. */
  const ratios = (withInventory: boolean): RatioValues => ({
    cr: 2.4, qr: 2.4, cashR: 0.8, der: 0.45, wc: 125_000_000,
    gpm: 60, npm: 20, opm: 25, roe: 22.5, roa: 14.2,
    dso: 30, dpo: 12,
    dio: withInventory ? 45 : 0,
    invTurn: withInventory ? 8 : 0,
    assetTurn: 1.4,
    ccc: (withInventory ? 45 : 0) + 30 - 12,
  })
  const trends = (withInventory: boolean): TrendSubset => ({
    gpm: [58, 59, 60], opm: [24, 24.5, 25], assetTurn: [1.3, 1.35, 1.4],
    dso: [33, 31, 30],
    dio: withInventory ? [50, 47, 45] : [0, 0, 0],
    ccc: withInventory ? [71, 68, 63] : [21, 19, 18],
  })
  const EXCLUDE = { excludeMetrics: INVENTORY_METRICS }

  it('klien TANPA persediaan skornya lebih tinggi daripada sebelum perbaikan', () => {
    const sebelum = assessHealth(ratios(false), trends(false))          // perilaku lama
    const sesudah = assessHealth(ratios(false), trends(false), EXCLUDE) // perilaku baru
    expect(sesudah.dimensions.efisiensi.score).toBeGreaterThan(sebelum.dimensions.efisiensi.score)
    expect(sesudah.overall).toBeGreaterThan(sebelum.overall)
  })

  it('klien DENGAN persediaan tidak bergeser sama sekali — tidak ada yang pindah', () => {
    // Tanpa opts, dan dengan opts kosong, hasilnya harus byte-identical.
    const a = assessHealth(ratios(true), trends(true))
    const b = assessHealth(ratios(true), trends(true), {})
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('nilai maksimum dimensi tetap bisa dicapai setelah pengecualian', () => {
    // Semua metrik Efisiensi yang TERSISA sehat → 100, bukan tertahan di bawah
    // karena dua metrik nol yang tidak berlaku.
    const r = ratios(false)
    const t: TrendSubset = {
      gpm: [50, 55, 60], opm: [20, 22, 25], assetTurn: [1.0, 1.2, 1.4],
      dso: [40, 35, 30], dio: [0, 0, 0], ccc: [30, 25, 18],
    }
    const h = assessHealth(r, t, EXCLUDE)
    expect(h.dimensions.efisiensi.score).toBe(100)
  })

  it('metrik yang dikecualikan tidak memunculkan alert', () => {
    const h = assessHealth(ratios(false), trends(false), EXCLUDE)
    expect(h.alerts.map(a => a.metric)).not.toContain('dio')
    expect(h.alerts.map(a => a.metric)).not.toContain('invTurn')
  })

  it('CCC tetap dihitung & tetap memakai DIO — aritmetika rasio tidak disentuh', () => {
    const r = ratios(false)
    expect(r.ccc).toBe(r.dio + r.dso - r.dpo)
    const h = assessHealth(r, trends(false), EXCLUDE)
    expect(h.tones.ccc).toBeDefined()
    // ccc TETAP anggota kedua dimensi, tidak ikut dikecualikan.
    expect(DIMENSIONS.efisiensi.metrics).toContain('ccc')
    expect(DIMENSIONS.likuiditas.metrics).toContain('ccc')
  })

  it('BERHENTI kalau pengecualian menghabiskan seluruh metrik sebuah dimensi', () => {
    // Tidak boleh membagi nol maupun diam-diam memakai skor default.
    expect(() =>
      assessHealth(ratios(false), trends(false), { excludeMetrics: DIMENSIONS.leverage.metrics })
    ).toThrow(/kehilangan SELURUH metriknya/i)
  })

  it('INVENTORY_METRICS berisi persis dua metrik berbasis persediaan', () => {
    expect([...INVENTORY_METRICS]).toEqual(['dio', 'invTurn'])
  })
})
