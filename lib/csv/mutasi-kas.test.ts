import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  detectDelimiter,
  detectHeader,
  deteksiTanggalMMDD,
  mapRows,
  normalizeHeader,
  parseCsv,
  parseNominalCell,
  parseTanggalCell,
  FIELD_WAJIB,
  MUTASI_FIELDS,
} from './mutasi-kas'

describe('detectDelimiter', () => {
  it('mengenali koma', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
  })

  it('mengenali titik koma — bank Indonesia lazim memakainya', () => {
    expect(detectDelimiter('Tanggal;Keterangan;Debit\n01/09/2026;TRF;1.000,00')).toBe(';')
  })

  it('koma DI DALAM kutip tidak ikut dihitung', () => {
    // Ini kasus yang paling mahal kalau salah: menebak koma pada berkas
    // ber-titik-koma memecah setiap nominal jadi dua kolom, dan hasilnya
    // terbaca "berhasil" dengan angka yang salah.
    const teks = 'Tanggal;Keterangan;Debit\n01/09/2026;"TRF, BRI, CAB A";1.000,00'
    expect(detectDelimiter(teks)).toBe(';')
  })

  it('mengenali tab dan pipe', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|')
  })
})

describe('parseCsv', () => {
  it('menomori baris dari 1 mengikuti BERKAS, bukan indeks array', () => {
    const r = parseCsv('a,b\nc,d\ne,f')
    expect(r.rows.map(x => x.nomor)).toEqual([1, 2, 3])
  })

  it('menangani kutip, pemisah di dalam kutip, dan kutip ganda', () => {
    const r = parseCsv('x,"satu, dua","dia bilang ""ya"""')
    expect(r.rows[0].cells).toEqual(['x', 'satu, dua', 'dia bilang "ya"'])
  })

  it('newline DI DALAM sel tidak memecah barisnya', () => {
    const r = parseCsv('a,"baris\nkedua",c')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].cells[1]).toBe('baris\nkedua')
  })

  it('CRLF tidak meninggalkan carriage return di sel', () => {
    const r = parseCsv('a,b\r\nc,d\r\n')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[1].cells).toEqual(['c', 'd'])
  })

  it('baris yang SELURUH selnya kosong dibuang', () => {
    // Berkas rekening koran sering berakhir dengan baris kosong; kalau lolos,
    // ia muncul sebagai "baris bermasalah" yang tidak bisa dibetulkan siapa pun.
    const r = parseCsv('a,b\n,,\n\nc,d\n')
    expect(r.rows.map(x => x.cells)).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('nomor baris TIDAK bergeser walau ada baris kosong di tengah', () => {
    const r = parseCsv('a,b\n\nc,d')
    expect(r.rows.map(x => x.nomor)).toEqual([1, 3])
  })

  it('baris terakhir tanpa newline penutup tetap terbaca', () => {
    const r = parseCsv('a,b\nc,d')
    expect(r.rows).toHaveLength(2)
  })
})

describe('normalizeHeader', () => {
  it('huruf kecil, tanda baca jadi spasi, spasi dirapatkan', () => {
    expect(normalizeHeader('  Tgl.  Transaksi ')).toBe('tgl transaksi')
    expect(normalizeHeader('Debit/Kredit')).toBe('debit kredit')
  })

  it('masukan bukan string tidak melempar', () => {
    for (const v of [null, undefined, 42]) expect(typeof normalizeHeader(v)).toBe('string')
  })
})

