import { acak, cetakSen, nominalKosong, susunDokumen, type BarisCetak, type BarisData, type DokumenSintetis, type TataLetak } from './dokumen-sintetis'
import { lebarTeks, type TeksPdf } from './pdf-sintetis'

// Koleksi rekening koran KARANGAN untuk test & harness (UJI-B-). Bentuknya
// meniru tata letak umum, bukan salinan dokumen bank mana pun.

const TATA_SATU_KOLOM: TataLetak = {
  bentuk: 'satu-kolom',
  kop: ['BANK UJI-B CONTOH', 'REKENING KORAN', 'PT UJI COBA - 000-UJI-B-0001'],
  periodeTeks: 'PERIODE : OKTOBER 2026',
  kolom: [
    { judul: 'TANGGAL', x: 40, rata: 'kiri', peran: 'tanggal' },
    { judul: 'KETERANGAN', x: 82, rata: 'kiri', peran: 'uraian' },
    { judul: 'CBG', x: 300, rata: 'kiri', peran: 'lain' },
    { judul: 'MUTASI', x: 440, rata: 'kanan', peran: 'nominal1' },
    { judul: 'SALDO', x: 550, rata: 'kanan', peran: 'saldo' },
  ],
}

const TATA_DUA_KOLOM: TataLetak = {
  bentuk: 'dua-kolom',
  kop: ['BANK UJI-B SEJAHTERA', 'Laporan Mutasi Rekening', 'PT Uji Coba / 999-UJI-B-77'],
  periodeTeks: 'Periode: 01/12/2026 - 31/01/2027',
  kolom: [
    { judul: 'Tanggal', x: 40, rata: 'kiri', peran: 'tanggal' },
    { judul: 'Keterangan', x: 95, rata: 'kiri', peran: 'uraian' },
    { judul: 'Debet', x: 345, rata: 'kanan', peran: 'nominal1' },
    { judul: 'Kredit', x: 425, rata: 'kanan', peran: 'nominal2' },
    { judul: 'Saldo', x: 510, rata: 'kanan', peran: 'saldo' },
    { judul: 'Reff', x: 520, rata: 'kiri', peran: 'lain' },
  ],
}

const TATA_TANPA_SALDO: TataLetak = {
  bentuk: 'dua-kolom',
  kop: ['KAS KECIL UJI-B', 'Rekap Penerimaan & Pengeluaran'],
  periodeTeks: 'Bulan: November 2026',
  kolom: [
    { judul: 'Tgl', x: 40, rata: 'kiri', peran: 'tanggal' },
    { judul: 'Uraian', x: 100, rata: 'kiri', peran: 'uraian' },
    { judul: 'Masuk', x: 420, rata: 'kanan', peran: 'nominal1' },
    { judul: 'Keluar', x: 520, rata: 'kanan', peran: 'nominal2' },
  ],
}

type Transaksi = { tanggal: string; uraian: string[]; sen: number; keluar: boolean; lain?: string }

/** Satu transaksi → baris utama + baris lanjutan uraian (tercetak terpisah); saldo berjalan dalam sen. */
function barisTransaksi(tata: TataLetak, t: Transaksi, saldo: number, gaya: 'koma' | 'titik'): BarisCetak[] {
  const nominal = cetakSen(t.sen, gaya)
  const judul = (i: number) => tata.kolom.filter(k => k.peran === 'nominal1' || k.peran === 'nominal2')[i].judul
  const lainJudul = tata.kolom.find(k => k.peran === 'lain')?.judul
  // Kolom pertama = Debet/Masuk sesuai tata letaknya: rekening koran bank memakai
  // Debet = keluar, rekap kas kecil Masuk = masuk.
  const diPertama = tata === TATA_DUA_KOLOM ? t.keluar : !t.keluar
  const utama: BarisData = {
    tanggal: t.tanggal,
    uraian: t.uraian[0],
    nominal:
      tata.bentuk === 'satu-kolom'
        ? { bentuk: 'satu-kolom', judul: judul(0), teks: nominal, penanda: t.keluar ? 'DB' : '' }
        : {
            bentuk: 'dua-kolom',
            pertama: { judul: judul(0), teks: diPertama ? nominal : '' },
            kedua: { judul: judul(1), teks: diPertama ? '' : nominal },
          },
    saldo: tata.kolom.some(k => k.peran === 'saldo') ? cetakSen(saldo, gaya) : '',
    lain: lainJudul && t.lain ? [{ judul: lainJudul, teks: t.lain }] : [],
  }
  return [utama, ...t.uraian.slice(1).map(u => ({ lanjutan: u }))]
}

