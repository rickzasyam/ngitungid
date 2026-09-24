// Pemformat input angka SAAT MENGETIK — otak komponen <NominalInput>.
// MURNI (tanpa React, tanpa DOM) dan TANPA RegExp (D22), supaya seluruh
// perilakunya — termasuk posisi kursor — bisa diuji di lib/nominal-input.test.ts.
//
// ══ DUA WUJUD SATU ANGKA ══════════════════════════════════════════════════
// Yang TAMPIL di field memakai format Indonesia yang sama dengan tampilan Rp:
// titik = ribuan (dipasang otomatis), koma = desimal. Yang DISIMPAN di state
// form dan DIKIRIM ke server tetap bentuk kanonik ("1000000.25" untuk uang,
// "2.5000" untuk qty). Pemformatan tidak pernah bocor ke nilai.
//
// ══ TOMBOL TITIK = PEMISAH DESIMAL (keputusan 2026-09-24) ════════════════
// Karena titik ribuan dipasang otomatis, pengguna tidak pernah perlu
// mengetiknya. Tombol titik yang diketik dianggap pemisah DESIMAL (kebiasaan
// keypad numerik) dan diganti koma — bukan diabaikan. Konsekuensinya: orang
// yang tetap mengetik titik ribuan sendiri ("1.000") mendapat "1,00" dan angka
// ketiga di belakang koma ditolak; itu terlihat di layar saat itu juga.
//
// ══ YANG DITOLAK, YANG JADI GALAT ═════════════════════════════════════════
// - Angka desimal melebihi batas (2 uang / 4 qty) lewat KETIKAN: tombolnya
//   tidak berefek, kursor tidak bergeser. Menerimanya sebagai teks mentah
//   berbahaya: "1,256" akan dibaca parser bersama sebagai seribu dua ratus.
// - Selain itu, teks yang tidak bisa dibaca (huruf, minus, dua pemisah
//   desimal, tempelan aneh) DIBIARKAN tampil apa adanya dan dikirim ke form
//   mentah — parser bersama (lib/nominal.ts) lalu menandainya galat di field
//   dan Simpan terkunci. Tidak ada yang diam-diam jadi 0.
//
// ══ KURSOR DIHITUNG DARI KANAN ════════════════════════════════════════════
// Posisi kursor dipertahankan sebagai "berapa angka (dan koma) di KANAN-nya".
// Titik ribuan yang muncul/hilang tidak mengubah hitungan itu, jadi kursor
// tidak meloncat ke ujung — termasuk saat mengedit di tengah angka. Backspace
// tepat di belakang titik menghapus ANGKA di depannya (titiknya sendiri akan
// dipasang ulang pemformat, jadi menghapus titik saja tidak mengubah apa pun).

import { bacaAngka } from '@/lib/nominal'

export type MaxDesimal = 2 | 4

export interface KeadaanInput {
  /** Teks yang tampil di field. */
  teks: string
  /** Posisi kursor sesudah pengolahan. */
  caret: number
  /** Nilai untuk form: kanonik bila terbaca, '' bila kosong, teks mentah bila tidak terbaca. */
  nilai: string
}

const adalahDigit = (ch: string) => ch >= '0' && ch <= '9'
const bermakna = (ch: string) => adalahDigit(ch) || ch === ','

/** "1000000" → "1.000.000". Masukan: digit saja. */
function kelompokkan(utuh: string): string {
  let out = ''
  for (let i = 0; i < utuh.length; i++) {
    if (i > 0 && (utuh.length - i) % 3 === 0) out += '.'
    out += utuh[i]
  }
  return out
}

/**
 * Kanonik → tampilan. Desimal nol tidak ditampilkan ("1000000.00" → "1.000.000");
 * sen uang tampil utuh dua angka ("1000000.50" → "1.000.000,50"); desimal qty
 * dipangkas nol di belakangnya ("2.5000" → "2,5").
 */
export function formatTampilan(kanonik: string, maxDesimal: MaxDesimal): string {
  const [utuh = '0', pecahan = ''] = kanonik.split('.')
  const semuaNol = [...pecahan].every(ch => ch === '0')
  if (semuaNol) return kelompokkan(utuh)
  let desimal = pecahan
  if (maxDesimal === 4) {
    let ujung = desimal.length
    while (ujung > 0 && desimal[ujung - 1] === '0') ujung--
    desimal = desimal.slice(0, ujung)
  }
  return `${kelompokkan(utuh)},${desimal}`
}

