import { describe, it, expect } from 'vitest'
import { contractActions } from './contract-actions'
import type { Role } from './roles'

// ══ KLIEN READ-ONLY ══════════════════════════════════════════════
// Halaman Kontrak adalah satu-satunya surface tempat role 'user' punya akses
// TAPI tidak boleh menulis. Di halaman lain klien tidak masuk sama sekali,
// jadi pertanyaan "apakah tombolnya tampil" tidak pernah muncul — di sini
// muncul, dan hanya kode UI yang menjawabnya.
describe('contractActions — role user (klien) hanya boleh melihat', () => {
  const a = contractActions('user')

  it('boleh membuka halaman & preview dokumen', () => {
    expect(a.lihat).toBe(true)
    expect(a.preview).toBe(true)
  })

  it('TIDAK boleh Kontrak Baru, Ganti, maupun Hapus', () => {
    expect(a.buat).toBe(false)
    expect(a.ganti).toBe(false)
    expect(a.hapus).toBe(false)
  })

  it('TIDAK boleh "+ Layanan Baru" — itu menulis ke katalog GLOBAL', () => {
    // GET /api/layanan pun digerbangi requireInternal, jadi klien bahkan tidak
    // punya katalognya. Tombol yang tampil di sini akan gagal dua kali.
    expect(a.layananBaru).toBe(false)
  })

  it('SETIAP aksi tulis false, tanpa terkecuali', () => {
    const { lihat, preview, ...tulis } = a
    expect(lihat && preview).toBe(true)
    expect(Object.values(tulis).some(Boolean)).toBe(false)
  })
})

describe('contractActions — owner & finance boleh semuanya', () => {
  it.each(['owner', 'finance'] as const)('%s', (role) => {
    const a = contractActions(role)
    expect(Object.values(a).every(Boolean)).toBe(true)
  })
})

describe('contractActions — akunting tidak boleh apa pun di sini', () => {
  const a = contractActions('akunting')

  it('tidak bisa melihat halamannya, jadi tidak ada aksi yang berlaku', () => {
    expect(Object.values(a).some(Boolean)).toBe(false)
  })

  it('khususnya: tidak boleh menulis katalog Layanan', () => {
    // Akunting membukukan pekerjaan klien; ia tidak menentukan jasa apa yang
    // dijual. Persis pembagian canManageCommercial vs canDoAccounting.
    expect(a.layananBaru).toBe(false)
  })
})

describe('contractActions — default menolak', () => {
  it('null / undefined: tidak ada aksi', () => {
    for (const r of [null, undefined]) {
      expect(Object.values(contractActions(r)).some(Boolean), String(r)).toBe(false)
    }
  })

  it('role yang belum terdaftar: tidak ada aksi', () => {
    // Kedua predikat penyusunnya allowlist, jadi arah kegagalannya menolak.
    expect(Object.values(contractActions('marketing' as Role)).some(Boolean)).toBe(false)
  })
})

describe('contractActions — aksi tulis selalu SUBSET dari lihat', () => {
  it('tidak ada role yang punya tombol tulis tanpa boleh membuka halamannya', () => {
    const semua: (Role | null | undefined)[] = [
      'owner', 'akunting', 'user', 'finance', null, undefined, 'marketing' as Role,
    ]
    for (const r of semua) {
      const a = contractActions(r)
      if (a.buat || a.ganti || a.hapus || a.layananBaru) {
        expect(a.lihat, String(r)).toBe(true)
      }
    }
  })
})
