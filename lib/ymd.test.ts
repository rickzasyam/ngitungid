import { describe, it, expect } from 'vitest'
import { localDateToYmd, ymdToLocalDate, todayYmd, hariIniJakarta } from './ymd'

// ══ ROUND-TRIP ADALAH IDENTITAS ══════════════════════════════════
// Seluruh nilai modul ini ada di sini. Kalau salah satu arah diam-diam lewat
// UTC, tanggal 1 mundur ke bulan sebelumnya dan tanggal 31 maju ke bulan
// berikutnya — di WIB (UTC+7) itu terjadi pada SETIAP tanggal, tapi paling
// terlihat di ujung bulan.
describe('round-trip ymd → Date → ymd tidak pernah menggeser hari', () => {
  it('tanggal 1 dan 31 setiap bulan yang punya 31 hari', () => {
    for (const m of [1, 3, 5, 7, 8, 10, 12]) {
      const mm = String(m).padStart(2, '0')
      for (const d of ['01', '31']) {
        const ymd = `2026-${mm}-${d}`
        expect(localDateToYmd(ymdToLocalDate(ymd)), ymd).toBe(ymd)
      }
    }
  })

  it('tanggal 1 dan hari terakhir setiap bulan 30 hari', () => {
    for (const m of [4, 6, 9, 11]) {
      const mm = String(m).padStart(2, '0')
      for (const d of ['01', '30']) {
        const ymd = `2026-${mm}-${d}`
        expect(localDateToYmd(ymdToLocalDate(ymd)), ymd).toBe(ymd)
      }
    }
  })

  it('1 Januari TIDAK pernah jatuh ke 31 Desember tahun sebelumnya', () => {
    // Kegagalan khas jalur UTC di zona waktu positif seperti WIB.
    for (const y of [2024, 2025, 2026, 2027]) {
      const ymd = `${y}-01-01`
      const balik = localDateToYmd(ymdToLocalDate(ymd))
      expect(balik, ymd).toBe(ymd)
      expect(balik.startsWith(String(y)), ymd).toBe(true)
    }
  })

  it('31 Desember TIDAK pernah maju ke 1 Januari tahun berikutnya', () => {
    for (const y of [2024, 2025, 2026, 2027]) {
      const ymd = `${y}-12-31`
      expect(localDateToYmd(ymdToLocalDate(ymd)), ymd).toBe(ymd)
    }
  })

  it('29 Februari tahun kabisat bertahan; 28 Februari tahun biasa juga', () => {
    expect(localDateToYmd(ymdToLocalDate('2024-02-29'))).toBe('2024-02-29')
    expect(localDateToYmd(ymdToLocalDate('2026-02-28'))).toBe('2026-02-28')
  })

  it('setiap hari sepanjang satu tahun penuh selamat', () => {
    // Sapuan menyeluruh: kalau ada satu hari saja yang bergeser (mis. karena
    // transisi DST di zona waktu lain), ini yang menangkapnya.
    const d = ymdToLocalDate('2026-01-01')
    for (let i = 0; i < 365; i++) {
      const ymd = localDateToYmd(d)
      expect(localDateToYmd(ymdToLocalDate(ymd)), ymd).toBe(ymd)
      d.setDate(d.getDate() + 1)
    }
  })
})

describe('localDateToYmd — padding & bentuk', () => {
  it('bulan & tanggal satu digit diberi nol depan', () => {
    expect(localDateToYmd(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(localDateToYmd(new Date(2026, 8, 9))).toBe('2026-09-09')
  })

  it('memakai komponen LOKAL, bukan UTC', () => {
    // Date dibangun dari komponen lokal, jadi pembacaannya wajib cocok persis
    // dengan komponen yang dipakai membangunnya — apa pun zona waktunya.
    const d = new Date(2026, 2, 31, 23, 59, 59)
    expect(localDateToYmd(d)).toBe('2026-03-31')
  })

  it('jam berapa pun dalam hari itu menghasilkan tanggal yang sama', () => {
    for (const jam of [0, 6, 12, 18, 23]) {
      expect(localDateToYmd(new Date(2026, 0, 1, jam, 30))).toBe('2026-01-01')
    }
  })
})

describe('ymdToLocalDate — tengah malam lokal', () => {
  it('mengembalikan komponen yang sama dengan string-nya', () => {
    const d = ymdToLocalDate('2026-03-31')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2) // 0-indexed
    expect(d.getDate()).toBe(31)
    expect(d.getHours()).toBe(0)
  })
})

describe('todayYmd', () => {
  it('berbentuk YYYY-MM-DD dan cocok dengan jam lokal', () => {
    const t = todayYmd()
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(t).toBe(localDateToYmd(new Date()))
  })

  it('urut leksikografis terhadap tanggal jelas-lampau & jelas-depan', () => {
    // Properti yang diandalkan SELURUH logika status kontrak: 'YYYY-MM-DD'
    // bisa dibandingkan sebagai string biasa.
    const t = todayYmd()
    expect(t > '2000-01-01').toBe(true)
    expect(t < '2999-12-31').toBe(true)
  })
})

describe('hariIniJakarta — tanggal WIB, bukan jam server', () => {
  // Pukul 00.00–07.00 WIB server UTC masih di tanggal kemarin.
  it('18.00 UTC = 01.00 WIB keesokan harinya', () => {
    expect(hariIniJakarta(new Date(Date.UTC(2026, 9, 26, 18, 0)))).toBe('2026-10-27')
  })

  it('16.59 UTC = 23.59 WIB hari yang sama; 17.00 UTC sudah berganti hari', () => {
    expect(hariIniJakarta(new Date(Date.UTC(2026, 9, 26, 16, 59)))).toBe('2026-10-26')
    expect(hariIniJakarta(new Date(Date.UTC(2026, 9, 26, 17, 0)))).toBe('2026-10-27')
  })

  it('pergantian tahun & format selalu YYYY-MM-DD', () => {
    expect(hariIniJakarta(new Date(Date.UTC(2025, 11, 31, 17, 30)))).toBe('2026-01-01')
    expect(hariIniJakarta()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
