import { describe, it, expect } from 'vitest'
import {
  FINANCE_VISIBLE_TABS,
  SETTINGS_TABS,
  USER_VISIBLE_TABS,
  isSettingsTabVisible,
  visibleSettingsTabs,
  type SettingsTabId,
} from './settings-tabs'

// Test ini adalah PAGAR REGRESI untuk perubahan 2026-08-04: tab Account dibuka
// untuk role user (klien) supaya semua orang bisa ganti password sendiri. Yang
// paling mudah salah adalah membuka Account lalu ikut membocorkan tab lain.
// Karena itu daftar untuk 'user' di-assert PERSIS, bukan sekadar "mengandung".

describe('visibleSettingsTabs', () => {
  it('user (klien) melihat PERSIS General + Master COA + Account', () => {
    expect(visibleSettingsTabs('user')).toEqual(['general', 'coa', 'account'])
  })

  it('user TIDAK melihat Analytics Display, Kelola Akun, maupun Notifications', () => {
    const visible = visibleSettingsTabs('user')
    expect(visible).not.toContain('analytics')
    expect(visible).not.toContain('users')
    expect(visible).not.toContain('notifications')
  })

  it('akunting melihat semua kecuali tab ownerOnly', () => {
    expect(visibleSettingsTabs('akunting')).toEqual([
      'general', 'coa', 'supplier', 'pembukuan', 'aturan-mutasi', 'analytics', 'account', 'notifications',
    ])
  })

  it('owner melihat semua tab', () => {
    expect(visibleSettingsTabs('owner')).toEqual(SETTINGS_TABS.map(t => t.id))
  })

  it('Kelola Akun hanya untuk owner', () => {
    expect(isSettingsTabVisible('owner', 'users')).toBe(true)
    expect(isSettingsTabVisible('akunting', 'users')).toBe(false)
    expect(isSettingsTabVisible('user', 'users')).toBe(false)
  })

  it('urutan mengikuti SETTINGS_TABS, bukan urutan filter', () => {
    for (const role of ['owner', 'akunting', 'user'] as const) {
      const visible = visibleSettingsTabs(role)
      const canonical = SETTINGS_TABS.map(t => t.id).filter(id => visible.includes(id))
      expect(visible).toEqual(canonical)
    }
  })
})

describe('isSettingsTabVisible — tab Account', () => {
  it('terlihat untuk SEMUA role (setiap orang harus bisa ganti password sendiri)', () => {
    expect(isSettingsTabVisible('owner', 'account')).toBe(true)
    expect(isSettingsTabVisible('akunting', 'account')).toBe(true)
    expect(isSettingsTabVisible('user', 'account')).toBe(true)
  })

  it('role null/undefined diperlakukan seperti user, bukan staf', () => {
    // Fallback client-context saat sesi belum termuat adalah 'user'; pastikan
    // nilai kosong tidak pernah membuka tab staf.
    expect(isSettingsTabVisible(null, 'users')).toBe(false)
    expect(isSettingsTabVisible(undefined, 'analytics')).toBe(false)
    expect(isSettingsTabVisible(null, 'account')).toBe(true)
  })
})

