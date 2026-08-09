import { describe, it, expect } from 'vitest'
import {
  isPathAllowedForRole, STAFF_ONLY_PREFIXES, ACCOUNTING_ONLY_PREFIXES,
  INTERNAL_ONLY_PREFIXES, CONTRACT_PREFIXES, USER_HOME,
} from './route-access'
import { isInternal, type Role } from './roles'

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

// ══ Role 'finance' ═══════════════════════════════════════════════
describe('finance — ditolak surface kerja akunting secara EKSPLISIT', () => {
  it('ditolak /upload, /extraction-review, /coa-mapping (dan turunannya)', () => {
    for (const p of ['/upload', '/extraction-review', '/coa-mapping']) {
      expect(isPathAllowedForRole('finance', p), p).toBe(false)
      expect(isPathAllowedForRole('finance', `${p}/abc`), `${p}/abc`).toBe(false)
    }
  })

  it('/admin-overview TERBUKA — pemilih klien, bukan pekerjaan akunting', () => {
    // Diperbaiki 2026-08-06: dulu satu daftar dengan surface akunting, yang
    // membuat finance terjebak loop pantulan (lihat blok terminasi di bawah).
    expect(isPathAllowedForRole('finance', '/admin-overview')).toBe(true)
  })

  it('diizinkan /dashboard, /analytics, /laporan, /settings', () => {
    for (const p of ['/dashboard', '/analytics', '/laporan', '/settings']) {
      expect(isPathAllowedForRole('finance', p), p).toBe(true)
    }
  })

  it('owner & akunting tetap boleh semuanya', () => {
    for (const r of ['owner', 'akunting'] as const) {
      for (const p of ['/upload', '/extraction-review', '/coa-mapping', '/dashboard', '/laporan']) {
        expect(isPathAllowedForRole(r, p), `${r} ${p}`).toBe(true)
      }
    }
  })

  it('user tetap ditolak surface staf & diizinkan sisanya', () => {
    expect(isPathAllowedForRole('user', '/upload')).toBe(false)
    expect(isPathAllowedForRole('user', '/coa-mapping')).toBe(false)
    expect(isPathAllowedForRole('user', '/dashboard')).toBe(true)
    expect(isPathAllowedForRole('user', '/laporan')).toBe(true)
  })
})

// ══ Terminasi: pantulan useRequireClient × gerbang proxy ═════════
//
// Dua mekanisme saling mengejar kalau daftarnya tidak cocok:
//   useRequireClient : role internal TANPA klien aktif → /admin-overview
//   proxy            : path yang tidak diizinkan       → USER_HOME
// Kalau /admin-overview tertutup bagi sebuah role internal, keduanya saling
// melempar tanpa henti. Itu persis yang terjadi pada 'finance' sebelum
// /admin-overview dipindah ke INTERNAL_ONLY_PREFIXES.
//
// Test ini MENJALANKAN loop-nya, bukan sekadar memeriksa satu boolean.
function settle(role: Role, start: string, hasActiveClient: boolean, maxSteps = 12): string[] {
  const trail = [start]
  let path = start
  for (let i = 0; i < maxSteps; i++) {
    if (!isPathAllowedForRole(role, path)) {
      path = USER_HOME
      trail.push(path)
      continue
    }
    // useRequireClient: hanya memantulkan role internal yang belum punya klien.
    if (isInternal(role) && !hasActiveClient && path !== '/admin-overview') {
      path = '/admin-overview'
      trail.push(path)
      continue
    }
    return trail // stabil — tidak ada lagi yang memindahkan
  }
  throw new Error(`tidak pernah stabil setelah ${maxSteps} langkah: ${trail.join(' → ')}`)
}

describe('navigasi selalu berhenti (tidak ada loop pantulan)', () => {
  it('finance tanpa klien aktif SAMPAI di /admin-overview dan berhenti di sana', () => {
    expect(() => settle('finance', '/dashboard', false)).not.toThrow()
    const trail = settle('finance', '/dashboard', false)
    expect(trail[trail.length - 1]).toBe('/admin-overview')
  })

  it('finance membuka /admin-overview langsung: tidak dilempar ke mana-mana', () => {
    expect(settle('finance', '/admin-overview', false)).toEqual(['/admin-overview'])
  })

  it('setiap role internal tanpa klien berhenti — bukan cuma finance', () => {
    for (const r of ['owner', 'akunting', 'finance'] as const) {
      expect(() => settle(r, '/dashboard', false), r).not.toThrow()
      expect(settle(r, '/dashboard', false).at(-1), r).toBe('/admin-overview')
    }
  })

  it('role internal DENGAN klien aktif berhenti di halaman yang dituju', () => {
    for (const r of ['owner', 'akunting', 'finance'] as const) {
      expect(settle(r, '/dashboard', true), r).toEqual(['/dashboard'])
      expect(settle(r, '/laporan', true), r).toEqual(['/laporan'])
    }
  })

  it('user (klien) tidak pernah dipantulkan ke /admin-overview', () => {
    expect(settle('user', '/dashboard', false)).toEqual(['/dashboard'])
    // Kalau ia mencoba masuk, proxy melemparnya sekali lalu berhenti.
    expect(settle('user', '/admin-overview', false)).toEqual(['/admin-overview', USER_HOME])
  })

  it('finance yang mencoba surface akunting dilempar SEKALI lalu berhenti', () => {
    // Dengan klien aktif, supaya pantulan pemilih klien tidak ikut bermain.
    for (const p of ACCOUNTING_ONLY_PREFIXES) {
      expect(settle('finance', p, true), p).toEqual([p, USER_HOME])
    }
  })
})

