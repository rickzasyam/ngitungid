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
      'dashboard', 'analytics', 'upload', 'jurnal', 'buku-besar', 'pembelian', 'mutasi-kas', 'hutang', 'laporan', 'kontrak',
      'coa-mapping', 'operational', 'settings',
    ])
  })

  it('akunting: semuanya KECUALI Kontrak', () => {
    // Akunting membukukan pekerjaan klien; katalog & kontrak komersial bukan
    // urusannya. Ini satu-satunya item yang staf kehilangan tapi klien punya.
    expect(ids('akunting')).toEqual([
      'dashboard', 'analytics', 'upload', 'jurnal', 'buku-besar', 'pembelian', 'mutasi-kas', 'hutang', 'laporan',
      'coa-mapping', 'operational', 'settings',
    ])
  })

  it('finance: tanpa surface kerja akunting, DENGAN Kontrak', () => {
    // Pembelian ikut: ia internalOnly, dan finance adalah orang dalam (D45).
    expect(ids('finance')).toEqual([
      'dashboard',
      'analytics',
      'pembelian',
      'mutasi-kas',
      'hutang',
      'laporan',
      'kontrak',
      'settings',
    ])
  })

  it('user (klien): seperti finance, TANPA Pembelian', () => {
    expect(ids('user')).toEqual(['dashboard', 'analytics', 'laporan', 'kontrak', 'settings'])
  })

  // Dulu keduanya identik. Sejak Pembelian memakai sumbu internalOnly (D45),
  // finance melihat satu item yang tidak dilihat klien — dan itu satu-satunya
  // bedanya. Test ini menyebut perbedaannya, bukan sekadar berhenti menuntut
  // kesamaan: kalau kelak ada item internalOnly kedua yang bocor ke klien,
  // selisihnya muncul di sini.
  it('finance = user PLUS Pembelian, tidak lebih', () => {
    const finance = ids('finance')
    const user = ids('user')
    expect(finance.filter(i => !user.includes(i))).toEqual(['pembelian', 'mutasi-kas', 'hutang'])
    expect(user.filter(i => !finance.includes(i))).toEqual([])
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
      'dashboard', 'analytics', 'upload', 'jurnal', 'buku-besar', 'pembelian', 'mutasi-kas', 'hutang', 'laporan', 'kontrak',
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
    // Kapsul yang mengukur saat loading lalu tidak pernah mengukur ulang akan
    // tertinggal sebanyak selisih indeksnya, jatuh di bawah item terakhir.
    // Jaraknya MELEBAR tiap kali surface akunting bertambah: 1 saat Jurnal
    // masuk, 2 saat Buku Besar menyusul, 3 sejak Mutasi Kas (semuanya tidak
    // dilihat finance setelah settle) — konsekuensi tidak mengukur ulang justru
    // makin kelihatan seiring waktu, bukan makin samar.
    expect(ids('finance', true).indexOf('kontrak')).toBe(9)
    expect(ids('finance', false).indexOf('kontrak')).toBe(6)
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
    expect(navKey(navItemsForRole('finance'))).toBe(
      'dashboard|analytics|pembelian|mutasi-kas|hutang|laporan|kontrak|settings'
    )
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

// ══ BUKU BESAR ═══════════════════════════════════════════════════
// Isinya jurnal yang SAMA, dibaca per akun — jadi ia duduk tepat sesudah
// Jurnal, dan gerbangnya wajib identik.
describe('Buku Besar', () => {
  it.each(['owner', 'akunting'] as const)('%s: Buku Besar tepat sesudah Jurnal', (role) => {
    const list = ids(role)
    expect(list.indexOf('buku-besar')).toBe(list.indexOf('jurnal') + 1)
  })

  it.each(['finance', 'user'] as const)('%s tidak melihat Buku Besar sama sekali', (role) => {
    expect(ids(role)).not.toContain('buku-besar')
  })

  it('bertanda staffOnly, persis seperti Jurnal', () => {
    const bb = NAV_ITEMS.find(i => i.id === 'buku-besar')!
    const jurnal = NAV_ITEMS.find(i => i.id === 'jurnal')!
    expect(bb.staffOnly).toBe(jurnal.staffOnly)
    expect(bb.contractOnly).toBeUndefined()
    expect(bb.comingSoon).toBeUndefined()
  })

  it('kedua surface jurnal terlihat oleh himpunan role yang SAMA', () => {
    // Kalau salah satunya kelak dilonggarkan sendirian, yang lebih ketat jadi
    // kosmetik: isinya bisa dibaca lewat pintu sebelah.
    for (const role of ['owner', 'akunting', 'finance', 'user'] as const) {
      const list = ids(role)
      expect(list.includes('buku-besar'), role).toBe(list.includes('jurnal'))
    }
  })
})

// ══ PEMBELIAN — SUMBU KETIGA: internalOnly ═══════════════════════════════
// Bukan pelonggaran staffOnly. Yang membedakan keduanya cuma finance, dan
// perbedaan itu keputusan (D45): finance melihat kewajiban klien, bukan
// pembukuannya.
describe('Pembelian', () => {
  it.each(['owner', 'akunting'] as const)('%s: Pembelian tepat sesudah Buku Besar', role => {
    const list = ids(role)
    expect(list.indexOf('pembelian')).toBe(list.indexOf('buku-besar') + 1)
  })

  it('finance MELIHAT Pembelian, tapi tidak Jurnal maupun Buku Besar', () => {
    const list = ids('finance')
    expect(list).toContain('pembelian')
    expect(list).not.toContain('jurnal')
    expect(list).not.toContain('buku-besar')
  })

  it('klien tidak melihat Pembelian sama sekali', () => {
    expect(ids('user')).not.toContain('pembelian')
  })

  it('bertanda internalOnly saja — bukan staffOnly, bukan contractOnly', () => {
    const p = NAV_ITEMS.find(i => i.id === 'pembelian')!
    expect(p.internalOnly).toBe(true)
    expect(p.staffOnly).toBeUndefined()
    expect(p.contractOnly).toBeUndefined()
    expect(p.comingSoon).toBeUndefined()
  })

  // canDoAccounting ⊂ isInternal, jadi item yang bertanda KEDUANYA akan ambigu:
  // urutan pemeriksaan yang terbalik diam-diam membuka surface akunting untuk
  // finance. Selama tidak ada item seperti itu, ambiguitasnya tidak pernah
  // sempat lahir — dan test inilah yang menjaganya tetap begitu.
  it('tidak ada item yang staffOnly DAN internalOnly sekaligus', () => {
    for (const i of NAV_ITEMS) expect(!!(i.staffOnly && i.internalOnly), i.id).toBe(false)
  })

  it('sumbu internalOnly hanya dipakai item yang memang dilihat finance', () => {
    const internal = NAV_ITEMS.filter(i => i.internalOnly).map(i => i.id)
    for (const id of internal) expect(ids('finance'), id).toContain(id)
  })
})