function barisSaldoAwal(tata: TataLetak, tanggal: string, saldo: number, gaya: 'koma' | 'titik', uraian = 'SALDO AWAL'): BarisData {
  return { tanggal, uraian, nominal: nominalKosong(tata), saldo: cetakSen(saldo, gaya), lain: [] }
}

/** Gaya BCA: satu kolom MUTASI + penanda DB, tanggal tanpa tahun, uraian terlipat, 2 halaman. */
export function dokumenSatuKolom(opsi: { nama?: string; gambar?: number[] } = {}): DokumenSintetis {
  const g = 'koma'
  let saldo = 10_000_000_00
  const tx: Transaksi[] = [
    { tanggal: '05/10', uraian: ['TRSF E-BANKING DB', 'UJI-B-001 SEWA KANTOR'], sen: 1_500_000_00, keluar: true, lain: '0000' },
    { tanggal: '07/10', uraian: ['SETORAN TUNAI UJI-B-002'], sen: 2_250_000_00, keluar: false, lain: '0123' },
    { tanggal: '07/10', uraian: ['BIAYA ADM UJI-B'], sen: 15_000_00, keluar: true, lain: '0000' },
    { tanggal: '12/10', uraian: ['TRSF E-BANKING CR', 'UJI-B-003 PELUNASAN INV-9'], sen: 7_125_500_50, keluar: false, lain: '0000' },
    { tanggal: '15/10', uraian: ['KARTU DEBIT UJI-B-004'], sen: 342_000_00, keluar: true, lain: '0456' },
  ]
  const tx2: Transaksi[] = [
    { tanggal: '20/10', uraian: ['TRSF E-BANKING DB', 'UJI-B-005 GAJI'], sen: 9_000_000_00, keluar: true, lain: '0000' },
    { tanggal: '28/10', uraian: ['BUNGA UJI-B'], sen: 12_345_67, keluar: false, lain: '0000' },
    { tanggal: '31/10', uraian: ['PAJAK BUNGA UJI-B'], sen: 2_469_13, keluar: true, lain: '0000' },
  ]
  const susun = (daftar: Transaksi[]) =>
    daftar.flatMap(t => {
      saldo += t.keluar ? -t.sen : t.sen
      return barisTransaksi(TATA_SATU_KOLOM, t, saldo, g)
    })
  const h1 = [barisSaldoAwal(TATA_SATU_KOLOM, '01/10', saldo, g), ...susun(tx)]
  const h2 = susun(tx2)
  return susunDokumen(opsi.nama ?? 'UJI-B-satu-kolom', TATA_SATU_KOLOM, [h1, h2], { gambar: opsi.gambar })
}

/** Debet/Kredit (Debet = keluar), tanggal lengkap lintas tahun, 3 halaman: hal. 2 tanpa judul, hal. 3 judul tercetak ulang + SALDO AWAL. */
export function dokumenDuaKolom(): DokumenSintetis {
  const g = 'titik'
  let saldo = 25_000_000_00
  const susun = (daftar: Transaksi[]) =>
    daftar.flatMap(t => {
      saldo += t.keluar ? -t.sen : t.sen
      return barisTransaksi(TATA_DUA_KOLOM, t, saldo, g)
    })
  const h1 = [
    barisSaldoAwal(TATA_DUA_KOLOM, '01/12/2026', saldo, g),
    ...susun([
      { tanggal: '03/12/2026', uraian: ['Transfer masuk UJI-B-101'], sen: 4_000_000_00, keluar: false, lain: 'TRX-1' },
      { tanggal: '10/12/2026', uraian: ['Pembayaran supplier UJI-B-102'], sen: 3_750_000_00, keluar: true, lain: 'TRX-2' },
    ]),
  ]
  const h2 = susun([
    { tanggal: '24/12/2026', uraian: ['Penjualan UJI-B-103'], sen: 1_234_567_89, keluar: false, lain: 'TRX-3' },
    { tanggal: '31/12/2026', uraian: ['Biaya administrasi UJI-B'], sen: 25_000_00, keluar: true },
  ])
  const h3 = [
    barisSaldoAwal(TATA_DUA_KOLOM, '01/01/2027', saldo, g),
    ...susun([
      { tanggal: '02/01/2027', uraian: ['Transfer keluar UJI-B-104', 'ke rekening UJI-B-REK-9'], sen: 5_000_000_00, keluar: true, lain: 'TRX-4' },
      { tanggal: '15/01/2027', uraian: ['Setoran UJI-B-105'], sen: 800_000_00, keluar: false, lain: 'TRX-5' },
    ]),
  ]
  return susunDokumen('UJI-B-dua-kolom', TATA_DUA_KOLOM, [h1, h2, h3], { judulTercetak: [true, false, true] })
}

