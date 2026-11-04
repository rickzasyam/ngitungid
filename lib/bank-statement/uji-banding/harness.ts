import { GalatAi, jenisGalatAi, type AiProvider } from '@/lib/ai/penyedia'
import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { bukaPdf } from '../baca-pdf'
import { gabungLintasHalaman, kolomSebelumnyaBerposisi, type JudulTercetak } from '../dokumen'
import type { DokumenSintetis } from '../fikstur/dokumen-sintetis'
import { GalatSusun, susunDenganUlang, type PercobaanSusun } from '../susun-tabel'
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
  /** Token model UTAMA — termasuk permintaan yang lalu ditolak penjaga. */
  tokenMasuk: number
  tokenKeluar: number
  /** Hanya bila diuji dengan model pengulang (`susunDenganUlang`). */
  halamanDiulang?: number[]
  tokenUlangMasuk?: number
  tokenUlangKeluar?: number
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
  opsi: { timeoutMs?: number; jam?: () => number; aiUlang?: AiProvider } = {}
): Promise<HasilDokumen> {
  const jam = opsi.jam ?? (() => performance.now())
  const doc = await bukaPdf(d.pdf)
  const hasil: HalamanMentah[] = []
  const halamanGagal: HasilDokumen['halamanGagal'] = []
  // Token per model: percobaan pertama selalu model utama, yang kedua (bila
  // ada) model pengulang — juga untuk percobaan yang ditolak, karena tetap dibayar.
  const token = { masuk: 0, keluar: 0, ulangMasuk: 0, ulangKeluar: 0 }
  const catatToken = (percobaan: PercobaanSusun[]) =>
    percobaan.forEach((p, i) => {
      if (i === 0) {
        token.masuk += p.pemakaian.tokenMasuk
        token.keluar += p.pemakaian.tokenKeluar
      } else {
        token.ulangMasuk += p.pemakaian.tokenMasuk
        token.ulangKeluar += p.pemakaian.tokenKeluar
      }
    })
  const halamanDiulang: number[] = []
  // Seperti browser (X5): judul terakhir yang tercetak ikut dikirim ke halaman
  // berikutnya beserta posisinya di halaman itu.
  let judulTerakhir: JudulTercetak | null = null
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
        const baris = t.baris.map(b => b.teks)
        const r = await susunDenganUlang(ai, opsi.aiUlang ?? null, {
          halaman: n,
          sumber: { jenis: 'teks', baris },
          kolomSebelumnya: kolomSebelumnyaBerposisi(judulTerakhir, t.grid),
          timeoutMs: opsi.timeoutMs,
        })
        hasil.push(r.halaman)
        if (r.halaman.kolom.length > 0) judulTerakhir = { kolom: r.halaman.kolom, baris, grid: t.grid }
        catatToken(r.percobaan)
        if (r.diulang) halamanDiulang.push(n)
      } catch (e) {
        if (e instanceof GalatSusun) {
          catatToken(e.percobaan)
          if (e.inputManual) halamanDiulang.push(n)
        }
        // Kuota harian habis: halaman berikutnya pasti gagal juga dan bukan ukuran
        // mutu penyedia. Dokumen ini dibatalkan utuh; CLI menyimpan sisanya untuk
        // dilanjutkan sesudah kuota direset.
        if (jenisGalatAi(e) === 'kuotaHarian') throw e
        const jenis = e instanceof GalatSusun ? (e.inputManual ? 'input-manual' : 'ditolak-penjaga') : e instanceof GalatAi ? `penyedia-${e.jenis}` : `penyedia-${jenisGalatAi(e)}`
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

  // Dokumen bersaldo atau tidak ditentukan KEBENARANNYA, bukan keluaran: dokumen
  // yang semua halamannya gagal (atau saldonya hilang) tidak boleh keluar dari
  // penyebut % lolos sebagai "tanpa saldo" — itu menggelembungkan angkanya.
  const keluaranSaldo = pemeriksa(dokumen)
  const kesinambungan: HasilKesinambungan =
    pemeriksa(d.kebenaran) === 'tanpa-saldo' ? 'tanpa-saldo' : keluaranSaldo === 'tanpa-saldo' ? 'putus' : keluaranSaldo
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
    tokenMasuk: token.masuk,
    tokenKeluar: token.keluar,
    ...(opsi.aiUlang ? { halamanDiulang, tokenUlangMasuk: token.ulangMasuk, tokenUlangKeluar: token.ulangKeluar } : {}),
  }
}

