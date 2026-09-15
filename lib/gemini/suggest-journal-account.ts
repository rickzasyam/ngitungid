import { Type } from '@google/genai'
import { GEMINI_MODEL, generateContentWithRetry } from './client'

// Saran PASANGAN AKUN untuk jurnal manual (D10, direvisi R1).
//
// Bedanya dengan lib/gemini/suggest-coa.ts: di sana yang dicocokkan adalah SATU
// nama akun mentah ke SATU akun COA. Di sini masukannya kalimat bebas yang
// ditulis akunting ("bayar listrik kantor September lewat BCA") dan keluarannya
// PASANGAN debit/kredit — dua akun yang harus konsisten satu sama lain, bukan
// dua tebakan terpisah. Menyarankan "Beban Listrik" tanpa menyarankan lawannya
// tidak menolong siapa pun.
//
// R1: mengembalikan HINGGA TIGA pasangan berperingkat, bukan satu. Satu jawaban
// memaksa pengguna menerima atau membuang seluruhnya; tiga pilihan membuat
// bagian yang paling sering keliru — akun kas mana yang dipakai — bisa dikoreksi
// dengan memilih, bukan dengan mengetik ulang.
//
// SELALU saran, tidak pernah otomatis (D10). Dipicu tombol eksplisit supaya
// kuota Gemini tidak terbakar diam-diam setiap kali orang mengetik.

export const MAX_SUGGESTION_PAIRS = 3

export interface JournalAccountChoice {
  kode: string
  nama: string
  /** 'Debit' | 'Kredit' — normal balance akun, dipakai model untuk menimbang. */
  posisi: string
  kelompok: string
  subKelompok: string
}

export interface AiJournalPair {
  debitKode: string
  kreditKode: string
  /** 0–100. Pemanggil membuang yang di bawah ambang. */
  confidence: number
  reason: string
}

const responseSchema = {
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

/**
 * Minta Gemini menyarankan pasangan akun debit/kredit dari keterangan transaksi.
 *
 * Mengembalikan paling banyak tiga pasangan, terurut keyakinan menurun. Kode
 * yang dikembalikan adalah KODE akun (bukan UUID — model tidak perlu tahu id
 * basis data); route yang memetakan kode ke id dan membuang kode yang tidak ada
 * di Master COA klien.
 */
export async function suggestJournalAccounts(
  keterangan: string,
  choices: JournalAccountChoice[]
): Promise<AiJournalPair[]> {
  const teks = keterangan.trim()
  if (teks === '' || choices.length === 0) return []

  const coaList = choices
    .map(a => `- kode ${a.kode} | ${a.nama} | ${a.kelompok} / ${a.subKelompok} | saldo normal ${a.posisi}`)
    .join('\n')

  const prompt = `Kamu asisten akuntansi yang teliti. Dari KETERANGAN TRANSAKSI berikut, usulkan pasangan akun DEBIT dan KREDIT untuk satu jurnal umum, memakai Master COA klien di bawah.

KETERANGAN TRANSAKSI:
"${teks}"

MASTER COA (gunakan KODE persis seperti tertulis di sini):
${coaList}

Aturan:
- Usulkan paling banyak ${MAX_SUGGESTION_PAIRS} pasangan, urut dari yang paling mungkin benar.
- Tiap pasangan harus MASUK AKAL SEBAGAI SATU JURNAL: sisi debit dan sisi kredit saling menjelaskan. Contoh: "bayar listrik kantor lewat bank" → debit akun beban listrik, kredit akun bank.
- HORMATI saldo normal tiap akun. Beban & aset bertambah di DEBIT; pendapatan, utang, dan modal bertambah di KREDIT.
- "debitKode" dan "kreditKode" WAJIB berbeda, dan keduanya harus ada di daftar di atas.
- Kalau keterangannya terlalu kabur untuk ditebak dengan yakin, kembalikan array KOSONG. Saran yang salah lebih berbahaya daripada tidak ada saran — pengguna cenderung menerima apa yang sudah terisi.
- Variasi antar-pasangan sebaiknya pada bagian yang memang sering berbeda, misalnya akun kas/bank mana yang dipakai.
- "confidence": 0–100, seberapa yakin pasangan itu benar.
- "reason": alasan singkat dalam Bahasa Indonesia, maksimal 12 kata.

Kembalikan HANYA array JSON sesuai skema.`

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
    throw new Error('Gemini mengembalikan JSON yang tidak valid saat menyarankan akun jurnal.')
  }
  if (!Array.isArray(parsed)) return []

  return (parsed as Record<string, unknown>[])
    .map(r => ({
      debitKode: String(r.debitKode ?? '').trim(),
      kreditKode: String(r.kreditKode ?? '').trim(),
      confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0))),
      reason: String(r.reason ?? '').trim(),
    }))
    // Pasangan dengan sisi kosong atau dua sisi yang sama BUKAN jurnal — dibuang
    // di sini supaya route tidak perlu mengulang aturan yang sama.
    .filter(r => r.debitKode !== '' && r.kreditKode !== '' && r.debitKode !== r.kreditKode)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTION_PAIRS)
}
