import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bacaBlok,
  bacaSaldoSel,
  bacaTanggalSel,
  bacaUangSel,
  belahTempelan,
  cocokkanAkun,
  dariHalamanMentah,
  indeksAkun,
  kelasBaris,
  kenaliJudul,
  nominalKeSel,
  penandaDbCr,
  periksaUrutanTanggal,
  pisahkanNominal,
  selKosong,
  tetapkanTahun,
  validasiBaris,
  type BarisTerpetakan,
  type HasilBacaBlok,
  type Periode,
  type SelDraf,
} from './mutasi-draf'
import type { HalamanMentah } from './mutasi-kas/kontrak-baris-mentah'

const APRIL: Periode = { mulai: '2026-04-01', akhir: '2026-04-30' }
const OKT: Periode = { mulai: '2026-10-01', akhir: '2026-10-31' }

function ok(h: HasilBacaBlok) {
  if (!h.ok) throw new Error(`blok ditolak: ${h.pesan}`)
  return h
}

const tempel = (teks: string, periode = APRIL, sumber: 'tempel' | 'berkas' = 'tempel') => {
  const { baris, nomor } = belahTempelan(teks)
  return bacaBlok({ baris, nomor, sumber, periode })
}

// ── Pembelah tempelan ────────────────────────────────────────

describe('belahTempelan — TSV dari Excel / Google Sheets', () => {
  it('Excel: CRLF, sel berkutip berisi baris baru (Alt+Enter) dan kutip ganda', () => {
    const teks =
      'Tanggal\tUraian\tMasuk\tKeluar\r\n' +
      '05/04/2026\t"TRF dari ""PT A""\r\nvia BCA"\t1.500.000\t\r\n' +
      '06/04/2026\tBiaya admin\t\t6.500\r\n'
    const h = ok(tempel(teks))
    expect(h.baris).toHaveLength(2)
    // Baris baru di dalam sel jadi SATU spasi — sel grid satu baris.
    expect(h.baris[0].sel.uraian).toBe('TRF dari "PT A" via BCA')
    expect(h.baris[0].sel.masuk).toBe('1.500.000')
    expect(h.baris[1].sel.keluar).toBe('6.500')
  })

  it('Google Sheets: LF tanpa kutip', () => {
    const h = ok(tempel('Tanggal\tUraian\tMasuk\tKeluar\n05/04/2026\tSetoran\t100\t\n'))
    expect(h.baris).toHaveLength(1)
    expect(h.baris[0].nomor).toBe(2)
  })
})

// ── Judul kolom ──────────────────────────────────────────────

describe('judul kolom → peran, tanpa arah dari Debet/Kredit', () => {
  it('Debet/Kredit = dua kolom nominal TANPA petunjuk arah', () => {
    const p = kenaliJudul(['Tanggal', 'Keterangan', 'Debet', 'Kredit', 'Saldo'])!
    expect(p.filter(k => k.peran === 'nominal').map(k => k.petunjuk)).toEqual([null, null])
  })

  it('Masuk/Keluar & Penerimaan/Pengeluaran = petunjuk (bukan keputusan)', () => {
    const p = kenaliJudul(['Tgl', 'Uraian', 'Pengeluaran', 'Penerimaan'])!
    expect(p.filter(k => k.peran === 'nominal').map(k => k.petunjuk)).toEqual(['keluar', 'masuk'])
  })

  it('kolom tambahan (No. Ref, Cabang) TIDAK menggeser apa pun', () => {
    const h = ok(
      tempel('Tanggal\tNo. Ref\tUraian\tCabang\tDebet\tKredit\tSaldo\n05/04/2026\tR-1\tSetoran\t0998\t\t250.000\t1.250.000\n')
    )
    expect(h.baris[0].sel).toMatchObject({ tanggal: '05/04/2026', uraian: 'Setoran', saldo: '1.250.000' })
    expect(h.baris[0].sel.keluar).toBe('250.000')
  })

  it('catatan: alias Konfirmasi / Reff / Ref / Catatan → kolom catatan, bukan uraian', () => {
    for (const judul of ['Konfirmasi', 'Reff', 'Ref', 'Catatan']) {
      const h = ok(tempel(`Tanggal\tUraian\tMasuk\t${judul}\n05/04/2026\tSetoran\t100\tOK-${judul}\n`))
      expect(h.baris[0].sel.catatan, judul).toBe(`OK-${judul}`)
      expect(h.baris[0].sel.uraian, judul).toBe('Setoran')
    }
  })

  it('tanpa judul → POSISIONAL dari kolom jangkar (urutan grid)', () => {
    const { baris, nomor } = belahTempelan('Setoran\t100\t\t1.100\n')
    const h = ok(bacaBlok({ baris, nomor, sumber: 'tempel', periode: APRIL, jangkarKolom: 'uraian' }))
    expect(h.dariJudul).toBe(false)
    expect(h.baris[0].sel).toMatchObject({ uraian: 'Setoran', masuk: '100', keluar: '', saldo: '1.100' })
  })

  it('kop di atas baris judul dilewati dengan alasan', () => {
    const h = ok(tempel('PT CONTOH\nRekening 123\nTanggal\tUraian\tMasuk\tKeluar\n05/04/2026\tSetoran\t100\t\n'))
    expect(h.baris).toHaveLength(1)
    expect(h.dilewati.map(d => d.alasan)).toEqual([
      'Kop di atas baris judul kolom.',
      'Kop di atas baris judul kolom.',
      'Baris judul kolom.',
    ])
  })
})

