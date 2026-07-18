import { describe, it, expect } from 'vitest'
import { isPathAllowedForRole, STAFF_ONLY_PREFIXES, USER_HOME } from './route-access'
import type { Role } from './roles'

const STAFF_ROLES: Role[] = ['owner', 'akunting']

describe('isPathAllowedForRole — role user (klien) read-only', () => {
  it('boleh Dashboard & Analytics (surface klien)', () => {
    expect(isPathAllowedForRole('user', '/dashboard')).toBe(true)
    expect(isPathAllowedForRole('user', '/analytics')).toBe(true)
  })

  it('DITOLAK dari tiap surface kerja staf', () => {
    for (const p of STAFF_ONLY_PREFIXES) {
      expect(isPathAllowedForRole('user', p)).toBe(false)
    }
  })

  it('DITOLAK dari sub-path surface staf (mis. /coa-mapping/abc, /settings/x)', () => {
    expect(isPathAllowedForRole('user', '/coa-mapping/123')).toBe(false)
    expect(isPathAllowedForRole('user', '/settings/general')).toBe(false)
    expect(isPathAllowedForRole('user', '/upload/step-2')).toBe(false)
  })

  it('prefix match tidak bocor ke path yang cuma berawalan huruf sama', () => {
    // '/uploads-report' BUKAN sub-path '/upload' → tetap boleh (tidak ada
    // halaman begini sekarang, tapi menjaga guard tidak over-block).
    expect(isPathAllowedForRole('user', '/uploads-report')).toBe(true)
    expect(isPathAllowedForRole('user', '/analytics-preview')).toBe(true)
  })
})

describe('isPathAllowedForRole — staf tidak pernah ter-block (anti regresi role lain)', () => {
  it.each(STAFF_ROLES)('%s boleh semua surface staf', (role) => {
    for (const p of STAFF_ONLY_PREFIXES) {
      expect(isPathAllowedForRole(role, p)).toBe(true)
    }
  })

  it.each(STAFF_ROLES)('%s boleh Dashboard & Analytics juga', (role) => {
    expect(isPathAllowedForRole(role, '/dashboard')).toBe(true)
    expect(isPathAllowedForRole(role, '/analytics')).toBe(true)
  })
})

describe('konstanta', () => {
  it('USER_HOME adalah halaman yang boleh diakses user (bukan surface staf)', () => {
    expect(isPathAllowedForRole('user', USER_HOME)).toBe(true)
  })
})
