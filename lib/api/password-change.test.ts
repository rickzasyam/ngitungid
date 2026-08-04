import { describe, it, expect } from 'vitest'
import { validatePasswordChange, MIN_PASSWORD } from './password-change'

// Catatan cakupan: file ini menguji ATURAN-nya saja (murni). Verifikasi password
// lama lewat bcrypt, penulisan hash ke DB, dan larangan menyasar akun lain diuji
// end-to-end terhadap branch dev — lihat ROADMAP 2026-08-04.

const ok = (currentPassword: string, newPassword: string) =>
  validatePasswordChange({ currentPassword, newPassword })

describe('validatePasswordChange', () => {
  it('menerima password baru yang valid', () => {
    const r = ok('lama12345', 'baru98765')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.currentPassword).toBe('lama12345')
      expect(r.newPassword).toBe('baru98765')
    }
  })

  it('menolak kalau salah satu field bukan string', () => {
    expect(validatePasswordChange({ currentPassword: 123, newPassword: 'baru98765' }).ok).toBe(false)
    expect(validatePasswordChange({ currentPassword: 'lama12345', newPassword: null }).ok).toBe(false)
    expect(validatePasswordChange({ currentPassword: undefined, newPassword: undefined }).ok).toBe(false)
  })

  it('menolak password lama kosong', () => {
    const r = ok('', 'baru98765')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/lama wajib/i)
  })

  it(`menolak password baru di bawah ${MIN_PASSWORD} karakter`, () => {
    const r = ok('lama12345', 'pendek')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(new RegExp(`minimal ${MIN_PASSWORD}`, 'i'))
  })

  it('menghitung panjang SETELAH trim — spasi tidak bisa dipakai menambal', () => {
    // 4 huruf + spasi supaya total mentah >= 8; harus tetap ditolak.
    const r = ok('lama12345', '    abcd    ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(new RegExp(`minimal ${MIN_PASSWORD}`, 'i'))
  })

  it('menolak password baru yang isinya hanya whitespace', () => {
    const r = ok('lama12345', '          ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/wajib diisi/i)
  })

  it('menolak password baru yang sama dengan yang lama', () => {
    const r = ok('lama12345', 'lama12345')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/berbeda/i)
  })

  it('menolak "sama dengan lama" walau dibungkus spasi', () => {
    const r = ok('lama12345', '  lama12345  ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/berbeda/i)
  })

  it('men-trim password baru — yang disimpan adalah hasil trim', () => {
    const r = ok('lama12345', '  baru98765  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.newPassword).toBe('baru98765')
  })

  it('TIDAK men-trim password lama — harus cocok persis dengan yang di-hash', () => {
    // Akun yang password-nya memang berspasi di ujung tetap bisa ganti password.
    const r = ok('  lama12345  ', 'baru98765')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.currentPassword).toBe('  lama12345  ')
  })

  it(`menerima password baru tepat ${MIN_PASSWORD} karakter (batas bawah)`, () => {
    expect(ok('lama12345', 'a'.repeat(MIN_PASSWORD)).ok).toBe(true)
    expect(ok('lama12345', 'a'.repeat(MIN_PASSWORD - 1)).ok).toBe(false)
  })
})
