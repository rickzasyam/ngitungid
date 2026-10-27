import { GalatAi, jenisGalatAi, type AiProvider } from '@/lib/ai/penyedia'
import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { bukaPdf } from '../baca-pdf'
import { gabungLintasHalaman, kolomTerakhir } from '../dokumen'
import type { DokumenSintetis } from '../fikstur/dokumen-sintetis'
import { GalatSusun, susunHalaman } from '../susun-tabel'
import type { HasilKesinambungan, PemeriksaKesinambungan } from './kesinambungan-sementara'

// Harness uji banding penyedia (X4) — HANYA dokumen SINTETIS (`DokumenSintetis`
// dari lib/bank-statement/fikstur). Tidak ada jalan memasukkan PDF dari berkas:
// uji dengan rekening koran nyata adalah X6, skrip lokal di luar repo, sesudah
// gerbang X0 dan atas keputusan Ricko.
//
// Ukuran utama (D54): % dokumen yang LOLOS kesinambungan saldo TANPA KOREKSI —
// semua halaman tersusun (tidak ada yang ditolak penjaga/penyedia) dan rantai
// saldonya utuh. Ditambah: % identik dengan kebenaran, baris hilang/lebih,
// waktu per halaman, token, dan perkiraan biaya per dokumen.

export type HasilDokumen = {
  nama: string
  jumlahHalaman: number
  /** Jenis galat per halaman yang gagal (tanpa isi baris). */
  halamanGagal: { halaman: number; jenis: string }[]
  kesinambungan: HasilKesinambungan
  /** Lolos tanpa koreksi = tidak ada halaman gagal DAN rantai saldo utuh. */
  lolosTanpaKoreksi: boolean
  identik: boolean
  barisHilang: number
  barisLebih: number
  msPerHalaman: number
  tokenMasuk: number
  tokenKeluar: number
}

