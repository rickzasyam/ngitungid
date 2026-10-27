import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Adaptor & pemilih penyedia (X1). Semua klien SDK ditiru — tidak ada panggilan
// AI sungguhan di test mana pun (aturan data Stream B).
vi.mock('@/lib/gemini/client', async orig => ({
  ...(await orig<typeof import('@/lib/gemini/client')>()),
  generateContentWithRetry: vi.fn(),
}))

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GEMINI_MODEL, generateContentWithRetry } from '@/lib/gemini/client'
import { ANTHROPIC_MODEL_BAWAAN, penyediaAnthropic, type KlienAnthropic } from './anthropic'
import { penyediaGemini } from './gemini'
import { penyediaOpenAi, type KlienOpenAi } from './openai'
import { GalatAi, jenisGalatAi, skemaKetat, type PermintaanJson, type SkemaJson } from './penyedia'
import { penyediaDariEnv } from './pilih-penyedia'

const gen = vi.mocked(generateContentWithRetry)
afterEach(() => {
  gen.mockReset()
  vi.unstubAllEnvs()
})

const SKEMA_BARIS: SkemaJson = {
  type: 'array',
  items: { type: 'object', properties: { a: { type: 'string' }, n: { type: 'integer' } }, required: ['a', 'n'] },
}
const MINTA: PermintaanJson = {
  sistem: 'Susun tabel.',
  isi: [{ jenis: 'teks', teks: 'halaman 1' }, { jenis: 'gambarPng', base64: 'iVBORw0K' }],
  skema: SKEMA_BARIS,
  timeoutMs: 30_000,
}

describe('skemaKetat — akar objek + additionalProperties false (Anthropic & OpenAI)', () => {
  it('akar array dibungkus { hasil } dan dibuka lagi', () => {
    const k = skemaKetat(SKEMA_BARIS)
    expect(k.skema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['hasil'],
      properties: {
        hasil: {
          type: 'array',
          items: { type: 'object', additionalProperties: false, required: ['a', 'n'], properties: { a: { type: 'string' }, n: { type: 'integer' } } },
        },
      },
    })
    expect(k.buka('{"hasil":[{"a":"x","n":1}]}')).toBe('[{"a":"x","n":1}]')
    // Yang tidak bisa dibuka diteruskan apa adanya — penjaga bentuk pemanggil yang menolak.
    expect(k.buka('{rusak')).toBe('{rusak')
    expect(k.buka('{"lain":1}')).toBe('{"lain":1}')
  })

  it('akar objek tidak dibungkus; required = semua properti (mode ketat OpenAI)', () => {
    const k = skemaKetat({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'boolean' } }, required: ['a'] })
    expect(k.skema).toEqual({ type: 'object', additionalProperties: false, required: ['a', 'b'], properties: { a: { type: 'string' }, b: { type: 'boolean' } } })
    expect(k.buka('{"a":"x","b":true}')).toBe('{"a":"x","b":true}')
  })
})

describe('adaptor Gemini', () => {
  it('teks & gambar, instruksi sistem, batas waktu, pemakaian token', async () => {
    gen.mockResolvedValue({ text: '[]', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 7 } } as never)
    const j = await penyediaGemini().mintaJson(MINTA)
    expect(gen.mock.calls[0][0]).toEqual({
      model: GEMINI_MODEL,
      contents: [{ text: 'halaman 1' }, { inlineData: { mimeType: 'image/png', data: 'iVBORw0K' } }],
      config: expect.objectContaining({ systemInstruction: 'Susun tabel.', temperature: 0, httpOptions: { timeout: 30_000 }, responseMimeType: 'application/json' }),
    })
    expect(j).toEqual({ teks: '[]', model: GEMINI_MODEL, pemakaian: { tokenMasuk: 100, tokenKeluar: 27 } })
  })

  it('jawaban tanpa teks → teks kosong, bukan galat', async () => {
    gen.mockResolvedValue({ text: undefined } as never)
    expect((await penyediaGemini('model-x').mintaJson(MINTA)).teks).toBe('')
    expect(gen.mock.calls[0][0].model).toBe('model-x')
  })
})