/** Harga resmi per 1 juta token PADA TANGGAL UJI — diisi pelaksana, tidak ditebak kode. */
export type Harga = { masukPerJuta: number; keluarPerJuta: number; mataUang: string; tanggal: string }

export type Ringkasan = {
  penyedia: string
  model: string
  /** Model pengulang halaman yang ditolak penjaga; null = tanpa ulang. */
  modelUlang: string | null
  halamanDiulang: number
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

/**
 * `ulang`: model pengulang beserta harganya. Token pengulang dihargai dengan
 * harga MODEL ITU; ada token pengulang tanpa harganya → biaya "belum diisi".
 */
export function rangkumUji(
  ai: Pick<AiProvider, 'nama' | 'model'>,
  hasil: HasilDokumen[],
  harga?: Harga,
  ulang?: { model: string; harga?: Harga }
): Ringkasan {
  const bersaldo = hasil.filter(h => h.kesinambungan !== 'tanpa-saldo')
  const n = hasil.length || 1
  const masuk = hasil.reduce((s, h) => s + h.tokenMasuk, 0) / n
  const keluar = hasil.reduce((s, h) => s + h.tokenKeluar, 0) / n
  const ulangMasuk = hasil.reduce((s, h) => s + (h.tokenUlangMasuk ?? 0), 0) / n
  const ulangKeluar = hasil.reduce((s, h) => s + (h.tokenUlangKeluar ?? 0), 0) / n
  const biayaUlang = ulangMasuk + ulangKeluar === 0 ? 0 : ulang?.harga ? (ulangMasuk * ulang.harga.masukPerJuta + ulangKeluar * ulang.harga.keluarPerJuta) / 1e6 : null
  const halaman = hasil.reduce((s, h) => s + h.jumlahHalaman, 0)
  return {
    penyedia: ai.nama,
    model: ai.model,
    modelUlang: ulang?.model ?? null,
    halamanDiulang: hasil.reduce((s, h) => s + (h.halamanDiulang?.length ?? 0), 0),
    dokumen: hasil.length,
    dokumenBersaldo: bersaldo.length,
    persenLolosTanpaKoreksi: persen(bersaldo.filter(h => h.lolosTanpaKoreksi).length, bersaldo.length),
    persenIdentik: persen(hasil.filter(h => h.identik).length, hasil.length),
    halamanGagal: hasil.reduce((s, h) => s + h.halamanGagal.length, 0),
    barisHilang: hasil.reduce((s, h) => s + h.barisHilang, 0),
    barisLebih: hasil.reduce((s, h) => s + h.barisLebih, 0),
    msPerHalaman: halaman === 0 ? 0 : Math.round(hasil.reduce((s, h) => s + h.msPerHalaman * h.jumlahHalaman, 0) / halaman),
    tokenPerDokumen: { masuk: Math.round(masuk), keluar: Math.round(keluar) },
    biayaPerDokumen:
      harga && biayaUlang !== null
      ? {
          nilai: Math.round(((masuk * harga.masukPerJuta + keluar * harga.keluarPerJuta) / 1e6 + biayaUlang) * 1e6) / 1e6,
          mataUang: harga.mataUang,
          tanggalHarga: harga.tanggal,
        }
      : null,
  }
}

const namaUji = (x: Ringkasan) =>
  `${x.penyedia} · ${x.model}${x.modelUlang ? ` + ulang ${x.modelUlang} (${x.halamanDiulang} hlm diulang)` : ''}`

/** Laporan AGREGAT (tanpa isi baris) — bentuk yang boleh dicatat di docs. */
export function laporanMarkdown(r: Ringkasan[], catatan: { tanggal: string; pemeriksa: string; dokumen: string }): string {
  const baris = r.map(x =>
    // Belum ada satu dokumen pun (mis. kuota harian habis): "0%" dan "0 USD"
    // akan terbaca sebagai hasil, padahal belum ada yang diukur.
    x.dokumen === 0
      ? [namaUji(x), ...Array<string>(7).fill('belum diuji')].join(' | ')
      : [
      namaUji(x),
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
