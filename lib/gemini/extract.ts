import { Type } from '@google/genai'
import { getGeminiClient, GEMINI_MODEL } from './client'

export type ReportType = 'laba_rugi' | 'neraca' | 'arus_kas'

export interface ExtractedLine {
  rawName: string
  amount: number
  isSubtotal: boolean
  confidence: number
}

// Petunjuk khusus per tipe laporan — struktur & pola subtotal tiap tipe beda.
const TYPE_HINTS: Record<ReportType, string> = {
  laba_rugi:
    'Ini LAPORAN LABA RUGI. Urutan umum: Penerimaan/Penjualan → Retur & Potongan (NEGATIF) → ' +
    'PENERIMAAN BERSIH (subtotal) → HPP → LABA KOTOR (subtotal) → Biaya Variabel & Tetap → ' +
    'TOTAL BIAYA (subtotal) → LABA OPERASI / SEBELUM PAJAK / BERSIH (subtotal). Baris berlabel ' +
    'PENERIMAAN BERSIH, TOTAL*, LABA* adalah subtotal.',
  neraca:
    'Ini NERACA (Balance Sheet). Ada sisi AKTIVA (aset lancar & tetap) dan PASIVA (kewajiban + ' +
    'ekuitas/modal). Baris TOTAL/JUMLAH AKTIVA, TOTAL KEWAJIBAN, TOTAL MODAL, TOTAL PASIVA adalah ' +
    'subtotal. Nilai umumnya positif; total Aktiva seimbang dengan total Pasiva.',
  arus_kas:
    'Ini LAPORAN ARUS KAS. Terbagi aktivitas OPERASI, INVESTASI, dan PENDANAAN. Arus kas keluar ' +
    'bernilai NEGATIF. Baris "Arus Kas Bersih dari ...", "Kenaikan/Penurunan Kas", "Saldo Kas ' +
    'Awal/Akhir", dan TOTAL adalah subtotal.',
}

const BASE_PROMPT = `Kamu asisten akuntansi yang teliti. Ekstrak SEMUA baris dari laporan keuangan di PDF ini menjadi array JSON, dari atas ke bawah, tanpa melewatkan baris apa pun (termasuk baris subtotal/total).

Untuk setiap baris:
- "rawName": nama akun/pos PERSIS seperti tertulis di dokumen (pertahankan bahasa & ejaan asli, jangan diterjemahkan/dirapikan).
- "amount": nominal sebagai ANGKA murni (tanpa "Rp", tanpa titik/koma pemisah ribuan). Nilai dalam tanda kurung — mis. (2.526.000) — atau bertanda minus berarti NEGATIF.
- "isSubtotal": true untuk baris total/subtotal/agregat (biasanya HURUF KAPITAL atau berlabel TOTAL/JUMLAH/LABA/PENERIMAAN BERSIH/SALDO), false untuk baris akun detail biasa.
- "confidence": bilangan 0–100, seberapa yakin kamu angka & nama baris ini terbaca benar dari PDF.

Jangan mengarang baris yang tidak ada di dokumen. Kembalikan HANYA array JSON sesuai skema.`

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      rawName: { type: Type.STRING },
      amount: { type: Type.NUMBER },
      isSubtotal: { type: Type.BOOLEAN },
      confidence: { type: Type.INTEGER },
    },
    required: ['rawName', 'amount', 'isSubtotal', 'confidence'],
  },
}

/**
 * Ekstrak line item dari PDF laporan keuangan via Gemini (structured output).
 * PDF dikirim inline (base64) — native, tanpa render lokal.
 */
export async function extractReport(
  pdfBytes: Buffer,
  reportType: ReportType
): Promise<ExtractedLine[]> {
  const ai = getGeminiClient()
  const prompt = `${BASE_PROMPT}\n\n${TYPE_HINTS[reportType]}`

  const params = {
    model: GEMINI_MODEL,
    contents: [
      { text: prompt },
      { inlineData: { mimeType: 'application/pdf', data: pdfBytes.toString('base64') } },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0,
    },
  }

  // Retry untuk error transient Gemini (429/5xx — mis. 503 "high demand").
  let response
  for (let attempt = 1; ; attempt++) {
    try {
      response = await ai.models.generateContent(params)
      break
    } catch (err) {
      const status = (err as { status?: number }).status
      const retriable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504
      if (!retriable || attempt >= 4) throw err
      // Hormati retryDelay yang disarankan server (umum di 429 free-tier), cap 20s.
      const msg = err instanceof Error ? err.message : String(err)
      const m = msg.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) || msg.match(/retry in ([\d.]+)s/i)
      const serverDelay = m ? Math.ceil(parseFloat(m[1]) * 1000) : 0
      await new Promise(r => setTimeout(r, Math.min(Math.max(serverDelay, 1500 * attempt), 20000)))
    }
  }

  const text = response.text
  if (!text) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini mengembalikan JSON yang tidak valid saat ekstraksi.')
  }
  if (!Array.isArray(parsed)) return []

  return (parsed as Record<string, unknown>[])
    .map(r => ({
      rawName: String(r.rawName ?? '').trim(),
      amount: Number(r.amount) || 0,
      isSubtotal: Boolean(r.isSubtotal),
      confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0))),
    }))
    .filter(r => r.rawName !== '')
}
