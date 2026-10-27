import { getDocumentProxy, renderPageAsImage } from 'unpdf'
import { jumlahKarakter, susunBaris, type BarisTata, type ItemTeks } from './susun-baris'

// Pembaca PDF rekening koran (X2). Dirancang untuk BROWSER (D56: PDF tidak
// disimpan — teks diekstrak di perangkat pengguna, server hanya menerima teks
// atau gambar satu halaman). Modul ini juga jalan di Node supaya bisa diuji
// dengan PDF sintetis; rendering gambar halaman hanya di browser.
//
// - Lapisan teks diutamakan: dibaca PER HALAMAN, berurutan, nomor halaman ikut.
// - Halaman tanpa lapisan teks (scan) → `perluGambar`: pemanggil merender PNG
//   lewat `gambarHalaman` sebagai CADANGAN OCR dan menandai barisnya "dibaca
//   dari gambar".
// - Tidak ada yang ditulis ke penyimpanan apa pun; `tutup()` melepas dokumen.

/** Di bawah ini halaman dianggap tanpa lapisan teks (kop + nomor halaman saja masih di atasnya jarang). */
export const AMBANG_KARAKTER_TEKS = 20

export type HalamanTeks = {
  halaman: number
  baris: BarisTata[]
  /** Lapisan teks kosong/terlalu sedikit → kirim gambar halaman, bukan teks. */
  perluGambar: boolean
}

export type DokumenPdf = {
  jumlahHalaman: number
  bacaHalaman(halaman: number): Promise<HalamanTeks>
  /** PNG halaman (base64 tanpa awalan data URL). Hanya browser. */
  gambarHalaman(halaman: number, skala?: number): Promise<string>
  tutup(): Promise<void>
}

type ItemPdfJs = { str: string; transform: number[]; width: number; height: number }

function keItemTeks(items: unknown[]): ItemTeks[] {
  const out: ItemTeks[] = []
  for (const i of items) {
    if (typeof i !== 'object' || i === null || !('str' in i)) continue // TextMarkedContent
    const it = i as ItemPdfJs
    const [a, b, , d, x, y] = it.transform
    out.push({ teks: it.str, x, y, lebar: it.width, tinggi: it.height || Math.hypot(a, b) || d })
  }
  return out
}

export async function bukaPdf(data: Uint8Array): Promise<DokumenPdf> {
  // pdf.js memindahkan (detach) buffer yang diberikan; salin supaya berkas asli
  // milik pemanggil tetap utuh untuk dibaca ulang bila diperlukan.
  const doc = await getDocumentProxy(new Uint8Array(data))
  return {
    jumlahHalaman: doc.numPages,
    async bacaHalaman(halaman) {
      const page = await doc.getPage(halaman)
      try {
        const isi = await page.getTextContent()
        const baris = susunBaris(keItemTeks(isi.items))
        return { halaman, baris, perluGambar: jumlahKarakter(baris) < AMBANG_KARAKTER_TEKS }
      } finally {
        page.cleanup()
      }
    },
    async gambarHalaman(halaman, skala = 2) {
      const url = await renderPageAsImage(doc, halaman, { scale: skala, toDataURL: true })
      const awalan = 'data:image/png;base64,'
      if (!url.startsWith(awalan)) throw new Error('Gambar halaman bukan PNG.')
      return url.slice(awalan.length)
    },
    async tutup() {
      // Melepas dokumen beserta salinan bytes-nya dari memori pdf.js.
      await doc.loadingTask.destroy()
    },
  }
}
