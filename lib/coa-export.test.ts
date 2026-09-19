import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildCoaWorkbook,
  coaExportFilename,
  COA_EXPORT_HEADERS,
  COA_EXPORT_SHEET_NAME,
  type CoaExportRow,
} from './coa-export'
import { parseCoaWorkbook } from './coa-import'

// Fixture sengaja memuat kasus yang paling mudah rusak saat round-trip:
//   - kode berangka-nol-di-depan & kode murni angka (jebakan koersi numerik)
//   - kode ber-tanda-hubung gaya template klien
//   - classCf null DAN classCf terisi
//   - posisi 'Debit'/'Kredit' plus '-' (baris non-postable yang memang ada di
//     template Rasyuka dan TIDAK dinormalisasi importer)
//   - nama ber-& dan ber-koma
//   - subKelompok dengan spasi ganda di tengah? TIDAK — importer men-trim sel,
//     jadi nilai berspasi-ujung memang tidak bisa round-trip. Lihat test khusus.
const FIXTURE: CoaExportRow[] = [
  { kode: '0001',    nama: 'Kas Kecil',                     posisi: 'Debit',  kelompok: 'Neraca',    subKelompok: 'Aktiva Lancar',        classCf: 'Operating', tipeAkun: 'asset', isKas: true },
  { kode: '1101',    nama: 'Bank BCA',                      posisi: 'Debit',  kelompok: 'Neraca',    subKelompok: 'Aktiva Lancar',        classCf: 'Operating', tipeAkun: null, isKas: true },
  { kode: '24-0001', nama: 'Biaya Gaji Karyawan',           posisi: 'Debit',  kelompok: 'Laba Rugi', subKelompok: 'Fixed Cost',           classCf: 'Operating' },
  { kode: '24-0002', nama: 'Pendapatan Jasa & Konsultasi',  posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Pendapatan',           classCf: null },
  { kode: '31-0001', nama: 'Modal Disetor',                 posisi: 'Kredit', kelompok: 'Neraca',    subKelompok: 'Modal',                classCf: 'Funding', tipeAkun: 'equity', isKas: false },
  { kode: '15-0001', nama: 'Mesin, Peralatan, dan Inventaris', posisi: 'Debit', kelompok: 'Neraca',  subKelompok: 'Aktiva Tidak Berwujud', classCf: 'Investing' },
  { kode: '99-0000', nama: 'Pindah Buku',                   posisi: '-',      kelompok: '-',         subKelompok: '-',                    classCf: null },
]

/** Export → import, persis seperti admin mengunduh lalu mengunggah ulang. */
const roundTrip = (rows: CoaExportRow[]) => parseCoaWorkbook(buildCoaWorkbook(rows))

describe('round-trip export → import (kontrak inti fitur ini)', () => {
  it('parse tanpa error sama sekali', () => {
    const res = roundTrip(FIXTURE)
    expect(res.errors).toEqual([])
  })

  it('jumlah baris sama', () => {
    expect(roundTrip(FIXTURE).rows).toHaveLength(FIXTURE.length)
  })

  it('SETIAP field kembali identik — kode, nama, posisi, kelompok, subKelompok, classCf', () => {
    const got = roundTrip(FIXTURE).rows
    // Perbandingan menyeluruh: kalau satu field pun bergeser, diff-nya kelihatan.
    expect(got).toEqual(
      FIXTURE.map(r => ({
        kode: r.kode,
        nama: r.nama,
        posisi: r.posisi,
        kelompok: r.kelompok,
        subKelompok: r.subKelompok,
        classCf: r.classCf,
        // Tipe akun round-trip penuh: ditulis sebagai label Indonesia ('Aset'),
        // dibaca balik jadi nilai enumnya lewat TIPE_ALIAS.
        tipeAkun: r.tipeAkun ?? null,
        // ASIMETRIS DAN DISENGAJA: `false` ditulis sebagai sel KOSONG, jadi ia
        // kembali sebagai `null` ("tidak diisi"), bukan `false`. Itulah yang
        // membuat impor ulang tidak menimpa penanda kas yang sudah disetel
        // lewat layar — aturan sel-kosong-tidak-menghapus. Menulis 'Tidak'
        // akan memutus sifat itu, dan test ini yang jatuh kalau seseorang
        // "merapikannya".
        isKas: r.isKas === true ? true : null,
      }))
    )
  })

  it('urutan baris dipertahankan', () => {
    expect(roundTrip(FIXTURE).rows.map(r => r.kode)).toEqual(FIXTURE.map(r => r.kode))
  })

  it('tidak ada kode yang di-suffix — export tidak pernah menghasilkan kode dobel', () => {
    const res = roundTrip(FIXTURE)
    expect(res.ambiguousKode ?? []).toEqual([])
    expect((res.warnings ?? []).join(' ')).not.toMatch(/dobel/i)
  })
})

describe('jebakan yang membuat cadangan diam-diam rusak', () => {
  it('kode berangka-nol-di-depan TIDAK berubah jadi angka', () => {
    // Kalau sel ditulis sebagai number, '0001' kembali sebagai '1' dan nol
    // depannya hilang permanen di file cadangan.
    const got = roundTrip([FIXTURE[0]]).rows[0]
    expect(got.kode).toBe('0001')
  })

  it('kode murni angka tetap string yang sama', () => {
    expect(roundTrip([FIXTURE[1]]).rows[0].kode).toBe('1101')
  })

  it('classCf null kembali sebagai null, bukan string kosong / "-"', () => {
    const got = roundTrip([FIXTURE[3]]).rows[0]
    expect(got.classCf).toBeNull()
  })

  it('classCf terisi kembali apa adanya', () => {
    expect(roundTrip([FIXTURE[0]]).rows[0].classCf).toBe('Operating')
  })

  it("posisi '-' (baris non-postable) tidak dipaksa jadi Debit/Kredit", () => {
    expect(roundTrip([FIXTURE[6]]).rows[0].posisi).toBe('-')
  })

  it('nama dengan & dan koma utuh — bukan ter-escape ganda', () => {
    expect(roundTrip([FIXTURE[3]]).rows[0].nama).toBe('Pendapatan Jasa & Konsultasi')
    expect(roundTrip([FIXTURE[5]]).rows[0].nama).toBe('Mesin, Peralatan, dan Inventaris')
  })
})

describe('normalisasi posisi ikut terjaga', () => {
  it("D/K singkat juga round-trip menjadi Debit/Kredit", () => {
    // Bukan bentuk yang kita tulis, tapi membuktikan file cadangan tetap sah
    // walau seseorang menyuntingnya memakai singkatan gaya template Rasyuka.
    const got = roundTrip([
      { ...FIXTURE[0], posisi: 'D' },
      { ...FIXTURE[3], posisi: 'K' },
    ]).rows
    expect(got[0].posisi).toBe('Debit')
    expect(got[1].posisi).toBe('Kredit')
  })
})

describe('bentuk file', () => {
  const readBack = (rows: CoaExportRow[]) => {
    const wb = XLSX.read(new Uint8Array(buildCoaWorkbook(rows)), { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    return {
      wb,
      matrix: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' }),
    }
  }

  it('satu sheet, dinamai "Master COA"', () => {
    const { wb } = readBack(FIXTURE)
    expect(wb.SheetNames).toEqual([COA_EXPORT_SHEET_NAME])
  })

  it('baris pertama adalah header kanonik', () => {
    const { matrix } = readBack(FIXTURE)
    expect(matrix[0]).toEqual([...COA_EXPORT_HEADERS])
  })

  it('semua sel data bertipe string di dalam file', () => {
    // Penjaga langsung untuk butir "SEMUA sel string" di lib/coa-export.ts.
    const wb = XLSX.read(new Uint8Array(buildCoaWorkbook(FIXTURE)), { type: 'array' })
    const sheet = wb.Sheets[COA_EXPORT_SHEET_NAME]
    const ref = XLSX.utils.decode_range(sheet['!ref']!)
    for (let r = ref.s.r; r <= ref.e.r; r++) {
      for (let c = ref.s.c; c <= ref.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })]
        if (!cell) continue // sel kosong (classCf null) memang tidak ditulis
        expect(cell.t, `sel ${XLSX.utils.encode_cell({ r, c })}`).toBe('s')
      }
    }
  })

  it('file kosong (klien belum punya COA) tetap menghasilkan header yang sah', () => {
    const { matrix } = readBack([])
    expect(matrix[0]).toEqual([...COA_EXPORT_HEADERS])
    // Importer menolak file tanpa baris data — itu perilaku yang benar, dan
    // pesannya harus tentang "tidak ada baris", bukan "kolom tidak ditemukan".
    const res = roundTrip([])
    expect(res.rows).toEqual([])
    expect(res.errors.join(' ')).toMatch(/tidak ada baris data/i)
  })
})

