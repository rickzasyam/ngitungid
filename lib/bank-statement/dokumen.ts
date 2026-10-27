import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// Satu PDF = satu dokumen = satu blok draf di grid. Halaman disusun satu per
// satu (X4 dipanggil per halaman), lalu dirangkum di sini sebelum diserahkan
// ke grid. Tidak ada tafsiran tanggal/tahun: "tahun konsisten satu dokumen"
// dijaga dengan memastikan SATU teks periode untuk seluruh dokumen — S2
// `tetapkanTahun` membacanya sekali untuk semua halaman — dan memperingatkan
// bila halaman lain mencetak periode yang berbeda.

/** Judul kolom terakhir yang tercetak sebelum halaman `sebelum` — untuk halaman lanjutan tanpa judul. */
export function kolomTerakhir(halaman: HalamanMentah[], sebelum: number): string[] {
  for (let i = halaman.length - 1; i >= 0; i--) {
    if (halaman[i].halaman < sebelum && halaman[i].kolom.length > 0) return halaman[i].kolom
  }
  return []
}

export type RangkumanDokumen = {
  /** Teks periode pertama yang tercetak — satu-satunya untuk seluruh dokumen. */
  periodeTeks: string | null
  jumlahBaris: number
  /** Tanpa isi baris (aman ditampilkan & dicatat). */
  peringatan: string[]
}

export function rangkumDokumen(halaman: HalamanMentah[], jumlahHalamanPdf: number): RangkumanDokumen {
  const peringatan: string[] = []
  const nomor = halaman.map(h => h.halaman)
  for (let n = 1; n <= jumlahHalamanPdf; n++) {
    const k = nomor.filter(x => x === n).length
    if (k === 0) peringatan.push(`Halaman ${n} belum terbaca.`)
    if (k > 1) peringatan.push(`Halaman ${n} terbaca ${k} kali.`)
  }
  if (nomor.some((n, i) => i > 0 && n < nomor[i - 1])) peringatan.push('Urutan halaman tidak naik.')

  const periode = halaman.map(h => h.periodeTeks).filter((p): p is string => p !== null && p.trim() !== '')
  const periodeTeks = periode[0] ?? null
  if (periode.some(p => p.trim() !== periode[0].trim())) {
    peringatan.push('Teks periode berbeda antar halaman — pastikan semua halaman dari rekening koran yang sama.')
  }
  if (periodeTeks === null) peringatan.push('Teks periode tidak ditemukan — tahun tanggal mengikuti periode yang dipilih di grid.')
  return { periodeTeks, jumlahBaris: halaman.reduce((n, h) => n + h.baris.length, 0), peringatan }
}
