import Anthropic from '@anthropic-ai/sdk'
import { GalatAi, skemaKetat, type AiProvider, type BagianIsi } from './penyedia'

// Adaptor Claude (X1) — DISIAPKAN untuk uji banding X6, belum dipakai fitur apa
// pun: hanya diuji dengan klien tiruan. Panggilan sungguhan baru boleh sesudah
// gerbang X0 (akun berbayar, ketentuan data dicatat — D54), dan tetap hanya
// dengan PDF sintetis sampai Ricko memutuskan lain.

/** Kandidat D54 "Claude Haiku". Ganti lewat env `AI_MODEL_EKSTRAKSI` tanpa mengubah kode. */
export const ANTHROPIC_MODEL_BAWAAN = 'claude-haiku-5-5'

// Satu halaman rekening koran ±40 baris JSON jauh di bawah ini; batasnya ada
// supaya jawaban terpotong ketahuan (`stop_reason: max_tokens`), bukan dipakai.
const MAX_TOKENS = 16000

/** Bagian SDK yang dipakai — klien tiruan di test cukup memenuhi ini. */
export type KlienAnthropic = { messages: Pick<Anthropic['messages'], 'create'> }

function klienDariEnv(): KlienAnthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new GalatAi('konfigurasi', 'ANTHROPIC_API_KEY belum diset — penyedia "anthropic" butuh key ini.')
  return new Anthropic({ apiKey })
}

function bagianAnthropic(b: BagianIsi): Anthropic.ContentBlockParam {
  return b.jenis === 'teks'
    ? { type: 'text', text: b.teks }
    : { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b.base64 } }
}

export function penyediaAnthropic(opsi: { model?: string; klien?: KlienAnthropic } = {}): AiProvider {
  const model = opsi.model ?? ANTHROPIC_MODEL_BAWAAN
  return {
    nama: 'anthropic',
    model,
    async mintaJson({ sistem, isi, skema, timeoutMs }) {
      const klien = opsi.klien ?? klienDariEnv()
      const ketat = skemaKetat(skema)
      let res: Anthropic.Message
      try {
        res = await klien.messages.create(
          {
            model,
            max_tokens: MAX_TOKENS,
            ...(sistem ? { system: sistem } : {}),
            messages: [{ role: 'user', content: isi.map(bagianAnthropic) }],
            output_config: { format: { type: 'json_schema', schema: ketat.skema } },
          },
          timeoutMs ? { timeout: timeoutMs } : undefined
        )
      } catch (e) {
        if (e instanceof Anthropic.APIConnectionTimeoutError) throw new GalatAi('batasWaktu', 'Penyedia AI tidak menjawab dalam batas waktu.', { cause: e })
        throw e
      }
      if (res.stop_reason === 'refusal') throw new GalatAi('ditolak', 'Model menolak permintaan ini.')
      if (res.stop_reason === 'max_tokens') throw new GalatAi('lain', 'Jawaban model terpotong (max_tokens).')
      const teks = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
      return {
        teks: teks === '' ? '' : ketat.buka(teks),
        model: res.model,
        pemakaian: { tokenMasuk: res.usage.input_tokens, tokenKeluar: res.usage.output_tokens },
      }
    },
  }
}
