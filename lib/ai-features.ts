// Sakelar fitur AI, satu env untuk semuanya: AI_FEATURES_ENABLED.
//   "true"            → semua fitur LAMA menyala
//   nilai lain apa pun → semua MATI, termasuk fitur baru (cara mematikan semuanya: isi "false")
//   tidak diisi        → hanya fitur di MENYALA_BILA_KOSONG yang menyala
// Dibaca juga di browser lewat `env` di next.config.mjs (tertanam saat build),
// jadi mengubahnya di Vercel butuh redeploy.
//
// Fitur AI BARU (keputusan Ricko 2026-10-27): masing-masing punya sakelar
// SENDIRI yang bawaannya MATI — juga di Production yang AI_FEATURES_ENABLED-nya
// "true". Fitur baru menyala HANYA bila sakelarnya diisi "true" persis DAN
// AI_FEATURES_ENABLED tidak mematikan semuanya. Dengan begitu merilis kodenya
// tidak sama dengan menyalakannya; yang menyalakan adalah langkah sadar di
// Vercel (untuk rekening koran: X7, sesudah gerbang X0 dan D54).
export const AI_NONAKTIF = 'Fitur AI belum diaktifkan.'

/** Fitur yang sudah ada sebelum aturan sakelar sendiri — perilakunya tidak berubah. */
export const FITUR_LAMA = ['saranAkunJurnal', 'saranCoa', 'ekstraksiLaporan'] as const
export type FiturLama = (typeof FITUR_LAMA)[number]
/** Setiap fitur baru WAJIB terdaftar di SAKELAR_SENDIRI (dipaksa kompilator). */
export type FiturBaru = 'ekstraksiRekeningKoran'
export type FiturAi = FiturLama | FiturBaru

// D55 opsi (b), keputusan Ricko 2026-10-26: saran COA Mapping & ekstraksi PDF
// laporan tetap menyala sementara Gemini paid tier diurus — kosongkan daftar ini
// saat Ricko memerintahkan. Batas waktu 9 Nov 2026 (ROADMAP, risiko terbuka).
const MENYALA_BILA_KOSONG: readonly FiturAi[] = ['saranCoa', 'ekstraksiLaporan']

// Nama env ditulis LITERAL di dalam fungsi supaya Next menanamkannya ke bundel
// browser (lewat `env` di next.config.mjs) — `process.env[nama]` tidak ditanam.
const SAKELAR_SENDIRI: { [F in FiturBaru]: { env: string; baca: () => string | undefined } } = {
  ekstraksiRekeningKoran: { env: 'AI_EKSTRAKSI_REKENING_KORAN', baca: () => process.env.AI_EKSTRAKSI_REKENING_KORAN },
}

const fiturBaru = (f: FiturAi): f is FiturBaru => f in SAKELAR_SENDIRI

/** Nama env sakelar sendiri sebuah fitur baru — untuk pesan & dokumentasi. */
export function envSakelarSendiri(f: FiturBaru): string {
  return SAKELAR_SENDIRI[f].env
}

export function aiFeaturesEnabled(
  fitur: FiturAi,
  v = process.env.AI_FEATURES_ENABLED,
  khusus: string | undefined = fiturBaru(fitur) ? SAKELAR_SENDIRI[fitur].baca() : undefined
): boolean {
  const semuaKosong = v === undefined || v === ''
  if (fiturBaru(fitur)) return khusus === 'true' && (semuaKosong || v === 'true')
  if (semuaKosong) return MENYALA_BILA_KOSONG.includes(fitur)
  return v === 'true'
}
