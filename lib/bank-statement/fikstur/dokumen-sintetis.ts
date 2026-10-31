import type { BarisMentah, HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { buatPdf, lebarTeks, type HalamanPdf, type TeksPdf } from './pdf-sintetis'

// Rekening koran KARANGAN beserta KEBENARANNYA (HalamanMentah yang seharusnya
// dihasilkan penyusun tabel). Dipakai test X2/X3 dan harness uji banding X4.
// Semua nama & uraian berawalan UJI-B-; tidak ada data klien nyata.
//
// Tafsiran kontrak yang dipakai kebenaran ini (keputusan Ricko 2026-10-27):
//  - satu baris TRANSAKSI tercetak = satu BarisMentah; uraian yang terlipat ke
//    baris tercetak berikutnya DIGABUNG ke uraian transaksinya: teks apa adanya,
//    disambung satu spasi, urut dari atas;
//  - lanjutan yang terpotong ke awal halaman berikutnya: per halaman (jawaban
//    route) menjadi baris berisi uraian saja (`kebenaranHalaman`); di tingkat
//    dokumen digabung ke transaksi di halaman sebelumnya (`kebenaran`,
//    `gabungLintasHalaman`);
//  - judul kolom halaman pertama → `kolom`, BUKAN baris;
//  - judul kolom yang tercetak ULANG di halaman berikut → `kolom` halaman itu
//    DAN dikirim sebagai baris biasa (kontrak: "tetap dikirim sebagai baris biasa");
//  - halaman lanjutan tanpa judul tercetak → `kolom: []`, judul di `nominal`/`lain`
//    memakai judul halaman sebelumnya;
//  - kop surat, alamat, dan nomor halaman di kaki BUKAN baris tabel.

export type Peran = 'tanggal' | 'uraian' | 'nominal1' | 'nominal2' | 'saldo' | 'lain'
type KolomTata = { judul: string; x: number; rata: 'kiri' | 'kanan'; peran: Peran }

export type TataLetak = {
  bentuk: 'satu-kolom' | 'dua-kolom'
  kolom: KolomTata[]
  kop: string[]
  periodeTeks: string | null
}

/** Baris tanpa nomor halaman — nomornya diberikan saat disusun per halaman. */
export type BarisData = Omit<BarisMentah, 'halaman'>
/** Satu baris TERCETAK: baris transaksi (uraian baris pertamanya saja), atau lanjutan uraian. */
export type BarisCetak = BarisData | { lanjutan: string }

export type DokumenSintetis = {
  nama: string
  tata: TataLetak
  pdf: Uint8Array
  /** Halaman yang tidak punya lapisan teks (tiruan scan), mulai 1. */
  halamanGambar: number[]
  /** Baris tercetak per halaman (tanpa baris judul) — sumber PDF dan jawaban AI tiruan. */
  cetak: BarisCetak[][]
  /** Jawaban route per halaman: lanjutan di awal halaman masih baris sendiri. */
  kebenaranHalaman: HalamanMentah[]
  /** Satu dokumen sesudah lanjutan lintas halaman digabung — yang diterima grid. */
  kebenaran: HalamanMentah[]
}

const BARIS_ATAS = 690
const JARAK = 12

function selUntuk(b: BarisData, k: KolomTata): string {
  switch (k.peran) {
    case 'tanggal':
      return b.tanggal
    case 'uraian':
      return b.uraian
    case 'saldo':
      return b.saldo
    case 'nominal1':
      return b.nominal.bentuk === 'satu-kolom'
        ? b.nominal.teks + (b.nominal.penanda ? ` ${b.nominal.penanda}` : '')
        : b.nominal.pertama.teks
    case 'nominal2':
      return b.nominal.bentuk === 'dua-kolom' ? b.nominal.kedua.teks : ''
    case 'lain':
      return b.lain.find(l => l.judul === k.judul)?.teks ?? ''
  }
}

function teksBaris(sel: (k: KolomTata) => string, kolom: KolomTata[], y: number): TeksPdf[] {
  const out: TeksPdf[] = []
  for (const k of kolom) {
    const t = sel(k)
    if (t === '') continue
    out.push({ x: k.rata === 'kanan' ? k.x - lebarTeks(t) : k.x, y, teks: t })
  }
  return out
}

/** Nominal kosong berjudul — bentuk sel nominal baris yang hanya berisi uraian. */
export function nominalKosong(tata: TataLetak): BarisData['nominal'] {
  const [a, b] = tata.kolom.filter(k => k.peran === 'nominal1' || k.peran === 'nominal2')
  return tata.bentuk === 'satu-kolom'
    ? { bentuk: 'satu-kolom', judul: a.judul, teks: '', penanda: '' }
    : { bentuk: 'dua-kolom', pertama: { judul: a.judul, teks: '' }, kedua: { judul: b.judul, teks: '' } }
}

const lanjutan = (c: BarisCetak): c is { lanjutan: string } => 'lanjutan' in c

/** Baris judul kolom sebagai BarisMentah — bentuk yang dikirim bila judul tercetak ulang. */
export function barisJudul(tata: TataLetak): BarisData {
  const judul = (p: Peran) => tata.kolom.find(k => k.peran === p)?.judul ?? ''
  return {
    tanggal: judul('tanggal'),
    uraian: judul('uraian'),
    nominal:
      tata.bentuk === 'satu-kolom'
        ? { bentuk: 'satu-kolom', judul: judul('nominal1'), teks: judul('nominal1'), penanda: '' }
        : {
            bentuk: 'dua-kolom',
            pertama: { judul: judul('nominal1'), teks: judul('nominal1') },
            kedua: { judul: judul('nominal2'), teks: judul('nominal2') },
          },
    saldo: judul('saldo'),
    lain: tata.kolom.filter(k => k.peran === 'lain').map(k => ({ judul: k.judul, teks: k.judul })),
  }
}

/**
 * Susun PDF + kebenaran. `judulTercetak[i]` = apakah halaman i+1 mencetak baris
 * judul kolom; `gambar` = nomor halaman yang dijadikan tiruan scan.
 */
export function susunDokumen(
  nama: string,
  tata: TataLetak,
  halamanCetak: BarisCetak[][],
  opsi: { judulTercetak?: boolean[]; gambar?: number[] } = {}
): DokumenSintetis {
  const total = halamanCetak.length
  const pdf: HalamanPdf[] = []
  const kebenaranHalaman: HalamanMentah[] = []
  const kebenaran: HalamanMentah[] = []
  const xUraian = tata.kolom.find(k => k.peran === 'uraian')!.x
  // Transaksi terakhir di seluruh dokumen — sasaran lanjutan lintas halaman.
  let terakhirDokumen: BarisMentah | null = null
  halamanCetak.forEach((rows, i) => {
    const halaman = i + 1
    const adaJudul = opsi.judulTercetak?.[i] ?? true
    const teks: TeksPdf[] = []
    tata.kop.forEach((k, j) => teks.push({ x: 40, y: 800 - j * 11, teks: k, ukuran: 9 }))
    if (halaman === 1 && tata.periodeTeks) teks.push({ x: 360, y: 800, teks: tata.periodeTeks, ukuran: 9 })
    let y = BARIS_ATAS
    if (adaJudul) {
      teks.push(...teksBaris(k => k.judul, tata.kolom, y))
      y -= JARAK + 4
    }
    for (const b of rows) {
      if (lanjutan(b)) teks.push({ x: xUraian, y, teks: b.lanjutan })
      else teks.push(...teksBaris(k => selUntuk(b, k), tata.kolom, y))
      y -= JARAK
    }
    teks.push({ x: 270, y: 40, teks: `Halaman ${halaman} / ${total}`, ukuran: 7 })
    const gambarSaja = opsi.gambar?.includes(halaman) ?? false
    pdf.push({ teks, gambarSaja })

    const judul: BarisMentah[] = adaJudul && halaman > 1 ? [{ halaman, ...barisJudul(tata) }] : []
    const perHalaman: BarisMentah[] = [...judul]
    const dokumen: BarisMentah[] = judul.map(b => ({ ...b }))
    let terakhirHalaman: BarisMentah | null = null
    for (const b of rows) {
      if (!lanjutan(b)) {
        terakhirHalaman = { halaman, ...b, lain: [...b.lain] }
        perHalaman.push(terakhirHalaman)
        terakhirDokumen = { ...terakhirHalaman }
        dokumen.push(terakhirDokumen)
        continue
      }
      const sendiri = (): BarisMentah => ({ halaman, tanggal: '', uraian: b.lanjutan, nominal: nominalKosong(tata), saldo: '', lain: [] })
      if (terakhirHalaman) terakhirHalaman.uraian += ` ${b.lanjutan}`
      else perHalaman.push((terakhirHalaman = sendiri()))
      if (terakhirDokumen) terakhirDokumen.uraian += ` ${b.lanjutan}`
      else dokumen.push((terakhirDokumen = sendiri()))
    }
    const kolom = adaJudul ? tata.kolom.map(k => k.judul) : []
    const periodeTeks = halaman === 1 ? tata.periodeTeks : null
    kebenaranHalaman.push({ halaman, kolom, baris: perHalaman, periodeTeks })
    kebenaran.push({ halaman, kolom, baris: dokumen, periodeTeks })
  })
  return { nama, tata, pdf: buatPdf(pdf), halamanGambar: opsi.gambar ?? [], cetak: halamanCetak, kebenaranHalaman, kebenaran }
}

// ── Pembentuk angka KARANGAN (hanya untuk mencetak fikstur, bukan pembaca) ──

function ribuan(n: number, pemisah: string): string {
  const s = n.toString()
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += pemisah
    out += s[i]
  }
  return out
}

/** Sen bulat → "1,500,000.00" (gaya BCA) atau "1.500.000,00" (gaya Indonesia). */
export function cetakSen(sen: number, gaya: 'koma' | 'titik'): string {
  if (!Number.isSafeInteger(sen) || sen < 0) throw new Error(`Fikstur: sen harus bilangan bulat ≥ 0, dapat ${sen}`)
  const bulat = Math.floor(sen / 100)
  const sisa = (sen % 100).toString().padStart(2, '0')
  return gaya === 'koma' ? `${ribuan(bulat, ',')}.${sisa}` : `${ribuan(bulat, '.')},${sisa}`
}

/** PRNG deterministik (mulberry32) — dokumen acak yang sama di setiap mesin. */
export function acak(benih: number): () => number {
  let a = benih >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
