import { describe, it, expect } from 'vitest'
import { navItemsForRole, navKey, NAV_ITEMS, type NavItemId } from './nav-items'
import type { Role } from './roles'

const ids = (role: Role | null | undefined, sessionLoading = false): NavItemId[] =>
  navItemsForRole(role, { sessionLoading }).map(i => i.id)

// ══ ISI & URUTAN PERSIS, PER ROLE ════════════════════════════════
// Bukan test kosmetik. Kapsul aktif sidebar diposisikan dari offsetTop item
// aktif, jadi INDEKS setiap item adalah bagian dari kontraknya: satu item yang
// disisipkan di tempat berbeda memindahkan kapsul ke slot yang salah, dan
// karena item aktif diwarnai --color-bg-sidebar, item itu ikut jadi tak terbaca.
// Itu persis bug 2026-08-09 (kapsul lime kosong parkir di bawah Settings).
describe('navItemsForRole — isi & urutan persis untuk keempat role', () => {
  it('owner: semuanya', () => {
    expect(ids('owner')).toEqual([
      'dashboard', 'analytics', 'upload', 'jurnal', 'laporan', 'kontrak',
      'coa-mapping', 'operational', 'settings',
    ])
  })

  it('akunting: semuanya KECUALI Kontrak', () => {
    // Akunting membukukan pekerjaan klien; katalog & kontrak komersial bukan
    // urusannya. Ini satu-satunya item yang staf kehilangan tapi klien punya.
    expect(ids('akunting')).toEqual([
      'dashboard', 'analytics', 'upload', 'jurnal', 'laporan',
      'coa-mapping', 'operational', 'settings',
    ])
  })

  it('finance: tanpa surface kerja akunting, DENGAN Kontrak', () => {
    expect(ids('finance')).toEqual(['dashboard', 'analytics', 'laporan', 'kontrak', 'settings'])
  })

  it('user (klien): sama dengan finance', () => {
    expect(ids('user')).toEqual(['dashboard', 'analytics', 'laporan', 'kontrak', 'settings'])
  })

  it('finance & user melihat daftar yang identik', () => {
    expect(ids('finance')).toEqual(ids('user'))
  })
})

describe('navItemsForRole — Kontrak duduk tepat SESUDAH Laporan', () => {
  it.each(['owner', 'finance', 'user'] as const)('%s', (role) => {
    const list = ids(role)
    expect(list.indexOf('kontrak')).toBe(list.indexOf('laporan') + 1)
  })

  it('posisinya SAMA relatif ke Laporan di semua role yang punya keduanya', () => {
    // Dulu Kontrak ditaruh sesudah COA Mapping. Untuk finance, COA Mapping
    // tersaring habis sehingga Kontrak seolah berpindah tempat antar role —
    // dan indeks yang berbeda itulah yang menggeser kapsul.
    for (const r of ['owner', 'finance', 'user'] as const) {
      const list = ids(r)
      expect(list[list.indexOf('laporan') + 1], r).toBe('kontrak')
    }
  })
})

describe('navItemsForRole — default menolak', () => {
  it('role tak dikenal & null hanya dapat item terbuka', () => {
    // Tidak ada staffOnly maupun contractOnly yang bocor ke role yang belum
    // terdaftar: kedua predikat penyusunnya allowlist.
    for (const r of ['marketing' as Role, null, undefined]) {
      expect(ids(r), String(r)).toEqual(['dashboard', 'analytics', 'laporan', 'settings'])
    }
  })
})

// ══ JENDELA LOADING ══════════════════════════════════════════════
describe('sessionLoading — semua item tampil, apa pun role-nya', () => {
  it.each(['owner', 'akunting', 'finance', 'user'] as const)('%s melihat daftar penuh', (role) => {
    expect(ids(role, true)).toEqual(NAV_ITEMS.map(i => i.id))
  })

  it('daftar penuhnya persis NAV_ITEMS, urutan apa adanya', () => {
    expect(ids(null, true)).toEqual([
      'dashboard', 'analytics', 'upload', 'jurnal', 'laporan', 'kontrak',
      'coa-mapping', 'operational', 'settings',
    ])
  })
})

