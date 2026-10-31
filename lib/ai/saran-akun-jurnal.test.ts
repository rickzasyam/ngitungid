import { afterEach, describe, expect, it, vi } from 'vitest'
import { Type } from '@google/genai'

// Pemindahan X1 TANPA perubahan perilaku: permintaan yang sampai ke Gemini harus
// IDENTIK dengan yang dikirim lib/gemini/suggest-journal-account.ts sebelum
// dipindah (prompt, model, skema, suhu — tidak ada kunci tambahan), dan
// penyaring jawabannya tetap sama. Klien Gemini ditiru: tidak ada panggilan AI.
vi.mock('@/lib/gemini/client', async orig => ({
  ...(await orig<typeof import('@/lib/gemini/client')>()),
  generateContentWithRetry: vi.fn(),
}))

import { GEMINI_MODEL, generateContentWithRetry } from '@/lib/gemini/client'
import { suggestJournalAccounts, type JournalAccountChoice } from './saran-akun-jurnal'
import type { AiProvider } from './penyedia'

const gen = vi.mocked(generateContentWithRetry)
afterEach(() => gen.mockReset())

const AKUN: JournalAccountChoice[] = [
  { kode: '1101', nama: 'Bank UJI-B', posisi: 'Debit', kelompok: 'Neraca', subKelompok: 'Kas & Setara Kas' },
  { kode: '6101', nama: 'Beban Listrik', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Tetap' },
]

// Salinan PERSIS responseSchema modul lama (commit c3a1d07).
const SKEMA_LAMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      debitKode: { type: Type.STRING },
      kreditKode: { type: Type.STRING },
      confidence: { type: Type.INTEGER },
      reason: { type: Type.STRING },
    },
    required: ['debitKode', 'kreditKode', 'confidence', 'reason'],
  },
}

const jawab = (text: string | undefined) =>
  gen.mockResolvedValue({ text, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } as never)

describe('saran akun jurnal — permintaan ke Gemini sama dengan sebelum X1', () => {
  it('model, isi, skema, dan suhu identik; tanpa systemInstruction/httpOptions', async () => {
    jawab('[]')
    await suggestJournalAccounts('bayar listrik UJI-B lewat bank', AKUN)
    expect(gen).toHaveBeenCalledTimes(1)
    const [params, ...sisa] = gen.mock.calls[0]
    expect(sisa).toEqual([]) // maxAttempts bawaan (4), seperti dulu
    expect(params).toEqual({
      model: GEMINI_MODEL,
      contents: [{ text: expect.stringContaining('"bayar listrik UJI-B lewat bank"') }],
      config: { responseMimeType: 'application/json', responseSchema: SKEMA_LAMA, temperature: 0 },
    })
    const prompt = (params.contents as { text: string }[])[0].text
    expect(prompt).toContain('- kode 6101 | Beban Listrik | Laba Rugi / Biaya Tetap | saldo normal Debit')
    expect(prompt).toContain('kembalikan array KOSONG')
  })

  it('keterangan kosong atau COA kosong → [] tanpa memanggil AI', async () => {
    expect(await suggestJournalAccounts('   ', AKUN)).toEqual([])
    expect(await suggestJournalAccounts('bayar listrik', [])).toEqual([])
    expect(gen).not.toHaveBeenCalled()
  })

  it('jawaban kosong → []; JSON rusak → galat yang sama; bukan array → []', async () => {
    jawab(undefined)
    expect(await suggestJournalAccounts('x', AKUN)).toEqual([])
    jawab('{bukan json')
    await expect(suggestJournalAccounts('x', AKUN)).rejects.toThrow('Gemini mengembalikan JSON yang tidak valid saat menyarankan akun jurnal.')
    jawab('{"debitKode":"6101"}')
    expect(await suggestJournalAccounts('x', AKUN)).toEqual([])
  })

  it('galat Gemini diteruskan apa adanya — route tetap memilahnya dari pesan (400/429/502)', async () => {
    const g = Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), { status: 429 })
    gen.mockRejectedValue(g)
    await expect(suggestJournalAccounts('x', AKUN)).rejects.toBe(g)
  })
})

describe('saran akun jurnal — penyaring jawaban tidak berubah', () => {
  const tiruan = (teks: string): AiProvider => ({
    nama: 'gemini',
    model: 'tiruan',
    mintaJson: async () => ({ teks, model: 'tiruan', pemakaian: { tokenMasuk: 0, tokenKeluar: 0 } }),
  })

  it('buang sisi kosong & dua sisi sama, rapikan, batasi keyakinan, urut menurun, maks 3', async () => {
    const teks = JSON.stringify([
      { debitKode: ' 6101 ', kreditKode: '1101', confidence: 70.6, reason: ' listrik ' },
      { debitKode: '6101', kreditKode: '', confidence: 99, reason: 'sisi kosong' },
      { debitKode: '1101', kreditKode: '1101', confidence: 98, reason: 'sama' },
      { debitKode: '6101', kreditKode: '1102', confidence: 150, reason: 'terlalu yakin' },
      { debitKode: '6102', kreditKode: '1101', confidence: -5, reason: 'negatif' },
      { debitKode: '6103', kreditKode: '1101', confidence: 'abc', reason: 'bukan angka' },
    ])
    expect(await suggestJournalAccounts('x', AKUN, tiruan(teks))).toEqual([
      { debitKode: '6101', kreditKode: '1102', confidence: 100, reason: 'terlalu yakin' },
      { debitKode: '6101', kreditKode: '1101', confidence: 71, reason: 'listrik' },
      { debitKode: '6102', kreditKode: '1101', confidence: 0, reason: 'negatif' },
    ])
  })
})
