import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ALASAN_BUKA_MIN,
  canLock,
  canUnlock,
  isDateLocked,
  latestLock,
  validateLockInput,
  validateUnlockReason,
} from './period-lock'

const kunci = (...t: string[]) => t.map(terkunciSampai => ({ terkunciSampai }))

describe('latestLock & isDateLocked', () => {
  it('belum pernah dikunci → tidak ada yang terkunci', () => {
    expect(latestLock([])).toBeNull()
    expect(isDateLocked('2020-01-01', [])).toBe(false)
  })

  it('batasnya INKLUSIF: tanggal kunci sendiri terkunci, sehari sesudahnya tidak', () => {
    const l = kunci('2026-09-30')
    expect(isDateLocked('2026-09-30', l)).toBe(true)
    expect(isDateLocked('2026-09-29', l)).toBe(true)
    expect(isDateLocked('2026-10-01', l)).toBe(false)
  })

  it('yang berlaku = terkunciSampai TERBESAR, apa pun urutan barisnya', () => {
    const l = kunci('2026-08-31', '2026-09-30', '2026-07-31')
    expect(latestLock(l)?.terkunciSampai).toBe('2026-09-30')
    expect(isDateLocked('2026-09-15', l)).toBe(true)
    expect(isDateLocked('2026-10-01', l)).toBe(false)
  })

  // Perbandingan string YMD = perbandingan kalender — termasuk lintas tahun.
  it('lintas tahun dan akhir bulan terbaca benar tanpa objek Date', () => {
    const l = kunci('2025-12-31')
    expect(isDateLocked('2025-12-31', l)).toBe(true)
    expect(isDateLocked('2026-01-01', l)).toBe(false)
    expect(isDateLocked('2024-02-29', kunci('2024-02-28'))).toBe(false)
  })
})

describe('validateLockInput', () => {
  const hariIni = '2026-10-26'

  it('menerima tanggal valid yang maju dari kunci berlaku', () => {
    expect(validateLockInput({ terkunciSampai: '2026-09-30' }, { latest: null, hariIni })).toEqual({
      ok: true,
      value: { terkunciSampai: '2026-09-30' },
    })
    expect(validateLockInput({ terkunciSampai: '2026-10-26' }, { latest: { terkunciSampai: '2026-09-30' }, hariIni }).ok).toBe(true)
  })

  it('menolak format salah dan tanggal mustahil', () => {
    for (const t of [undefined, '', '30/09/2026', '2026-02-30', '2026-9-30', 20260930]) {
      expect(validateLockInput({ terkunciSampai: t }, { latest: null, hariIni }).ok).toBe(false)
    }
  })

  it('menolak tanggal di masa depan', () => {
    const r = validateLockInput({ terkunciSampai: '2026-10-27' }, { latest: null, hariIni })
    expect(r.ok).toBe(false)
  })

  // Mundur = membuka sebagian — itu jalur owner + alasan, bukan jalur mengunci.
  it('menolak tanggal yang tidak maju (sama atau mundur dari kunci berlaku)', () => {
    const latest = { terkunciSampai: '2026-09-30' }
    expect(validateLockInput({ terkunciSampai: '2026-09-30' }, { latest, hariIni }).ok).toBe(false)
    expect(validateLockInput({ terkunciSampai: '2026-08-31' }, { latest, hariIni }).ok).toBe(false)
  })

  it('pesannya menyebut tanggal terformat, bukan YYYY-MM-DD (temuan CP-13)', () => {
    const r = validateLockInput({ terkunciSampai: '2026-08-31' }, { latest: { terkunciSampai: '2026-09-30' }, hariIni })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('30 Sep 2026')
    expect(r.error).not.toContain('2026-09-30')
  })
})

describe('validateUnlockReason', () => {
  it(`alasan wajib, minimal ${ALASAN_BUKA_MIN} karakter sesudah di-trim`, () => {
    expect(validateUnlockReason(undefined).ok).toBe(false)
    expect(validateUnlockReason('   koreksi   ').ok).toBe(false)
    expect(validateUnlockReason('  Koreksi jurnal gaji  ')).toEqual({ ok: true, value: 'Koreksi jurnal gaji' })
  })
})

describe('hak akses (D17)', () => {
  it('mengunci = owner & akunting; finance & klien tidak', () => {
    expect(canLock('owner')).toBe(true)
    expect(canLock('akunting')).toBe(true)
    expect(canLock('finance')).toBe(false)
    expect(canLock('user')).toBe(false)
    expect(canLock(null)).toBe(false)
  })

  it('membuka = owner SAJA', () => {
    expect(canUnlock('owner')).toBe(true)
    expect(canUnlock('akunting')).toBe(false)
    expect(canUnlock('finance')).toBe(false)
    expect(canUnlock(null)).toBe(false)
  })
})

describe('skema period_locks (migrasi 0020)', () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').split('\r\n').join('\n')
  const SQL = read('lib', 'db', 'migrations', '0020_period_locks.sql')
  const JOURNAL = JSON.parse(read('lib', 'db', 'migrations', 'meta', '_journal.json')) as { entries: { idx: number; tag: string }[] }

  it('0020 hanya MEMBUAT period_locks — nol DROP, nol ALTER tabel lain', () => {
    expect(SQL).toContain('CREATE TABLE "period_locks"')
    expect(SQL).not.toMatch(/DROP|ALTER TABLE "(?!period_locks)/)
    expect(SQL).not.toContain('CREATE TYPE')
  })

  it('tidak ada kolom status/aktif — terkunci DITURUNKAN (P3)', () => {
    expect(SQL).not.toMatch(/"(status|aktif|is_active)"/)
  })

  it('created_at bertimezone (D24); pengunci RESTRICT, klien CASCADE', () => {
    expect(SQL).toContain('"created_at" timestamp with time zone')
    expect(SQL).toContain('REFERENCES "public"."users"("id") ON DELETE restrict')
    expect(SQL).toContain('REFERENCES "public"."clients"("id") ON DELETE cascade')
  })

  it('terdaftar di jurnal migrasi sebagai idx 20', () => {
    expect(JOURNAL.entries.find(e => e.idx === 20)?.tag).toBe('0020_period_locks')
  })
})
