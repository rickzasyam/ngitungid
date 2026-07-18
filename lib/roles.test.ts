import { describe, it, expect } from 'vitest'
import { isOwner, isStaff, canAccessClientData, ROLE_LABEL, CREATABLE_ROLES, type Role } from './roles'

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

describe('canAccessClientData — scoping antar-klien ASIMETRIS', () => {
  const CLIENT_A = 'aaaaaaaa-0000-0000-0000-000000000001'
  const CLIENT_B = 'bbbbbbbb-0000-0000-0000-000000000002'

  // Inti requirement: user (klien) HANYA boleh data klien-nya sendiri —
  // mengganti clientId di request tidak boleh membocorkan data klien lain.
  it('user boleh data klien-nya SENDIRI', () => {
    expect(canAccessClientData('user', CLIENT_A, CLIENT_A)).toBe(true)
  })

  it('user DITOLAK data klien lain (walau id diutak-atik)', () => {
    expect(canAccessClientData('user', CLIENT_A, CLIENT_B)).toBe(false)
  })

  it('user tanpa clientId terpasang → tidak boleh apa pun', () => {
    expect(canAccessClientData('user', null, CLIENT_A)).toBe(false)
    expect(canAccessClientData('user', undefined, CLIENT_A)).toBe(false)
  })

  // Asimetri: staf TIDAK dibatasi klien — sama seperti perilaku mereka di
  // semua endpoint lain. Re-add scoping TIDAK boleh ikut membatasi staf.
  it('owner & akunting boleh klien MANA PUN (tidak dibatasi)', () => {
    expect(canAccessClientData('owner', null, CLIENT_A)).toBe(true)
    expect(canAccessClientData('owner', CLIENT_B, CLIENT_A)).toBe(true)
    expect(canAccessClientData('akunting', null, CLIENT_A)).toBe(true)
    expect(canAccessClientData('akunting', CLIENT_B, CLIENT_A)).toBe(true)
  })
})