/**
 * Nilai dari form (kanonik, '' atau mentah) → teks tampilan. Dipakai saat nilai
 * datang dari LUAR ketikan: data ubah, isi otomatis subtotal, reset sesudah simpan.
 */
export function tampilanDari(nilai: string, maxDesimal: MaxDesimal): string {
  if (nilai.trim() === '') return ''
  const h = bacaAngka(nilai, maxDesimal)
  return h.status === 'ok' ? formatTampilan(h.nilai, maxDesimal) : nilai
}

type Ketikan =
  | { jenis: 'kosong' }
  | { jenis: 'ok'; utuh: string; pecahan: string; adaKoma: boolean }
  | { jenis: 'berlebih' }
  | { jenis: 'bukan' }

/**
 * Baca teks field sebagai KETIKAN: titik = ribuan (dibuang), koma = desimal
 * (paling banyak satu). Apa pun di luar itu → 'bukan' (diserahkan ke parser
 * bersama). Desimal melebihi batas → 'berlebih'.
 */
function bacaKetikan(teks: string, maxDesimal: MaxDesimal): Ketikan {
  let utuh = ''
  let pecahan = ''
  let adaKoma = false
  for (const ch of teks) {
    if (adalahDigit(ch)) {
      if (adaKoma) pecahan += ch
      else utuh += ch
      continue
    }
    if (ch === ',') {
      if (adaKoma) return { jenis: 'bukan' }
      adaKoma = true
      continue
    }
    // Titik di bagian utuh = pemisah ribuan tampilan. Titik di bagian desimal
    // tidak pernah dibuat pemformat — itu bukan ketikan yang bisa dibaca.
    if (ch === '.' && !adaKoma) continue
    return { jenis: 'bukan' }
  }
  if (utuh === '' && pecahan === '' && !adaKoma) return { jenis: 'kosong' }
  if (pecahan.length > maxDesimal) return { jenis: 'berlebih' }
  let mulai = 0
  while (mulai < utuh.length - 1 && utuh[mulai] === '0') mulai++
  return { jenis: 'ok', utuh: utuh.slice(mulai) || '0', pecahan, adaKoma }
}

/** Banyaknya angka & koma di kanan kursor. */
function bermaknaDiKanan(teks: string, caret: number): number {
  let n = 0
  for (let i = caret; i < teks.length; i++) if (bermakna(teks[i])) n++
  return n
}

/** Posisi paling kiri yang di kanannya ada tepat `kanan` angka/koma. */
function posisiDariKanan(teks: string, kanan: number): number {
  let total = 0
  for (const ch of teks) if (bermakna(ch)) total++
  const target = total - kanan
  if (target <= 0) return 0
  let n = 0
  for (let i = 0; i < teks.length; i++) {
    if (bermakna(teks[i]) && ++n === target) return i + 1
  }
  return teks.length
}

/** Inti bersama ketik & tempel: teks mentah + kursor → keadaan baru, atau null (tolak). */
function olah(teks: string, caret: number, maxDesimal: MaxDesimal, tolakBerlebih: boolean): KeadaanInput | null {
  const k = bacaKetikan(teks, maxDesimal)
  if (k.jenis === 'kosong') return { teks: '', caret: 0, nilai: '' }
  if (k.jenis === 'berlebih' && tolakBerlebih) return null
  if (k.jenis === 'ok') {
    const tampil = kelompokkan(k.utuh) + (k.adaKoma ? `,${k.pecahan}` : '')
    return {
      teks: tampil,
      caret: posisiDariKanan(tampil, bermaknaDiKanan(teks, caret)),
      nilai: `${k.utuh}.${(k.pecahan + '0000').slice(0, maxDesimal)}`,
    }
  }
  // Bukan ketikan biasa: biarkan parser bersama memutuskan. Terbaca → dirapikan;
  // tidak terbaca → tampil & dikirim mentah, galatnya muncul di field.
  const h = bacaAngka(teks, maxDesimal)
  if (h.status === 'ok') {
    const tampil = formatTampilan(h.nilai, maxDesimal)
    return { teks: tampil, caret: posisiDariKanan(tampil, bermaknaDiKanan(teks, caret)), nilai: h.nilai }
  }
  return { teks, caret, nilai: teks }
}