// ══ REGRESI: daftar loading ≠ daftar settle ══════════════════════
// Inilah kondisi yang menyebabkan bug-nya. Test ini TIDAK menuntut keduanya
// sama — perilaku "tampilkan semua saat loading" memang disengaja (anti-kedip).
// Yang dijaga di sini adalah bahwa perbedaannya NYATA, sehingga siapa pun yang
// mengukur posisi item tahu ia WAJIB mengukur ulang saat daftarnya berubah.
describe('daftar berubah setelah sesi resolve — kapsul wajib mengukur ulang', () => {
  it.each(['akunting', 'finance', 'user'] as const)('%s: panjang daftar berubah', (role) => {
    expect(ids(role, true).length).toBeGreaterThan(ids(role, false).length)
  })

  it('finance: indeks Kontrak BERGESER antara loading dan settle', () => {
    // Indeks 5 saat loading → 3 sesudah settle. Kapsul yang mengukur saat
    // loading lalu tidak pernah mengukur ulang akan tertinggal DUA slot, jatuh
    // di bawah item terakhir. Jaraknya melebar dari 1 jadi 2 slot sejak Jurnal
    // ditambahkan (staffOnly, jadi finance tidak melihatnya setelah settle) —
    // artinya konsekuensi tidak mengukur ulang justru makin kelihatan.
    expect(ids('finance', true).indexOf('kontrak')).toBe(5)
    expect(ids('finance', false).indexOf('kontrak')).toBe(3)
  })

  it('finance: indeks lama melampaui daftar baru — kapsul jatuh di luar', () => {
    const loading = ids('finance', true)
    const settled = ids('finance', false)
    expect(loading.indexOf('kontrak')).toBeGreaterThanOrEqual(settled.length - 1)
  })

  it('owner: daftarnya TIDAK berubah, jadi ia tidak pernah kena bug ini', () => {
    // Menjelaskan kenapa bug-nya cuma terlihat pada finance/user/akunting.
    expect(ids('owner', true)).toEqual(ids('owner', false))
  })

  it('navKey ikut berubah persis ketika daftarnya berubah', () => {
    for (const r of ['akunting', 'finance', 'user'] as const) {
      expect(navKey(navItemsForRole(r, { sessionLoading: true })), r)
        .not.toBe(navKey(navItemsForRole(r, { sessionLoading: false })))
    }
    expect(navKey(navItemsForRole('owner', { sessionLoading: true })))
      .toBe(navKey(navItemsForRole('owner', { sessionLoading: false })))
  })

  it('navKey stabil untuk daftar yang sama (tidak memicu ukur-ulang palsu)', () => {
    expect(navKey(navItemsForRole('finance'))).toBe(navKey(navItemsForRole('finance')))
    expect(navKey(navItemsForRole('finance'))).toBe('dashboard|analytics|laporan|kontrak|settings')
  })
})

// ══ Bentuk data ══════════════════════════════════════════════════
describe('NAV_ITEMS', () => {
  it('setiap item punya id unik & label', () => {
    const seen = new Set<string>()
    for (const i of NAV_ITEMS) {
      expect(i.label, i.id).toBeTruthy()
      expect(seen.has(i.id), i.id).toBe(false)
      seen.add(i.id)
    }
  })

  it('hanya Operational yang comingSoon', () => {
    expect(NAV_ITEMS.filter(i => i.comingSoon).map(i => i.id)).toEqual(['operational'])
  })

  it('tidak ada item yang staffOnly DAN contractOnly sekaligus', () => {
    // Keduanya sumbu berbeda (akunting lolos yang satu, ditolak yang lain).
    // Item yang memakai keduanya akan ambigu; kalau suatu saat perlu, putuskan
    // urutan pemeriksaannya dengan sadar — jangan biarkan kebetulan.
    for (const i of NAV_ITEMS) expect(!!(i.staffOnly && i.contractOnly), i.id).toBe(false)
  })
})

// ══ JURNAL ═══════════════════════════════════════════════════════
// Jurnal duduk tepat SESUDAH Upload: keduanya pintu masuk DATA, dan keduanya
// staffOnly sehingga jaraknya tidak pernah berubah antar role.
describe('Jurnal', () => {
  it.each(['owner', 'akunting'] as const)('%s: Jurnal tepat sesudah Upload', (role) => {
    const list = ids(role)
    expect(list.indexOf('jurnal')).toBe(list.indexOf('upload') + 1)
  })

  it.each(['finance', 'user'] as const)('%s tidak melihat Jurnal sama sekali', (role) => {
    expect(ids(role)).not.toContain('jurnal')
  })

  it('Jurnal bertanda staffOnly, sumbu yang sama dengan Upload', () => {
    const jurnal = NAV_ITEMS.find(i => i.id === 'jurnal')!
    expect(jurnal.staffOnly).toBe(true)
    expect(jurnal.contractOnly).toBeUndefined()
    expect(jurnal.comingSoon).toBeUndefined()
  })
})
