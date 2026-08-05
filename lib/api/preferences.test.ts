import { describe, it, expect } from 'vitest'
import {
  LANGUAGES,
  CURRENCY_FORMATS,
  DEFAULT_PREFERENCES,
  isLanguage,
  isCurrencyFormat,
  validatePreferences,
  normalizePreferences,
} from './preferences'

describe('nilai yang diizinkan', () => {
  it('bahasa: id & en saja', () => {
    expect([...LANGUAGES]).toEqual(['id', 'en'])
  })

  it("format nominal: 'idr' & 'intl' — BUKAN 'id'", () => {
    expect([...CURRENCY_FORMATS]).toEqual(['idr', 'intl'])
    // Justru inti penamaannya: 'id' di kolom language berarti bahasa Indonesia,
    // jadi 'id' TIDAK boleh juga berarti gaya angka Indonesia.
    expect(isCurrencyFormat('id')).toBe(false)
  })

  it('default sama dengan DEFAULT kolom di migrasi 0006', () => {
    expect(DEFAULT_PREFERENCES).toEqual({ language: 'id', currencyFormat: 'idr' })
  })
})

describe('validatePreferences', () => {
  it('menerima kombinasi yang sah', () => {
    const r = validatePreferences({ language: 'en', currencyFormat: 'intl' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.preferences).toEqual({ language: 'en', currencyFormat: 'intl' })
  })

  it('menolak bahasa tidak dikenal', () => {
    const r = validatePreferences({ language: 'jv', currencyFormat: 'idr' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Bahasa/i)
  })

  it('menolak format nominal tidak dikenal', () => {
    const r = validatePreferences({ language: 'id', currencyFormat: 'usd' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Format nominal/i)
  })

  it("menolak 'id' sebagai format nominal — ejaan lama yang ambigu", () => {
    expect(validatePreferences({ language: 'id', currencyFormat: 'id' }).ok).toBe(false)
  })

  it('menolak field yang hilang — PUT mengganti seluruh preferensi, bukan patch', () => {
    expect(validatePreferences({ language: 'id' }).ok).toBe(false)
    expect(validatePreferences({ currencyFormat: 'idr' }).ok).toBe(false)
    expect(validatePreferences({}).ok).toBe(false)
  })

  it('menolak tipe non-string', () => {
    expect(validatePreferences({ language: 1, currencyFormat: 'idr' }).ok).toBe(false)
    expect(validatePreferences({ language: 'id', currencyFormat: null }).ok).toBe(false)
    expect(validatePreferences({ language: ['id'], currencyFormat: 'idr' }).ok).toBe(false)
  })
})

describe('normalizePreferences', () => {
  it('meneruskan nilai yang sah apa adanya', () => {
    expect(normalizePreferences({ language: 'en', currencyFormat: 'intl' }))
      .toEqual({ language: 'en', currencyFormat: 'intl' })
  })

  it('jatuh ke default untuk nilai asing — currency_format bertipe text di DB', () => {
    // Kolomnya text tanpa CHECK, jadi nilai tak dikenal secara teori bisa ada.
    // UI tidak boleh pecah karenanya.
    expect(normalizePreferences({ language: 'id', currencyFormat: 'sesuatu' }))
      .toEqual({ language: 'id', currencyFormat: 'idr' })
  })

  it('jatuh ke default untuk null/undefined', () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences({ language: null, currencyFormat: undefined })).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('isLanguage / isCurrencyFormat', () => {
  it('menerima hanya nilai yang terdaftar', () => {
    expect(isLanguage('id')).toBe(true)
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage('EN')).toBe(false) // case-sensitive, sesuai isi enum DB
    expect(isCurrencyFormat('idr')).toBe(true)
    expect(isCurrencyFormat('intl')).toBe(true)
    expect(isCurrencyFormat('IDR')).toBe(false)
  })
})
