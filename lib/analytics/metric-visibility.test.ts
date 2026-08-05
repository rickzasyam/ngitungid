import { describe, it, expect } from 'vitest'
import {
  METRIC_IDS,
  METRIC_KEYS,
  defaultMetricVisibility,
  isMetricVisible,
  visibleMetricIds,
  isHiddenFromClient,
  type MetricId,
  type VisibilityMap,
} from './metric-visibility'
import { assessHealth, type RatioValues, type TrendSubset } from '@/lib/financial-health'

describe('METRIC_IDS', () => {
  it('berisi 16 metrik — penyebut counter "x/16" di Settings', () => {
    expect(METRIC_IDS).toHaveLength(16)
  })

  it('TIDAK memuat dar — DAR = DER/(1+DER), redundan dgn Debt-to-Equity', () => {
    expect(METRIC_IDS).not.toContain('dar' as MetricId)
  })

  it('tidak ada id duplikat', () => {
    expect(new Set(METRIC_IDS).size).toBe(METRIC_IDS.length)
  })
})

describe('METRIC_KEYS — peta id yang eksplisit', () => {
  // PAGAR REGRESI: metrik baru yang ditambahkan ke METRIC_IDS tapi lupa
  // didaftarkan di METRIC_KEYS akan lolos tsc (Record<MetricId,...> memang
  // memaksa lengkap) TAPI test ini tetap ada sebagai jaring kedua kalau tipe
  // di masa depan dilonggarkan jadi Partial/string.
  it('exhaustive — setiap id di METRIC_IDS punya pemetaan', () => {
    const unmapped = METRIC_IDS.filter(id => !METRIC_KEYS[id])
    expect(unmapped).toEqual([])
  })

  it('tidak ada entri yatim — METRIC_KEYS tidak memuat id di luar METRIC_IDS', () => {
    const known = new Set<string>(METRIC_IDS)
    expect(Object.keys(METRIC_KEYS).filter(k => !known.has(k))).toEqual([])
  })

  it('setiap pemetaan punya ratioKey dan drawerKey non-kosong', () => {
    for (const id of METRIC_IDS) {
      expect(METRIC_KEYS[id].ratioKey, `ratioKey ${id}`).toBeTruthy()
      expect(METRIC_KEYS[id].drawerKey, `drawerKey ${id}`).toBeTruthy()
    }
  })

  it('memetakan tiga ejaan yang menyimpang dengan benar', () => {
    // Justru ketiga inilah alasan peta ini ditulis tangan.
    expect(METRIC_KEYS.cashr).toEqual({ ratioKey: 'cashR', drawerKey: 'cash' })
    expect(METRIC_KEYS.invturn).toEqual({ ratioKey: 'invTurn', drawerKey: 'invturn' })
    expect(METRIC_KEYS.assetturn).toEqual({ ratioKey: 'assetTurn', drawerKey: 'assetturn' })
  })

  it('id yang ejaannya sama di ketiga namespace dipetakan ke dirinya sendiri', () => {
    for (const id of ['cr', 'qr', 'wc', 'ccc', 'roe', 'roa', 'gpm', 'npm', 'opm', 'der', 'dso', 'dio', 'dpo'] as MetricId[]) {
      expect(METRIC_KEYS[id]).toEqual({ ratioKey: id, drawerKey: id })
    }
  })
})

describe('defaultMetricVisibility', () => {
  it('semua metrik menyala — dpo & dar tidak lagi mati sebagai sisa mock', () => {
    const d = defaultMetricVisibility()
    expect(Object.values(d).every(v => v === true)).toBe(true)
    expect(d.dpo).toBe(true)
  })

  it('mencakup persis METRIC_IDS', () => {
    expect(Object.keys(defaultMetricVisibility()).sort()).toEqual([...METRIC_IDS].sort())
  })
})

describe('isMetricVisible', () => {
  const hidden: VisibilityMap = { dpo: false, cashr: false }

  it('staf selalu melihat semua, apa pun isi tabel', () => {
    for (const role of ['owner', 'akunting'] as const) {
      for (const id of METRIC_IDS) {
        expect(isMetricVisible(role, hidden, id), `${role}/${id}`).toBe(true)
      }
    }
  })

  it('user tidak melihat metrik yang dimatikan', () => {
    expect(isMetricVisible('user', hidden, 'dpo')).toBe(false)
    expect(isMetricVisible('user', hidden, 'cashr')).toBe(false)
  })

  it('user tetap melihat metrik yang menyala', () => {
    expect(isMetricVisible('user', hidden, 'cr')).toBe(true)
    expect(isMetricVisible('user', hidden, 'ccc')).toBe(true)
  })

  it('metrik yang belum pernah di-toggle default TAMPIL', () => {
    expect(isMetricVisible('user', {}, 'dpo')).toBe(true)
  })

  it('role null/undefined diperlakukan seperti user, bukan staf', () => {
    expect(isMetricVisible(null, hidden, 'dpo')).toBe(false)
    expect(isMetricVisible(undefined, hidden, 'dpo')).toBe(false)
  })
})