/**
 * Satu ketikan/hapusan. `sesudah` & `caret` adalah keadaan field SETELAH
 * browser menerapkan tombolnya; `jenis` = InputEvent.inputType bila ada.
 * Tolak → keadaan sebelum dikembalikan, kursor di tempat semula.
 */
export function olahKetikan(a: {
  sebelum: string
  nilaiSebelum: string
  sesudah: string
  caret: number
  jenis?: string
  maxDesimal: MaxDesimal
}): KeadaanInput {
  let teks = a.sesudah
  let caret = a.caret

  // Tombol titik → koma desimal (lihat kepala berkas).
  if (
    teks.length === a.sebelum.length + 1 &&
    caret > 0 &&
    teks[caret - 1] === '.' &&
    teks.slice(0, caret - 1) + teks.slice(caret) === a.sebelum
  ) {
    teks = `${teks.slice(0, caret - 1)},${teks.slice(caret)}`
  }

  // Menghapus TITIK RIBUAN sendirian tidak berarti apa-apa (pemformat akan
  // memasangnya lagi), jadi yang dihapus adalah angka di sebelahnya.
  if (
    teks.length === a.sebelum.length - 1 &&
    a.sebelum[caret] === '.' &&
    teks === a.sebelum.slice(0, caret) + a.sebelum.slice(caret + 1) &&
    bacaKetikan(a.sebelum, a.maxDesimal).jenis === 'ok'
  ) {
    if (a.jenis === 'deleteContentForward') {
      if (adalahDigit(teks[caret] ?? '')) teks = teks.slice(0, caret) + teks.slice(caret + 1)
    } else if (caret > 0 && adalahDigit(teks[caret - 1])) {
      teks = teks.slice(0, caret - 1) + teks.slice(caret)
      caret--
    }
  }

  const hasil = olah(teks, caret, a.maxDesimal, true)
  if (hasil) return hasil
  const kembali = Math.max(0, a.caret - (a.sesudah.length - a.sebelum.length))
  return { teks: a.sebelum, caret: kembali, nilai: a.nilaiSebelum }
}

/**
 * Tempel. Teks tempelan dibaca parser bersama lebih dulu — "Rp 1.500.000,-",
 * "1500000", "1,500,000.25" semuanya jadi angka yang sama — lalu disisipkan
 * di posisi seleksi. Tempelan yang tidak terbaca disisipkan mentah → galat.
 */
export function olahTempel(a: {
  teks: string
  awal: number
  akhir: number
  tempel: string
  maxDesimal: MaxDesimal
}): KeadaanInput {
  const h = bacaAngka(a.tempel, a.maxDesimal)
  let sisipan = a.tempel
  if (h.status === 'ok') {
    // Bentuk polos tanpa titik ribuan, supaya bisa menyatu dengan angka yang
    // sudah ada di kiri/kanannya sebelum dikelompokkan ulang.
    const [utuh] = h.nilai.split('.')
    const [, desimal] = formatTampilan(h.nilai, a.maxDesimal).split(',')
    sisipan = desimal === undefined ? utuh : `${utuh},${desimal}`
  }
  const teks = a.teks.slice(0, a.awal) + sisipan + a.teks.slice(a.akhir)
  const caret = a.awal + sisipan.length
  return olah(teks, caret, a.maxDesimal, false) ?? { teks, caret, nilai: teks }
}

/**
 * Rapikan saat field ditinggalkan: "1.000,00" → "1.000", "1.000,5" → "1.000,50"
 * (uang). Teks yang tidak terbaca dibiarkan — galatnya harus tetap terlihat.
 */
export function rapikan(nilai: string, teks: string, maxDesimal: MaxDesimal): string {
  const h = bacaAngka(nilai, maxDesimal)
  return h.status === 'ok' ? formatTampilan(h.nilai, maxDesimal) : teks
}