/** Tanpa kolom saldo — rantai saldo tidak bisa memeriksa apa pun (risiko 1 sisa). */
export function dokumenTanpaSaldo(): DokumenSintetis {
  const tx: Transaksi[] = [
    { tanggal: '02/11/2026', uraian: ['Penerimaan UJI-B-201'], sen: 500_000_00, keluar: false },
    { tanggal: '05/11/2026', uraian: ['Beli ATK UJI-B-202'], sen: 87_500_00, keluar: true },
    { tanggal: '09/11/2026', uraian: ['Parkir UJI-B-203'], sen: 10_000_00, keluar: true },
  ]
  return susunDokumen('UJI-B-tanpa-saldo', TATA_TANPA_SALDO, [tx.flatMap(t => barisTransaksi(TATA_TANPA_SALDO, t, 0, 'titik'))])
}

/** Halaman 2 tanpa lapisan teks (tiruan scan) → harus jatuh ke cadangan gambar. */
export function dokumenSebagianScan(): DokumenSintetis {
  return dokumenSatuKolom({ nama: 'UJI-B-sebagian-scan', gambar: [2] })
}

/**
 * Dokumen acak deterministik untuk harness X4: bentuk bergantian, jumlah
 * transaksi & panjang uraian bervariasi, 25 baris tercetak per halaman.
 */
export function dokumenAcak(benih: number, jumlahTransaksi = 40): DokumenSintetis {
  const r = acak(benih)
  const tata = benih % 2 === 0 ? TATA_SATU_KOLOM : TATA_DUA_KOLOM
  const g = tata === TATA_SATU_KOLOM ? 'koma' : 'titik'
  let saldo = (5_000_000 + Math.floor(r() * 50_000_000)) * 100
  const rows: BarisCetak[] = [barisSaldoAwal(tata, tata === TATA_SATU_KOLOM ? '01/10' : '01/12/2026', saldo, g)]
  for (let i = 0; i < jumlahTransaksi; i++) {
    const hari = 1 + Math.floor((i / jumlahTransaksi) * 28)
    const tanggal = tata === TATA_SATU_KOLOM ? `${String(hari).padStart(2, '0')}/10` : `${String(hari).padStart(2, '0')}/12/2026`
    const sen = (1 + Math.floor(r() * 5_000_000)) * (r() < 0.3 ? 1 : 100)
    // Saldo rekening koran karangan tidak pernah negatif.
    const keluar = r() < 0.55 && sen <= saldo
    const uraian = [`${keluar ? 'TRSF KELUAR' : 'TRSF MASUK'} UJI-B-${benih}-${i}`]
    if (r() < 0.3) uraian.push(`UJI-B REF ${Math.floor(r() * 1e6)}`)
    saldo += keluar ? -sen : sen
    rows.push(...barisTransaksi(tata, { tanggal, uraian, sen, keluar, lain: tata === TATA_SATU_KOLOM ? '0000' : `TRX-${i}` }, saldo, g))
  }
  // Dipotong per 25 baris TERCETAK — lanjutan uraian bisa terpotong ke halaman berikut.
  const halaman: BarisCetak[][] = []
  for (let i = 0; i < rows.length; i += 25) halaman.push(rows.slice(i, i + 25))
  return susunDokumen(`UJI-B-acak-${benih}`, tata, halaman)
}

/**
 * Uraian terlipat yang TERPOTONG halaman: lanjutan transaksi terakhir hal. 1
 * tercetak di awal hal. 2 (tanpa judul), dan lanjutan transaksi terakhir hal. 2
 * di awal hal. 3 sesudah judul yang tercetak ulang.
 */
