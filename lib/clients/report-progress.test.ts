import { describe, it, expect } from 'vitest'
import {
  computeReportProgress,
  formatMonth,
  monthOf,
  monthsBehind,
  type ClientMonth,
} from './report-progress'

/** Bulan lengkap (3 jenis) vs belum lengkap. */
const lengkap = (...ms: string[]): ClientMonth[] => ms.map(m => ({ m, types: 3 }))
const sebagian = (m: string, types: number): ClientMonth => ({ m, types })

// Acuan tetap supaya test tidak berubah hasil seiring waktu nyata.
const HARI_INI = new Date(2026, 6, 28) // 28 Juli 2026 → bulan lengkap terakhir = Juni

describe('computeReportProgress — kasus utama', () => {
  it('klien TERKINI: semua bulan sejak mulai sudah lengkap', () => {
    const p = computeReportProgress(lengkap('2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'), HARI_INI)
    expect(p.kind).toBe('ratio')
    expect(p.completed).toBe(6)
    expect(p.total).toBe(6)
    expect(monthsBehind(p)).toBe(0)
  })

  it('klien TERTINGGAL: Rasyuka (Jan-Mar) per 28 Juli 2026 → 3 dari 6', () => {
    const p = computeReportProgress(lengkap('2026-01', '2026-02', '2026-03'), HARI_INI)
    expect(p.completed).toBe(3)
    expect(p.total).toBe(6) // Jan..Jun
    expect(p.lastMonth).toBe('2026-03')
    expect(monthsBehind(p)).toBe(3)
  })

  it('klien MULAI TENGAH TAHUN: jangkar ikut bergeser, tidak dihukum', () => {
    // Mulai April → jendela hanya Apr..Jun = 3 bulan, bukan Jan..Jun = 6.
    const p = computeReportProgress(lengkap('2026-04', '2026-05', '2026-06'), HARI_INI)
    expect(p.total).toBe(3)
    expect(p.completed).toBe(3)
    expect(monthsBehind(p)).toBe(0)
  })

  it('klien TANPA LAPORAN: bukan 0%, melainkan keadaan tersendiri', () => {
    const p = computeReportProgress([], HARI_INI)
    expect(p.kind).toBe('none')
    expect(p.lastMonth).toBeNull()
    expect(p.total).toBe(0)
  })
})

describe('computeReportProgress — bulan berjalan tidak dihitung', () => {
  it('bulan berjalan TIDAK masuk denominator', () => {
    // Jan..Jun lengkap, Juli (bulan berjalan) belum ada — tetap dianggap terkini.
    const p = computeReportProgress(lengkap('2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'), HARI_INI)
    expect(p.total).toBe(6)
    expect(monthsBehind(p)).toBe(0)
  })

  it('bulan berjalan yang sudah diunggah TIDAK membuat completed > total', () => {
    const p = computeReportProgress(lengkap('2026-06', '2026-07'), HARI_INI)
    expect(p.total).toBe(1) // hanya Juni
    expect(p.completed).toBe(1) // Juli tidak ikut dihitung
    expect(p.lastMonth).toBe('2026-07')
  })

  it('laporan pertama justru di bulan berjalan → belum ada jendela penilaian', () => {
    const p = computeReportProgress(lengkap('2026-07'), HARI_INI)
    expect(p.kind).toBe('no-window')
    expect(p.total).toBe(0)
    expect(p.lastMonth).toBe('2026-07')
  })
})

describe('computeReportProgress — periode belum lengkap', () => {
  it('bulan dengan 1 dari 3 jenis TIDAK dihitung selesai', () => {
    // Kasus nyata PT Nusantara Group: Jan 2026 hanya laba_rugi.
    const p = computeReportProgress([sebagian('2026-01', 1)], HARI_INI)
    expect(p.completed).toBe(0)
    expect(p.total).toBe(6)
    expect(p.incompleteMonths).toEqual(['2026-01'])
    expect(p.lastMonth).toBe('2026-01') // kerja yang sudah masuk tetap terlihat
  })

  it('2 dari 3 jenis juga belum selesai', () => {
    const p = computeReportProgress([sebagian('2026-05', 2)], HARI_INI)
    expect(p.completed).toBe(0)
    expect(p.incompleteMonths).toEqual(['2026-05'])
  })

  it('campuran lengkap & belum lengkap dihitung terpisah', () => {
    const p = computeReportProgress([...lengkap('2026-01', '2026-02'), sebagian('2026-03', 2)], HARI_INI)
    expect(p.completed).toBe(2)
    expect(p.incompleteMonths).toEqual(['2026-03'])
    expect(p.lastMonth).toBe('2026-03')
  })

  it('baris ganda untuk bulan sama: ambil jumlah jenis terbesar', () => {
    const p = computeReportProgress([sebagian('2026-01', 1), sebagian('2026-01', 3)], HARI_INI)
    expect(p.completed).toBe(1)
    expect(p.incompleteMonths).toEqual([])
  })
})

describe('computeReportProgress — lintas tahun', () => {
  it('jendela melintasi pergantian tahun', () => {
    const p = computeReportProgress(lengkap('2025-11', '2025-12', '2026-01'), HARI_INI)
    expect(p.total).toBe(8) // Nov 2025 .. Jun 2026
    expect(p.completed).toBe(3)
  })

  it('acuan Januari: bulan lengkap terakhir = Desember tahun lalu', () => {
    const p = computeReportProgress(lengkap('2025-12'), new Date(2026, 0, 15))
    expect(p.total).toBe(1)
    expect(p.completed).toBe(1)
    expect(monthsBehind(p)).toBe(0)
  })
})

describe('helper', () => {
  it('monthOf memakai waktu LOKAL, tidak bergeser oleh UTC', () => {
    // 1 Jan 2026 00:30 WIB masih Januari, walau di UTC sudah 31 Des.
    expect(monthOf(new Date(2026, 0, 1, 0, 30))).toBe('2026-01')
  })

  it('formatMonth', () => {
    expect(formatMonth('2026-03')).toBe('Mar 2026')
    expect(formatMonth('2026-12')).toBe('Des 2026')
  })
})