describe('adaptor Claude (klien tiruan)', () => {
  const tiruan = (res: Partial<Anthropic.Message>) => {
    const create = vi.fn(async () => ({ model: ANTHROPIC_MODEL_BAWAAN, stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 9 }, content: [], ...res }))
    return { klien: { messages: { create } } as unknown as KlienAnthropic, create }
  }

  it('bentuk permintaan: model bawaan, system, gambar base64, json_schema ketat, timeout', async () => {
    const { klien, create } = tiruan({ content: [{ type: 'text', text: '{"hasil":[{"a":"x","n":1}]}', citations: null }] })
    const j = await penyediaAnthropic({ klien }).mintaJson(MINTA)
    const [body, opsi] = create.mock.calls[0] as unknown as [Record<string, unknown>, unknown]
    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 16000,
      system: 'Susun tabel.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'halaman 1' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0K' } }] }],
      output_config: { format: { type: 'json_schema', schema: skemaKetat(SKEMA_BARIS).skema } },
    })
    // Tanpa temperature: Claude Haiku 5.5 menolak nilai sampling non-bawaan.
    expect(body).not.toHaveProperty('temperature')
    expect(opsi).toEqual({ timeout: 30_000 })
    expect(j).toEqual({ teks: '[{"a":"x","n":1}]', model: 'claude-haiku-5-5', pemakaian: { tokenMasuk: 50, tokenKeluar: 9 } })
  })

  it('menolak → GalatAi ditolak; terpotong → GalatAi lain; tanpa teks → kosong', async () => {
    await expect(penyediaAnthropic({ klien: tiruan({ stop_reason: 'refusal' }).klien }).mintaJson(MINTA)).rejects.toMatchObject({ jenis: 'ditolak' })
    await expect(penyediaAnthropic({ klien: tiruan({ stop_reason: 'max_tokens' }).klien }).mintaJson(MINTA)).rejects.toMatchObject({ jenis: 'lain' })
    expect((await penyediaAnthropic({ klien: tiruan({}).klien }).mintaJson(MINTA)).teks).toBe('')
  })

  it('batas waktu SDK → GalatAi batasWaktu', async () => {
    const klien = { messages: { create: vi.fn(async () => { throw new Anthropic.APIConnectionTimeoutError() }) } } as unknown as KlienAnthropic
    await expect(penyediaAnthropic({ klien }).mintaJson(MINTA)).rejects.toMatchObject({ jenis: 'batasWaktu' })
  })

  it('tanpa ANTHROPIC_API_KEY → galat konfigurasi sebelum ada permintaan', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    await expect(penyediaAnthropic().mintaJson(MINTA)).rejects.toMatchObject({ jenis: 'konfigurasi' })
  })
})

describe('adaptor OpenAI (klien tiruan)', () => {
  const tiruan = (res: Record<string, unknown>) => {
    const create = vi.fn(async () => ({ model: 'gpt-uji', status: 'completed', output_text: '', usage: { input_tokens: 40, output_tokens: 8 }, ...res }))
    return { klien: { responses: { create } } as unknown as KlienOpenAi, create }
  }

  it('bentuk permintaan: instructions, input_image data URL, json_schema strict, timeout', async () => {
    const { klien, create } = tiruan({ output_text: '{"hasil":[{"a":"y","n":2}]}' })
    const j = await penyediaOpenAi({ model: 'gpt-uji', klien }).mintaJson(MINTA)
    const [body, opsi] = create.mock.calls[0] as unknown as [Record<string, unknown>, unknown]
    expect(body).toEqual({
      model: 'gpt-uji',
      instructions: 'Susun tabel.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'halaman 1' }, { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0K', detail: 'high' }] }],
      text: { format: { type: 'json_schema', name: 'jawaban', schema: skemaKetat(SKEMA_BARIS).skema, strict: true } },
      stream: false,
    })
    expect(opsi).toEqual({ timeout: 30_000 })
    expect(j).toEqual({ teks: '[{"a":"y","n":2}]', model: 'gpt-uji', pemakaian: { tokenMasuk: 40, tokenKeluar: 8 } })
  })

  it('tidak lengkap → GalatAi; batas waktu → batasWaktu; tanpa model/kunci → konfigurasi', async () => {
    await expect(penyediaOpenAi({ model: 'm', klien: tiruan({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }).klien }).mintaJson(MINTA)).rejects.toThrow('max_output_tokens')
    const lambat = { responses: { create: vi.fn(async () => { throw new OpenAI.APIConnectionTimeoutError() }) } } as unknown as KlienOpenAi
    await expect(penyediaOpenAi({ model: 'm', klien: lambat }).mintaJson(MINTA)).rejects.toMatchObject({ jenis: 'batasWaktu' })
    expect(() => penyediaOpenAi({ model: '' })).toThrow(GalatAi)
    vi.stubEnv('OPENAI_API_KEY', '')
    await expect(penyediaOpenAi({ model: 'm' }).mintaJson(MINTA)).rejects.toMatchObject({ jenis: 'konfigurasi' })
  })
})

