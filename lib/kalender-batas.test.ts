import { describe, expect, it } from 'vitest'
import { batasSah, bulanAwalTampil, bulanDalamBatas, dalamBatas, jepitTanggal, ymdSah } from './kalender-batas'
import { localDateToYmd, ymdToLocalDate } from './ymd'

// Batas & bulan awal DatePicker satu tanggal (keputusan Ricko 2026-10-30).
const t = (ymd: string) => ymdToLocalDate(ymd)

describe('ymdSah / batasSah', () => {
  it('hanya YYYY-MM-DD yang benar-benar ada', () => {
    for (const s of ['2026-10-30', '2024-02-29', '2026-12-31']) expect(ymdSah(s), s).toBe(true)
    for (const s of ['', '2026-02-30', '2025-02-29', '2026-13-01', '2026-10-3', '2026/10/30', '30-10-2026', '2026-10-30T00:00', 'abcd-ef-gh']) {
      expect(ymdSah(s), s).toBe(false)
    }
  })

  it('min/max yang bukan tanggal sah diabaikan, bukan dibandingkan sebagai teks', () => {
    expect(batasSah('2026-10-01', '2026-10-31')).toEqual({ min: '2026-10-01', max: '2026-10-31' })
    expect(batasSah('kemarin', '2026-10-31')).toEqual({ min: undefined, max: '2026-10-31' })
    expect(batasSah(undefined, '')).toEqual({ min: undefined, max: undefined })
  })
})

describe('dalamBatas / jepitTanggal / bulanDalamBatas', () => {
  const b = { min: '2026-10-01', max: '2026-10-31' }

  it('batas inklusif di kedua sisi; sisi yang kosong tidak membatasi', () => {
    expect(['2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01'].map(x => dalamBatas(x, b))).toEqual([false, true, true, false])
    expect(dalamBatas('1999-01-01', { max: '2026-10-31' })).toBe(true)
    expect(dalamBatas('2999-01-01', undefined)).toBe(true)
  })

  it('jepit: di luar → tepat di batas; di dalam → Date yang SAMA (DateRangePicker tidak berubah)', () => {
    expect(localDateToYmd(jepitTanggal(t('2026-09-24'), b))).toBe('2026-10-01')
    expect(localDateToYmd(jepitTanggal(t('2026-11-03'), b))).toBe('2026-10-31')
    const d = t('2026-10-15')
    expect(jepitTanggal(d, b)).toBe(d)
    expect(jepitTanggal(d, undefined)).toBe(d)
  })

  it('bulan hidup bila memuat SATU saja tanggal yang boleh', () => {
    expect([bulanDalamBatas(2026, 8, b), bulanDalamBatas(2026, 9, b), bulanDalamBatas(2026, 10, b)]).toEqual([false, true, false])
    expect(bulanDalamBatas(2026, 9, { min: '2026-10-31' })).toBe(true)
    expect(bulanDalamBatas(2026, 10, { max: '2026-11-01' })).toBe(true)
    expect(bulanDalamBatas(1900, 0, undefined)).toBe(true)
  })
})

describe('bulanAwalTampil', () => {
  const hariIni = '2026-10-30'

  it('urutan: bulan nilai → bulanAwal → hari ini', () => {
    expect(bulanAwalTampil({ value: '2026-03-15', bulanAwal: '2026-07', hariIni })).toEqual({ tahun: 2026, bulan: 2 })
    expect(bulanAwalTampil({ value: '', bulanAwal: '2026-07', hariIni })).toEqual({ tahun: 2026, bulan: 6 })
    expect(bulanAwalTampil({ value: '', hariIni })).toEqual({ tahun: 2026, bulan: 9 })
  })

  it('nilai/bulanAwal yang tidak sah diabaikan; hari ini dijepit ke batas (grid bulan lain tidak terbuka di bulan mati)', () => {
    expect(bulanAwalTampil({ value: 'x', bulanAwal: '2026-13', hariIni })).toEqual({ tahun: 2026, bulan: 9 })
    expect(bulanAwalTampil({ value: '', batas: { min: '2025-01-01', max: '2025-01-31' }, hariIni })).toEqual({ tahun: 2025, bulan: 0 })
    expect(bulanAwalTampil({ value: '', batas: { min: '2027-02-01' }, hariIni })).toEqual({ tahun: 2027, bulan: 1 })
  })

  it('tanpa new Date(string) maupun ekspresi reguler', async () => {
    const { readFileSync } = await import('node:fs')
    // Kode saja — komentar kepala memang menyebut `new Date(string)` sebagai larangan.
    const src = readFileSync(new URL('./kalender-batas.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**'))
      .join('\n')
    // Setiap `new Date(` berbentuk (tahun, bulan, tanggal) — tidak pernah satu argumen string.
    const panggilan = src.split('new Date(').slice(1).map(x => x.slice(0, x.indexOf(')')))
    expect(panggilan.length).toBeGreaterThan(0)
    for (const a of panggilan) expect(a.split(',').length, a).toBe(3)
    expect(src).not.toContain('RegExp')
    expect(src).not.toMatch(/\.(test|match|replace)\(\//)
  })
})
