import { describe, it, expect, vi, beforeEach } from 'vitest'

// auth() menyentuh DB & NextAuth — di-mock supaya guard bisa diuji murni
// terhadap ROLE-nya, tanpa perlu sesi/login sungguhan.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

import { auth } from '@/lib/auth'
import {
  requireUser, requireAkunting, requireOwner, requireInternal, requireFinance, requireCommercial,
} from './guards'

const authMock = vi.mocked(auth)

/** Sesi palsu dengan role tertentu; null = belum login. */
const asRole = (role: string | null) =>
  role === null
    ? null
    : { user: { role, clientId: null, name: 'Uji', email: 'uji@example.com' }, expires: '' }

beforeEach(() => authMock.mockReset())

describe('requireOwner — pertahanan privilege escalation', () => {
  // INI inti-nya: akunting TIDAK boleh menembus endpoint owner-only
  // (buat akun, assign akunting ke klien).
  it('akunting DITOLAK dengan 403', async () => {
    authMock.mockResolvedValue(asRole('akunting') as never)
    const g = await requireOwner()
    expect('error' in g).toBe(true)
    expect(g.error?.status).toBe(403)
    expect(g.user).toBeUndefined()
  })

  it('user (klien) DITOLAK dengan 403', async () => {
    authMock.mockResolvedValue(asRole('user') as never)
    const g = await requireOwner()
    expect(g.error?.status).toBe(403)
  })

  it('tanpa sesi → 401 (bukan 403)', async () => {
    authMock.mockResolvedValue(null as never)
    const g = await requireOwner()
    expect(g.error?.status).toBe(401)
  })

  it('owner lolos', async () => {
    authMock.mockResolvedValue(asRole('owner') as never)
    const g = await requireOwner()
    expect('error' in g).toBe(false)
    expect(g.user?.role).toBe('owner')
  })

  // Role yang tidak dikenal (mis. JWT lama berisi 'admin' dari sebelum migrasi)
  // harus DITOLAK, bukan diloloskan karena "bukan user biasa".
  it('role warisan "admin" (JWT lama) DITOLAK', async () => {
    authMock.mockResolvedValue(asRole('admin') as never)
    const g = await requireOwner()
    expect(g.error?.status).toBe(403)
  })
})

describe('requireAkunting — surface kerja harian', () => {
  it('owner lolos (mewarisi kemampuan akunting)', async () => {
    authMock.mockResolvedValue(asRole('owner') as never)
    const g = await requireAkunting()
    expect('error' in g).toBe(false)
    expect(g.user?.role).toBe('owner')
  })

  it('akunting lolos', async () => {
    authMock.mockResolvedValue(asRole('akunting') as never)
    const g = await requireAkunting()
    expect('error' in g).toBe(false)
  })

  it('user (klien) DITOLAK 403 — tidak boleh upload/mapping', async () => {
    authMock.mockResolvedValue(asRole('user') as never)
    const g = await requireAkunting()
    expect(g.error?.status).toBe(403)
  })

  it('tanpa sesi → 401', async () => {
    authMock.mockResolvedValue(null as never)
    const g = await requireAkunting()
    expect(g.error?.status).toBe(401)
  })

  it('role warisan "admin" (JWT lama) DITOLAK — harus login ulang', async () => {
    authMock.mockResolvedValue(asRole('admin') as never)
    const g = await requireAkunting()
    expect(g.error?.status).toBe(403)
  })
})

describe('requireUser — cukup login apa pun', () => {
  it.each(['owner', 'akunting', 'user'])('%s lolos', async role => {
    authMock.mockResolvedValue(asRole(role) as never)
    const g = await requireUser()
    expect('error' in g).toBe(false)
  })

  it('tanpa sesi → 401', async () => {
    authMock.mockResolvedValue(null as never)
    const g = await requireUser()
    expect(g.error?.status).toBe(401)
  })
})

