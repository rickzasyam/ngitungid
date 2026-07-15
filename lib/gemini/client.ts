import { GoogleGenAI } from '@google/genai'

// Model default: Gemini Flash (murah, cepat, cukup akurat untuk ekstraksi
// dokumen). Bisa dioverride via env kalau perlu ganti versi.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'

let client: GoogleGenAI | null = null

/** Lazy singleton — throw jelas kalau key belum diisi (bukan crash di import). */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum diset di .env.local — ekstraksi PDF butuh key ini (lihat .env.example).'
    )
  }
  if (!client) client = new GoogleGenAI({ apiKey })
  return client
}

type GenerateParams = Parameters<GoogleGenAI['models']['generateContent']>[0]

/**
 * `generateContent` + retry untuk error transient Gemini (429 free-tier / 5xx
 * "high demand"). Menghormati `retryDelay` yang disarankan server, backoff naik
 * per attempt, cap 20s. Dipakai bersama oleh ekstraksi & saran COA AI.
 */
export async function generateContentWithRetry(params: GenerateParams, maxAttempts = 4) {
  const ai = getGeminiClient()
  for (let attempt = 1; ; attempt++) {
    try {
      return await ai.models.generateContent(params)
    } catch (err) {
      const status = (err as { status?: number }).status
      const retriable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504
      if (!retriable || attempt >= maxAttempts) throw err
      const msg = err instanceof Error ? err.message : String(err)
      const m = msg.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) || msg.match(/retry in ([\d.]+)s/i)
      const serverDelay = m ? Math.ceil(parseFloat(m[1]) * 1000) : 0
      await new Promise(r => setTimeout(r, Math.min(Math.max(serverDelay, 1500 * attempt), 20000)))
    }
  }
}
