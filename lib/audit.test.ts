import { describe, it, expect } from 'vitest'
import { AUDIT_ENTITY_TYPES, isAuditEntityType, requiresEntityId } from './audit'
import { JOURNAL_EVENTS } from './journal'

describe('AUDIT_ENTITY_TYPES', () => {
  it('memuat tepat empat entitas yang disepakati R2', () => {
    expect([...AUDIT_ENTITY_TYPES]).toEqual(['journal', 'master_coa', 'period_lock', 'supplier'])
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
