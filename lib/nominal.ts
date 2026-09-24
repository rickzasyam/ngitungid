// Pembaca NOMINAL uang dari teks ketikan manusia. MURNI, TANPA RegExp (D22).
//
// ══ SATU ATURAN PEMISAH UNTUK SELURUH SISTEM ══════════════════════════════
// Dipakai tiga pintu, dan ketiganya WAJIB membaca teks yang sama sebagai angka
// yang sama:
//   - form (jurnal, pembelian, mutasi, alokasi) — lewat toMinorUnits/pesanGalatNominal,
//   - validasi server — normalizeNominal (lib/contracts.ts) memanggil bacaNominal,
//   - impor CSV mutasi kas — parseNominalCell memakai pemisahDesimal di bawah.
// Kalau form membaca "1.000" sebagai seribu tapi CSV membacanya satu, akunting
// yang mengetik ulang baris CSV ke form mendapat angka lain tanpa ada yang tahu.
//
// ══ ATURANNYA ═════════════════════════════════════════════════════════════
//   1. Titik DAN koma muncul → yang muncul TERAKHIR adalah desimal
//      ("1.500.000,25", juga "1,500,000.25").
//   2. Hanya satu jenis, muncul SEKALI, diikuti 0–2 angka → desimal
//      ("500000,25", "500000.25", "500000,5", "5,").
//   3. Selain itu semuanya pemisah ribuan ("1.000", "1.500.000", "1,000").
// Dasarnya: pemisah ribuan SELALU diikuti tepat 3 angka. Satu atau dua angka di
// belakang pemisah hanya bisa berarti desimal — maka "1.000" seribu, dan
// "1.000,5" seribu lima puluh sen.
//
// ══ KETAT DI FORM, LONGGAR DI CSV ═════════════════════════════════════════
// bacaNominal (form & server) MENOLAK yang tidak bisa dibaca dengan pasti:
// kelompok ribuan yang bukan 3 angka ("12.345.67"), lebih dari 2 desimal,
// tanda minus, huruf. Yang ditolak jadi galat di field-nya — tidak pernah
// diam-diam jadi 0. parseNominalCell (CSV) tetap memakai tebakan longgarnya
// sendiri untuk hal-hal di luar klasifikasi pemisah (huruf DB/CR diabaikan,
// negatif dalam kurung, desimal ke-3 dipotong) karena rekening koran memang
// begitu bentuknya; yang dibagi adalah KLASIFIKASI pemisahnya.

export type Pemisah = '.' | ','

export interface RingkasPemisah {
  jumlahDigit: number
  titik: { jumlah: number; posisiTerakhir: number }
  koma: { jumlah: number; posisiTerakhir: number }
  /** Jenis pemisah yang muncul PALING AKHIR di teks; null bila tidak ada. */
  terakhir: Pemisah | null
}

/**
 * Pemisah mana yang DESIMAL — null bila semuanya pemisah ribuan (atau tidak
 * ada pemisah). `posisiTerakhir` = jumlah digit SEBELUM pemisah itu.
 *
 * `maxDesimal` 2 untuk uang (bawaan, dipakai CSV & server), 4 untuk qty. Tepat
 * 3 angka di belakang satu pemisah SELALU ribuan, berapa pun batasnya — itu
 * yang membuat "1.000" seribu baik sebagai rupiah maupun sebagai qty.
 */
export function pemisahDesimal(r: RingkasPemisah, maxDesimal = 2): Pemisah | null {
  const adaTitik = r.titik.jumlah > 0
  const adaKoma = r.koma.jumlah > 0
  if (adaTitik && adaKoma) return r.terakhir
  if (!adaTitik && !adaKoma) return null
  const ch: Pemisah = adaTitik ? '.' : ','
  const p = adaTitik ? r.titik : r.koma
  const sesudah = r.jumlahDigit - p.posisiTerakhir
  return p.jumlah === 1 && sesudah !== 3 && sesudah <= maxDesimal ? ch : null
}

export type BacaNominal =
  | { status: 'kosong' }
  | { status: 'ok'; nilai: string }
  | { status: 'galat'; pesan: string }

export const CONTOH_NOMINAL = '1.500.000,25 · 1500000,25 · 1500000.25'

const GALAT_FORMAT = `Format nominal tidak terbaca. Contoh yang diterima: ${CONTOH_NOMINAL}.`
const GALAT_NEGATIF = 'Nominal tidak boleh negatif — tulis tanpa tanda minus.'
const GALAT_KARAKTER = 'Nominal hanya boleh berisi angka, titik, dan koma.'
const galatDesimal = (maxDesimal: number) =>
  maxDesimal === 2 ? 'Paling banyak 2 angka desimal (sen).' : `Paling banyak ${maxDesimal} angka desimal.`
const GALAT_BESAR = 'Nominal terlalu besar.'

const huruf = (s: string) => {
  let out = ''
  for (const ch of s) {
    const k = ch.codePointAt(0) ?? 0
    out += k >= 65 && k <= 90 ? String.fromCharCode(k + 32) : ch
  }
  return out
}

/**
 * Teks → angka kanonik (`maxDesimal` desimal, tanpa pemisah), `kosong`, atau
 * galat dengan pesan yang bisa ditampilkan apa adanya di bawah field.
 * Uang memakai bacaNominal (2 desimal: "1500000.25"); qty memakai bacaQty
 * (4 desimal: "2.5000", bentuk yang sama dengan normalizeQty di server).
 *
 * Diterima juga, karena lazim diketik dan tidak mengubah nilai: awalan "Rp",
 * "Rp." dan "IDR"; akhiran ",-" / ".-" ("tanpa sen"); spasi di mana pun.
 */
