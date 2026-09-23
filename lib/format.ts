// Rumah tunggal untuk memformat NOMINAL RUPIAH. Murni (tanpa I/O, tanpa React)
// supaya bisa diuji langsung; pengikatan ke preferensi user ada di hook
// `useRupiah()` di lib/preferences-context.tsx (modul client, pemilik preferensi).
//
// ══ TAMPILAN SAJA, BUKAN KONVERSI ══════════════════════════════════════════
// Setiap angka di sistem ini Rupiah. Yang berbeda antar format HANYA simbol dan
// pemisah ribuan/desimal — digitnya identik, selalu. Tidak ada kurs, tidak ada
// pengali, dan TIDAK ADA parameter kode mata uang: satu-satunya argumen adalah
// gaya penulisan, jadi memanggil fungsi ini dengan "mata uang lain" bukan hanya
// dilarang, melainkan tidak bisa diungkapkan.
//
// Sengaja TIDAK memakai Intl style:'currency'. API itu memang tidak mengonversi,
// tapi ia menerima kode mata uang — permukaan yang tidak boleh ada di sini.
// Dipakai style:'decimal' lalu simbolnya ditempel sendiri.
//
// CATATAN: file ini KHUSUS nominal. Formatter TANGGAL sengaja tidak dipindahkan
// ke sini dan tetap di tempatnya masing-masing (`fmtTanggal` memakai
// `ymd.split('-')`). Alasannya di komentar bagian bawah file.

import type { CurrencyFormat } from '@/lib/api/preferences'

/** Simbol + locale pemisah per gaya. 'idr' = gaya Indonesia (titik ribuan),
 *  'intl' = gaya internasional (koma ribuan). */
const STYLE: Record<CurrencyFormat, { symbol: string; locale: string }> = {
  idr: { symbol: 'Rp', locale: 'id-ID' },
  intl: { symbol: 'IDR', locale: 'en-US' },
}

/** Semua nominal di sistem ini bulat — tidak ada sen dalam laporan klien. */
const groupDigits = (abs: number, format: CurrencyFormat): string =>
  new Intl.NumberFormat(STYLE[format].locale, {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(Math.round(abs))

/**
 * Nominal penuh DENGAN simbol. Negatif memakai kurung, mengikuti konvensi
 * laporan akuntansi (bukan tanda minus).
 *   idr  → "Rp 1.234.567"   negatif → "(Rp 1.234.567)"
 *   intl → "IDR 1,234,567"  negatif → "(IDR 1,234,567)"
 */
export function formatRupiah(value: number, format: CurrencyFormat = 'idr'): string {
  const body = `${STYLE[format].symbol} ${groupDigits(Math.abs(value), format)}`
  return value < 0 ? `(${body})` : body
}

/**
 * Nominal PERSIS — TANPA pembulatan ke rupiah utuh.
 *
 * ══ KENAPA FORMATTER KEDUA ══════════════════════════════════════════════
 * `formatRupiah` membulatkan ke rupiah utuh, dengan asumsi lama bahwa laporan
 * klien selalu bulat. Asumsi itu tidak lagi berlaku untuk modul pembelian &
 * mutasi kas: jadwal termin menaruh sisa sen di cicilan terakhir, dan invoice
 * boleh bersen. Di layar REKONSILIASI pembulatan itu fatal — selisih Rp 0,01
 * akan tampil "Rp 0" dan terbaca COCOK. `formatRupiah` sendiri sengaja tidak
 * diubah: ia dipakai di Dashboard & Analytics, di mana angka bulat memang
 * yang diinginkan.
 *
 * Menerima STRING 2 desimal (keluaran fromMinorUnits), bukan number, supaya
 * nilainya tidak pernah melewati float. Sen ditampilkan HANYA bila tidak nol:
 * "Rp 1.210.000" tetap terbaca biasa, "Rp 0,01" tetap terlihat. Negatif memakai
 * kurung, sama dengan formatRupiah.
 */
export function formatRupiahPersis(value: string, format: CurrencyFormat = 'idr'): string {
  const s = String(value ?? '').trim()
  const neg = s.startsWith('-')
  const [intRaw = '', fracRaw = ''] = (neg ? s.slice(1) : s).split('.')

  let mulai = 0
  while (mulai < intRaw.length - 1 && intRaw[mulai] === '0') mulai++
  const int = intRaw.slice(mulai) || '0'
  const frac = (fracRaw + '00').slice(0, 2)

  // Pemisah dipasang per karakter, bukan lewat Intl atas number: nilainya
  // tidak boleh melewati float, berapa pun besarnya.
  const sepRibu = format === 'idr' ? '.' : ','
  const sepDesimal = format === 'idr' ? ',' : '.'
  let dikelompokkan = ''
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % 3 === 0) dikelompokkan += sepRibu
    dikelompokkan += int[i]
  }

  const angka = frac === '00' ? dikelompokkan : `${dikelompokkan}${sepDesimal}${frac}`
  const body = `${STYLE[format].symbol} ${angka}`
  const nol = int === '0' && frac === '00'
  return neg && !nol ? `(${body})` : body
}

