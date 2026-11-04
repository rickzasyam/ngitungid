import { ThinkingLevel, Type, type Schema, type ThinkingConfig } from '@google/genai'
import { GEMINI_MODEL, generateContentWithRetry, getGeminiClient } from '@/lib/gemini/client'
import type { AiProvider, BagianIsi, SkemaJson } from './penyedia'
import { ulangGemini } from './ulang-gemini'

// Adaptor Gemini (X1). Klien, model bawaan, dan retry TIDAK dipindah: ekstraksi
// laporan (/upload) dan saran COA Mapping masih memakai lib/gemini/client.ts
// langsung dan sengaja tidak disentuh — adaptor ini memakai ulang klien yang
// sama, jadi kunci, model, dan perilaku retry-nya identik.

const TIPE: Record<Exclude<SkemaJson['type'], 'array' | 'object'>, Type> = {
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
}

/** Skema netral → `responseSchema` Gemini (huruf besar, enum `Type`). */
export function skemaGemini(s: SkemaJson): Schema {
  if (s.type === 'array') return { type: Type.ARRAY, items: skemaGemini(s.items) }
  if (s.type === 'object') {
    const properties: Record<string, Schema> = {}
    for (const [k, v] of Object.entries(s.properties)) properties[k] = skemaGemini(v)
    return { type: Type.OBJECT, properties, required: s.required }
  }
  return { type: TIPE[s.type] }
}

function bagianGemini(b: BagianIsi) {
  return b.jenis === 'teks' ? { text: b.teks } : { inlineData: { mimeType: 'image/png', data: b.base64 } }
}

/**
 * Pilihan untuk fitur BARU. Keduanya tidak diisi = perilaku fitur lama, persis
 * seperti sebelum X1 (saran akun jurnal memanggil `penyediaGemini()` tanpa opsi).
 */
export type OpsiGemini = {
  /** Kecilkan "thinking": menyusun struktur tabel tidak butuh penalaran, dan token berpikir dibayar sebagai keluaran. */
  berpikirMinimal?: boolean
  /** Kebijakan ulang lapisan baru (`ulangGemini`): kuota harian tidak diulang. */
  ulangBaru?: boolean
}

/**
 * Gemini 2.x mengatur penalaran lewat anggaran token (0 = mati); Gemini 3 ke
 * atas lewat tingkat, dan MINIMAL adalah yang terkecil (tidak semua model
 * menerima "mati").
 */
export function konfigBerpikirMinimal(model: string): ThinkingConfig {
  return model.startsWith('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.MINIMAL }
}

export function penyediaGemini(model: string = GEMINI_MODEL, opsi: OpsiGemini = {}): AiProvider {
  return {
    nama: 'gemini',
    model,
    async mintaJson({ sistem, isi, skema, timeoutMs }) {
      const params = {
        model,
        contents: isi.map(bagianGemini),
        config: {
          ...(sistem ? { systemInstruction: sistem } : {}),
          responseMimeType: 'application/json',
          responseSchema: skemaGemini(skema),
          // Semua pemakaian Gemini di repo ini deterministik: saran akuntansi dan
          // penyusunan tabel tidak boleh berubah tiap kali tombol ditekan.
          temperature: 0,
          ...(opsi.berpikirMinimal ? { thinkingConfig: konfigBerpikirMinimal(model) } : {}),
          ...(timeoutMs ? { httpOptions: { timeout: timeoutMs } } : {}),
        },
      }
      const response = opsi.ulangBaru
        ? await ulangGemini(() => getGeminiClient().models.generateContent(params))
        : await generateContentWithRetry(params)
      const u = response.usageMetadata
      return {
        teks: response.text ?? '',
        model,
        pemakaian: {
          tokenMasuk: u?.promptTokenCount ?? 0,
          tokenKeluar: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
        },
      }
    },
  }
}
