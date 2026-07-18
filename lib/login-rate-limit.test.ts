import { describe, it, expect } from 'vitest'
import {
  isLocked,
  registerFailure,
  lockRemainingMs,
  MAX_FAILED_ATTEMPTS,
  ATTEMPT_WINDOW_MS,
  LOCKOUT_MS,
  type AttemptRecord,
} from './login-rate-limit'

const NOW = new Date('2026-07-18T10:00:00Z')
/** Waktu `ms` milidetik sebelum NOW. */
const agoMs = (ms: number) => new Date(NOW.getTime() - ms)

/** Simulasikan n kegagalan beruntun (tanpa jeda) mulai dari record kosong,
 *  mengembalikan state terakhir sebagai AttemptRecord. */
const failNTimes = (n: number, now: Date = NOW): AttemptRecord => {
  let rec: AttemptRecord | null = null
  for (let i = 0; i < n; i++) {
    rec = registerFailure(rec, now)
  }
  return rec as AttemptRecord
}

describe('registerFailure — akumulasi dalam window', () => {
  it('gagal pertama (record kosong) → hitungan 1, belum terkunci', () => {
    const next = registerFailure(null, NOW)
    expect(next.failedCount).toBe(1)
    expect(next.lockedUntil).toBeNull()
    expect(next.windowStart).toEqual(NOW)
  })

  it('gagal berturut menaikkan hitungan dalam window yang sama', () => {
    const rec = failNTimes(3)
    expect(rec.failedCount).toBe(3)
    expect(rec.lockedUntil).toBeNull()
    // windowStart tidak bergeser selama masih di window yang sama.
    expect(new Date(rec.windowStart as Date).getTime()).toBe(NOW.getTime())
  })

  it('tepat di MAX_FAILED_ATTEMPTS → terkunci selama LOCKOUT_MS', () => {
    const rec = failNTimes(MAX_FAILED_ATTEMPTS)
    expect(rec.failedCount).toBe(MAX_FAILED_ATTEMPTS)
    expect(rec.lockedUntil).not.toBeNull()
    expect((rec.lockedUntil as Date).getTime()).toBe(NOW.getTime() + LOCKOUT_MS)
    expect(isLocked(rec, NOW)).toBe(true)
  })

  it('satu di bawah ambang → belum terkunci', () => {
    const rec = failNTimes(MAX_FAILED_ATTEMPTS - 1)
    expect(isLocked(rec, NOW)).toBe(false)
    expect(rec.lockedUntil).toBeNull()
  })
})

describe('isLocked', () => {
  it('record null → tidak pernah terkunci', () => {
    expect(isLocked(null, NOW)).toBe(false)
    expect(isLocked(undefined, NOW)).toBe(false)
  })

  it('lockedUntil di masa depan → terkunci', () => {
    expect(isLocked({ failedCount: 5, windowStart: NOW, lockedUntil: agoMs(-60_000) }, NOW)).toBe(true)
  })

  it('lockedUntil sudah lewat → tidak terkunci lagi', () => {
    expect(isLocked({ failedCount: 5, windowStart: agoMs(LOCKOUT_MS + 1), lockedUntil: agoMs(1) }, NOW)).toBe(false)
  })

  it('lockedUntil null → tidak terkunci walau hitungan tinggi', () => {
    expect(isLocked({ failedCount: 4, windowStart: NOW, lockedUntil: null }, NOW)).toBe(false)
  })
})

describe('registerFailure — reset window & siklus lock', () => {
  it('gagal setelah window kedaluwarsa → hitungan mulai dari 1 lagi', () => {
    const stale: AttemptRecord = { failedCount: 4, windowStart: agoMs(ATTEMPT_WINDOW_MS + 1), lockedUntil: null }
    const next = registerFailure(stale, NOW)
    expect(next.failedCount).toBe(1)
    expect(next.windowStart).toEqual(NOW)
  })

  it('tepat DI batas window masih diakumulasi (belum kedaluwarsa)', () => {
    const edge: AttemptRecord = { failedCount: 2, windowStart: agoMs(ATTEMPT_WINDOW_MS), lockedUntil: null }
    const next = registerFailure(edge, NOW)
    expect(next.failedCount).toBe(3)
  })

  it('gagal setelah lock lepas → hitungan reset, tidak langsung terkunci lagi', () => {
    const expiredLock: AttemptRecord = {
      failedCount: MAX_FAILED_ATTEMPTS,
      windowStart: agoMs(LOCKOUT_MS + 1_000),
      lockedUntil: agoMs(1_000), // lock sudah lewat
    }
    const next = registerFailure(expiredLock, NOW)
    expect(next.failedCount).toBe(1)
    expect(next.lockedUntil).toBeNull()
  })
})

describe('registerFailure — bentuk input dari DB', () => {
  it('menerima windowStart/lockedUntil berupa string ISO', () => {
    const rec: AttemptRecord = {
      failedCount: MAX_FAILED_ATTEMPTS - 1,
      windowStart: NOW.toISOString(),
      lockedUntil: null,
    }
    const next = registerFailure(rec, NOW)
    expect(next.failedCount).toBe(MAX_FAILED_ATTEMPTS)
    expect(next.lockedUntil).not.toBeNull()
  })
})

describe('lockRemainingMs', () => {
  it('tidak terkunci → 0', () => {
    expect(lockRemainingMs(null, NOW)).toBe(0)
    expect(lockRemainingMs({ failedCount: 1, windowStart: NOW, lockedUntil: null }, NOW)).toBe(0)
  })

  it('terkunci → sisa waktu positif, tidak pernah negatif', () => {
    const rec = failNTimes(MAX_FAILED_ATTEMPTS)
    expect(lockRemainingMs(rec, NOW)).toBe(LOCKOUT_MS)
    // Setelah lewat, clamp ke 0 (bukan negatif).
    const after = new Date(NOW.getTime() + LOCKOUT_MS + 5_000)
    expect(lockRemainingMs(rec, after)).toBe(0)
  })
})

describe('parameter waras', () => {
  it('ambang & durasi bernilai wajar', () => {
    expect(MAX_FAILED_ATTEMPTS).toBeGreaterThanOrEqual(3)
    expect(ATTEMPT_WINDOW_MS).toBeGreaterThan(0)
    expect(LOCKOUT_MS).toBeGreaterThan(0)
  })
})