// ── Dua sumber, satu struktur: template akuntan vs rekening koran BCA ──

describe('template akuntan (Debet = masuk) dan rekening koran (Debet = keluar) dibaca SAMA', () => {
  // Fikstur yang SAMA strukturnya: judul Debet/Kredit identik, isinya berlawanan
  // makna. S2 tidak boleh membedakannya — arahnya diputuskan rantai saldo (S3).
  const TEMPLATE =
    'Tanggal\tUraian\tDebet\tKredit\tSaldo\n' +
    '01/04/2026\tSALDO AWAL\t\t\t1.000.000\n' +
    '02/04/2026\tPenjualan\t500.000\t\t1.500.000\n' +
    '03/04/2026\tBeli bahan\t\t200.000\t1.300.000\n'
  const BANK =
    'Tanggal\tUraian\tDebet\tKredit\tSaldo\n' +
    '01/04/2026\tSALDO AWAL\t\t\t1.000.000\n' +
    '02/04/2026\tTRF KE SUPPLIER\t500.000\t\t500.000\n' +
    '03/04/2026\tSETORAN TUNAI\t\t200.000\t700.000\n'

  it('keduanya: kolom nominal pertama ditaruh SEMENTARA di Masuk, tanpa keputusan arah', () => {
    for (const teks of [TEMPLATE, BANK]) {
      const h = ok(tempel(teks))
      expect(h.judulNominal).toEqual(['Debet', 'Kredit'])
      expect(h.pertamaKe).toBe('masuk')
      expect(h.satuKolom).toBe(false)
      expect(h.baris[0].sel.masuk).toBe('500.000')
      expect(h.baris[1].sel.keluar).toBe('200.000')
    }
  })

  it('SALDO AWAL tidak jadi transaksi — saldonya jadi jangkar (titik saldo sebelum transaksi pertama)', () => {
    const h = ok(tempel(TEMPLATE))
    expect(h.baris).toHaveLength(2)
    expect(h.titikSaldo).toEqual([{ setelah: 0, saldo: '1.000.000', nomor: 2, halaman: null }])
  })

  it('BCA: satu kolom MUTASI + penanda DB/CR di selnya → arah per baris dari penandanya', () => {
    const h = ok(
      tempel(
        'TANGGAL\tKETERANGAN\tCBG\tMUTASI\tSALDO\n' +
          '01/04\tSALDO AWAL\t\t\t1,000,000.00\n' +
          '02/04\tTRSF E-BANKING DB 0204/FTSCY\t0998\t500,000.00 DB\t500,000.00\n' +
          '03/04\tSETORAN TUNAI\t0998\t200,000.00 CR\t700,000.00\n'
      )
    )
    expect(h.satuKolom).toBe(true)
    expect(h.baris.map(b => b.penanda)).toEqual(['keluar', 'masuk'])
    expect(h.baris[0].sel).toMatchObject({ keluar: '500,000.00', masuk: '' })
    expect(h.baris[1].sel).toMatchObject({ masuk: '200,000.00', keluar: '' })
    // Tanggal tanpa tahun → tahun periode, ditulis baku DD/MM/YYYY.
    expect(h.baris[0].sel.tanggal).toBe('02/04/2026')
  })

  it('DB/CR di URAIAN pada dua kolom nominal = petunjuk saja; nilainya tetap di kolom sementara', () => {
    const h = ok(tempel('Tanggal\tUraian\tDebet\tKredit\n02/04/2026\tTRSF DB 1\t500\t\n'))
    expect(h.baris[0].penanda).toBe('keluar')
    expect(h.baris[0].sel.masuk).toBe('500')
  })
})

