import { describe, it, expect } from 'vitest'
import {
  AUDIT_ENTITY_TYPES,
  isAuditEntityType,
  requiresEntityId,
  riwayatBertahanSetelahDihapus,
} from './audit'
import { JOURNAL_EVENTS } from './journal'

describe('AUDIT_ENTITY_TYPES', () => {
  it('empat entitas R2 plus dua yang lahir bersama modul pembelian & mutasi kas', () => {
    expect([...AUDIT_ENTITY_TYPES]).toEqual([
      'journal',
      'master_coa',
      'period_lock',
      'supplier',
      'purchase_invoice',
      'cash_mutation',
    ])
  })

  // Urutan di lib HARUS mengikuti urutan fisik enum di Postgres: empat nilai
  // asli dari CREATE TYPE 0014, lalu dua yang di-ADD VALUE di 0016. Menyusunnya
  // ulang di sini membuat perbandingan dengan migrasi jadi tidak berarti.
  it('dua entitas baru berada DI UJUNG, sesuai urutan ADD VALUE', () => {
    expect(AUDIT_ENTITY_TYPES.slice(-2)).toEqual(['purchase_invoice', 'cash_mutation'])
  })

  it('isAuditEntityType menolak yang tidak terdaftar, termasuk ejaan Indonesianya', () => {
    // 'jurnal' adalah salah ketik yang PALING mungkin terjadi di basis kode yang
    // komentarnya berbahasa Indonesia — dan pada kolom text ia akan tersimpan
    // diam-diam. Di DB yang menolaknya adalah enum; di sini predikat ini.
    for (const buruk of ['jurnal', 'Journal', '', 'coa', null, 42]) {
      expect(isAuditEntityType(buruk), String(buruk)).toBe(false)
    }
    for (const baik of AUDIT_ENTITY_TYPES) expect(isAuditEntityType(baik), baik).toBe(true)
  })
})

describe('riwayat yang bertahan setelah barisnya dihapus', () => {
  // Aturan umumnya: event dihapus bersama entitasnya (pengganti FK cascade).
  // purchase_invoice adalah pengecualian yang diminta tersurat oleh brief —
  // penghapusan invoice harus tercatat lengkap dengan isinya.
  it('hanya purchase_invoice', () => {
    expect(riwayatBertahanSetelahDihapus('purchase_invoice')).toBe(true)
    for (const t of ['journal', 'master_coa', 'period_lock', 'supplier', 'cash_mutation'] as const) {
      expect(riwayatBertahanSetelahDihapus(t), t).toBe(false)
    }
  })
})

describe('requiresEntityId', () => {
  it('jurnal WAJIB punya entity_id', () => {
    expect(requiresEntityId('journal')).toBe(true)
  })

  it('entitas lain boleh tanpa entity_id', () => {
    // Kunci periode dan event COA tingkat-klien (mis. ganti massal seluruh COA)
    // memang tidak menunjuk satu baris pun. Memaksakan id di situ = mengarang id.
    expect(requiresEntityId('period_lock')).toBe(false)
    expect(requiresEntityId('master_coa')).toBe(false)
    expect(requiresEntityId('supplier')).toBe(false)
  })
})

describe('daftar nama peristiwa jurnal', () => {
  it('tetap milik lib/journal.ts, bukan lib/audit.ts', () => {
    // R2 menyatukan TABELNYA, bukan kosakatanya: tiap entitas punya daftar
    // eventnya sendiri di lib masing-masing (§3.3). Kalau daftar itu pindah ke
    // modul audit, setiap fitur baru harus menyunting berkas milik bersama.
    expect(JOURNAL_EVENTS).toContain('posted')
    expect(JOURNAL_EVENTS).toContain('reversal_created')
    expect(AUDIT_ENTITY_TYPES as readonly string[]).not.toContain('posted')
  })
})
