import type { AiProvider } from '@/lib/ai/penyedia'
import { bukaPdf } from '../baca-pdf'
import type { BarisAi, JawabanSusun } from '../susun-tabel'
import type { BarisData, DokumenSintetis, Peran } from './dokumen-sintetis'

// Jawaban AI SEMPURNA untuk halaman dokumen sintetis — dibentuk dari
// kebenarannya dan baris tata hasil X2. Dipakai sebagai penyedia tiruan di test
// X3 dan sebagai garis dasar harness X4 (penyedia "tiruan-sempurna" harus
// selalu lolos; kalau tidak, yang salah harness atau fiksturnya).

function selUtama(b: BarisData): string[] {
  const n = b.nominal
  const nominal = n.bentuk === 'satu-kolom' ? [n.teks, n.penanda] : [n.pertama.teks, n.kedua.teks]
  return [b.tanggal, b.uraian, ...nominal, b.saldo, ...b.lain.map(l => l.teks)].filter(s => s !== '')
}

const rapat = (s: string) => s.split(' ').filter(t => t !== '').join(' ')

/**
 * Jawaban AI yang benar untuk satu halaman: transaksi merujuk baris tercetaknya,
 * lanjutan uraian digabung (satu spasi) dan dicatat di `barisLanjutan`;
 * lanjutan di awal halaman (transaksinya di halaman sebelumnya) jadi entri sendiri.
 */
export function jawabanSempurna(d: DokumenSintetis, halaman: number, baris: string[]): JawabanSusun {
  const h = d.kebenaranHalaman[halaman - 1]
  const judul = (p: Peran) => d.tata.kolom.find(k => k.peran === p)?.judul ?? ''
  const adaJudul = h.kolom.length > 0
  const nomorBarisJudul = adaJudul ? baris.findIndex(g => h.kolom.every(k => rapat(g).includes(k))) + 1 : 0

  let terakhir = nomorBarisJudul
  const cari = (cocok: (g: string) => boolean, apa: string) => {
    const idx = baris.findIndex((g, i) => i + 1 > terakhir && cocok(rapat(g)))
    if (idx < 0) throw new Error(`fikstur ${d.nama} hal. ${halaman}: "${apa}" tidak ditemukan di teks`)
    terakhir = idx + 1
    return idx + 1
  }
  const barisAi: BarisAi[] = []
  for (const c of d.cetak[halaman - 1]) {
    if ('lanjutan' in c) {
      const nomor = cari(g => g === rapat(c.lanjutan), c.lanjutan)
      const atas = barisAi[barisAi.length - 1]
      if (atas) {
        atas.uraian = `${atas.uraian} ${c.lanjutan}`
        atas.barisLanjutan.push(nomor)
      } else {
        barisAi.push({ nomorBaris: nomor, tanggal: '', uraian: c.lanjutan, nominalPertama: '', nominalKedua: '', penanda: '', saldo: '', lain: [], barisLanjutan: [] })
      }
      continue
    }
    const sel = selUtama(c)
    const n = c.nominal
    barisAi.push({
      nomorBaris: cari(g => sel.every(s => g.includes(s)), c.uraian),
      tanggal: c.tanggal,
      uraian: c.uraian,
      nominalPertama: n.bentuk === 'satu-kolom' ? n.teks : n.pertama.teks,
      nominalKedua: n.bentuk === 'dua-kolom' ? n.kedua.teks : '',
      penanda: n.bentuk === 'satu-kolom' ? n.penanda : '',
      saldo: c.saldo,
      lain: c.lain,
      barisLanjutan: [],
    })
  }
  return {
    periodeTeks: h.periodeTeks ?? '',
    nomorBarisJudul,
    kolom: h.kolom,
    peranKolom: {
      tanggal: judul('tanggal'),
      uraian: judul('uraian'),
      nominalPertama: judul('nominal1'),
      nominalKedua: judul('nominal2'),
      saldo: judul('saldo'),
    },
    baris: barisAi,
  }
}

/** Penyedia tiruan yang menjawab dengan `jawab(halaman)` — tanpa panggilan AI. */
export function penyediaTiruan(jawab: (isiTeks: string) => string): AiProvider {
  return {
    nama: 'gemini',
    model: 'tiruan',
    async mintaJson({ isi }) {
      const teks = jawab(isi.map(b => (b.jenis === 'teks' ? b.teks : '')).join('\n'))
      // Token tiruan = 0: biaya garis dasar memang nol, bukan perkiraan.
      return { teks, model: 'tiruan', pemakaian: { tokenMasuk: 0, tokenKeluar: 0 } }
    },
  }
}

/** Nomor halaman dari isi permintaan X3 ("HALAMAN: n"), tanpa ekspresi reguler. */
export function halamanDariPermintaan(isiTeks: string): number {
  const awal = isiTeks.indexOf('HALAMAN: ')
  if (awal < 0) return 0
  let n = 0
  for (const c of isiTeks.slice(awal + 'HALAMAN: '.length)) {
    if (c < '0' || c > '9') break
    n = n * 10 + (c.charCodeAt(0) - 48)
  }
  return n
}

/**
 * Penyedia tiruan yang menjawab SEMPURNA untuk dokumen `d` (garis dasar harness).
 * `ubah` boleh merusak jawaban per halaman untuk menguji kepekaan ukuran.
 */
export async function penyediaSempurna(
  d: DokumenSintetis,
  ubah: (j: JawabanSusun, halaman: number) => JawabanSusun = j => j
): Promise<AiProvider> {
  const doc = await bukaPdf(d.pdf)
  const baris: string[][] = []
  try {
    for (let i = 1; i <= doc.jumlahHalaman; i++) baris.push((await doc.bacaHalaman(i)).baris.map(b => b.teks))
  } finally {
    await doc.tutup()
  }
  return penyediaTiruan(isi => {
    const h = halamanDariPermintaan(isi)
    return JSON.stringify(ubah(jawabanSempurna(d, h, baris[h - 1]), h))
  })
}