describe('detectHeader', () => {
  const rows = parseCsv(
    [
      'Rekening Koran Bank ABC',
      'Periode: Tanggal 1 s/d 30 September 2026',
      '',
      'Tanggal,Keterangan,Debet,Kredit,Saldo',
      '01/09/2026,TRF MASUK,,1000000,5000000',
    ].join('\n')
  ).rows

  it('menemukan baris header walau didahului kop', () => {
    const d = detectHeader(rows)
    expect(d.headerRowIndex).toBe(2) // baris kosong dibuang, jadi indeks 2
    // Kolom "Debet" rekening koran = uang KELUAR = field `kredit` kita;
    // kolom "Kredit" = uang MASUK = field `debit` kita (D36).
    expect(d.mapping).toEqual({ tanggal: 0, keterangan: 1, kredit: 2, debit: 3, saldo: 4 })
    expect(d.hilang).toEqual([])
  })

  it('kata bank TERBALIK dari kata kita — ini seluruh jebakannya', () => {
    // Rekening koran ditulis dari pembukuan BANK: simpanan nasabah adalah
    // kewajiban, jadi setoran DIKREDIT. Memetakannya apa adanya membalik arah
    // SETIAP baris yang diimpor, dan jurnalnya tetap seimbang sehingga tidak
    // ada yang melempar galat.
    const r = parseCsv('Tanggal,Debet,Kredit\n01/09/2026,,1000').rows
    const d = detectHeader(r)
    expect(d.mapping.kredit).toBe(1) // "Debet" bank → uang keluar
    expect(d.mapping.debit).toBe(2) // "Kredit" bank → uang masuk
  })

  it('kata NON-akuntansi (masuk/keluar) TIDAK ikut terbalik', () => {
    // "Masuk"/"Keluar" adalah sudut pandang pemilik rekening, bukan bank.
    const r = parseCsv('Tanggal,Uang Masuk,Uang Keluar\n01/09/2026,1000,').rows
    const d = detectHeader(r)
    expect(d.mapping.debit).toBe(1)
    expect(d.mapping.kredit).toBe(2)
  })

  it('baris kop yang memuat kata "Tanggal" TIDAK menang', () => {
    // "Periode: Tanggal 1 s/d 30" cocok ke alias tanggal, tapi tidak punya
    // kolom nominal — syarat yang membuatnya kalah.
    const d = detectHeader(rows)
    expect(rows[d.headerRowIndex!].cells[0]).toBe('Tanggal')
  })

  it('alias Inggris dikenali, dengan pembalikan yang sama', () => {
    const r = parseCsv('Date,Description,Credit,Debit,Balance\n2026-09-01,x,10,,10').rows
    const d = detectHeader(r)
    expect(d.mapping.debit).toBe(2) // Credit bank → uang masuk
    expect(d.mapping.kredit).toBe(3) // Debit bank → uang keluar
    expect(d.mapping.saldo).toBe(4)
  })

  it('berkas tanpa header dikenali → headerRowIndex null, BUKAN galat', () => {
    // Pemetaan manual adalah jalur normal, bukan keadaan darurat.
    const r = parseCsv('01/09/2026,TRF,1000000,,5000000').rows
    const d = detectHeader(r)
    expect(d.headerRowIndex).toBeNull()
    expect(d.hilang).toEqual([...FIELD_WAJIB])
  })

  it('header tanpa kolom nominal sama sekali tidak dianggap header', () => {
    const r = parseCsv('Tanggal,Keterangan\n01/09/2026,x').rows
    expect(detectHeader(r).headerRowIndex).toBeNull()
  })

  it('pemisah boleh DITENTUKAN pemanggil — deteksinya cuma tebakan', () => {
    // Pada berkas satu pasang kolom dengan koma desimal, jumlah ',' dan ';'
    // bisa sama persis dan teksnya sendiri tidak bisa memutuskannya.
    const teks = '01/09/2026;1.000,00'
    // Tebakannya memilih koma dan memecah nominalnya di tengah — hasilnya
    // terbaca "berhasil" dengan angka yang salah, persis kegagalan yang paling
    // sulit terlihat.
    expect(parseCsv(teks).rows[0].cells).toEqual(['01/09/2026;1.000', '00'])
    expect(parseCsv(teks, ';').rows[0].cells).toEqual(['01/09/2026', '1.000,00'])
  })
})

