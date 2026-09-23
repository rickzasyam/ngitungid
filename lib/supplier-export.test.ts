import { describe, it, expect } from 'vitest'
import {
  buildSupplierWorkbook,
  supplierExportFilename,
  SUPPLIER_EXPORT_HEADERS,
  type SupplierExportRow,
} from './supplier-export'
import * as XLSX from 'xlsx'
import { parseSupplierWorkbook } from './supplier-import'

// ══ PENJAGA BERDIRI: KONTRAK ROUND-TRIP ══════════════════════════
// File hasil export WAJIB bisa di-import balik tanpa satu pun suntingan dan
// menghasilkan daftar yang identik. Kalau kontrak ini putus, gejalanya baru
// muncul saat seseorang butuh cadangannya — yaitu saat paling buruk.

const kosongBank = { bankNama: null, bankRekening: null, bankAtasNama: null }

const rows: SupplierExportRow[] = [
  {
    nama: 'Toko Bangunan Jaya',
    kontak: 'Pak Budi 0812',
    npwp: '01.234.567.8-901.000',
    bankNama: 'BCA',
    bankRekening: '0123456789',
    bankAtasNama: 'Toko Bangunan Jaya',
    akunHutangKode: '21-0001',
  },
  { nama: 'PT Sumber Rejeki', kontak: null, npwp: null, ...kosongBank, akunHutangKode: null },
  {
    nama: 'CV Mitra Abadi',
    kontak: 'admin@mitra.co.id',
    npwp: null,
    bankNama: 'Bank Mandiri',
    bankRekening: '0000123',
    bankAtasNama: null,
    akunHutangKode: '21-0002',
  },
]

const roundTrip = (input: SupplierExportRow[]) => {
  const buf = buildSupplierWorkbook(input)
  const hasil = parseSupplierWorkbook(buf)
  expect(hasil.errors).toEqual([])
  return hasil
}

describe('round-trip export → import', () => {
  it('seluruh baris kembali utuh, jumlah dan urutannya sama', () => {
    const hasil = roundTrip(rows)
    expect(hasil.rows).toHaveLength(rows.length)
    expect(hasil.rows.map(r => r.nama)).toEqual(rows.map(r => r.nama))
  })

  it('setiap field kembali dengan nilai yang sama persis', () => {
    const hasil = roundTrip(rows)
    for (let i = 0; i < rows.length; i++) {
      expect(hasil.rows[i], rows[i].nama).toEqual({
        nama: rows[i].nama,
        kontak: rows[i].kontak,
        npwp: rows[i].npwp,
        bankNama: rows[i].bankNama,
        bankRekening: rows[i].bankRekening,
        bankAtasNama: rows[i].bankAtasNama,
        akunHutangKode: rows[i].akunHutangKode,
      })
    }
  })

  it('null tetap null — tidak berubah jadi string kosong atau "-"', () => {
    const hasil = roundTrip(rows)
    const sumber = hasil.rows.find(r => r.nama === 'PT Sumber Rejeki')!
    expect(sumber.kontak).toBeNull()
    expect(sumber.npwp).toBeNull()
    expect(sumber.akunHutangKode).toBeNull()
    expect(sumber.bankNama).toBeNull()
    expect(sumber.bankRekening).toBeNull()
    expect(sumber.bankAtasNama).toBeNull()
  })

  it('NOMOR REKENING berawalan nol tidak kehilangan nol depannya (D43)', () => {
    // Nomor rekening yang kehilangan nol depan adalah nomor rekening ORANG LAIN.
    // Ketahuannya baru saat transfer gagal — atau malah berhasil ke rekening
    // yang salah.
    const hasil = roundTrip(rows)
    expect(hasil.rows[0].bankRekening).toBe('0123456789')
    expect(hasil.rows.find(r => r.nama === 'CV Mitra Abadi')!.bankRekening).toBe('0000123')
  })

  it('sel rekening di berkas ekspor bertipe TEKS, bukan angka', () => {
    const buf = buildSupplierWorkbook([rows[0]])
    const book = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const sheet = book.Sheets[book.SheetNames[0]]
    const kolom = SUPPLIER_EXPORT_HEADERS.indexOf('No. Rekening')
    const sel = sheet[XLSX.utils.encode_cell({ r: 1, c: kolom })]
    expect(sel.t).toBe('s')
    expect(sel.v).toBe('0123456789')
  })

  it('NPWP berawalan nol tidak kehilangan nol depannya', () => {
    // Inilah alasan semua sel ditulis sebagai STRING. Kalau ditulis sebagai
    // angka, "01.234…" kembali sebagai angka dan nol depannya hilang PERMANEN
    // di berkas cadangan.
    const hasil = roundTrip(rows)
    expect(hasil.rows[0].npwp).toBe('01.234.567.8-901.000')
  })

  it('kode akun berawalan nol juga utuh', () => {
    const hasil = roundTrip([
      { nama: 'Vendor Nol', kontak: null, npwp: null, ...kosongBank, akunHutangKode: '0021' },
    ])
    expect(hasil.rows[0].akunHutangKode).toBe('0021')
  })

  it('daftar kosong menghasilkan file berheader yang tetap terbaca', () => {
    // Bukan kasus karangan: klien baru yang belum punya supplier tetap boleh
    // mengekspor, dan hasilnya harus jadi template yang bisa diisi lalu diimpor.
    const buf = buildSupplierWorkbook([])
    const hasil = parseSupplierWorkbook(buf)
    expect(hasil.rows).toEqual([])
    // Tidak ada baris = importer memang mengeluh, tapi HEADER-nya terbaca:
    // pesannya soal "tidak ada baris", bukan soal kolom yang tidak ditemukan.
    expect(hasil.errors.join(' ')).toContain('Tidak ada baris supplier')
  })
})

