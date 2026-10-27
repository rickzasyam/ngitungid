import type { BarisMentah, HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

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

/** Baris yang hanya berisi uraian — lanjutan uraian yang terlipat. */
function hanyaUraian(b: BarisMentah): boolean {
  const n = b.nominal
  const nominalKosong = n.bentuk === 'satu-kolom' ? n.teks === '' && n.penanda === '' : n.pertama.teks === '' && n.kedua.teks === ''
  return b.uraian !== '' && b.tanggal === '' && b.saldo === '' && nominalKosong && b.lain.every(l => l.teks === '')
}

/**
 * Gabungkan lanjutan uraian yang TERPOTONG halaman (keputusan Ricko
 * 2026-10-27: uraian terlipat digabung ke transaksinya, teks apa adanya,
 * disambung satu spasi). Di dalam satu halaman penggabungan sudah dilakukan
 * penyusun tabel (X3); yang tersisa hanya baris berisi uraian saja di AWAL
 * halaman — sesudah baris judul berulang bila ada — yang transaksinya ada di
 * halaman sebelumnya. Baris itu ditambahkan ke uraian transaksi terakhir
 * sebelumnya (nomor halamannya tetap halaman transaksi) lalu dibuang.
 * Wajib dipanggil sebelum hasil halaman diserahkan ke grid.
 */
export function gabungLintasHalaman(halaman: HalamanMentah[]): HalamanMentah[] {
  const hasil = halaman.map(h => ({ ...h, baris: h.baris.map(b => ({ ...b })) }))
  let terakhir: BarisMentah | null = null
  for (const h of hasil) {
    // Baris judul berulang disusun di indeks 0 (susun-tabel.ts `bentukHalaman`).
    const judul = h.halaman > 1 && h.kolom.length > 0 ? 1 : 0
    while (judul < h.baris.length && terakhir !== null && hanyaUraian(h.baris[judul])) {
      terakhir.uraian = `${terakhir.uraian} ${h.baris[judul].uraian}`
      h.baris.splice(judul, 1)
    }
    for (let k = judul; k < h.baris.length; k++) terakhir = h.baris[k]
  }
  return hasil
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
