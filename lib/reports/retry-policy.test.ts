import { describe, it, expect } from 'vitest'
import { retryState, STALE_EXTRACTING_MS } from './retry-policy'

const NOW = new Date('2026-07-17T10:00:00Z')
/** Waktu mulai percobaan, `ms` milidetik sebelum NOW. */
const agoMs = (ms: number) => new Date(NOW.getTime() - ms)

const state = (over: Partial<Parameters<typeof retryState>[0]> = {}) =>
  retryState({ status: 'extracting', updatedAt: agoMs(0), hasPdf: true, now: NOW, ...over })

describe('retryState — laporan macet di "extracting"', () => {
  // Satu invocation upload mustahil hidup > maxDuration (60s), jadi yang masih
  // 'extracting' jauh setelah ambang pasti yatim — bukan sedang diproses.
  it('extracting yang sudah lewat ambang → retriable', () => {
    expect(state({ updatedAt: agoMs(STALE_EXTRACTING_MS + 1_000) })).toBe('retriable')
  })

  it('extracting yang baru mulai → in-progress (jangan diganggu)', () => {
    expect(state({ updatedAt: agoMs(5_000) })).toBe('in-progress')
  })

  it('tepat DI ambang masih in-progress (harus melewatinya dulu)', () => {
    expect(state({ updatedAt: agoMs(STALE_EXTRACTING_MS) })).toBe('in-progress')
  })

  it('ambangnya jauh di atas maxDuration route upload (60s)', () => {
    expect(STALE_EXTRACTING_MS).toBeGreaterThan(60_000)
  })
})

describe('retryState — status lain', () => {
  // Catch di route upload mengembalikan status ke 'uploaded' saat ekstraksi
  // gagal "sopan" → aman di-retry kapan pun, tak perlu tunggu ambang.
  it('uploaded (ekstraksi gagal) → retriable tanpa menunggu', () => {
    expect(state({ status: 'uploaded', updatedAt: agoMs(0) })).toBe('retriable')
  })

  // Retry menghapus line item lama; untuk laporan yang sudah terekstrak itu
  // berarti membuang hasil kerja (termasuk mapping). Jalurnya "Ganti file".
  it.each(['review', 'mapped', 'confirmed'])('%s → not-applicable', status => {
    expect(state({ status, updatedAt: agoMs(999_999_999) })).toBe('not-applicable')
  })

  it('status tak dikenal → not-applicable (default aman)', () => {
    expect(state({ status: 'entah' })).toBe('not-applicable')
  })
})

describe('retryState — PDF sumber', () => {
  it('tanpa PDF → no-pdf, walau statusnya retriable', () => {
    expect(state({ status: 'uploaded', hasPdf: false })).toBe('no-pdf')
    expect(state({ updatedAt: agoMs(STALE_EXTRACTING_MS + 1_000), hasPdf: false })).toBe('no-pdf')
  })

  // Yang sudah terekstrak dicek DULUAN: tak perlu retry, jadi PDF hilang pun
  // bukan masalah yang perlu dilaporkan ke admin.
  it('sudah terekstrak + tanpa PDF → tetap not-applicable, bukan no-pdf', () => {
    expect(state({ status: 'mapped', hasPdf: false })).toBe('not-applicable')
  })
})

describe('retryState — bentuk input', () => {
  it('menerima updatedAt berupa string ISO (payload JSON dari DB)', () => {
    expect(state({ updatedAt: agoMs(STALE_EXTRACTING_MS + 1_000).toISOString() })).toBe('retriable')
    expect(state({ updatedAt: agoMs(1_000).toISOString() })).toBe('in-progress')
  })
})
