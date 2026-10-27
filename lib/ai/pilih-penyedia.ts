import { penyediaAnthropic } from './anthropic'
import { penyediaGemini } from './gemini'
import { penyediaOpenAi } from './openai'
import { GalatAi, type AiProvider } from './penyedia'

// Pemilihan penyedia lewat env (MP §5.G X1):
//   AI_PROVIDER  tidak diisi / "gemini" → Gemini;  "anthropic" · "openai"
//   AI_MODEL     model penyedia itu; tidak diisi → bawaan penyedia (OpenAI wajib diisi)
// Nilai lain → galat konfigurasi, bukan diam-diam jatuh ke Gemini: salah ketik
// di Vercel tidak boleh mengirim data ke penyedia yang tidak dimaksud.
//
// HANYA fitur baru yang memanggil ini (ekstraksi rekening koran). Fitur AI yang
// sudah jalan memanggil adaptornya langsung (`penyediaGemini()`), jadi mengisi
// AI_PROVIDER untuk X7 tidak ikut memindahkan saran akun jurnal, saran COA,
// atau ekstraksi laporan ke penyedia lain.
export function penyediaDariEnv(env: Record<string, string | undefined> = process.env): AiProvider {
  const nama = env.AI_PROVIDER ?? ''
  const model = env.AI_MODEL || undefined
  if (nama === '' || nama === 'gemini') return model ? penyediaGemini(model) : penyediaGemini()
  if (nama === 'anthropic') return penyediaAnthropic({ model })
  if (nama === 'openai') return penyediaOpenAi({ model: model ?? '' })
  throw new GalatAi('konfigurasi', `AI_PROVIDER "${nama}" tidak dikenal — pilih gemini, anthropic, atau openai.`)
}
