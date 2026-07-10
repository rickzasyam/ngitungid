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
