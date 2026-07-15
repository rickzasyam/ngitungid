import { Type } from '@google/genai'
import { GEMINI_MODEL, generateContentWithRetry } from './client'
import type { ReportType } from './extract'

// Saran COA berbantuan Gemini (Phase 3.2) — untuk baris yang matcher
// deterministik (`lib/coa-match.ts`: history → exact → fuzzy) TIDAK bisa bantu.
// Kasus target: nama akun di PDF berbeda SECARA MAKNA dari Master COA klien
// (mis. "Gaji Pegawai" ≈ "Biaya Gaji Karyawan", "Ongkir" ≈ "Beban Pengiriman")
// — kemiripan huruf gagal, tapi Gemini paham semantik akuntansinya.
//
// Selalu SARAN saja (bukan auto-map): tebakan semantik AI perlu konfirmasi
// admin, dan begitu dikonfirmasi ia masuk `coa_mapping_history` → matcher
// deterministik menangkapnya instan di lain waktu (learning loop).

export interface CoaChoice {
  kode: string
  nama: string
  kelompok: string
  subKelompok: string
}

export interface UnmappedRef {
  ref: number // indeks stabil ke baris yang diminta — Gemini meng-echo balik
  rawName: string
}

export interface AiCoaSuggestion {
  ref: number
  kode: string // '' = tidak ada kecocokan yang meyakinkan
  confidence: number // 0–100
  reason: string
}

const TYPE_LABEL: Record<ReportType, string> = {
  laba_rugi: 'Laba Rugi (P&L)',
  neraca: 'Neraca (Balance Sheet)',
  arus_kas: 'Arus Kas (Cash Flow)',
}

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ref: { type: Type.INTEGER },
      kode: { type: Type.STRING },
      confidence: { type: Type.INTEGER },
      reason: { type: Type.STRING },
    },
    required: ['ref', 'kode', 'confidence', 'reason'],
  },
}

/**
 * Minta Gemini mencocokkan nama akun mentah → kode Master COA berdasarkan MAKNA.
 * Satu panggilan untuk semua baris (hemat kuota: 1 request/laporan, bukan
 * per-baris). Mengembalikan kode COA (bukan UUID — Gemini tak perlu tahu id DB);
 * route yang memetakan kode → id. Kode di luar daftar / '' diabaikan pemanggil.
 */
export async function suggestCoaWithGemini(
  items: UnmappedRef[],
  accounts: CoaChoice[],
  reportType: ReportType
): Promise<AiCoaSuggestion[]> {
  if (items.length === 0 || accounts.length === 0) return []

  const coaList = accounts
    .map(a => `- kode ${a.kode} | ${a.nama} | ${a.kelompok} / ${a.subKelompok}`)
    .join('\n')
  const itemList = items.map(i => `- ref ${i.ref}: "${i.rawName}"`).join('\n')

  const prompt = `Kamu asisten akuntansi yang teliti. Cocokkan tiap "nama akun mentah" (hasil ekstraksi PDF laporan ${TYPE_LABEL[reportType]}) ke SATU akun di Master COA klien berikut, berdasarkan MAKNA/FUNGSI akun — bukan sekadar kemiripan huruf.

MASTER COA (gunakan KODE persis seperti tertulis di sini):
${coaList}

NAMA AKUN MENTAH yang perlu dicocokkan:
${itemList}

Aturan:
- Cocokkan berdasarkan makna akuntansi. Contoh: "Gaji Pegawai" ≈ "Biaya Gaji Karyawan"; "Ongkir Shopee" ≈ "Beban Pengiriman"; "Pendapatan Bunga Bank" ≈ akun pendapatan lain-lain.
- HORMATI klasifikasi: pos pendapatan → akun pendapatan, pos biaya → akun biaya; jangan menyeberang antara Laba Rugi dan Neraca.
- Kalau TIDAK ADA akun yang benar-benar cocok, kembalikan "kode": "" (string kosong). Jangan memaksakan tebakan yang lemah — saran salah lebih berbahaya daripada tidak ada saran.
- "confidence": 0–100, seberapa yakin kecocokan itu benar.
- "reason": alasan singkat, maksimal 12 kata.

Kembalikan HANYA array JSON sesuai skema, tepat satu entri per ref di atas.`

  const response = await generateContentWithRetry({
    model: GEMINI_MODEL,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0,
    },
  })

  const text = response.text
  if (!text) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini mengembalikan JSON yang tidak valid saat menyarankan COA.')
  }
  if (!Array.isArray(parsed)) return []

  return (parsed as Record<string, unknown>[])
    .map(r => ({
      ref: Number(r.ref),
      kode: String(r.kode ?? '').trim(),
      confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0))),
      reason: String(r.reason ?? '').trim(),
    }))
    .filter(r => Number.isInteger(r.ref))
}