describe('penyediaDariEnv — AI_PROVIDER + AI_MODEL', () => {
  it('kosong / gemini → Gemini (model bawaan lib/gemini/client)', () => {
    for (const env of [{}, { AI_PROVIDER: '' }, { AI_PROVIDER: 'gemini' }]) {
      const p = penyediaDariEnv(env)
      expect([p.nama, p.model]).toEqual(['gemini', GEMINI_MODEL])
    }
    expect(penyediaDariEnv({ AI_PROVIDER: 'gemini', AI_MODEL: 'gemini-uji' }).model).toBe('gemini-uji')
  })

  it('anthropic → Claude Haiku bawaan atau AI_MODEL', () => {
    expect(penyediaDariEnv({ AI_PROVIDER: 'anthropic' })).toMatchObject({ nama: 'anthropic', model: 'claude-haiku-5-5' })
    expect(penyediaDariEnv({ AI_PROVIDER: 'anthropic', AI_MODEL: 'claude-x' }).model).toBe('claude-x')
  })

  it('openai wajib AI_MODEL', () => {
    expect(penyediaDariEnv({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-uji' })).toMatchObject({ nama: 'openai', model: 'gpt-uji' })
    expect(() => penyediaDariEnv({ AI_PROVIDER: 'openai' })).toThrow('AI_MODEL')
  })

  it('nilai tak dikenal → galat konfigurasi, tidak jatuh diam-diam ke Gemini', () => {
    for (const v of ['Gemini', 'claude', ' gemini', 'deepseek']) {
      expect(() => penyediaDariEnv({ AI_PROVIDER: v })).toThrow(GalatAi)
    }
  })
})

describe('jenisGalatAi', () => {
  it('memilah galat dari penyedia mana pun', () => {
    expect(jenisGalatAi(new GalatAi('ditolak', 'x'))).toBe('ditolak')
    expect(jenisGalatAi(Object.assign(new Error('x'), { status: 429 }))).toBe('kuota')
    expect(jenisGalatAi(new Error('GEMINI_API_KEY belum diset di .env.local'))).toBe('konfigurasi')
    expect(jenisGalatAi(new Error('{"status":"RESOURCE_EXHAUSTED"}'))).toBe('kuota')
    expect(jenisGalatAi(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('batasWaktu')
    expect(jenisGalatAi(Object.assign(new Error('x'), { status: 503 }))).toBe('lain')
    expect(jenisGalatAi('teks')).toBe('lain')
  })
})

describe('batas lapisan', () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

  // Fitur AI yang sudah jalan memakai Gemini LANGSUNG — mengisi AI_PROVIDER untuk
  // rekening koran (X7) tidak boleh ikut memindahkan mereka ke penyedia lain.
  it('fitur lama tidak memakai pemilih penyedia dari env', () => {
    for (const f of [['lib', 'ai', 'saran-akun-jurnal.ts'], ['lib', 'gemini', 'extract.ts'], ['lib', 'gemini', 'suggest-coa.ts']]) {
      expect(read(...f), f.join('/')).not.toContain('penyediaDariEnv')
    }
  })

  it('tanpa RegExp di lib/ai (D22)', () => {
    for (const f of readdirSync(join(process.cwd(), 'lib', 'ai')).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const src = read('lib', 'ai', f)
      expect(src, f).not.toContain('RegExp')
      expect(src, f).not.toContain('.match(')
      expect(src, f).not.toContain('.test(')
    }
  })
})