// ── Kelas baris ──────────────────────────────────────────────

describe('lima kelas baris dilewati — sebagai DAFTAR beralasan, bukan galat', () => {
  const b = (o: Partial<BarisTerpetakan>): BarisTerpetakan => {
    const isi = {
      tanggal: '',
      uraian: '',
      nominal: ['', ''],
      penanda: '',
      saldo: '',
      akunLawan: '',
      catatan: '',
      ...o,
    }
    return { ...isi, semua: o.semua ?? [isi.tanggal, isi.uraian, ...isi.nominal, isi.saldo] }
  }
  const opsi = { sumber: 'tempel' as const, judulDikenal: new Set(['tanggal', 'uraian', 'debet', 'kredit', 'saldo']) }

  it('kosong', () => expect(kelasBaris(b({}), opsi).kelas).toBe('kosong'))
  it('judul berulang (dikenali alias)', () =>
    expect(kelasBaris(b({ tanggal: 'Tanggal', uraian: 'Uraian', nominal: ['Debet', 'Kredit'], saldo: 'Saldo' }), opsi).kelas).toBe('judul'))
  it('judul berulang (≥ 2 sel sama dengan judul yang dikenal, walau kata tak dikenal)', () => {
    const o = { ...opsi, judulDikenal: new Set(['tgl posting', 'mutasi rp', 'sisa']) }
    expect(kelasBaris(b({ semua: ['TGL POSTING', 'MUTASI (Rp)', 'SISA'] }), o).kelas).toBe('judul')
  })
  it('saldo (SALDO AWAL/AKHIR: tanpa nominal, bersaldo, menyebut saldo)', () => {
    expect(kelasBaris(b({ tanggal: '01/04/2026', uraian: 'SALDO AWAL', saldo: '1.000' }), opsi).kelas).toBe('saldo')
    expect(kelasBaris(b({ uraian: 'Saldo Akhir', saldo: '1.000' }), opsi).kelas).toBe('saldo')
    expect(kelasBaris(b({ uraian: 'BALANCE B/F', saldo: '1.000' }), opsi).kelas).toBe('saldo')
  })
  it('ringkasan (TOTAL/SUBTOTAL/MUTASI DEBET tanpa tanggal)', () => {
    for (const u of ['TOTAL', 'Subtotal halaman', 'MUTASI DEBET', 'Jumlah Mutasi Kredit']) {
      expect(kelasBaris(b({ uraian: u, nominal: ['1.000', ''] }), opsi).kelas, u).toBe('ringkasan')
    }
  })
  it('lanjutan (teks saja) — hanya tempelan & berkas', () => {
    expect(kelasBaris(b({ uraian: 'lanjutan uraian' }), opsi).kelas).toBe('lanjutan')
    expect(kelasBaris(b({ uraian: 'lanjutan uraian' }), { ...opsi, sumber: 'berkas' }).kelas).toBe('lanjutan')
  })

  it('bertanggal tapi nominal hilang & tanpa kata saldo → TRANSAKSI (merah), bukan saldo', () => {
    // Salah baca nominal tidak boleh membuat transaksinya dilewati diam-diam.
    expect(kelasBaris(b({ tanggal: '02/04/2026', uraian: 'TRF', saldo: '500' }), opsi).kelas).toBe('transaksi')
  })

  it('bertanggal dengan kata "total" tetap transaksi', () => {
    expect(kelasBaris(b({ tanggal: '02/04/2026', uraian: 'TOTAL PEMBAYARAN', nominal: ['500', ''] }), opsi).kelas).toBe('transaksi')
  })

  it('lanjutan digabung ke uraian transaksi sebelumnya dengan SATU spasi, dan tercatat di daftar', () => {
    const h = ok(tempel('Tanggal\tUraian\tMasuk\n05/04/2026\tTRF DARI\t100\n\tPT  CONTOH\t\n'))
    expect(h.baris).toHaveLength(1)
    expect(h.baris[0].sel.uraian).toBe('TRF DARI PT CONTOH')
    expect(h.dilewati.at(-1)).toMatchObject({ kelas: 'lanjutan', alasan: 'Digabung ke uraian baris 2.' })
  })

  it('urutan dalam blok utuh: kosong tidak dicatat, judul/saldo/ringkasan dicatat beralasan', () => {
    const h = ok(
      tempel(
        'Tanggal\tUraian\tDebet\tKredit\tSaldo\n' +
          '01/04/2026\tSALDO AWAL\t\t\t1.000\n' +
          '02/04/2026\tA\t100\t\t1.100\n' +
          'Tanggal\tUraian\tDebet\tKredit\tSaldo\n' +
          '\tTOTAL\t100\t0\t\n'
      )
    )
    expect(h.baris).toHaveLength(1)
    expect(h.dilewati.map(d => d.kelas)).toEqual(['judul', 'saldo', 'judul', 'ringkasan'])
  })
})