describe('alias header "COA" tetap diterima', () => {
  it('file dengan kolom nama berjudul "COA" juga round-trip', () => {
    // Template Rasyuka menamai kolom nama akun-nya "COA". Export kita memakai
    // "Nama Akun", tapi alias itu harus tetap hidup supaya cadangan yang
    // disunting manual (atau file asli klien) tidak tiba-tiba ditolak.
    const aoa = [
      ['Kode', 'COA', 'Posisi', 'Kelompok', 'Sub Kelompok', 'Class CF'],
      ['24-0001', 'Biaya Gaji Karyawan', 'D', 'Laba Rugi', 'Fixed Cost', 'Operating'],
    ]
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, COA_EXPORT_SHEET_NAME)
    const res = parseCoaWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)

    expect(res.errors).toEqual([])
    expect(res.rows[0]).toEqual({
      kode: '24-0001',
      nama: 'Biaya Gaji Karyawan',
      posisi: 'Debit',
      kelompok: 'Laba Rugi',
      subKelompok: 'Fixed Cost',
      classCf: 'Operating',
      tipeAkun: null,
      isKas: null,
    })
  })
})

describe('coaExportFilename', () => {
  const D = new Date(2026, 7, 5) // 5 Agustus 2026, waktu LOKAL

  it('memuat nama klien dan tanggal', () => {
    expect(coaExportFilename('Rasyuka', D)).toBe('Master-COA-Rasyuka-2026-08-05.xlsx')
  })

  it('spasi & tanda baca pada nama klien diratakan jadi tanda hubung', () => {
    expect(coaExportFilename('PT Nusantara Group', D)).toBe('Master-COA-PT-Nusantara-Group-2026-08-05.xlsx')
    expect(coaExportFilename('Graphicook (Jakarta)', D)).toBe('Master-COA-Graphicook-Jakarta-2026-08-05.xlsx')
  })

  it('nama klien kosong tidak menghasilkan nama file rusak', () => {
    expect(coaExportFilename('   ', D)).toBe('Master-COA-Klien-2026-08-05.xlsx')
    expect(coaExportFilename('///', D)).toBe('Master-COA-Klien-2026-08-05.xlsx')
  })

  it('tanggal dari komponen LOKAL — sore hari di WIB tidak mundur sehari', () => {
    // toISOString() pada 5 Agu 23:30 WIB menghasilkan 2026-08-05T16:30Z → masih
    // tanggal 5; tapi pada 5 Agu 06:00 WIB menghasilkan 2026-08-04T23:00Z → 4.
    // Test ini mengunci bahwa kita TIDAK memakai jalur itu.
    const pagi = new Date(2026, 7, 5, 6, 0, 0)
    expect(coaExportFilename('Rasyuka', pagi)).toContain('2026-08-05')
  })

  it('padding dua digit untuk bulan & tanggal', () => {
    expect(coaExportFilename('X', new Date(2026, 0, 9))).toBe('Master-COA-X-2026-01-09.xlsx')
  })
})