describe('parseNominalCell — dua konvensi angka', () => {
  it('Indonesia: titik ribuan, koma desimal', () => {
    expect(parseNominalCell('1.234.567,89')).toBe('1234567.89')
  })

  it('Inggris: koma ribuan, titik desimal', () => {
    expect(parseNominalCell('1,234,567.89')).toBe('1234567.89')
  })

  it('yang MUNCUL TERAKHIR adalah desimal', () => {
    expect(parseNominalCell('1.000,50')).toBe('1000.50')
    expect(parseNominalCell('1,000.50')).toBe('1000.50')
  })

  it('"1.000" dibaca SERIBU, bukan satu koma nol', () => {
    expect(parseNominalCell('1.000')).toBe('1000.00')
    expect(parseNominalCell('1,000')).toBe('1000.00')
  })

  it('satu pemisah diikuti tepat 2 digit = desimal', () => {
    expect(parseNominalCell('1234,56')).toBe('1234.56')
    expect(parseNominalCell('1234.56')).toBe('1234.56')
  })

  it('"Rp" dan spasi diabaikan', () => {
    expect(parseNominalCell('Rp 1.500.000,00')).toBe('1500000.00')
  })

  it('tanda kurung dan minus sama-sama berarti negatif', () => {
    expect(parseNominalCell('(1.500,00)')).toBe('-1500.00')
    expect(parseNominalCell('-1.500,00')).toBe('-1500.00')
  })

  it('lebih dari 2 desimal DIPOTONG, tidak dibulatkan ke atas', () => {
    // Membulatkan ke atas menciptakan uang yang tidak ada di rekening.
    expect(parseNominalCell('1.234,5678')).toBe('1234.56')
    expect(parseNominalCell('1.234,5699')).toBe('1234.56')
  })

  it('sel kosong / tanpa angka → null', () => {
    for (const v of ['', '   ', '-', 'n/a', null, undefined]) {
      expect(parseNominalCell(v), String(v)).toBeNull()
    }
  })

  it('nol tetap nol, tanpa tanda minus', () => {
    expect(parseNominalCell('0')).toBe('0.00')
    expect(parseNominalCell('(0)')).toBe('0.00')
  })

  it('nol di depan dibuang tanpa mengubah nilainya', () => {
    expect(parseNominalCell('0001500')).toBe('1500.00')
  })

  it('penanda DB/CR di dalam sel TIDAK mengubah tanda', () => {
    // Arah uang datang dari KOLOM tempat sel ini berada. Menebaknya dari huruf
    // akan bertabrakan dengan pemetaan kolom yang sudah dipilih akunting.
    expect(parseNominalCell('1.000,00 DB')).toBe('1000.00')
    expect(parseNominalCell('1.000,00 CR')).toBe('1000.00')
  })
})

describe('parseTanggalCell — tanpa new Date (P2)', () => {
  it('YYYY-MM-DD apa adanya', () => {
    expect(parseTanggalCell('2026-09-21')).toBe('2026-09-21')
  })

  it('DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY', () => {
    expect(parseTanggalCell('21/09/2026')).toBe('2026-09-21')
    expect(parseTanggalCell('21-09-2026')).toBe('2026-09-21')
    expect(parseTanggalCell('21.09.2026')).toBe('2026-09-21')
  })

  it('nama bulan Indonesia dan Inggris', () => {
    expect(parseTanggalCell('21 Sep 2026')).toBe('2026-09-21')
    expect(parseTanggalCell('21 Agustus 2026')).toBe('2026-08-21')
    expect(parseTanggalCell('1 May 2026')).toBe('2026-05-01')
  })

  it('tahun dua digit: <70 jadi 2000-an', () => {
    expect(parseTanggalCell('21/09/26')).toBe('2026-09-21')
    expect(parseTanggalCell('21/09/99')).toBe('1999-09-21')
  })

  it('MENOLAK tanggal yang tidak ada', () => {
    expect(parseTanggalCell('31/02/2026')).toBeNull()
    expect(parseTanggalCell('29/02/2026')).toBeNull()
    expect(parseTanggalCell('00/09/2026')).toBeNull()
    expect(parseTanggalCell('21/13/2026')).toBeNull()
  })

  it('29 Februari diterima HANYA di tahun kabisat', () => {
    expect(parseTanggalCell('29/02/2024')).toBe('2024-02-29')
    expect(parseTanggalCell('29/02/2100')).toBeNull() // 2100 bukan kabisat
    expect(parseTanggalCell('29/02/2000')).toBe('2000-02-29') // 2000 kabisat
  })

  it('sel yang bukan tanggal → null, bukan tanggal ngawur', () => {
    for (const v of ['', 'SALDO AWAL', 'Total', '2026', '21/09', null]) {
      expect(parseTanggalCell(v), String(v)).toBeNull()
    }
  })

  it('tidak bergeser sehari karena zona waktu', () => {
    // new Date('2026-09-21') di zona GMT+7 bisa terbaca 20 September saat
    // dicetak sebagai tanggal lokal. Fungsi ini tidak pernah menyentuh Date.
    expect(parseTanggalCell('2026-01-01')).toBe('2026-01-01')
    expect(parseTanggalCell('2026-12-31')).toBe('2026-12-31')
  })
})

