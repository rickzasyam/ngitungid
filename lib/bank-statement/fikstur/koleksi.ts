import { acak, cetakSen, nominalKosong, susunDokumen, type BarisCetak, type BarisData, type DokumenSintetis, type TataLetak } from './dokumen-sintetis'

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
