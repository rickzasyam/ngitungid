import { penyediaAnthropic } from './anthropic'
import { penyediaGemini } from './gemini'
import { penyediaOpenAi } from './openai'
import { GalatAi, type AiProvider } from './penyedia'

/**
 * Model bawaan ekstraksi rekening koran bila penyedianya Gemini (keputusan Ricko
 * 2026-10-28): Flash-Lite STABIL dengan nama pasti, bukan alias "latest" yang
 * bisa berpindah model (dan harga) diam-diam. Fitur lama tetap GEMINI_MODEL.
 */
export const MODEL_EKSTRAKSI_GEMINI = 'gemini-3.5-flash-lite'

/**
 * Penyedia untuk ekstraksi rekening koran — dipakai route DAN harness uji
 * banding, supaya yang diukur sama dengan yang dijalankan. Gemini dibuat dengan
 * thinking minimal dan kebijakan ulang lapisan baru (kuota harian tidak diulang).
 * Claude: penalaran tambahan (extended thinking) memang mati bila tidak diminta.
 */
export function penyediaEkstraksi(nama: string, model?: string): AiProvider {
  if (nama === '' || nama === 'gemini') return penyediaGemini(model ?? MODEL_EKSTRAKSI_GEMINI, { berpikirMinimal: true, ulangBaru: true })
  if (nama === 'anthropic') return penyediaAnthropic({ model })
  if (nama === 'openai') return penyediaOpenAi({ model: model ?? '' })
  throw new GalatAi('konfigurasi', `AI_PROVIDER "${nama}" tidak dikenal — pilih gemini, anthropic, atau openai.`)
}

// Pemilihan penyedia lewat env (MP §5.G X1):
//   AI_PROVIDER         tidak diisi / "gemini" → Gemini;  "anthropic" · "openai"
//   AI_MODEL_EKSTRAKSI  model penyedia itu; tidak diisi → bawaan (Gemini: Flash-Lite
//                       di atas; Claude: Haiku; OpenAI WAJIB diisi)
// Nilai lain → galat konfigurasi, bukan diam-diam jatuh ke Gemini: salah ketik
// di Vercel tidak boleh mengirim data ke penyedia yang tidak dimaksud.
//
// HANYA fitur baru yang memanggil ini (ekstraksi rekening koran). Fitur AI yang
// sudah jalan memanggil adaptornya langsung (`penyediaGemini()`), jadi mengisi
// AI_PROVIDER untuk X7 tidak ikut memindahkan saran akun jurnal, saran COA,
// atau ekstraksi laporan ke penyedia lain.
export function penyediaDariEnv(env: Record<string, string | undefined> = process.env): AiProvider {
  return penyediaEkstraksi(env.AI_PROVIDER ?? '', env.AI_MODEL_EKSTRAKSI || undefined)
}
