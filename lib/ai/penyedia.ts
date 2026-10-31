// Lapisan penyedia AI (MP §5.G X1). Satu antarmuka untuk semua penyedia, supaya
// fitur (saran akun jurnal, ekstraksi rekening koran) tidak tahu SDK mana yang
// dipakai dan penyedia bisa dibandingkan dengan masukan yang sama (X6, D54).
//
// Kontraknya sengaja sempit: satu permintaan → teks JSON mentah. Membaca dan
// memeriksa bentuk JSON itu tugas PEMANGGIL ("keluaran AI selalu lewat penjaga
// bentuk milik kita"), bukan adaptor — adaptor tidak boleh diam-diam
// membetulkan jawaban model.
//
// Gerbang fitur BUKAN di sini: `aiFeaturesEnabled(fitur)` di lib/ai-features.ts
// tetap satu-satunya gerbang, diperiksa route sebelum penyedia mana pun dibuat.

export type NamaPenyedia = 'gemini' | 'anthropic' | 'openai'

export type BagianIsi =
  | { jenis: 'teks'; teks: string }
  /** PNG halaman (base64 tanpa awalan data URL) — cadangan OCR untuk PDF hasil scan. */
  | { jenis: 'gambarPng'; base64: string }

/**
 * Subset JSON Schema yang dipahami ketiga penyedia (Gemini `responseSchema`,
 * Anthropic `output_config.format`, OpenAI `text.format`). Tanpa `enum`,
 * `format`, atau `anyOf`: nilai seperti itu diperiksa penjaga bentuk pemanggil.
 */
export type SkemaJson =
  | { type: 'string' | 'integer' | 'number' | 'boolean' }
  | { type: 'array'; items: SkemaJson }
  | { type: 'object'; properties: Record<string, SkemaJson>; required: string[] }

export type PermintaanJson = {
  /** Instruksi sistem; kosong/tidak diisi = semua instruksi ada di `isi`. */
  sistem?: string
  isi: BagianIsi[]
  skema: SkemaJson
  /** Batas waktu SATU percobaan ke penyedia. Tidak diisi = bawaan SDK. */
  timeoutMs?: number
}

export type JawabanJson = {
  /** Teks JSON sebagaimana dikembalikan model; '' bila model tidak menjawab apa pun. */
  teks: string
  model: string
  /** Untuk perkiraan biaya per dokumen (X6). Token "berpikir" dihitung sebagai keluaran. */
  pemakaian: { tokenMasuk: number; tokenKeluar: number }
}

export interface AiProvider {
  nama: NamaPenyedia
  model: string
  mintaJson(p: PermintaanJson): Promise<JawabanJson>
}

/**
 * Galat yang dilempar adaptor ketika penyebabnya sudah jelas di sisi kita
 * (konfigurasi kurang, jawaban terpotong, model menolak). Galat SDK lain
 * diteruskan apa adanya — `jenisGalatAi` yang memilahnya untuk route.
 */
export class GalatAi extends Error {
  constructor(
    readonly jenis: JenisGalatAi,
    pesan: string,
    opsi?: { cause?: unknown }
  ) {
    super(pesan, opsi)
    this.name = 'GalatAi'
  }
}

/** `kuotaHarian` = kuota HARIAN penyedia habis (lapisan baru tidak mengulangnya — `ulang-gemini.ts`). */
export type JenisGalatAi = 'konfigurasi' | 'kuota' | 'kuotaHarian' | 'batasWaktu' | 'ditolak' | 'lain'

/**
 * Memilah galat penyedia mana pun untuk jawaban HTTP: konfigurasi → 400/503,
 * kuota & kuotaHarian → 429, batas waktu → 504, sisanya 502. Tanpa ekspresi reguler (D22).
 */
export function jenisGalatAi(e: unknown): JenisGalatAi {
  if (e instanceof GalatAi) return e.jenis
  const status = (e as { status?: unknown } | null)?.status
  if (status === 429) return 'kuota'
  const nama = e instanceof Error ? e.name : ''
  if (nama === 'AbortError' || nama === 'TimeoutError' || nama.endsWith('TimeoutError')) return 'batasWaktu'
  const pesan = e instanceof Error ? e.message : String(e)
  // getGeminiClient (lib/gemini/client.ts) melempar Error biasa saat kunci kosong.
  if (pesan.includes('GEMINI_API_KEY')) return 'konfigurasi'
  if (pesan.includes('RESOURCE_EXHAUSTED')) return 'kuota'
  return 'lain'
}

/**
 * Anthropic & OpenAI (mode ketat) mensyaratkan akar skema berupa objek dan
 * `additionalProperties: false` di setiap objek. Skema berakar array
 * dibungkus `{ hasil: … }` lalu dibuka lagi, supaya pemanggil melihat bentuk
 * yang sama dari penyedia mana pun.
 */
export function skemaKetat(s: SkemaJson): { skema: Record<string, unknown>; buka: (teks: string) => string } {
  const ubah = (x: SkemaJson): Record<string, unknown> => {
    if (x.type === 'array') return { type: 'array', items: ubah(x.items) }
    if (x.type === 'object') {
      const properties: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(x.properties)) properties[k] = ubah(v)
      // Mode ketat OpenAI: SEMUA properti wajib disebut di `required`.
      return { type: 'object', properties, required: Object.keys(x.properties), additionalProperties: false }
    }
    return { type: x.type }
  }
  if (s.type === 'object') return { skema: ubah(s), buka: teks => teks }
  return {
    skema: ubah({ type: 'object', properties: { hasil: s }, required: ['hasil'] }),
    buka: teks => {
      // Jawaban yang tidak bisa dibuka diteruskan apa adanya — penjaga bentuk
      // pemanggil yang akan menolaknya dengan pesannya sendiri.
      try {
        const o = JSON.parse(teks) as unknown
        if (o !== null && typeof o === 'object' && 'hasil' in o) return JSON.stringify((o as { hasil: unknown }).hasil)
      } catch {
        // jatuh ke bawah
      }
      return teks
    },
  }
}