// ── PDF: kontrak HalamanMentah → jalur yang sama ─────────────

describe('PDF (HalamanMentah) lewat jalur yang sama dengan tempelan', () => {
  const dua = (pertama: string, kedua: string) => ({
    bentuk: 'dua-kolom' as const,
    pertama: { judul: 'Mutasi Debet', teks: pertama },
    kedua: { judul: 'Mutasi Kredit', teks: kedua },
  })
  const halaman: HalamanMentah[] = [
    {
      halaman: 1,
      kolom: ['Tanggal', 'Keterangan', 'Mutasi Debet', 'Mutasi Kredit', 'Saldo', 'Reff'],
      periodeTeks: 'PERIODE : OKTOBER 2026',
      baris: [
        { halaman: 1, tanggal: '', uraian: 'SALDO AWAL', nominal: dua('', ''), saldo: '1.000.000,00', lain: [] },
        { halaman: 1, tanggal: '02/10', uraian: 'TRF KE PT A', nominal: dua('250.000,00', ''), saldo: '750.000,00', lain: [{ judul: 'Reff', teks: 'R-1' }] },
      ],
    },
    {
      halaman: 2,
      kolom: ['Tanggal', 'Keterangan', 'Mutasi Debet', 'Mutasi Kredit', 'Saldo', 'Reff'],
      periodeTeks: null,
      baris: [
        // Judul kolom yang TERCETAK ULANG di halaman 2 — dikirim sebagai baris biasa (kontrak).
        { halaman: 2, tanggal: 'Tanggal', uraian: 'Keterangan', nominal: dua('Mutasi Debet', 'Mutasi Kredit'), saldo: 'Saldo', lain: [{ judul: 'Reff', teks: 'Reff' }] },
        { halaman: 2, tanggal: '', uraian: 'SALDO AWAL', nominal: dua('', ''), saldo: '750.000,00', lain: [] },
        { halaman: 2, tanggal: '03/10', uraian: 'SETORAN', nominal: dua('', '100.000,00'), saldo: '850.000,00', lain: [] },
        // Baris teks-saja dari PDF: anomali (uraian terlipat sudah digabung Stream B).
        { halaman: 2, tanggal: '', uraian: 'teks nyasar', nominal: dua('', ''), saldo: '', lain: [] },
      ],
    },
  ]

  const h = ok(bacaBlok({ ...dariHalamanMentah(halaman), sumber: 'pdf', periode: OKT }))

  it('judul kolom yang tercetak ulang dikenali sebagai NON-transaksi dan dilewati', () => {
    expect(h.dilewati.filter(d => d.kelas === 'judul').map(d => d.halaman)).toEqual([2])
  })

  it('SALDO AWAL tiap halaman jadi titik saldo, halaman tercatat', () => {
    expect(h.titikSaldo.map(t => [t.setelah, t.saldo, t.halaman])).toEqual([
      [0, '1.000.000,00', 1],
      [1, '750.000,00', 2],
    ])
  })

  it('transaksi membawa nomor halaman, Reff → catatan, tahun dari periode', () => {
    const transaksi = h.baris.filter(b => b.sel.uraian !== 'teks nyasar')
    expect(transaksi.map(b => [b.halaman, b.sel.tanggal, b.sel.catatan])).toEqual([
      [1, '02/10/2026', 'R-1'],
      [2, '03/10/2026', ''],
    ])
  })

  it('baris teks-saja dari PDF BUKAN lanjutan: masuk grid sebagai transaksi yang galat', () => {
    const nyasar = h.baris.find(b => b.sel.uraian === 'teks nyasar')
    expect(nyasar).toBeDefined()
    expect(h.dilewati.some(d => d.kelas === 'lanjutan')).toBe(false)
  })

  it('satu-kolom + penanda (BCA) dari PDF: arah per baris dari penanda', () => {
    const bca: HalamanMentah[] = [
      {
        halaman: 1,
        kolom: ['TANGGAL', 'KETERANGAN', 'MUTASI', 'SALDO'],
        periodeTeks: null,
        baris: [
          { halaman: 1, tanggal: '02/10', uraian: 'TRSF', nominal: { bentuk: 'satu-kolom', judul: 'MUTASI', teks: '500,000.00', penanda: 'DB' }, saldo: '500,000.00', lain: [] },
          { halaman: 1, tanggal: '03/10', uraian: 'SETOR', nominal: { bentuk: 'satu-kolom', judul: 'MUTASI', teks: '200,000.00', penanda: 'CR' }, saldo: '700,000.00', lain: [] },
        ],
      },
    ]
    const r = ok(bacaBlok({ ...dariHalamanMentah(bca), sumber: 'pdf', periode: OKT }))
    expect(r.satuKolom).toBe(true)
    expect(r.baris.map(b => [b.sel.masuk, b.sel.keluar])).toEqual([
      ['', '500,000.00'],
      ['200,000.00', ''],
    ])
  })
})

