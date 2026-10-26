import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Route-nya diuji sungguhan: guard, DB, dan Gemini di-mock, jadi yang diuji
// hanya gerbang sakelarnya — tidak ada panggilan AI atau DB.
vi.mock('@/lib/api/guards', () => ({
  requireAkunting: vi.fn(async () => ({ user: { role: 'owner', clientId: null } })),
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/gemini/suggest-journal-account', () => ({ suggestJournalAccounts: vi.fn() }))

import { AI_NONAKTIF, aiFeaturesEnabled } from './ai-features'
import { POST } from '@/app/api/journals/suggest-account/route'

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
const minta = async () =>
  (await POST(new Request('http://x/api/journals/suggest-account', { method: 'POST', body: '{}' })))!

afterEach(() => vi.unstubAllEnvs())

describe('aiFeaturesEnabled', () => {
  it('hanya "true" persis yang menyalakan', () => {
    expect(aiFeaturesEnabled('true')).toBe(true)
    for (const v of [undefined, '', 'false', 'TRUE', '1', ' true']) {
      expect(aiFeaturesEnabled(v)).toBe(false)
    }
  })
})

describe('POST /api/journals/suggest-account', () => {
  it('sakelar mati (env tidak diisi, seperti Production) → 503 dengan pesan jelas', async () => {
    vi.stubEnv('AI_FEATURES_ENABLED', '')
    const res = await minta()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: AI_NONAKTIF })
  })

  it('sakelar nyala → lolos gerbang, lanjut ke validasi biasa', async () => {
    vi.stubEnv('AI_FEATURES_ENABLED', 'true')
    const res = await minta()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'clientId tidak valid.' })
  })
})

describe('tombol "Sarankan akun (AI)"', () => {
  it('hanya dirender bila sakelar nyala', () => {
    const modal = read('components', 'jurnal', 'journal-form-modal.tsx')
    const gerbang = modal.indexOf('{aiFeaturesEnabled() && (')
    expect(gerbang).toBeGreaterThan(-1)
    expect(modal.indexOf('Sarankan akun (AI)')).toBeGreaterThan(gerbang)
  })

  it('sakelarnya sampai ke browser lewat env next.config', () => {
    expect(read('next.config.mjs')).toContain('AI_FEATURES_ENABLED: process.env.AI_FEATURES_ENABLED')
  })
})