describe('konsistensi daftar', () => {
  it('USER_VISIBLE_TABS hanya berisi id yang benar-benar ada di SETTINGS_TABS', () => {
    const known = new Set(SETTINGS_TABS.map(t => t.id))
    for (const id of USER_VISIBLE_TABS) expect(known.has(id)).toBe(true)
  })

  it('tidak ada id duplikat', () => {
    const ids = SETTINGS_TABS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('id yang tidak dikenal tidak pernah terlihat', () => {
    expect(isSettingsTabVisible('owner', 'tidak-ada' as SettingsTabId)).toBe(false)
  })
})

// ══ Role 'finance' ═══════════════════════════════════════════════
describe('finance — General + Layanan + Account', () => {
  it('melihat PERSIS ketiganya', () => {
    // 'layanan' masuk sejak 2026-08-07 lewat flag commercialOnly, BUKAN lewat
    // FINANCE_VISIBLE_TABS — tab commercialOnly diperiksa lebih dulu.
    expect(visibleSettingsTabs('finance')).toEqual(['general', 'supplier', 'aturan-mutasi', 'layanan', 'account'])
  })

  it('TIDAK melihat Master COA, Analytics Display, Kelola Akun, Notifications', () => {
    // finance juga isInternal, jadi tanpa cabang khusus (yang diperiksa LEBIH
    // DULU) ia akan jatuh ke cabang orang-dalam dan mendapat semuanya.
    for (const id of ['coa', 'analytics', 'users', 'notifications'] as const) {
      expect(isSettingsTabVisible('finance', id), id).toBe(false)
    }
  })

  it('daftar role lain tidak bergeser', () => {
    expect(visibleSettingsTabs('user')).toEqual(['general', 'coa', 'account'])
    expect(visibleSettingsTabs('akunting')).toEqual(['general', 'coa', 'supplier', 'pembukuan', 'aturan-mutasi', 'analytics', 'account', 'notifications'])
    expect(visibleSettingsTabs('owner')).toEqual(SETTINGS_TABS.map(t => t.id))
  })
})

// ══ Tab Layanan (owner + finance) ════════════════════════════════
describe('tab Layanan — komersial, bukan akunting', () => {
  it('owner & finance MELIHAT', () => {
    expect(isSettingsTabVisible('owner', 'layanan')).toBe(true)
    expect(isSettingsTabVisible('finance', 'layanan')).toBe(true)
  })

  it('akunting TIDAK melihat — walau ia isInternal dan tab-nya bukan ownerOnly', () => {
    // Justru kasus yang paling mudah bocor: cabang isInternal akan
    // meloloskannya kalau commercialOnly tidak diperiksa lebih dulu.
    expect(isSettingsTabVisible('akunting', 'layanan')).toBe(false)
  })

  it('klien TIDAK melihat', () => {
    expect(isSettingsTabVisible('user', 'layanan')).toBe(false)
    expect(isSettingsTabVisible(null, 'layanan')).toBe(false)
  })

  it('daftar lengkap per role', () => {
    expect(visibleSettingsTabs('owner')).toEqual(SETTINGS_TABS.map(t => t.id))
    expect(visibleSettingsTabs('finance')).toEqual(['general', 'supplier', 'aturan-mutasi', 'layanan', 'account'])
    expect(visibleSettingsTabs('akunting')).toEqual(['general', 'coa', 'supplier', 'pembukuan', 'aturan-mutasi', 'analytics', 'account', 'notifications'])
    expect(visibleSettingsTabs('user')).toEqual(['general', 'coa', 'account'])
  })

  it('tab lain tidak ikut bergeser karena penambahan Layanan', () => {
    expect(isSettingsTabVisible('akunting', 'coa')).toBe(true)
    expect(isSettingsTabVisible('finance', 'coa')).toBe(false)
    expect(isSettingsTabVisible('akunting', 'users')).toBe(false)
    expect(isSettingsTabVisible('owner', 'users')).toBe(true)
  })
})

// ══ TAB SUPPLIER — R4: finance MELIHAT, tidak mengelola ══════════
// Pembelahannya ada di dua lapis yang berbeda dan keduanya perlu: tab ini
// TERLIHAT oleh finance (di sini), tapi dirender read-only lewat prop, dan
// API-nya menegakkan baca requireInternal / tulis requireAkunting. Menyembunyikan
// tombol bukan kontrol keamanan — yang menegakkan tetap penjaga di route.
describe('tab Supplier', () => {
  it('terlihat oleh owner dan akunting', () => {
    for (const r of ['owner', 'akunting'] as const) {
      expect(isSettingsTabVisible(r, 'supplier'), r).toBe(true)
    }
  })

  it('TERLIHAT oleh finance — R4, finance boleh melihat daftar rekanan', () => {
    expect(isSettingsTabVisible('finance', 'supplier')).toBe(true)
  })

  it('TIDAK terlihat oleh klien (D7)', () => {
    expect(isSettingsTabVisible('user', 'supplier')).toBe(false)
    expect(visibleSettingsTabs('user')).not.toContain('supplier')
  })

  it('duduk tepat sesudah Master COA di daftar tab', () => {
    const ids = SETTINGS_TABS.map(t => t.id)
    expect(ids.indexOf('supplier')).toBe(ids.indexOf('coa') + 1)
  })

  it('bukan ownerOnly maupun commercialOnly — sumbunya visibilitas biasa', () => {
    const tab = SETTINGS_TABS.find(t => t.id === 'supplier')!
    expect(tab.ownerOnly).toBeUndefined()
    expect(tab.commercialOnly).toBeUndefined()
  })
})

// ══ TAB PEMBUKUAN (M8) ═══════════════════════════════════════════
// Tab ini memegang sakelar D42 ("jurnal terposting boleh diedit"). Ia bukan
// setelan tampilan — ia mengubah apa yang boleh terjadi pada angka yang sudah
// diserahkan ke klien. Karena itu finance TIDAK melihatnya walau ia orang
// dalam, dan klien jelas tidak.
describe('tab Pembukuan', () => {
  it('terlihat oleh owner dan akunting', () => {
    for (const r of ['owner', 'akunting'] as const) {
      expect(isSettingsTabVisible(r, 'pembukuan'), r).toBe(true)
    }
  })

  it('TIDAK terlihat oleh finance — ia isInternal, jadi ini yang paling mudah bocor', () => {
    // Kalau cabang finance dihapus atau dipindah SESUDAH isInternal, assertion
    // ini yang merah lebih dulu.
    expect(isSettingsTabVisible('finance', 'pembukuan')).toBe(false)
    expect(visibleSettingsTabs('finance')).not.toContain('pembukuan')
  })

  it('TIDAK terlihat oleh klien maupun role kosong', () => {
    expect(isSettingsTabVisible('user', 'pembukuan')).toBe(false)
    expect(isSettingsTabVisible(null, 'pembukuan')).toBe(false)
    expect(isSettingsTabVisible(undefined, 'pembukuan')).toBe(false)
  })

  it('duduk tepat sesudah Supplier, sebelum Aturan Mutasi', () => {
    const ids = SETTINGS_TABS.map(t => t.id)
    expect(ids.indexOf('pembukuan')).toBe(ids.indexOf('supplier') + 1)
    expect(ids.indexOf('pembukuan')).toBe(ids.indexOf('aturan-mutasi') - 1)
  })

  it('bukan ownerOnly maupun commercialOnly', () => {
    const tab = SETTINGS_TABS.find(t => t.id === 'pembukuan')!
    expect(tab.ownerOnly).toBeUndefined()
    expect(tab.commercialOnly).toBeUndefined()
  })

  it('daftar role lain tidak ikut bergeser karena penambahannya', () => {
    expect(visibleSettingsTabs('user')).toEqual(['general', 'coa', 'account'])
    expect(visibleSettingsTabs('finance')).toEqual(['general', 'supplier', 'aturan-mutasi', 'layanan', 'account'])
  })
})

describe('tab Aturan Mutasi (S4, D57)', () => {
  it('terlihat oleh owner dan akunting', () => {
    expect(isSettingsTabVisible('owner', 'aturan-mutasi')).toBe(true)
    expect(isSettingsTabVisible('akunting', 'aturan-mutasi')).toBe(true)
  })

  it('TERLIHAT oleh finance (baca saja) — pola Supplier, API baca requireInternal', () => {
    expect(isSettingsTabVisible('finance', 'aturan-mutasi')).toBe(true)
    expect(FINANCE_VISIBLE_TABS).toContain('aturan-mutasi')
  })

  it('TIDAK terlihat oleh klien maupun role kosong', () => {
    expect(isSettingsTabVisible('user', 'aturan-mutasi')).toBe(false)
    expect(isSettingsTabVisible(null, 'aturan-mutasi')).toBe(false)
  })

  it('duduk tepat sesudah Pembukuan, sebelum Analytics Display', () => {
    const ids = SETTINGS_TABS.map(t => t.id)
    expect(ids.indexOf('aturan-mutasi')).toBe(ids.indexOf('pembukuan') + 1)
    expect(ids.indexOf('aturan-mutasi')).toBe(ids.indexOf('analytics') - 1)
  })

  it('bukan ownerOnly maupun commercialOnly', () => {
    const tab = SETTINGS_TABS.find(t => t.id === 'aturan-mutasi')!
    expect(tab.ownerOnly).toBeUndefined()
    expect(tab.commercialOnly).toBeUndefined()
  })
})
