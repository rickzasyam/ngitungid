import { describe, it, expect } from 'vitest'
import { isOwner, isStaff, ROLE_LABEL, CREATABLE_ROLES, type Role } from './roles'

describe('isStaff — siapa yang boleh kerja harian & lihat semua klien', () => {
  // Owner SENGAJA ikut: ia mewarisi semua kemampuan akunting. Kalau tidak,
  // owner malah tak bisa upload/mapping — padahal ia tingkat tertinggi.
  it('owner & akunting = staf', () => {
    expect(isStaff('owner')).toBe(true)
    expect(isStaff('akunting')).toBe(true)
  })

  it('user (klien) BUKAN staf', () => {
    expect(isStaff('user')).toBe(false)
  })

  // Sesi yang belum ter-resolve tidak boleh dianggap staf walau sesaat.
  it('null/undefined bukan staf (default paling sempit)', () => {
    expect(isStaff(null)).toBe(false)
    expect(isStaff(undefined)).toBe(false)
  })
})

describe('isOwner — kemampuan yang TIDAK dimiliki akunting', () => {
  it('hanya owner', () => {
    expect(isOwner('owner')).toBe(true)
    expect(isOwner('akunting')).toBe(false)
    expect(isOwner('user')).toBe(false)
    expect(isOwner(null)).toBe(false)
    expect(isOwner(undefined)).toBe(false)
  })

  // Regresi privilege-escalation: akunting TIDAK boleh lolos guard owner.
  it('akunting tidak boleh lolos sebagai owner', () => {
    expect(isOwner('akunting')).toBe(false)
    expect(isStaff('akunting') && isOwner('akunting')).toBe(false)
  })
})

describe('ROLE_LABEL', () => {
  it('setiap role punya label berbahasa produk', () => {
    const roles: Role[] = ['owner', 'akunting', 'user']
    for (const r of roles) expect(ROLE_LABEL[r]).toBeTruthy()
    expect(ROLE_LABEL.akunting).toBe('Akunting')
    expect(ROLE_LABEL.user).toBe('Klien')
  })
})

describe('CREATABLE_ROLES', () => {
  // Akun 'user' (klien) terikat ke clientId & alurnya beda — tidak dibuat
  // lewat form "Buat Akun" milik Owner.
  it('hanya akunting & owner yang bisa dibuat dari UI', () => {
    expect(CREATABLE_ROLES).toEqual(['akunting', 'owner'])
    expect(CREATABLE_ROLES).not.toContain('user')
  })
})