export function dokumenLanjutanLintasHalaman(): DokumenSintetis {
  const g = 'titik'
  let saldo = 3_000_000_00
  const susun = (daftar: Transaksi[]) =>
    daftar.flatMap(t => {
      saldo += t.keluar ? -t.sen : t.sen
      return barisTransaksi(TATA_DUA_KOLOM, t, saldo, g)
    })
  const a = susun([
    { tanggal: '04/12/2026', uraian: ['Transfer masuk UJI-B-301'], sen: 1_000_000_00, keluar: false, lain: 'TRX-31' },
    { tanggal: '09/12/2026', uraian: ['Transfer keluar UJI-B-302', 'tujuan UJI-B-REK-1', 'berita sewa gudang'], sen: 750_000_00, keluar: true, lain: 'TRX-32' },
  ])
  const b = susun([
    { tanggal: '18/12/2026', uraian: ['Setoran UJI-B-303'], sen: 2_500_000_00, keluar: false, lain: 'TRX-33' },
    { tanggal: '22/12/2026', uraian: ['Bayar listrik UJI-B-304', 'ID PEL UJI-B-55'], sen: 412_345_00, keluar: true, lain: 'TRX-34' },
  ])
  const c = susun([{ tanggal: '28/12/2026', uraian: ['Bunga UJI-B'], sen: 1_234_00, keluar: false, lain: 'TRX-35' }])
  const awal = barisSaldoAwal(TATA_DUA_KOLOM, '01/12/2026', 3_000_000_00, g)
  // a = [301, 302, lanjutan, lanjutan]; b = [303, 304, lanjutan].
  return susunDokumen('UJI-B-lanjutan-lintas-halaman', TATA_DUA_KOLOM, [[awal, ...a.slice(0, 3)], [a[3], ...b.slice(0, 2)], [b[2], ...c]], {
    judulTercetak: [true, false, true],
  })
}

// ── e-statement BCA (uji X6, 2026-11-09) ─────────────────────────────────────
// Struktur & spasi meniru e-statement BCA asli yang ditolak di halaman TERAKHIR:
// kop kanan, judul berhuruf renggang, kolom CBG kosong, uraian 2–4 baris
// lanjutan, saldo hanya di transaksi terakhir per hari, penanda "DB", tanggal
// DD/MM, kaki "Bersambung ke halaman berikut", dan BLOK RINGKASAN sesudah
// transaksi terakhir. Nama, nomor, dan angka semuanya KARANGAN (UJI-B-).

const TATA_BCA: TataLetak = {
  bentuk: 'satu-kolom',
  kop: ['KCP CONTOH', 'C V  C O N T OH  UJI-B', 'J L  C O N T OH'],
  periodeTeks: 'PE RIOD E : JANU ARI 2026',
  kolom: [
    { judul: 'T ANG G A L', x: 40, rata: 'kiri', peran: 'tanggal' },
    { judul: 'KET ER A N GA N', x: 95, rata: 'kiri', peran: 'uraian' },
    { judul: 'C BG', x: 335, rata: 'kiri', peran: 'lain' },
    { judul: 'MU TASI', x: 470, rata: 'kanan', peran: 'nominal1' },
    { judul: 'SALD O', x: 565, rata: 'kanan', peran: 'saldo' },
  ],
}

/** Angka blok ringkasan bank yang dicetak di halaman terakhir (sen; jumlah transaksi). */
export type RingkasanFikstur = {
  saldoAwal: number
  saldoAkhir: number
  masuk: { total: number; jumlah: number }
  keluar: { total: number; jumlah: number }
}

const kanan = (x: number, y: number, teks: string, ukuran = 8): TeksPdf => ({ x: x - lebarTeks(teks, ukuran), y, teks, ukuran })