export function bacaAngka(raw: unknown, maxDesimal: 2 | 4): BacaNominal {
  if (typeof raw !== 'string') return { status: 'galat', pesan: GALAT_FORMAT }
  let teks = raw.trim()
  if (teks === '') return { status: 'kosong' }

  const awal = huruf(teks.slice(0, 3))
  if (awal.startsWith('rp')) {
    teks = teks.slice(2).trimStart()
    if (teks.startsWith('.')) teks = teks.slice(1)
  } else if (awal === 'idr') {
    teks = teks.slice(3)
  }
  teks = teks.trim()
  if (teks.endsWith(',-') || teks.endsWith('.-')) teks = teks.slice(0, -2)

  const digit: string[] = []
  const pemisah: { ch: Pemisah; posisi: number }[] = []
  for (const ch of teks) {
    if (ch >= '0' && ch <= '9') {
      digit.push(ch)
      continue
    }
    if (ch === '.' || ch === ',') {
      pemisah.push({ ch, posisi: digit.length })
      continue
    }
    // Spasi biasa dan NBSP (ikut tersalin dari PDF/Excel) tidak bermakna.
    if (ch === ' ' || ch === ' ') continue
    if (ch === '-' || ch === '(' || ch === ')') return { status: 'galat', pesan: GALAT_NEGATIF }
    return { status: 'galat', pesan: GALAT_KARAKTER }
  }
  if (digit.length === 0) return { status: 'galat', pesan: GALAT_FORMAT }

  const ringkas: RingkasPemisah = {
    jumlahDigit: digit.length,
    titik: { jumlah: 0, posisiTerakhir: -1 },
    koma: { jumlah: 0, posisiTerakhir: -1 },
    terakhir: null,
  }
  for (const p of pemisah) {
    const slot = p.ch === '.' ? ringkas.titik : ringkas.koma
    slot.jumlah++
    slot.posisiTerakhir = p.posisi
    ringkas.terakhir = p.ch
  }

  const desimal = pemisahDesimal(ringkas, maxDesimal)
  let ujungUtuh = digit.length
  let ribuan = pemisah
  if (desimal !== null) {
    // Pemisah desimal hanya sah sekali, dan harus yang terakhir: "1,000.000,5"
    // mencampur dua peran untuk satu karakter.
    const jumlah = desimal === '.' ? ringkas.titik.jumlah : ringkas.koma.jumlah
    if (jumlah !== 1 || pemisah[pemisah.length - 1].ch !== desimal) {
      return { status: 'galat', pesan: GALAT_FORMAT }
    }
    ujungUtuh = pemisah[pemisah.length - 1].posisi
    ribuan = pemisah.slice(0, -1)
  }

  // Kelompok ribuan: yang pertama 1–3 angka, sisanya TEPAT 3. "12.345.67" dan
  // "1.50.000" ditolak — keduanya lebih mungkin salah ketik daripada nominal
  // yang dimaksud, dan menebaknya berarti menyimpan angka yang tidak diketik.
  if (ribuan.length > 0) {
    let sebelum = 0
    for (let i = 0; i < ribuan.length; i++) {
      const panjang = ribuan[i].posisi - sebelum
      if (i === 0 ? panjang < 1 || panjang > 3 : panjang !== 3) {
        return { status: 'galat', pesan: GALAT_FORMAT }
      }
      sebelum = ribuan[i].posisi
    }
    if (ujungUtuh - sebelum !== 3) return { status: 'galat', pesan: GALAT_FORMAT }
  }

  const digitDesimal = digit.length - ujungUtuh
  if (digitDesimal > maxDesimal) return { status: 'galat', pesan: galatDesimal(maxDesimal) }

  let mulai = 0
  while (mulai < ujungUtuh - 1 && digit[mulai] === '0') mulai++
  const utuh = digit.slice(mulai, ujungUtuh).join('') || '0'
  const pecahan = (digit.slice(ujungUtuh).join('') + '0000').slice(0, maxDesimal)
  return { status: 'ok', nilai: `${utuh}.${pecahan}` }
}

/** Nominal uang: kanonik 2 desimal ("1500000.25"). */
export function bacaNominal(raw: unknown): BacaNominal {
  return bacaAngka(raw, 2)
}

/** Qty barang: kanonik 4 desimal ("2.5000") — sama dengan normalizeQty server. */
export function bacaQty(raw: unknown): BacaNominal {
  return bacaAngka(raw, 4)
}

/** Pesan galat field qty, atau null bila kosong/terbaca. */
export function pesanGalatQty(raw: unknown): string | null {
  const h = bacaQty(raw)
  return h.status === 'galat' ? h.pesan.replace('Nominal', 'Qty').replace('nominal', 'qty') : null
}

/**
 * Pesan galat untuk ditampilkan DI FIELD, atau null bila teksnya kosong atau
 * terbaca. Menambahkan satu hal di atas bacaNominal: batas aman SEN
 * (Number.MAX_SAFE_INTEGER, ± Rp 90 triliun) yang dijaga toMinorUnits — supaya
 * field tidak tampak sah lalu ditolak server tanpa penjelasan.
 */
export function pesanGalatNominal(raw: unknown): string | null {
  const h = bacaNominal(raw)
  if (h.status === 'kosong') return null
  if (h.status === 'galat') return h.pesan
  const [utuh, pecahan] = h.nilai.split('.')
  return Number.isSafeInteger(Number(utuh) * 100 + Number(pecahan)) ? null : GALAT_BESAR
}