describe('mapRows', () => {
  // Kolomnya ditulis seperti rekening koran sungguhan: "Debet" = uang keluar,
  // "Kredit" = uang masuk. Pemetaannya yang membalik, bukan datanya.
  const berkas = [
    'Tanggal;Keterangan;Debet;Kredit;Saldo',
    '01/09/2026;SETORAN TUNAI;;1.000.000,00;5.000.000,00',
    '02/09/2026;BIAYA ADMIN;15.000,00;;4.985.000,00',
    'SALDO AWAL;;;;',
    '03/09/2026;TRF MASUK;;250.000,00;5.235.000,00',
  ].join('\n')

  const parsed = parseCsv(berkas)
  const deteksi = detectHeader(parsed.rows)
  const hasil = mapRows({
    rows: parsed.rows,
    mapping: deteksi.mapping,
    mulaiDariIndex: (deteksi.headerRowIndex ?? -1) + 1,
  })

  it('membaca baris transaksi dengan sisi yang benar', () => {
    expect(hasil.rows).toHaveLength(3)
    expect(hasil.rows[0]).toMatchObject({
      nomor: 2,
      tanggal: '2026-09-01',
      keterangan: 'SETORAN TUNAI',
      debit: '1000000.00',
      kredit: '0.00',
      saldo: '5000000.00',
    })
    expect(hasil.rows[1]).toMatchObject({ debit: '0.00', kredit: '15000.00' })
  })

  it('baris bukan transaksi DIKEMBALIKAN sebagai bermasalah, bukan dibuang diam-diam', () => {
    // Kalau dibuang, jumlah baris yang diimpor tidak pernah bisa dicocokkan
    // dengan berkasnya — dan transaksi yang hilang karena tanggalnya salah
    // format terlihat sama persis dengan baris kop yang memang tak perlu.
    expect(hasil.bermasalah).toHaveLength(1)
    expect(hasil.bermasalah[0].nomor).toBe(4)
    expect(hasil.bermasalah[0].alasan).toContain('Tanggal')
    expect(hasil.bermasalah[0].cells[0]).toBe('SALDO AWAL')
  })

  it('nomor baris yang dilaporkan adalah nomor DI BERKAS', () => {
    expect(hasil.rows.map(r => r.nomor)).toEqual([2, 3, 5])
  })

  it('baris header tidak ikut terbaca sebagai transaksi', () => {
    expect(hasil.rows.some(r => r.nomor === 1)).toBe(false)
  })

  it('debit DAN kredit terisi bersamaan → bermasalah dengan sebab pemetaan', () => {
    const p = parseCsv('01/09/2026,x,100,200')
    const r = mapRows({ rows: p.rows, mapping: { tanggal: 0, keterangan: 1, debit: 2, kredit: 3 } })
    expect(r.rows).toHaveLength(0)
    expect(r.bermasalah[0].alasan).toContain('pemetaan kolom')
  })

  it('baris tanpa nominal sama sekali → bermasalah', () => {
    const p = parseCsv('01/09/2026,catatan kaki,,')
    const r = mapRows({ rows: p.rows, mapping: { tanggal: 0, keterangan: 1, debit: 2, kredit: 3 } })
    expect(r.bermasalah[0].alasan).toContain('Tidak ada nominal')
  })

  it('nominal NEGATIF di kolom debit/kredit ditolak — kolomnya kemungkinan tertukar', () => {
    const p = parseCsv('01/09/2026,x,-100,')
    const r = mapRows({ rows: p.rows, mapping: { tanggal: 0, keterangan: 1, debit: 2, kredit: 3 } })
    expect(r.rows).toHaveLength(0)
    expect(r.bermasalah[0].alasan).toContain('negatif')
  })

  it('saldo NEGATIF tetap diterima — rekening bisa minus', () => {
    const p = parseCsv('01/09/2026,x,100,,-50')
    const r = mapRows({
      rows: p.rows,
      mapping: { tanggal: 0, keterangan: 1, debit: 2, kredit: 3, saldo: 4 },
    })
    expect(r.rows[0].saldo).toBe('-50.00')
  })

  it('pemetaan manual tanpa kolom keterangan tetap jalan', () => {
    const p = parseCsv('01/09/2026;1.000,00', ';')
    const r = mapRows({ rows: p.rows, mapping: { tanggal: 0, debit: 1 } })
    expect(r.rows[0].keterangan).toBeNull()
    expect(r.rows[0].debit).toBe('1000.00')
  })

  it('indeks kolom di luar jangkauan tidak melempar', () => {
    const p = parseCsv('01/09/2026,x')
    const r = mapRows({ rows: p.rows, mapping: { tanggal: 0, debit: 99 } })
    expect(r.bermasalah).toHaveLength(1)
  })
})

