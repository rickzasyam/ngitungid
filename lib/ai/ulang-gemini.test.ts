import { describe, expect, it, vi } from 'vitest'
import { GalatAi, jenisGalatAi } from './penyedia'
import { bacaGalatGemini, JEDA_MAKS_MS, MAKS_PERCOBAAN, ulangGemini } from './ulang-gemini'

// Kebijakan ulang lapisan baru (keputusan Ricko 2026-10-28). Bentuk galat ditiru
// dari jawaban 429 Gemini sungguhan (sesi 2026-10-28): `ApiError` dengan
// `status` dan `message` = JSON jawaban server.

function galatGemini(status: number, quotaId: string | null, retryDelay?: string) {
  const details: unknown[] = []
  if (quotaId) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId, quotaValue: '20' }],
    })
  }
  if (retryDelay) details.push({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay })
  const body = { error: { code: status, message: 'x', status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE', details } }
  return Object.assign(new Error(JSON.stringify(body)), { name: 'ApiError', status })
}
const HARIAN = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
const PER_MENIT = 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'

function jalankan(galat: unknown[], hasil = 'ok') {
  const panggil = vi.fn(async () => {
    const g = galat.shift()
    if (g) throw g
    return hasil
  })
  const tidur = vi.fn(async (ms: number) => void ms)
  return { panggil, tidur, janji: ulangGemini(panggil, { tidur }) }
}

describe('bacaGalatGemini', () => {
  it('memilah harian / per menit / 503 dan membaca retryDelay', () => {
    expect(bacaGalatGemini(galatGemini(429, HARIAN, '16437s'))).toEqual({ status: 429, kuota: true, harian: true, jedaServerMs: 16_437_000 })
    expect(bacaGalatGemini(galatGemini(429, PER_MENIT, '41.5s'))).toEqual({ status: 429, kuota: true, harian: false, jedaServerMs: 41_500 })
    expect(bacaGalatGemini(galatGemini(503, null))).toEqual({ status: 503, kuota: false, harian: false, jedaServerMs: null })
    // Pesan bukan JSON: tetap dipilah dari teksnya.
    expect(bacaGalatGemini(Object.assign(new Error('RESOURCE_EXHAUSTED quotaId GenerateRequestsPerDayPerProjectPerModel'), { status: 429 })).harian).toBe(true)
    expect(bacaGalatGemini('teks').kuota).toBe(false)
  })
})

describe('ulangGemini', () => {
  it('kuota HARIAN habis → tidak diulang, langsung GalatAi kuotaHarian', async () => {
    const { panggil, tidur, janji } = jalankan([galatGemini(429, HARIAN, '16437s')])
    const e = await janji.catch(x => x)
    expect(e).toBeInstanceOf(GalatAi)
    expect(jenisGalatAi(e)).toBe('kuotaHarian')
    expect(panggil).toHaveBeenCalledTimes(1)
    expect(tidur).not.toHaveBeenCalled()
  })

  it('batas per menit → diulang dengan jeda dari server, lalu berhasil', async () => {
    const { panggil, tidur, janji } = jalankan([galatGemini(429, PER_MENIT, '41s')])
    expect(await janji).toBe('ok')
    expect(panggil).toHaveBeenCalledTimes(2)
    expect(tidur).toHaveBeenCalledWith(41_000)
  })

  it('503 → diulang dengan jeda naik per percobaan', async () => {
    const { panggil, tidur, janji } = jalankan([galatGemini(503, null), galatGemini(503, null)])
    expect(await janji).toBe('ok')
    expect(panggil).toHaveBeenCalledTimes(3)
    expect(tidur.mock.calls.map(c => c[0])).toEqual([2000, 4000])
  })

  it('jeda server yang sangat panjang dipotong', async () => {
    const { tidur, janji } = jalankan([galatGemini(429, PER_MENIT, '900s')])
    await janji
    expect(tidur).toHaveBeenCalledWith(JEDA_MAKS_MS)
  })

  it(`berhenti sesudah ${MAKS_PERCOBAAN} percobaan dan meneruskan galat aslinya`, async () => {
    const terakhir = galatGemini(503, null)
    const { panggil, janji } = jalankan([galatGemini(503, null), galatGemini(503, null), galatGemini(503, null), terakhir])
    expect(await janji.catch(x => x)).toBe(terakhir)
    expect(panggil).toHaveBeenCalledTimes(MAKS_PERCOBAAN)
  })

  it('galat lain (400, 500, tanpa status) tidak diulang', async () => {
    for (const g of [galatGemini(400, null), galatGemini(500, null), new Error('putus')]) {
      const { panggil, janji } = jalankan([g])
      expect(await janji.catch(x => x)).toBe(g)
      expect(panggil).toHaveBeenCalledTimes(1)
    }
  })
})