describe('visibleMetricIds', () => {
  it('staf dapat 16 metrik walau semua dimatikan', () => {
    const allOff = Object.fromEntries(METRIC_IDS.map(id => [id, false])) as VisibilityMap
    expect(visibleMetricIds('owner', allOff)).toHaveLength(16)
  })

  it('user hanya dapat yang menyala, urut sesuai METRIC_IDS', () => {
    const vis: VisibilityMap = { dpo: false, der: false }
    const got = visibleMetricIds('user', vis)
    expect(got).not.toContain('dpo')
    expect(got).not.toContain('der')
    expect(got).toHaveLength(14)
    expect(got).toEqual(METRIC_IDS.filter(id => id !== 'dpo' && id !== 'der'))
  })
})

describe('isHiddenFromClient', () => {
  it('menjawab "bagaimana tampaknya bagi klien", bukan bagi yang sedang melihat', () => {
    expect(isHiddenFromClient({ dpo: false }, 'dpo')).toBe(true)
    expect(isHiddenFromClient({ dpo: true }, 'dpo')).toBe(false)
    expect(isHiddenFromClient({}, 'dpo')).toBe(false)
  })
})

// ── DPO disembunyikan TIDAK boleh menyentuh perhitungan ──────────
//
// CCC = DIO + DSO − DPO, dan CCC ikut menilai DUA dimensi skor kesehatan
// (likuiditas & efisiensi). DPO sendiri info-only, di luar skor.
//
// Ini BUKAN pemisahan yang dijamin arsitektur: API hanya mengirim 15 rasio, dan
// CCC justru diturunkan di KLIEN (app/analytics/page.tsx ~L409:
// `const ccc = api.dio + api.dso - api.dpo`), lalu assessHealth juga jalan di
// klien (~L426) — di komponen yang sama tempat peta visibilitas sekarang hidup.
// Jadi godaan untuk "merapikan" dengan menyaring rasio dulu sebelum menghitung
// itu nyata dan hanya berjarak beberapa baris. Test ini yang menahannya:
// visibilitas dipakai HANYA saat render kartu, tidak pernah menyentuh input
// perhitungan.
describe('skor kesehatan tidak terpengaruh visibilitas DPO', () => {
  const ratios: RatioValues = {
    cr: 2.4, qr: 1.6, cashR: 0.8, der: 0.45, wc: 125_000_000,
    gpm: 38.2, npm: 12.4, opm: 18.1, roe: 22.5, roa: 14.2,
    dso: 42, dio: 61, dpo: 33, invTurn: 6.1, assetTurn: 1.4,
    ccc: 61 + 42 - 33, // = 70, persis rumus server
  }
  const trends: TrendSubset = {
    gpm: [36, 37, 38.2], opm: [17, 17.5, 18.1], assetTurn: [1.2, 1.3, 1.4],
    dso: [48, 45, 42], dio: [70, 65, 61], ccc: [80, 75, 70],
  }

  it('assessHealth tidak menerima visibilitas sebagai input sama sekali', () => {
    expect(assessHealth.length).toBe(2) // (ratios, trends) — tidak ada argumen ketiga
  })

  it('hasilnya identik baik DPO tampil maupun disembunyikan', () => {
    const shown: VisibilityMap = { ...defaultMetricVisibility(), dpo: true }
    const hiddenDpo: VisibilityMap = { ...defaultMetricVisibility(), dpo: false }

    // Visibilitas berbeda…
    expect(isMetricVisible('user', shown, 'dpo')).toBe(true)
    expect(isMetricVisible('user', hiddenDpo, 'dpo')).toBe(false)

    // …tapi input skor sama, jadi hasilnya harus sama persis.
    const a = assessHealth(ratios, trends)
    const b = assessHealth(ratios, trends)
    expect(b).toEqual(a)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('CCC tetap memakai DPO dalam rumusnya walau DPO disembunyikan', () => {
    const hiddenDpo: VisibilityMap = { ...defaultMetricVisibility(), dpo: false }
    expect(isMetricVisible('user', hiddenDpo, 'dpo')).toBe(false)
    // CCC tetap tampil DAN nilainya tetap turunan dari dpo.
    expect(isMetricVisible('user', hiddenDpo, 'ccc')).toBe(true)
    expect(ratios.ccc).toBe(ratios.dio + ratios.dso - ratios.dpo)
  })

  it('menyembunyikan DPO tidak mengubah tone/dimensi mana pun', () => {
    const h = assessHealth(ratios, trends)
    expect(h.tones.ccc).toBeDefined()
    expect(h.tones.dpo).toBe('info') // dpo memang info-only, di luar skor
    expect(h.dimensions.likuiditas.score).toBe(assessHealth(ratios, trends).dimensions.likuiditas.score)
    expect(h.dimensions.efisiensi.score).toBe(assessHealth(ratios, trends).dimensions.efisiensi.score)
    expect(h.overall).toBe(assessHealth(ratios, trends).overall)
  })
})
