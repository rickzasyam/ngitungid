// Sakelar fitur AI, satu env untuk semuanya: AI_FEATURES_ENABLED.
//   "true"            → semua fitur menyala
//   nilai lain apa pun → semua MATI (cara mematikan semuanya: isi "false")
//   tidak diisi        → hanya fitur di MENYALA_BILA_KOSONG yang menyala
// Dibaca juga di browser lewat `env` di next.config.mjs (tertanam saat build),
// jadi mengubahnya di Vercel butuh redeploy.
export const AI_NONAKTIF = 'Fitur AI belum diaktifkan.'

export type FiturAi = 'saranAkunJurnal' | 'saranCoa' | 'ekstraksiLaporan'

// D55 opsi (b), keputusan Ricko 2026-10-26: saran COA Mapping & ekstraksi PDF
// laporan tetap menyala sementara Gemini paid tier diurus — kosongkan daftar ini
// saat Ricko memerintahkan. Batas waktu 9 Nov 2026 (ROADMAP, risiko terbuka).
const MENYALA_BILA_KOSONG: readonly FiturAi[] = ['saranCoa', 'ekstraksiLaporan']

export function aiFeaturesEnabled(fitur: FiturAi, v = process.env.AI_FEATURES_ENABLED): boolean {
  if (v === undefined || v === '') return MENYALA_BILA_KOSONG.includes(fitur)
  return v === 'true'
}
