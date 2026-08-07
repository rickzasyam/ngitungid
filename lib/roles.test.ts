import { describe, it, expect } from 'vitest'
import {
  isOwner, isInternal, canDoAccounting, canAccessClientData,
  ALL_CLIENT_ACCESS_ROLES, ROLE_LABEL, CREATABLE_ROLES, type Role,
} from './roles'

// isStaff() DIHAPUS dan dipecah jadi dua predikat. Dulu satu fungsi itu berarti
// DUA hal sekaligus — "pegawai internal" DAN "boleh mengerjakan akunting" — yang
// kebetulan selalu sama selama role-nya cuma owner/akunting/user. Test di bawah
// mengunci bahwa pemecahannya TIDAK mengubah perilaku ketiga role itu.
describe('isInternal — orang dalam NgitungID (lawan kata: klien)', () => {
  // Owner SENGAJA ikut: ia mewarisi semua kemampuan akunting. Kalau tidak,
  // owner malah tak bisa upload/mapping — padahal ia tingkat tertinggi.
  it('owner & akunting = orang dalam', () => {
    expect(isInternal('owner')).toBe(true)
    expect(isInternal('akunting')).toBe(true)
  })

  it('user (klien) BUKAN orang dalam', () => {
    expect(isInternal('user')).toBe(false)
  })

  // Sesi yang belum ter-resolve tidak boleh dianggap orang dalam walau sesaat.
  it('null/undefined bukan orang dalam (default paling sempit)', () => {
    expect(isInternal(null)).toBe(false)
    expect(isInternal(undefined)).toBe(false)
  })
})

describe('canDoAccounting — boleh mengubah data akuntansi klien', () => {
  it('owner & akunting boleh', () => {
    expect(canDoAccounting('owner')).toBe(true)
    expect(canDoAccounting('akunting')).toBe(true)
  })

  it('user (klien) tidak boleh', () => {
    expect(canDoAccounting('user')).toBe(false)
  })

  it('null/undefined tidak boleh', () => {
    expect(canDoAccounting(null)).toBe(false)
    expect(canDoAccounting(undefined)).toBe(false)
  })
})

