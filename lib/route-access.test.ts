import { describe, it, expect } from 'vitest'
import { isPathAllowedForRole, STAFF_ONLY_PREFIXES, USER_HOME } from './route-access'
import type { Role } from './roles'

const STAFF_ROLES: Role[] = ['owner', 'akunting']

// Halaman yang BOLEH dibuka role 'user' (klien) — read-only.
const USER_ALLOWED = ['/dashboard', '/analytics', '/laporan', '/settings']

describe('isPathAllowedForRole — role user (klien) read-only', () => {
  it('boleh Dashboard, Analytics, Laporan, Settings', () => {
    for (const p of USER_ALLOWED) {
      expect(isPathAllowedForRole('user', p)).toBe(true)
    }
  })

  it('boleh sub-path Laporan & Settings (mis. /settings/general, /laporan/x)', () => {
    expect(isPathAllowedForRole('user', '/settings/general')).toBe(true)
    expect(isPathAllowedForRole('user', '/laporan/detail')).toBe(true)
  })

  it('DITOLAK dari tiap surface kerja staf (upload/coa-mapping/extraction-review/admin-overview)', () => {
    for (const p of STAFF_ONLY_PREFIXES) {
      expect(isPathAllowedForRole('user', p)).toBe(false)
    }
  })

  it('DITOLAK dari sub-path surface staf (mis. /coa-mapping/abc, /upload/step-2)', () => {
    expect(isPathAllowedForRole('user', '/coa-mapping/123')).toBe(false)
    expect(isPathAllowedForRole('user', '/upload/step-2')).toBe(false)
    expect(isPathAllowedForRole('user', '/extraction-review/x')).toBe(false)
  })

  it('/laporan & /settings SUDAH TIDAK di daftar blokir (perubahan requirement)', () => {
    expect((STAFF_ONLY_PREFIXES as readonly string[]).includes('/laporan')).toBe(false)
    expect((STAFF_ONLY_PREFIXES as readonly string[]).includes('/settings')).toBe(false)
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

  it.each(STAFF_ROLES)('%s boleh Dashboard/Analytics/Laporan/Settings juga', (role) => {
    for (const p of USER_ALLOWED) {
      expect(isPathAllowedForRole(role, p)).toBe(true)
    }
  })
})

describe('konstanta', () => {
  it('USER_HOME adalah halaman yang boleh diakses user (bukan surface staf)', () => {
    expect(isPathAllowedForRole('user', USER_HOME)).toBe(true)
  })
})