/** `tanpaBarisSaldoAwal`: halaman 1 tanpa baris "01/01 SALDO AWAL" — jangkar hanya dari blok ringkasan. */
export function dokumenBcaAsli(opsi: { tanpaBarisSaldoAwal?: boolean } = {}): DokumenSintetis & { ringkasan: RingkasanFikstur } {
  const r = acak(2026)
  const g = 'koma'
  const saldoAwal = 25_000_000_00
  const N = 49
  const masukDi = new Set([2, 7, 12, 17, 22, 27, 32, 37, 42, 46]) // 10 masuk, 39 keluar
  const hari = (i: number) => (i === N - 1 ? 31 : 2 + Math.floor((i * 29) / N))
  let saldo = saldoAwal
  const tx: { data: BarisData; lanjut: string[]; hari: number; saldoSesudah: number }[] = []
  const ringkasan: RingkasanFikstur = { saldoAwal, saldoAkhir: 0, masuk: { total: 0, jumlah: 0 }, keluar: { total: 0, jumlah: 0 } }
  for (let i = 0; i < N; i++) {
    const keluar = !masukDi.has(i)
    let sen = keluar ? (50_000 + Math.floor(r() * 1_200_000)) * 100 + Math.floor(r() * 100) : (1_000_000 + Math.floor(r() * 4_000_000)) * 100
    if (keluar && sen > saldo) sen = Math.floor(saldo / 2)
    saldo += keluar ? -sen : sen
    const bucket = keluar ? ringkasan.keluar : ringkasan.masuk
    bucket.total += sen
    bucket.jumlah++
    const dd = String(hari(i)).padStart(2, '0')
    const ref = `${dd}01/FTSCY/WS9${String(5000 + i)}`
    const mentah = `${Math.floor(sen / 100)}.${String(sen % 100).padStart(2, '0')}`
    let uraian: string
    let lanjut: string[] = []
    if (i === N - 1) uraian = 'BIAYA ADM'
    else if (!keluar) {
      uraian = `TRSF E-BANKING CR ${ref}`
      lanjut = [mentah, `UJI-B PEMBAYAR ${i}`, ...(i % 3 === 0 ? [`UJI-B INV-${i}`] : [])]
    } else if (i % 6 === 5) uraian = `KARTU DEBIT UJI-B-${i}`
    else {
      uraian = `TRSF E-BANKING DB ${ref}`
      lanjut = [mentah, `UJI-B PENERIMA ${i}`, ...(i % 4 === 1 ? [`UJI-B BERITA ${i}`, `UJI-B CATATAN ${i}`] : i % 4 === 3 ? [`UJI-B BERITA ${i}`] : [])]
    }
    const data: BarisData = {
      tanggal: `${dd}/01`,
      uraian,
      nominal: { bentuk: 'satu-kolom', judul: 'MU TASI', teks: cetakSen(sen, g), penanda: keluar ? 'DB' : '' },
      saldo: '',
      lain: [],
    }
    tx.push({ data, lanjut, hari: hari(i), saldoSesudah: saldo })
  }
  ringkasan.saldoAkhir = saldo
  // SALDO hanya dicetak di transaksi TERAKHIR per hari.
  tx.forEach((t, i) => {
    if (i === N - 1 || tx[i + 1].hari !== t.hari) t.data.saldo = cetakSen(t.saldoSesudah, g)
  })
  const cetak = tx.map(t => [t.data, ...t.lanjut.map(u => ({ lanjutan: u }))] as BarisCetak[])
  const ukuran = [9, 8, 8, 8, 8, 8]
  const halaman: BarisCetak[][] = []
  let k = 0
  for (const u of ukuran) {
    halaman.push(cetak.slice(k, k + u).flat())
    k += u
  }
  if (!opsi.tanpaBarisSaldoAwal) halaman[0].unshift(barisSaldoAwal(TATA_BCA, '01/01', saldoAwal, g))

  const atas = (h: number, total: number): TeksPdf[] => [
    { x: 300, y: 822, teks: 'REKENING GIRO', ukuran: 9 },
    { x: 360, y: 789, teks: 'NO. RE KE NING             :    0000000000', ukuran: 8 },
    { x: 360, y: 778, teks: `HALAMAN                    :    ${h}/${total}`, ukuran: 8 },
    { x: 360, y: 767, teks: 'MATA U ANG                 :    ID R', ukuran: 8 },
    { x: 40, y: 748, teks: 'CATATAN:', ukuran: 7 },
    { x: 40, y: 738, teks: '•    Apabila nasabah tidak melakukan sanggahan atas Laporan Mutasi', ukuran: 7 },
    { x: 300, y: 738, teks: '•   BCA berhak setiap saat melakukan koreksi apabila ada kesalahan pada', ukuran: 7 },
    { x: 40, y: 728, teks: '     Rekening ini sampai dengan akhir bulan berikutnya, ...', ukuran: 7 },
    { x: 300, y: 728, teks: '     Laporan Mutasi Rekening.', ukuran: 7 },
  ]
  const bawah = (h: number, total: number, y: number): TeksPdf[] => {
    if (h < total) return [{ x: 40, y: y - 6, teks: 'Bersambung ke halaman berikut', ukuran: 8 }]
    const blok: [string, number, number | null][] = [
      ['SALDO AWAL', ringkasan.saldoAwal, null],
      ['MUTASI CR', ringkasan.masuk.total, ringkasan.masuk.jumlah],
      ['MUTASI DB', ringkasan.keluar.total, ringkasan.keluar.jumlah],
      ['SALDO AKHIR', ringkasan.saldoAkhir, null],
    ]
    return blok.flatMap(([label, sen, jumlah], i) => {
      const yy = y - 14 - i * 12
      return [
        { x: 250, y: yy, teks: label },
        { x: 330, y: yy, teks: ':' },
        kanan(440, yy, cetakSen(sen, g)),
        ...(jumlah === null ? [] : [{ x: 470, y: yy, teks: String(jumlah) }]),
      ]
    })
  }
  const d = susunDokumen(opsi.tanpaBarisSaldoAwal ? 'UJI-B-bca-tanpa-saldo-awal' : 'UJI-B-bca-asli', TATA_BCA, halaman, { atas, bawah, periodeTiapHalaman: true, tanpaNomorHalaman: true })
  return { ...d, ringkasan }
}