describe('header export', () => {
  it('memakai label kanonik yang dikenali importer', () => {
    expect([...SUPPLIER_EXPORT_HEADERS]).toEqual([
      'Nama Supplier',
      'Kontak',
      'NPWP',
      'Nama Bank',
      'No. Rekening',
      'Atas Nama Rekening',
      'Kode Akun Hutang',
    ])
  })

  it('tidak ada lagi kolom termin — ia melekat pada invoice (D43, 0019)', () => {
    expect(SUPPLIER_EXPORT_HEADERS.join(' ').toLowerCase()).not.toContain('termin')
  })
})

describe('supplierExportFilename', () => {
  it('memuat nama klien dan tanggal lokal', () => {
    const nama = supplierExportFilename('Rasyuka', new Date(2026, 8, 16))
    expect(nama).toBe('Master-Supplier-Rasyuka-2026-09-16.xlsx')
  })

  it('tanggalnya dari komponen LOKAL, bukan UTC', () => {
    // 16 Sep 2026 pukul 23:30 waktu lokal. Lewat toISOString() di WIB ini jadi
    // 16:30 UTC — masih tanggal yang sama, tapi pukul 07:00 lokal akan jadi
    // tanggal SEBELUMNYA. Dipakai jam malam supaya selisihnya terlihat.
    const nama = supplierExportFilename('Rasyuka', new Date(2026, 8, 16, 23, 30))
    expect(nama).toContain('2026-09-16')
  })

  it('nama klien bertanda baca dijadikan slug yang aman', () => {
    expect(supplierExportFilename('PT. Maju / Jaya', new Date(2026, 8, 16))).toBe(
      'Master-Supplier-PT-Maju-Jaya-2026-09-16.xlsx'
    )
  })

  it('nama klien kosong tidak menghasilkan nama file yang aneh', () => {
    expect(supplierExportFilename('   ', new Date(2026, 8, 16))).toBe(
      'Master-Supplier-Klien-2026-09-16.xlsx'
    )
  })
})