describe('pemecahan isStaff TIDAK mengubah perilaku role yang sudah ada', () => {
  // Selama belum ada role internal-tanpa-akunting, kedua predikat WAJIB
  // identik untuk ketiga role lama. Begitu 'finance' masuk, test ini yang
  // memaksa perbedaannya dinyatakan dengan sadar (bukan diwarisi diam-diam).
  it('owner/akunting/user: isInternal === canDoAccounting', () => {
    for (const r of ['owner', 'akunting', 'user'] as const) {
      expect(isInternal(r), r).toBe(canDoAccounting(r))
    }
  })

  it('canDoAccounting adalah SUBSET dari isInternal', () => {
    for (const r of [...CREATABLE_ROLES, null, undefined]) {
      if (canDoAccounting(r)) expect(isInternal(r), String(r)).toBe(true)
    }
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
    expect(isInternal('akunting') && isOwner('akunting')).toBe(false)
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
  // Ketiganya bisa dibuat lewat form "Buat Akun" milik Owner. 'user' (klien)
  // ditambahkan 2026-07-19 — validasinya beda (WAJIB clientId), ditegakkan di
  // resolveNewAccountClientId, bukan di daftar ini.
  it('mencakup akunting, owner, user, dan finance', () => {
    expect(CREATABLE_ROLES).toEqual(['akunting', 'owner', 'user', 'finance'])
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

  // ── GAGAL TERTUTUP ──────────────────────────────────────────
  // Versi lama berbunyi `if (role !== 'user') return true`, sehingga SETIAP role
  // baru otomatis mendapat akses ke seluruh data setiap klien — tanpa satu baris
  // pun diubah dan tanpa satu test pun merah. Sekarang daftarnya allowlist, dan
  // test ini yang menjaga arah kegagalannya tetap menolak.
  it('role yang TIDAK terdaftar ditolak, walau bukan "user"', () => {
    // Sengaja memakai role yang belum pernah ada — 'finance' dulu dipakai di
    // sini, lalu resmi ditambahkan ke allowlist, dan test ini ikut merah.
    // Itu justru buktinya bekerja: daftar allowlist harus diubah dengan sadar.
    const unlisted = 'auditor' as Role
    expect(canAccessClientData(unlisted, null, CLIENT_A)).toBe(false)
    expect(canAccessClientData(unlisted, CLIENT_B, CLIENT_A)).toBe(false)
  })

  it('role tak dikenal masih boleh KLIENNYA SENDIRI kalau ownClientId cocok', () => {
    // Bukan penolakan total: aturannya sama dengan 'user' — hanya miliknya.
    expect(canAccessClientData('auditor' as Role, CLIENT_A, CLIENT_A)).toBe(true)
  })

  it('null/undefined role ditolak untuk klien mana pun', () => {
    expect(canAccessClientData(null, null, CLIENT_A)).toBe(false)
    expect(canAccessClientData(undefined, CLIENT_B, CLIENT_A)).toBe(false)
  })

  it('ALL_CLIENT_ACCESS_ROLES berisi persis owner, akunting & finance', () => {
    // 'user' TIDAK boleh masuk daftar ini — itu inti scoping antar-klien.
    expect([...ALL_CLIENT_ACCESS_ROLES]).toEqual(['owner', 'akunting', 'finance'])
    expect(ALL_CLIENT_ACCESS_ROLES).not.toContain('user')
  })
})

// ══ Role 'finance' (2026-08-06) ══════════════════════════════════
// Orang dalam yang TIDAK mengerjakan akunting. Ini role pertama yang memisahkan
// isInternal dari canDoAccounting; sebelum ini keduanya selalu identik.
describe('finance — orang dalam, bukan akunting', () => {
  it('finance ADALAH orang dalam', () => {
    expect(isInternal('finance')).toBe(true)
  })

  it('finance TIDAK boleh mengerjakan akunting', () => {
    // Inti pemisahan isStaff. Kalau ini true, finance mendapat Upload,
    // Extraction Review, COA Mapping, dan semua aksi tulis /laporan.
    expect(canDoAccounting('finance')).toBe(false)
  })

  it('finance bukan owner', () => {
    expect(isOwner('finance')).toBe(false)
  })

  it('predikat isInternal & canDoAccounting kini BERBEDA — itu maksudnya', () => {
    expect(isInternal('finance')).not.toBe(canDoAccounting('finance'))
  })

  it('finance boleh membaca data klien MANA PUN (ia yang membuat klien)', () => {
    const A = 'aaaaaaaa-0000-0000-0000-000000000001'
    const B = 'bbbbbbbb-0000-0000-0000-000000000002'
    expect(canAccessClientData('finance', null, A)).toBe(true)
    expect(canAccessClientData('finance', B, A)).toBe(true)
    expect(ALL_CLIENT_ACCESS_ROLES).toContain('finance')
  })

  it('punya label & bisa dibuat lewat Kelola Akun', () => {
    expect(ROLE_LABEL.finance).toBe('Finance')
    expect(CREATABLE_ROLES).toContain('finance')
  })

  it('owner/akunting/user TIDAK berubah oleh penambahan finance', () => {
    expect(isInternal('owner')).toBe(true)
    expect(isInternal('akunting')).toBe(true)
    expect(isInternal('user')).toBe(false)
    expect(canDoAccounting('owner')).toBe(true)
    expect(canDoAccounting('akunting')).toBe(true)
    expect(canDoAccounting('user')).toBe(false)
    expect(isOwner('owner')).toBe(true)
    expect(isOwner('akunting')).toBe(false)
  })
})

// ══ Menu kebab kartu klien (Admin Overview) ══════════════════════
// KEBIJAKANNYA yang diuji, bukan render-nya — project ini tidak punya setup
// component-testing, dan menambah React Testing Library demi satu menu tidak
// sepadan. Ketiga item di ClientCardMenu digerbangi persis oleh predikat di
// bawah, dan kebab-nya sendiri oleh isInternal di app/admin-overview/page.tsx.
describe('kebab klien: siapa melihat item apa', () => {
  const seesKebab = isInternal
  const seesEdit = isInternal      // kebab tampil → Edit selalu ikut
  const seesAssign = isOwner
  const seesDelete = isOwner       // 2026-08-06: dulu semua yang melihat kebab

  it('owner melihat Edit, Kelola Akunting, dan Hapus', () => {
    expect(seesKebab('owner')).toBe(true)
    expect(seesEdit('owner')).toBe(true)
    expect(seesAssign('owner')).toBe(true)
    expect(seesDelete('owner')).toBe(true)
  })

  it('akunting melihat Edit tapi TIDAK Hapus — pengurangan yang disengaja', () => {
    expect(seesEdit('akunting')).toBe(true)
    expect(seesDelete('akunting')).toBe(false)
    expect(seesAssign('akunting')).toBe(false)
  })

  it('finance melihat Edit tapi TIDAK Hapus', () => {
    expect(seesKebab('finance')).toBe(true)
    expect(seesEdit('finance')).toBe(true)
    expect(seesDelete('finance')).toBe(false)
    expect(seesAssign('finance')).toBe(false)
  })

  it('user (klien) tidak melihat kebab sama sekali', () => {
    expect(seesKebab('user')).toBe(false)
  })
})