describe('kontrak modul', () => {
  it('TIDAK ada satu pun RegExp di berkasnya (D22)', () => {
    // Isi CSV seluruhnya input pengguna: nama kolom, keterangan, dan angka.
    // Larangan ini yang membuat "tanpa regex" bisa diperiksa, bukan sekadar
    // dijanjikan di komentar.
    const src = readFileSync(join(process.cwd(), 'lib', 'csv', 'mutasi-kas.ts'), 'utf8')
    for (const jejak of ['new RegExp', '.match(', '.replace(/', '.test(', '.split(/']) {
      expect(src.includes(jejak), jejak).toBe(false)
    }
  })

  it('MVP CSV saja — tidak menyentuh xlsx maupun pdf', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'csv', 'mutasi-kas.ts'), 'utf8')
    expect(src).not.toContain('xlsx')
    expect(src).not.toContain('XLSX')
    expect(src.toLowerCase()).not.toContain('pdfjs')
  })

  it('daftar field tidak diam-diam bertambah tanpa label', () => {
    for (const f of MUTASI_FIELDS) expect(typeof f).toBe('string')
    expect(MUTASI_FIELDS).toContain('tanggal')
    expect(FIELD_WAJIB.every(f => MUTASI_FIELDS.includes(f))).toBe(true)
  })
})


// ══ MM/DD/YYYY DITOLAK, TIDAK DIBACA SEPARUH ═════════════════════════════
// Keputusan Ricko 2026-09-21. Berkas Amerika yang lolos separuh adalah bentuk
// kegagalan paling mahal modul ini: baris bertanggal 1–12 terbaca dengan hari
// dan bulan TERTUKAR (pindah periode, tanpa galat), sementara baris bertanggal
// 13+ ditolak satu per satu — sehingga akunting membetulkan yang gagal dan
// tidak pernah tahu sisanya salah.
describe('deteksiTanggalMMDD', () => {
  const sel = (...nilai: string[]) => nilai.map((v, i) => ({ nomor: i + 1, nilai: v }))

  it('mengenali berkas MM/DD/YYYY dari satu sel yang membuktikannya', () => {
    // 09/21 hanya masuk akal sebagai bulan/hari — tidak ada bulan ke-21.
    const d = deteksiTanggalMMDD(sel('01/02/2026', '09/21/2026', '03/04/2026'))
    expect(d.terdeteksi).toBe(true)
    expect(d.contoh[0]).toEqual({ nomor: 2, nilai: '09/21/2026' })
  })

  it('berkas DD/MM/YYYY yang jelas TIDAK terdeteksi', () => {
    // 21/09 membuktikan hari di depan; tidak ada yang perlu dipersoalkan.
    expect(deteksiTanggalMMDD(sel('21/09/2026', '01/02/2026')).terdeteksi).toBe(false)
  })

  it('YYYY-MM-DD tidak pernah dianggap terbalik', () => {
    expect(deteksiTanggalMMDD(sel('2026-09-21', '2026-12-31')).terdeteksi).toBe(false)
  })

  it('nama bulan tidak pernah ambigu', () => {
    expect(deteksiTanggalMMDD(sel('21 Sep 2026', 'Sep 21 2026')).terdeteksi).toBe(false)
  })

  it('berkas yang SELURUH tanggalnya 1–12 memang tak bisa diputuskan', () => {
    // false di sini berarti "tidak ada bukti ia terbalik", BUKAN "pasti DD/MM".
    // Sisanya urusan peringatan arah di layar pratinjau.
    expect(deteksiTanggalMMDD(sel('01/02/2026', '03/04/2026')).terdeteksi).toBe(false)
  })

  it('paling banyak tiga contoh — pesan galat tidak jadi daftar seratus baris', () => {
    const banyak = sel(...Array.from({ length: 20 }, () => '09/21/2026'))
    expect(deteksiTanggalMMDD(banyak).contoh).toHaveLength(3)
  })

  it('sel kosong & bukan tanggal dilewati tanpa melempar', () => {
    expect(deteksiTanggalMMDD(sel('', 'SALDO AWAL', '2026')).terdeteksi).toBe(false)
    expect(deteksiTanggalMMDD([{ nomor: 1, nilai: null }]).terdeteksi).toBe(false)
  })

  it('hari > 31 bukan bukti apa pun — ia sekadar tanggal rusak', () => {
    expect(deteksiTanggalMMDD(sel('01/99/2026')).terdeteksi).toBe(false)
  })
})
