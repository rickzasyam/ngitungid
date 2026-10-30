import { describe, expect, it } from 'vitest'
import { hariAktif, tujuanTombol } from './kalender-keyboard'
import { localDateToYmd, ymdToLocalDate } from './ymd'

// Navigasi keyboard kalender DateRangePicker (pola date grid WAI-ARIA).
const t = (ymd: string) => ymdToLocalDate(ymd)
const ke = (ymd: string, key: string, shift = false) => {
  const r = tujuanTombol(t(ymd), key, shift)
  return r && localDateToYmd(r)
}

describe('tujuanTombol', () => {
  it('panah: ±1 hari dan ±1 minggu, melintasi batas bulan & tahun', () => {
    expect(ke('2026-10-15', 'ArrowLeft')).toBe('2026-10-14')
    expect(ke('2026-10-15', 'ArrowRight')).toBe('2026-10-16')
    expect(ke('2026-10-15', 'ArrowUp')).toBe('2026-10-08')
    expect(ke('2026-10-15', 'ArrowDown')).toBe('2026-10-22')
    expect(ke('2026-11-01', 'ArrowLeft')).toBe('2026-10-31')
    expect(ke('2026-12-29', 'ArrowDown')).toBe('2027-01-05')
    expect(ke('2027-01-01', 'ArrowLeft')).toBe('2026-12-31')
  })

  it('Home/End = Senin/Minggu minggu itu — sama dengan kolom kalender', () => {
    // 2026-10-15 = Kamis
    expect(ke('2026-10-15', 'Home')).toBe('2026-10-12')
    expect(ke('2026-10-15', 'End')).toBe('2026-10-18')
    // Minggu: Home mundur ke Senin, End tetap
    expect(ke('2026-10-18', 'Home')).toBe('2026-10-12')
    expect(ke('2026-10-18', 'End')).toBe('2026-10-18')
    // Senin
    expect(ke('2026-10-12', 'Home')).toBe('2026-10-12')
  })

  it('PageUp/PageDown = ±1 bulan, tanggal dipotong ke akhir bulan; Shift = ±1 tahun', () => {
    expect(ke('2026-10-15', 'PageDown')).toBe('2026-11-15')
    expect(ke('2026-10-15', 'PageUp')).toBe('2026-09-15')
    expect(ke('2027-01-31', 'PageDown')).toBe('2027-02-28')
    expect(ke('2028-01-31', 'PageDown')).toBe('2028-02-29')
    expect(ke('2026-03-31', 'PageUp')).toBe('2026-02-28')
    expect(ke('2026-12-15', 'PageDown')).toBe('2027-01-15')
    expect(ke('2028-02-29', 'PageDown', true)).toBe('2029-02-28')
    expect(ke('2026-10-15', 'PageUp', true)).toBe('2025-10-15')
  })

  it('tombol lain bukan navigasi → null (Enter/Spasi/Tab/Escape tetap milik tombol & panel)', () => {
    for (const k of ['Enter', ' ', 'Tab', 'Escape', 'a']) expect(ke('2026-10-15', k), k).toBeNull()
  })

  it('selalu tengah malam lokal — tidak ada aritmetika milidetik', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
      const r = tujuanTombol(t('2026-03-29'), k)!
      expect([r.getHours(), r.getMinutes()], k).toEqual([0, 0])
    }
  })
})

describe('hariAktif — satu sel Tab per bulan (roving tabindex)', () => {
  it('kandidat pertama yang jatuh di bulan itu menang, urutan dari pemanggil', () => {
    expect(hariAktif(2026, 9, [t('2026-10-20'), t('2026-10-05'), t('2026-10-30')])).toBe(20)
    expect(hariAktif(2026, 9, [null, t('2026-10-05'), t('2026-10-30')])).toBe(5)
    expect(hariAktif(2026, 9, [t('2026-11-02'), undefined, t('2026-10-30')])).toBe(30)
  })

  it('tidak ada kandidat di bulan itu → tanggal 1 (bulan kedua tetap punya sel Tab)', () => {
    expect(hariAktif(2026, 10, [t('2026-10-20'), undefined, null])).toBe(1)
    expect(hariAktif(2027, 9, [t('2026-10-20')])).toBe(1)
  })
})

// DatePicker min/max (2026-10-30): sel di luar batas mati dan tidak bisa difokus.
describe('hariAktif dengan batas', () => {
  const batas = { min: '2026-10-10', max: '2026-10-25' }

  it('kandidat di luar batas dilewati; pengganti = tanggal pertama yang boleh, bukan tanggal 1', () => {
    expect(hariAktif(2026, 9, [t('2026-10-05'), t('2026-10-30'), t('2026-10-12')], batas)).toBe(12)
    expect(hariAktif(2026, 9, [t('2026-10-05'), t('2026-10-30')], batas)).toBe(10)
    expect(hariAktif(2026, 9, [t('2026-10-25')], { max: '2026-10-25' })).toBe(25)
  })

  it('tanpa batas: perilaku DateRangePicker tidak berubah', () => {
    expect(hariAktif(2026, 9, [t('2026-10-05')])).toBe(5)
    expect(hariAktif(2026, 9, [t('2026-10-05')], {})).toBe(5)
    expect(hariAktif(2026, 10, [])).toBe(1)
  })
})