function tandaBaris(h: HalamanMentah[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const b of h.flatMap(x => x.baris)) {
    const k = JSON.stringify(b)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export async function ujiDokumen(
  ai: AiProvider,
  d: DokumenSintetis,
  pemeriksa: PemeriksaKesinambungan,
  opsi: { timeoutMs?: number; jam?: () => number } = {}
): Promise<HasilDokumen> {
  const jam = opsi.jam ?? (() => performance.now())
  const doc = await bukaPdf(d.pdf)
  const hasil: HalamanMentah[] = []
  const halamanGagal: HasilDokumen['halamanGagal'] = []
  let tokenMasuk = 0
  let tokenKeluar = 0
  const mulai = jam()
  try {
    for (let n = 1; n <= doc.jumlahHalaman; n++) {
      const t = await doc.bacaHalaman(n)
      if (t.perluGambar) {
        // Render PNG butuh kanvas browser; harness Node hanya dokumen berlapis teks.
        halamanGagal.push({ halaman: n, jenis: 'gambar-tidak-didukung-harness' })
        continue
      }
      try {
        const r = await susunHalaman(ai, {
          halaman: n,
          sumber: { jenis: 'teks', baris: t.baris.map(b => b.teks) },
          kolomSebelumnya: kolomTerakhir(hasil, n),
          timeoutMs: opsi.timeoutMs,
        })
        hasil.push(r.halaman)
        tokenMasuk += r.pemakaian.tokenMasuk
        tokenKeluar += r.pemakaian.tokenKeluar
      } catch (e) {
        const jenis = e instanceof GalatSusun ? 'ditolak-penjaga' : e instanceof GalatAi ? `penyedia-${e.jenis}` : `penyedia-${jenisGalatAi(e)}`
        halamanGagal.push({ halaman: n, jenis })
      }
    }
  } finally {
    await doc.tutup()
  }
  const ms = jam() - mulai

  // Seperti di browser (X5): lanjutan uraian yang terpotong halaman digabung
  // dulu, baru dibandingkan & diperiksa.
  const dokumen = gabungLintasHalaman(hasil)
  const kebenaran = tandaBaris(d.kebenaran)
  const keluaran = tandaBaris(dokumen)
  let barisHilang = 0
  let barisLebih = 0
  for (const [k, n] of kebenaran) barisHilang += Math.max(0, n - (keluaran.get(k) ?? 0))
  for (const [k, n] of keluaran) barisLebih += Math.max(0, n - (kebenaran.get(k) ?? 0))

  const kesinambungan = pemeriksa(dokumen)
  return {
    nama: d.nama,
    jumlahHalaman: doc.jumlahHalaman,
    halamanGagal,
    kesinambungan,
    lolosTanpaKoreksi: halamanGagal.length === 0 && kesinambungan === 'lolos',
    identik: halamanGagal.length === 0 && JSON.stringify(dokumen) === JSON.stringify(d.kebenaran),
    barisHilang,
    barisLebih,
    msPerHalaman: doc.jumlahHalaman > 0 ? ms / doc.jumlahHalaman : 0,
    tokenMasuk,
    tokenKeluar,
  }
}

/** Harga resmi per 1 juta token PADA TANGGAL UJI — diisi pelaksana, tidak ditebak kode. */
export type Harga = { masukPerJuta: number; keluarPerJuta: number; mataUang: string; tanggal: string }

export type Ringkasan = {
  penyedia: string
  model: string
  dokumen: number
  /** Dokumen bersaldo saja — dokumen tanpa kolom saldo tidak bisa diperiksa. */
  dokumenBersaldo: number
  persenLolosTanpaKoreksi: number
  persenIdentik: number
  halamanGagal: number
  barisHilang: number
  barisLebih: number
  msPerHalaman: number
  tokenPerDokumen: { masuk: number; keluar: number }
  biayaPerDokumen: { nilai: number; mataUang: string; tanggalHarga: string } | null
}

const persen = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10)

export function rangkumUji(ai: Pick<AiProvider, 'nama' | 'model'>, hasil: HasilDokumen[], harga?: Harga): Ringkasan {
  const bersaldo = hasil.filter(h => h.kesinambungan !== 'tanpa-saldo')
  const n = hasil.length || 1
  const masuk = hasil.reduce((s, h) => s + h.tokenMasuk, 0) / n
  const keluar = hasil.reduce((s, h) => s + h.tokenKeluar, 0) / n
  const halaman = hasil.reduce((s, h) => s + h.jumlahHalaman, 0)
  return {
    penyedia: ai.nama,
    model: ai.model,
    dokumen: hasil.length,
    dokumenBersaldo: bersaldo.length,
    persenLolosTanpaKoreksi: persen(bersaldo.filter(h => h.lolosTanpaKoreksi).length, bersaldo.length),
    persenIdentik: persen(hasil.filter(h => h.identik).length, hasil.length),
    halamanGagal: hasil.reduce((s, h) => s + h.halamanGagal.length, 0),
    barisHilang: hasil.reduce((s, h) => s + h.barisHilang, 0),
    barisLebih: hasil.reduce((s, h) => s + h.barisLebih, 0),
    msPerHalaman: halaman === 0 ? 0 : Math.round(hasil.reduce((s, h) => s + h.msPerHalaman * h.jumlahHalaman, 0) / halaman),
    tokenPerDokumen: { masuk: Math.round(masuk), keluar: Math.round(keluar) },
    biayaPerDokumen: harga
      ? {
          nilai: Math.round(((masuk * harga.masukPerJuta + keluar * harga.keluarPerJuta) / 1e6) * 1e6) / 1e6,
          mataUang: harga.mataUang,
          tanggalHarga: harga.tanggal,
        }
      : null,
  }
}

/** Laporan AGREGAT (tanpa isi baris) — bentuk yang boleh dicatat di docs. */
export function laporanMarkdown(r: Ringkasan[], catatan: { tanggal: string; pemeriksa: string; dokumen: string }): string {
  const baris = r.map(x =>
    [
      `${x.penyedia} · ${x.model}`,
      `${x.persenLolosTanpaKoreksi}% (${x.dokumenBersaldo} dok. bersaldo)`,
      `${x.persenIdentik}%`,
      String(x.halamanGagal),
      `${x.barisHilang} / ${x.barisLebih}`,
      `${x.msPerHalaman} ms`,
      `${x.tokenPerDokumen.masuk} / ${x.tokenPerDokumen.keluar}`,
      x.biayaPerDokumen ? `${x.biayaPerDokumen.nilai} ${x.biayaPerDokumen.mataUang} (harga ${x.biayaPerDokumen.tanggalHarga})` : 'harga belum diisi',
    ].join(' | ')
  )
  return [
    `# Uji banding ekstraksi rekening koran — DOKUMEN SINTETIS (${catatan.tanggal})`,
    '',
    `Dokumen: ${catatan.dokumen}. Pemeriksa kesinambungan: ${catatan.pemeriksa}.`,
    '',
    '| Penyedia · model | Lolos kesinambungan tanpa koreksi | Identik dgn kebenaran | Halaman gagal | Baris hilang / lebih | Waktu/halaman | Token/dok (masuk/keluar) | Biaya/dok |',
    '|---|---|---|---|---|---|---|---|',
    ...baris.map(b => `| ${b} |`),
    '',
  ].join('\n')
}
