// Preferensi tampilan per-user. MURNI (tanpa I/O, tanpa DB) supaya bisa diuji
// tanpa database — pola sama dengan lib/api/password-change.ts.
//
// Scope per-USER (bukan per-klien / bukan global): bahasa itu preferensi
// pribadi, dan akan ada 4 akunting + akun klien yang boleh berbeda-beda.
// Konsistensi laporan yang dilihat klien dijaga di titik EKSPOR (format tetap
// untuk PDF), bukan dengan menyeragamkan layar semua orang.

/** Bahasa antarmuka. TERSIMPAN & bertahan, tapi BELUM berefek apa pun —
 *  penerjemahan adalah Task 4. Jangan menambah library locale di sini. */
export const LANGUAGES = ['id', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

/**
 * Format penulisan nominal. FORMAT TAMPILAN SAJA:
 *   'idr'  → Rp 1.234.567
 *   'intl' → IDR 1,234,567
 *
 * BUKAN mata uang dan BUKAN konversi. Semua nilai di sistem ini Rupiah; tidak
 * ada kurs, tidak ada pengali, dan tidak boleh ada parameter yang menyiratkan
 * konversi. Yang berubah hanya simbol dan pemisah ribuan/desimal.
 *
 * Dinamai 'idr' (bukan 'id') dengan sengaja: kolom language juga memakai 'id',
 * dan dua kolom bernilai 'id' dalam satu baris berarti dua hal yang berbeda.
 */
export const CURRENCY_FORMATS = ['idr', 'intl'] as const
export type CurrencyFormat = (typeof CURRENCY_FORMATS)[number]

export interface Preferences {
  language: Language
  currencyFormat: CurrencyFormat
}

/** Default = apa yang ditulis migrasi 0006 sebagai DEFAULT kolom. Satu sumber
 *  supaya UI tidak pernah menampilkan nilai awal yang beda dari isi DB. */
export const DEFAULT_PREFERENCES: Preferences = { language: 'id', currencyFormat: 'idr' }

export const isLanguage = (v: unknown): v is Language =>
  typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v)

export const isCurrencyFormat = (v: unknown): v is CurrencyFormat =>
  typeof v === 'string' && (CURRENCY_FORMATS as readonly string[]).includes(v)

export type PreferencesCheck =
  | { ok: true; preferences: Preferences }
  | { ok: false; error: string }

/**
 * Validasi body PUT. Kedua field WAJIB ada — endpoint-nya mengganti seluruh
 * preferensi sekaligus (bukan patch per-field), jadi body setengah lengkap
 * hampir selalu berarti pemanggilnya salah, bukan bermaksud "biarkan yang lain".
 *
 * `currency_format` bertipe text di DB (tanpa CHECK constraint) supaya menambah
 * format tampilan baru tidak butuh migrasi — konsekuensinya validasi DI SINI
 * adalah satu-satunya penjaga nilai kolom itu.
 */
export function validatePreferences(body: { language?: unknown; currencyFormat?: unknown }): PreferencesCheck {
  if (!isLanguage(body.language)) {
    return { ok: false, error: `Bahasa harus salah satu dari: ${LANGUAGES.join(', ')}.` }
  }
  if (!isCurrencyFormat(body.currencyFormat)) {
    return { ok: false, error: `Format nominal harus salah satu dari: ${CURRENCY_FORMATS.join(', ')}.` }
  }
  return { ok: true, preferences: { language: body.language, currencyFormat: body.currencyFormat } }
}

/** Baris DB → Preferences, dengan fallback ke default kalau isinya tak dikenal.
 *  Kolom currency_format bertipe text, jadi nilai asing secara teori mungkin
 *  ada; UI tidak boleh pecah karenanya. */
export function normalizePreferences(row: { language?: unknown; currencyFormat?: unknown }): Preferences {
  return {
    language: isLanguage(row.language) ? row.language : DEFAULT_PREFERENCES.language,
    currencyFormat: isCurrencyFormat(row.currencyFormat) ? row.currencyFormat : DEFAULT_PREFERENCES.currencyFormat,
  }
}
