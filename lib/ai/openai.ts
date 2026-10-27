import OpenAI from 'openai'
import { GalatAi, skemaKetat, type AiProvider, type BagianIsi } from './penyedia'

// Adaptor OpenAI (X1) — DISIAPKAN untuk uji banding X6, belum dipakai fitur apa
// pun: hanya diuji dengan klien tiruan. Sama dengan adaptor Claude: panggilan
// sungguhan baru sesudah gerbang X0 (D54).
//
// Tidak ada model bawaan: id model "GPT mini" yang berlaku pada tanggal uji
// harus dipilih sadar lewat env `AI_MODEL`, bukan ditebak di kode.

/** Bagian SDK yang dipakai — klien tiruan di test cukup memenuhi ini. */
export type KlienOpenAi = { responses: Pick<OpenAI['responses'], 'create'> }

function klienDariEnv(): KlienOpenAi {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new GalatAi('konfigurasi', 'OPENAI_API_KEY belum diset — penyedia "openai" butuh key ini.')
  return new OpenAI({ apiKey })
}

function bagianOpenAi(b: BagianIsi): OpenAI.Responses.ResponseInputContent {
  return b.jenis === 'teks'
    ? { type: 'input_text', text: b.teks }
    : // 'high': angka kecil di rekening koran hasil scan tidak boleh dibaca dari gambar yang diperkecil.
      { type: 'input_image', image_url: `data:image/png;base64,${b.base64}`, detail: 'high' }
}

export function penyediaOpenAi(opsi: { model: string; klien?: KlienOpenAi }): AiProvider {
  const { model } = opsi
  if (!model) throw new GalatAi('konfigurasi', 'AI_MODEL belum diisi — penyedia "openai" tidak punya model bawaan.')
  return {
    nama: 'openai',
    model,
    async mintaJson({ sistem, isi, skema, timeoutMs }) {
      const klien = opsi.klien ?? klienDariEnv()
      const ketat = skemaKetat(skema)
      let res: OpenAI.Responses.Response
      try {
        res = await klien.responses.create(
          {
            model,
            ...(sistem ? { instructions: sistem } : {}),
            input: [{ role: 'user', content: isi.map(bagianOpenAi) }],
            text: { format: { type: 'json_schema', name: 'jawaban', schema: ketat.skema, strict: true } },
            stream: false,
          },
          timeoutMs ? { timeout: timeoutMs } : undefined
        )
      } catch (e) {
        if (e instanceof OpenAI.APIConnectionTimeoutError) throw new GalatAi('batasWaktu', 'Penyedia AI tidak menjawab dalam batas waktu.', { cause: e })
        throw e
      }
      if (res.status === 'incomplete') throw new GalatAi('lain', `Jawaban model tidak lengkap (${res.incomplete_details?.reason ?? 'tanpa alasan'}).`)
      const teks = res.output_text ?? ''
      return {
        teks: teks === '' ? '' : ketat.buka(teks),
        model: res.model,
        pemakaian: { tokenMasuk: res.usage?.input_tokens ?? 0, tokenKeluar: res.usage?.output_tokens ?? 0 },
      }
    },
  }
}