/**
 * Digit saja, TANPA simbol — untuk tabel yang kolomnya sudah berjudul mata uang
 * dan harus bisa diadu persis dengan laporan manual klien.
 *   idr  → "1.234.567"   negatif → "(1.234.567)"
 *   intl → "1,234,567"   negatif → "(1,234,567)"
 */
export function formatRupiahPlain(value: number, format: CurrencyFormat = 'idr'): string {
  const body = groupDigits(Math.abs(value), format)
  return value < 0 ? `(${body})` : body
}

// Satuan singkat. HATI-HATI: "M" berarti dua hal berbeda di dua gaya —
// miliar (10^9) di 'idr', million (10^6) di 'intl'. Itu bukan kelalaian
// melainkan konsekuensi memakai singkatan asli masing-masing bahasa; keduanya
// tidak pernah bercampur karena format selalu satu nilai untuk satu pembaca.
const UNITS: Record<CurrencyFormat, { t: number; suffix: string }[]> = {
  idr: [
    { t: 1e9, suffix: 'M' },   // miliar
    { t: 1e6, suffix: 'jt' },  // juta
    { t: 1e3, suffix: 'rb' },  // ribu
  ],
  intl: [
    { t: 1e9, suffix: 'B' },   // billion
    { t: 1e6, suffix: 'M' },   // million
    { t: 1e3, suffix: 'K' },   // thousand
  ],
}

/**
 * Nominal RINGKAS untuk kartu & sumbu grafik, tempat angka penuh tidak muat.
 *   idr  → "Rp 1,2M"  "Rp 5jt"  "Rp 3rb"  "Rp 750"
 *   intl → "IDR 1.2B" "IDR 5M"  "IDR 3K"  "IDR 750"
 * Negatif tetap memakai kurung supaya konsisten dengan dua fungsi di atas.
 */
export function formatRupiahShort(value: number, format: CurrencyFormat = 'idr'): string {
  const { symbol, locale } = STYLE[format]
  const abs = Math.abs(value)

  let body: string
  const unit = UNITS[format].find(u => abs >= u.t)
  if (unit) {
    const scaled = abs / unit.t
    // Satu desimal hanya kalau memang informatif (1,2M) — 5,0jt jadi 5jt.
    const digits = scaled < 10 && Math.round(scaled * 10) % 10 !== 0 ? 1 : 0
    const num = new Intl.NumberFormat(locale, {
      style: 'decimal', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(scaled)
    body = `${symbol} ${num}${unit.suffix}`
  } else {
    body = `${symbol} ${groupDigits(abs, format)}`
  }
  return value < 0 ? `(${body})` : body
}

/** Hanya digit dari sebuah hasil format — dipakai test untuk membuktikan tidak
 *  ada konversi: digit 'idr' dan 'intl' WAJIB identik untuk nilai yang sama. */
export const digitsOf = (formatted: string): string => formatted.replace(/\D/g, '')

// ══ Kenapa formatter TANGGAL tidak ada di sini ════════════════════════════
// `period_start` / `period_end` bertipe `date` di DB dan sampai ke UI sebagai
// string 'YYYY-MM-DD'. Formatter yang ada (`fmtTanggal`) memecah string itu
// dengan `ymd.split('-')` dan TIDAK PERNAH membuat objek Date — justru itulah
// yang membuatnya benar. Sesi terdahulu pernah mengirim `toISOString()` di WIB
// dan melempar periode Januari ke Desember.
//
// Karena setelan timezone DIBATALKAN (bukan ditunda), tidak ada lagi yang bisa
// membuat tanggal bervariasi, sehingga memindahkannya ke sini hanya akan
// menambah risiko "sekalian dimodernkan pakai Intl.DateTimeFormat" tanpa
// manfaat apa pun. Dibiarkan di tempatnya, dengan sengaja.
