import { GalatAi } from './penyedia'

// Kebijakan ulang lapisan AI BARU (ekstraksi rekening koran) — keputusan Ricko
// 2026-10-28:
//  - Kuota HARIAN habis (429 RESOURCE_EXHAUSTED, quotaId "…PerDay…") TIDAK
//    diulang: langsung `GalatAi('kuotaHarian')`. Mengulangnya cuma menunggu
//    dan tidak pernah berhasil sebelum kuota direset.
//  - Batas per menit (429 lainnya) dan 503 diulang dengan jeda: `retryDelay`
//    dari server bila ada, selain itu naik per percobaan; paling lama
//    JEDA_MAKS_MS, paling banyak MAKS_PERCOBAAN.
//  - Galat lain diteruskan apa adanya (`jenisGalatAi` yang memilahnya).
//
// Fitur AI lama tetap memakai `generateContentWithRetry` (lib/gemini/client.ts)
// dan perilakunya tidak berubah.
//
// Tanpa ekspresi reguler (D22).

export const MAKS_PERCOBAAN = 4
export const JEDA_MAKS_MS = 60_000

type InfoGalat = { status: number | undefined; kuota: boolean; harian: boolean; jedaServerMs: number | null }

/** `retryDelay` Google berbentuk detik dengan akhiran "s", mis. "41s" atau "0.5s". */
function bacaDetik(v: unknown): number | null {
  if (typeof v !== 'string' || !v.endsWith('s')) return null
  const n = Number(v.slice(0, -1))
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n * 1000) : null
}

/**
 * `ApiError` @google/genai membawa `status` dan `message` berisi JSON jawaban
 * server (`{"error":{…,"details":[…]}}`). JSON yang tidak terbaca tetap dipilah
 * dari teksnya — pesannya memuat quotaId apa adanya.
 */
export function bacaGalatGemini(e: unknown): InfoGalat {
  const raw = (e as { status?: unknown } | null)?.status
  const status = typeof raw === 'number' ? raw : undefined
  const pesan = e instanceof Error ? e.message : String(e)
  let jedaServerMs: number | null = null
  try {
    const details = (JSON.parse(pesan) as { error?: { details?: unknown } }).error?.details
    if (Array.isArray(details)) {
      for (const d of details) jedaServerMs ??= bacaDetik((d as { retryDelay?: unknown } | null)?.retryDelay)
    }
  } catch {
    // bukan JSON — cukup dipilah dari teks di bawah
  }
  const kuota = status === 429 || pesan.includes('RESOURCE_EXHAUSTED')
  return { status, kuota, harian: kuota && (pesan.includes('PerDay') || pesan.includes('per day')), jedaServerMs }
}

export async function ulangGemini<T>(
  panggil: () => Promise<T>,
  opsi: { tidur?: (ms: number) => Promise<void>; maksPercobaan?: number } = {}
): Promise<T> {
  const tidur = opsi.tidur ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const maks = opsi.maksPercobaan ?? MAKS_PERCOBAAN
  for (let ke = 1; ; ke++) {
    try {
      return await panggil()
    } catch (e) {
      const g = bacaGalatGemini(e)
      if (g.harian) {
        throw new GalatAi('kuotaHarian', 'Kuota harian penyedia AI habis — tidak diulang; coba lagi sesudah kuota direset.', { cause: e })
      }
      if (!(g.kuota || g.status === 503) || ke >= maks) throw e
      await tidur(Math.min(Math.max(g.jedaServerMs ?? 0, 2000 * ke), JEDA_MAKS_MS))
    }
  }
}