describe('pembagian daftar prefix', () => {
  it('ACCOUNTING_ONLY + INTERNAL_ONLY = STAFF_ONLY (tidak ada yang hilang)', () => {
    expect([...STAFF_ONLY_PREFIXES].sort())
      .toEqual([...ACCOUNTING_ONLY_PREFIXES, ...INTERNAL_ONLY_PREFIXES].sort())
  })

  it('tidak ada prefix yang muncul di kedua daftar', () => {
    const acc = new Set<string>(ACCOUNTING_ONLY_PREFIXES)
    for (const p of INTERNAL_ONLY_PREFIXES) expect(acc.has(p), p).toBe(false)
  })

  it('SETIAP prefix internal-only harus bisa dicapai role internal mana pun', () => {
    // Pagar untuk prefix internal-only berikutnya: kalau ada yang ditambahkan
    // tapi digerbangi lebih ketat, test ini merah sebelum loop-nya terjadi.
    for (const p of INTERNAL_ONLY_PREFIXES) {
      for (const r of ['owner', 'akunting', 'finance'] as const) {
        expect(isPathAllowedForRole(r, p), `${r} ${p}`).toBe(true)
      }
    }
  })

  it('CONTRACT_PREFIXES TIDAK ikut STAFF_ONLY — klien justru boleh ke sana', () => {
    for (const p of CONTRACT_PREFIXES) {
      expect((STAFF_ONLY_PREFIXES as readonly string[]).includes(p), p).toBe(false)
    }
  })
})

// ══ /kontrak — matriks LENGKAP per role ══════════════════════════
//
// Bentuk yang tidak dimiliki surface lain: klien BOLEH, akunting TIDAK.
// Karena itu ia diuji role-per-role secara eksplisit, bukan lewat konstanta
// STAFF_ROLES / USER_ALLOWED yang mengasumsikan "staf ⊇ klien".
describe('isPathAllowedForRole — /kontrak', () => {
  const HARAP: [Role, boolean][] = [
    ['owner', true],
    ['finance', true],
    ['user', true],
    ['akunting', false], // satu-satunya yang ditolak — pembukuan ≠ komersial
  ]

  it.each(HARAP)('%s → %s', (role, boleh) => {
    expect(isPathAllowedForRole(role, '/kontrak')).toBe(boleh)
  })

  it.each(HARAP)('%s → %s juga untuk sub-path /kontrak/<id>', (role, boleh) => {
    expect(isPathAllowedForRole(role, '/kontrak/abc-123')).toBe(boleh)
    expect(isPathAllowedForRole(role, '/kontrak/abc/edit')).toBe(boleh)
  })

  it('role KELIMA — yang belum terdaftar — DITOLAK (allowlist, bukan blocklist)', () => {
    // Role berikutnya tidak boleh mewarisi halaman komersial hanya karena tidak
    // ada di daftar larangan mana pun. Ini kegagalan yang sama yang dulu ada di
    // canAccessClientData & isPathAllowedForRole, dan arah kegagalannya harus
    // MENOLAK. Sengaja di-cast: nilainya memang belum ada di type Role.
    const rolebaru = 'marketing' as Role
    expect(isPathAllowedForRole(rolebaru, '/kontrak')).toBe(false)
    expect(isPathAllowedForRole(rolebaru, '/kontrak/abc')).toBe(false)
  })

  it('prefix match tidak bocor ke path yang cuma berawalan sama', () => {
    // '/kontraktor' BUKAN sub-path '/kontrak' → tidak boleh ikut tergerbangi.
    expect(isPathAllowedForRole('akunting', '/kontraktor')).toBe(true)
    expect(isPathAllowedForRole('user', '/kontraktor')).toBe(true)
  })

  it('akunting yang membuka /kontrak dilempar SEKALI lalu berhenti', () => {
    // Tujuan pantulannya (USER_HOME) wajib halaman yang akunting memang boleh,
    // kalau tidak ia ikut berputar seperti kasus finance 2026-08-06.
    expect(settle('akunting', '/kontrak', true)).toEqual(['/kontrak', USER_HOME])
  })

  it('owner/finance DENGAN klien aktif berhenti di /kontrak; user selalu berhenti', () => {
    for (const r of ['owner', 'finance'] as const) {
      expect(settle(r, '/kontrak', true), r).toEqual(['/kontrak'])
    }
    expect(settle('user', '/kontrak', false)).toEqual(['/kontrak'])
  })

  it('owner/finance TANPA klien aktif sampai di pemilih klien, bukan loop', () => {
    for (const r of ['owner', 'finance'] as const) {
      expect(() => settle(r, '/kontrak', false), r).not.toThrow()
      expect(settle(r, '/kontrak', false).at(-1), r).toBe('/admin-overview')
    }
  })
})