// ── Tanggal ──────────────────────────────────────────────────

describe('tanggal: bentuk, tahun, periode', () => {
  it('DD/MM/YYYY · DD/Mon/YYYY · D-Mon-YYYY · YYYY-MM-DD semuanya terbaca', () => {
    for (const teks of ['05/04/2026', '05/Apr/2026', '5-Apr-2026', '2026-04-05', '5 April 2026']) {
      expect(bacaTanggalSel(teks, APRIL), teks).toBe('2026-04-05')
    }
  })

  it('tanpa tahun → tahun periode yang memuat bulannya', () => {
    expect(bacaTanggalSel('26/10', OKT)).toBe('2026-10-26')
    expect(bacaTanggalSel('26 Okt', OKT)).toBe('2026-10-26')
    // Periode lintas tahun: Des di tahun mulai, Jan di tahun akhir.
    const lintas = { mulai: '2026-12-01', akhir: '2027-01-31' }
    expect(bacaTanggalSel('15/12', lintas)).toBe('2026-12-15')
    expect(bacaTanggalSel('15/01', lintas)).toBe('2027-01-15')
  })

  it('tahun lintas Des→Jan dinaikkan setahun secara deterministik (dan Jan→Des diturunkan)', () => {
    const p = { mulai: '2026-12-01', akhir: '2026-12-31' }
    expect(tetapkanTahun(['30/12', '31/12', '01/01', '02/01'], p)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
    // Terurut terbaru-dulu.
    expect(tetapkanTahun(['02/01', '01/01', '31/12'], { mulai: '2027-01-01', akhir: '2027-01-31' })).toEqual([
      '2027-01-02',
      '2027-01-01',
      '2026-12-31',
    ])
  })

  it('bulan mundur selain 12↔1 BUKAN pergantian tahun', () => {
    expect(tetapkanTahun(['05/04', '30/03'], APRIL)).toEqual(['2026-04-05', '2026-03-30'])
  })

  it('tanggal bertahun menjadi tahun berjalan untuk tanggal tanpa tahun sesudahnya', () => {
    expect(tetapkanTahun(['31/12/2025', '01/01'], { mulai: '2026-01-01', akhir: '2026-01-31' })).toEqual([
      '2025-12-31',
      '2026-01-01',
    ])
  })

  it('29 Februari: sah di tahun kabisat, ditolak di tahun biasa — juga tanpa tahun', () => {
    const feb28 = { mulai: '2028-02-01', akhir: '2028-02-29' }
    expect(bacaTanggalSel('29/02/2028', feb28)).toBe('2028-02-29')
    expect(bacaTanggalSel('29/02', feb28)).toBe('2028-02-29')
    expect(bacaTanggalSel('29/02/2026', APRIL)).toBeNull()
    expect(bacaTanggalSel('29/02', { mulai: '2026-02-01', akhir: '2026-02-28' })).toBeNull()
  })

  it('blok MM/DD DITOLAK: ada potongan kedua > 12', () => {
    const r = periksaUrutanTanggal([{ nomor: 2, teks: '04/15/2026' }], APRIL)
    expect(r.ditolak).toBe(true)
  })

  it('blok MM/DD DITOLAK lewat PERIODE: seluruh tanggal ≤ 12/12, bacaan MM/DD yang jatuh di periode', () => {
    // April: "04/01" … "04/06" dibaca MM/DD = 1–6 April (di periode); dibaca
    // DD/MM = 4 Jan … 4 Jun (hanya 04/04 yang di periode).
    const sel = ['04/01/2026', '04/02/2026', '04/03/2026', '04/04/2026', '04/05/2026', '04/06/2026'].map((teks, i) => ({ nomor: i + 1, teks }))
    expect(periksaUrutanTanggal(sel, APRIL).ditolak).toBe(true)
    const h = tempel('Tanggal\tUraian\tMasuk\n' + sel.map(s => `${s.teks}\tx\t1`).join('\n'))
    expect(h.ok).toBe(false)
  })

  it('bacaan DD/MM di periode (atau seri) → DITERIMA sebagai DD/MM', () => {
    const sel = ['01/04/2026', '02/04/2026', '03/04/2026'].map((teks, i) => ({ nomor: i + 1, teks }))
    expect(periksaUrutanTanggal(sel, APRIL).ditolak).toBe(false)
    expect(periksaUrutanTanggal([{ nomor: 1, teks: '04/04/2026' }], APRIL).ditolak).toBe(false)
  })
})

// ── Nominal, saldo, penanda ──────────────────────────────────

describe('nominal & saldo lewat bacaNominal — satu aturan pemisah', () => {
  it('dua konvensi angka sama-sama terbaca dalam sen', () => {
    expect(bacaUangSel('1.500.000,25')).toEqual({ status: 'ok', minor: 150000025 })
    expect(bacaUangSel('1,500,000.25')).toEqual({ status: 'ok', minor: 150000025 })
    expect(bacaUangSel('Rp 1.000')).toEqual({ status: 'ok', minor: 100000 })
  })

  it('nominal tak terbaca → galat dengan pesan bacaNominal, tidak pernah diam-diam 0', () => {
    expect(bacaUangSel('12.345.67').status).toBe('galat')
    expect(bacaUangSel('-100').status).toBe('galat')
  })

  it('nominalKeSel: kanonik → teks Indonesia yang terbaca kembali ke nilai yang SAMA', () => {
    expect(nominalKeSel('1500000.25')).toBe('1.500.000,25')
    expect(nominalKeSel('1500000.00')).toBe('1.500.000')
    expect(nominalKeSel('999.50')).toBe('999,50')
    expect(nominalKeSel('-1234.00')).toBe('-1.234')
    expect(nominalKeSel(null)).toBe('')
    for (const k of ['0.01', '1000.00', '1234567890.99', '100.10']) {
      const h = bacaUangSel(nominalKeSel(k))
      expect(h.status === 'ok' && h.minor, k).toBe(Math.round(Number(k) * 100))
    }
    expect(bacaSaldoSel(nominalKeSel('-1234.50'))).toEqual({ status: 'ok', minor: -123450 })
  })

  it('saldo negatif (cerukan): minus depan, minus belakang, kurung', () => {
    for (const t of ['-1.000', '1.000-', '(1.000)']) expect(bacaSaldoSel(t), t).toEqual({ status: 'ok', minor: -100000 })
  })

  it('penanda DB/CR hanya sebagai token UTUH', () => {
    expect(penandaDbCr('TRSF E-BANKING DB 0204')).toBe('keluar')
    expect(penandaDbCr('SETORAN CR')).toBe('masuk')
    expect(penandaDbCr('DEBBY CRAFT')).toBeNull()
    expect(penandaDbCr('DB CR')).toBeNull()
    expect(pisahkanNominal('500,000.00 DB')).toEqual({ teks: '500,000.00', penanda: 'keluar', negatif: false })
    expect(pisahkanNominal('500000CR')).toEqual({ teks: '500000', penanda: 'masuk', negatif: false })
    expect(pisahkanNominal('1.000,-')).toEqual({ teks: '1.000,-', penanda: null, negatif: false })
  })

  it('satu kolom tanpa penanda tapi bertanda minus → keluar (petunjuk, diverifikasi rantai)', () => {
    const h = ok(tempel('Tanggal\tUraian\tAmount\n05/04/2026\tBayar\t-50.000\n06/04/2026\tTerima\t75.000\n'))
    expect(h.baris.map(b => [b.sel.masuk, b.sel.keluar])).toEqual([
      ['', '50.000'],
      ['75.000', ''],
    ])
  })

  it('minus di kolom nominal GANDA dibiarkan terlihat (galat di selnya)', () => {
    const h = ok(tempel('Tanggal\tUraian\tDebet\tKredit\n05/04/2026\tX\t-500\t\n'))
    expect(h.baris[0].sel.masuk).toBe('-500')
    expect(bacaUangSel(h.baris[0].sel.masuk).status).toBe('galat')
  })
})

// ── Akun lawan ───────────────────────────────────────────────

describe('akun lawan: kode persis dulu, lalu nama persis', () => {
  const coa = indeksAkun([
    { id: 'a-admin', kode: '6-2000', nama: 'Biaya Admin Bank' },
    { id: 'a-jual', kode: '4-1000', nama: 'Penjualan' },
    { id: 'a-x1', kode: '6-9001', nama: 'Lain-lain' },
    { id: 'a-x2', kode: '6-9002', nama: 'lain-lain' },
    // Nama yang SAMA dengan kode akun lain — kode menang.
    { id: 'a-aneh', kode: '9-9999', nama: '4-1000' },
  ])

  it('kode persis (abaikan besar/kecil & spasi tepi)', () => {
    expect(cocokkanAkun(' 6-2000 ', coa)).toEqual({ status: 'ok', akunId: 'a-admin' })
  })
  it('nama persis', () => {
    expect(cocokkanAkun('biaya admin bank', coa)).toEqual({ status: 'ok', akunId: 'a-admin' })
  })
  it('kode dicoba LEBIH DULU daripada nama', () => {
    expect(cocokkanAkun('4-1000', coa)).toEqual({ status: 'ok', akunId: 'a-jual' })
  })
  it('nama dipakai > 1 akun → galat "pakai kode", tidak ditebak', () => {
    const r = cocokkanAkun('Lain-lain', coa)
    expect(r.status).toBe('galat')
    expect(r.status === 'galat' && r.pesan).toContain('tulis kodenya')
  })
  it('tak dikenal → galat; kosong → kosong', () => {
    expect(cocokkanAkun('Biaya Admin', coa).status).toBe('galat')
    expect(cocokkanAkun('  ', coa)).toEqual({ status: 'kosong' })
  })
})

// ── validasiBaris ────────────────────────────────────────────

describe('validasiBaris — galat per sel, lalu validateCashMutation sebagai hakim terakhir', () => {
  const KAS = '11111111-1111-4111-8111-111111111111'
  const LAWAN = '22222222-2222-4222-8222-222222222222'
  const k = {
    periode: APRIL,
    akunKasId: KAS,
    akun: indeksAkun([
      { id: KAS, kode: '1-1100', nama: 'Bank BCA' },
      { id: LAWAN, kode: '6-2000', nama: 'Biaya Admin' },
    ]),
  }
  const sel = (o: Partial<SelDraf>): SelDraf => ({ ...selKosong(), tanggal: '05/04/2026', keluar: '6.500', ...o })

  it('baris sah → nilai siap kirim (debit = MASUK, D36)', () => {
    const r = validasiBaris(sel({ masuk: '1.000', keluar: '', akunLawan: '6-2000', catatan: 'Reff 1', saldo: '-500' }), k)
    expect(r.galat).toEqual({})
    expect(r.nilai).toEqual({
      tanggal: '2026-04-05',
      debit: '1000.00',
      kredit: '0.00',
      saldo: '-500.00',
      keterangan: null,
      catatan: 'Reff 1',
      akunLawanId: LAWAN,
    })
  })

  it('D60: tanggal kosong WAJIB diisi; di luar periode = galat', () => {
    expect(validasiBaris(sel({ tanggal: '' }), k).galat.tanggal).toContain('wajib')
    expect(validasiBaris(sel({ tanggal: '01/05/2026' }), k).galat.tanggal).toContain('di luar periode')
    expect(validasiBaris(sel({ tanggal: '31/02/2026' }), k).galat.tanggal).toContain('tidak terbaca')
  })

  it('Masuk ATAU Keluar: keduanya kosong / keduanya terisi → galat di kedua sel', () => {
    expect(validasiBaris(sel({ keluar: '' }), k).galat).toMatchObject({ masuk: 'Isi Masuk atau Keluar.', keluar: 'Isi Masuk atau Keluar.' })
    expect(validasiBaris(sel({ masuk: '1' }), k).galat.masuk).toContain('Hanya satu')
    expect(validasiBaris(sel({ keluar: '0' }), k).galat.keluar).toBe('Isi Masuk atau Keluar.')
  })

  it('uang tak terbaca → galat di selnya dengan pesan bacaNominal', () => {
    expect(validasiBaris(sel({ keluar: '12.345.67' }), k).galat.keluar).toContain('Format nominal')
  })

  it('akun lawan = akun kas ini sendiri → galat', () => {
    expect(validasiBaris(sel({ akunLawan: '1-1100' }), k).galat.akunLawan).toContain('akun kas ini sendiri')
  })

  it('uraian & catatan > 500 karakter → galat di selnya', () => {
    const panjang = 'x'.repeat(501)
    const r = validasiBaris(sel({ uraian: panjang, catatan: panjang }), k)
    expect(Object.keys(r.galat).sort()).toEqual(['catatan', 'uraian'])
  })

  it('setiap galat sel membuat nilai null — baris merah tidak pernah ikut terkirim', () => {
    expect(validasiBaris(sel({ saldo: 'abc' }), k).nilai).toBeNull()
  })
})

// ── Kinerja ──────────────────────────────────────────────────

describe('10.000 baris', () => {
  it('bacaBlok + validasi seluruh baris jauh di bawah anggaran tempel 2 detik', () => {
    const baris = ['Tanggal\tUraian\tDebet\tKredit\tSaldo']
    for (let i = 0; i < 10_000; i++) {
      const hari = String((i % 30) + 1).padStart(2, '0')
      baris.push(`${hari}/04/2026\tTRANSAKSI ${i}\t${i % 2 ? '1.000' : ''}\t${i % 2 ? '' : '500'}\t${i}`)
    }
    const t0 = performance.now()
    const h = ok(tempel(baris.join('\n')))
    const k = { periode: APRIL, akunKasId: '11111111-1111-4111-8111-111111111111', akun: indeksAkun([]) }
    for (const b of h.baris) validasiBaris(b.sel, k)
    const ms = performance.now() - t0
    expect(h.baris).toHaveLength(10_000)
    expect(ms).toBeLessThan(1500)
  })
})

// ── Kontrak modul ────────────────────────────────────────────

describe('kontrak modul', () => {
  it('TIDAK ada satu pun RegExp di berkasnya (D22)', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'mutasi-draf.ts'), 'utf8')
    for (const jejak of ['new RegExp', '.match(', '.replace(/', '.test(', '.split(/', 'RegExp(']) {
      expect(src.includes(jejak), jejak).toBe(false)
    }
    // Literal regex: "/" pembuka diikuti karakter pola khas.
    for (const jejak of ['= /^', '(/^', ' /\\', '/g,', '/i,', '/g)', '/i)']) {
      expect(src.includes(jejak), jejak).toBe(false)
    }
  })

  it('arah tidak pernah diputuskan di sini: tidak ada impor pemeriksa saldo', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'mutasi-draf.ts'), 'utf8')
    expect(src).not.toContain("from '@/lib/saldo-berantai'")
  })
})