// ══ Role 'finance' (2026-08-06) ══════════════════════════════════
describe('finance di lapisan API', () => {
  it('DITOLAK requireAkunting — tidak boleh upload/extract/mapping', async () => {
    // Inti keputusannya: finance TIDAK dilipat ke requireAkunting. Kalau test
    // ini merah, finance mendapat POST /api/upload, retry-extract, mapping,
    // dan semua aksi tulis laporan sekaligus.
    authMock.mockResolvedValue(asRole('finance') as never)
    const g = await requireAkunting()
    expect('error' in g).toBe(true)
    expect(g.error?.status).toBe(403)
  })

  it('DITOLAK requireOwner', async () => {
    authMock.mockResolvedValue(asRole('finance') as never)
    const g = await requireOwner()
    expect(g.error?.status).toBe(403)
  })

  it('DITERIMA requireInternal — boleh buat & ubah klien', async () => {
    authMock.mockResolvedValue(asRole('finance') as never)
    const g = await requireInternal()
    expect('error' in g).toBe(false)
    expect(g.user?.role).toBe('finance')
  })

  it('DITERIMA requireUser — Dashboard/Analytics/Laporan tetap terbuka', async () => {
    authMock.mockResolvedValue(asRole('finance') as never)
    const g = await requireUser()
    expect('error' in g).toBe(false)
  })

  it('DITERIMA requireFinance', async () => {
    authMock.mockResolvedValue(asRole('finance') as never)
    const g = await requireFinance()
    expect('error' in g).toBe(false)
  })
})

describe('requireInternal — orang dalam, bukan klien', () => {
  it('owner & akunting diterima', async () => {
    for (const r of ['owner', 'akunting']) {
      authMock.mockResolvedValue(asRole(r) as never)
      expect('error' in (await requireInternal()), r).toBe(false)
    }
  })

  it('user (klien) DITOLAK 403', async () => {
    authMock.mockResolvedValue(asRole('user') as never)
    expect((await requireInternal()).error?.status).toBe(403)
  })

  it('tanpa sesi → 401', async () => {
    authMock.mockResolvedValue(null as never)
    expect((await requireInternal()).error?.status).toBe(401)
  })
})

describe('requireFinance — TIDAK sama dengan requireAkunting', () => {
  it('owner ikut lolos (mewarisi, konsisten dgn hirarki guard lain)', async () => {
    authMock.mockResolvedValue(asRole('owner') as never)
    expect('error' in (await requireFinance())).toBe(false)
  })

  it('akunting DITOLAK — finance bukan turunan akunting', async () => {
    authMock.mockResolvedValue(asRole('akunting') as never)
    expect((await requireFinance()).error?.status).toBe(403)
  })

  it('user DITOLAK', async () => {
    authMock.mockResolvedValue(asRole('user') as never)
    expect((await requireFinance()).error?.status).toBe(403)
  })
})

// ══ requireCommercial — matriks role master Layanan ══════════════
describe('requireCommercial — owner + finance, TANPA akunting', () => {
  it('owner diterima', async () => {
    authMock.mockResolvedValue(asRole('owner') as never)
    expect('error' in (await requireCommercial())).toBe(false)
  })

  it('finance diterima', async () => {
    authMock.mockResolvedValue(asRole('finance') as never)
    expect('error' in (await requireCommercial())).toBe(false)
  })

  it('akunting DITOLAK 403 — ia membukukan, bukan menentukan yang dijual', async () => {
    authMock.mockResolvedValue(asRole('akunting') as never)
    expect((await requireCommercial()).error?.status).toBe(403)
  })

  it('user (klien) DITOLAK 403', async () => {
    authMock.mockResolvedValue(asRole('user') as never)
    expect((await requireCommercial()).error?.status).toBe(403)
  })

  it('tanpa sesi → 401 (bukan 403)', async () => {
    authMock.mockResolvedValue(null as never)
    expect((await requireCommercial()).error?.status).toBe(401)
  })

  it('BACA layanan lebih longgar daripada TULIS: akunting lolos requireInternal', async () => {
    // GET /api/layanan pakai requireInternal — akunting perlu melihat katalog
    // untuk memahami kontrak klien yang ia bukukan, ia hanya tak boleh mengubah.
    authMock.mockResolvedValue(asRole('akunting') as never)
    expect('error' in (await requireInternal())).toBe(false)
    expect((await requireCommercial()).error?.status).toBe(403)
  })
})
