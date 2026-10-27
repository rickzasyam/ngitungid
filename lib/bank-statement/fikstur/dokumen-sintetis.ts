import type { BarisMentah, HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { buatPdf, lebarTeks, type HalamanPdf, type TeksPdf } from './pdf-sintetis'

// Rekening koran KARANGAN beserta KEBENARANNYA (HalamanMentah yang seharusnya
// dihasilkan penyusun tabel). Dipakai test X2/X3 dan harness uji banding X4.
// Semua nama & uraian berawalan UJI-B-; tidak ada data klien nyata.
//
// Tafsiran kontrak yang dipakai kebenaran ini (dicatat di log progres untuk
// dikonfirmasi Ricko):
//  - satu baris TERCETAK = satu BarisMentah; uraian yang terlipat ke baris
//    berikutnya tetap baris sendiri (kelas "lanjutan" diputuskan S2);
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

export type DokumenSintetis = {
  nama: string
  tata: TataLetak
  pdf: Uint8Array
  /** Halaman yang tidak punya lapisan teks (tiruan scan), mulai 1. */
  halamanGambar: number[]
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
  halamanBaris: BarisData[][],
  opsi: { judulTercetak?: boolean[]; gambar?: number[] } = {}
): DokumenSintetis {
  const total = halamanBaris.length
  const pdf: HalamanPdf[] = []
  const kebenaran: HalamanMentah[] = []
  halamanBaris.forEach((rows, i) => {
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
      teks.push(...teksBaris(k => selUntuk(b, k), tata.kolom, y))
      y -= JARAK
    }
    teks.push({ x: 270, y: 40, teks: `Halaman ${halaman} / ${total}`, ukuran: 7 })
    const gambarSaja = opsi.gambar?.includes(halaman) ?? false
    pdf.push({ teks, gambarSaja })

    const baris = [...(adaJudul && halaman > 1 ? [barisJudul(tata)] : []), ...rows].map(b => ({ halaman, ...b }))
    kebenaran.push({
      halaman,
      kolom: adaJudul ? tata.kolom.map(k => k.judul) : [],
      baris,
      periodeTeks: halaman === 1 ? tata.periodeTeks : null,
    })
  })
  return { nama, tata, pdf: buatPdf(pdf), halamanGambar: opsi.gambar ?? [], kebenaran }
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
