import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseSupplierWorkbook } from './supplier-import'

// Parser impor Master Supplier. Yang diuji di sini perilaku yang TIDAK lewat
// jalur export (itu sudah dikunci test round-trip): header dengan ejaan lain,
// baris yang dilewati, dan kapan sesuatu jadi warning alih-alih error.
//
// Bedanya penting: `errors` berarti JANGAN tulis ke DB sama sekali, sementara
// `warnings` berarti impor tetap jalan dengan catatan. Menggagalkan seluruh
// berkas karena satu termin salah ketik memaksa orang mengulang dari awal.

const wb = (aoa: unknown[][], sheetName = 'Master Supplier'): ArrayBuffer => {
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('deteksi header', () => {
  it('menerima ejaan alternatif kolom nama', () => {
    for (const judul of ['Nama Supplier', 'Supplier', 'Vendor', 'Nama Vendor', 'Nama']) {
      const hasil = parseSupplierWorkbook(wb([[judul], ['Toko Jaya']]))
      expect(hasil.errors, judul).toEqual([])
      expect(hasil.rows[0].nama, judul).toBe('Toko Jaya')
    }
  })

  it('menerima ejaan alternatif kolom termin, termasuk yang berkurung', () => {
    for (const judul of ['Termin', 'Termin Pembayaran', 'Termin (Hari)', 'Tempo', 'Payment Term']) {
      const hasil = parseSupplierWorkbook(wb([['Nama Supplier', judul], ['Toko Jaya', '30']]))
      expect(hasil.errors, judul).toEqual([])
      expect(hasil.rows[0].terminPembayaran, judul).toBe(30)
    }
  })

  it('menerima ejaan alternatif kolom kontak dan akun', () => {
    const hasil = parseSupplierWorkbook(
      wb([['Vendor', 'PIC', 'Kode Akun Hutang'], ['Toko Jaya', 'Pak Budi', '21-0001']])
    )
    expect(hasil.errors).toEqual([])
    expect(hasil.rows[0].kontak).toBe('Pak Budi')
    expect(hasil.rows[0].akunHutangKode).toBe('21-0001')
  })

  it('melewati baris banner sebelum header', () => {
    const hasil = parseSupplierWorkbook(
      wb([['LAPORAN MASTER SUPPLIER'], ['Per 16 September 2026'], [], ['Nama Supplier'], ['Toko Jaya']])
    )
    expect(hasil.errors).toEqual([])
    expect(hasil.rows).toHaveLength(1)
  })

  it('tanpa kolom nama sama sekali → ERROR, bukan diam-diam kosong', () => {
    const hasil = parseSupplierWorkbook(wb([['Kontak', 'NPWP'], ['Pak Budi', '123']]))
    expect(hasil.rows).toEqual([])
    expect(hasil.errors.join(' ')).toContain('Nama Supplier')
  })

  it('berkas sampah ditolak — tidak ada baris, ada galat', () => {
    // Pesannya TIDAK dipatok ke satu kalimat: pustaka xlsx sangat permisif dan
    // teks biasa tidak selalu melempar — ia bisa terbaca sebagai satu sel,
    // sehingga yang menolak jadi deteksi header, bukan pembacaan berkas. Yang
    // dijaga di sini kontraknya: tidak ada baris yang lolos, dan `errors` tidak
    // kosong sehingga route wajib mengembalikan 400 tanpa menulis ke DB.
    const teks = new TextEncoder().encode('ini bukan excel')
    const sampah = new ArrayBuffer(teks.byteLength)
    new Uint8Array(sampah).set(teks)
    const hasil = parseSupplierWorkbook(sampah)
    expect(hasil.rows).toEqual([])
    expect(hasil.errors.length).toBeGreaterThan(0)
  })
})

describe('baris', () => {
  it('baris tanpa nama dilewati diam-diam, bukan jadi galat', () => {
    const hasil = parseSupplierWorkbook(
      wb([['Nama Supplier', 'Kontak'], ['Toko Jaya', 'Budi'], ['', 'baris pemisah'], ['CV Mitra', '']])
    )
    expect(hasil.errors).toEqual([])
    expect(hasil.rows.map(r => r.nama)).toEqual(['Toko Jaya', 'CV Mitra'])
  })

  it('sel kosong jadi null, bukan string kosong', () => {
    const hasil = parseSupplierWorkbook(wb([['Nama Supplier', 'Kontak', 'NPWP'], ['Toko Jaya', '', '  ']]))
    expect(hasil.rows[0].kontak).toBeNull()
    expect(hasil.rows[0].npwp).toBeNull()
  })

  it('nama dobel di dalam berkas: yang belakangan DILEWATI dengan warning', () => {
    // Impor memakai upsert by nama, jadi dua baris bernama sama di satu berkas
    // berarti berkas itu sendiri tidak bisa menentukan nilai mana yang benar.
    const hasil = parseSupplierWorkbook(
      wb([['Nama Supplier', 'Kontak'], ['Toko Jaya', 'Budi'], ['Toko Jaya', 'Andi']])
    )
    expect(hasil.errors).toEqual([])
    expect(hasil.rows).toHaveLength(1)
    expect(hasil.rows[0].kontak).toBe('Budi')
    expect(hasil.warnings?.join(' ')).toContain('sudah ada di baris')
  })

  it('perbandingan nama dobel tidak peduli besar-kecil huruf', () => {
    const hasil = parseSupplierWorkbook(
      wb([['Nama Supplier'], ['Toko Jaya'], ['TOKO JAYA']])
    )
    expect(hasil.rows).toHaveLength(1)
  })

  it('termin tidak masuk akal jadi WARNING dan dikosongkan, bukan menggagalkan berkas', () => {
    const hasil = parseSupplierWorkbook(
      wb([['Nama Supplier', 'Termin (Hari)'], ['Toko Jaya', 'dua minggu'], ['CV Mitra', '999']])
    )
    expect(hasil.errors).toEqual([])
    expect(hasil.rows).toHaveLength(2)
    expect(hasil.rows[0].terminPembayaran).toBeNull()
    expect(hasil.rows[1].terminPembayaran).toBeNull()
    expect(hasil.warnings).toHaveLength(2)
  })

  it('nama terlalu pendek jadi ERROR — itu data yang tidak bisa dipakai', () => {
    const hasil = parseSupplierWorkbook(wb([['Nama Supplier'], ['A']]))
    expect(hasil.errors.join(' ')).toContain('minimal')
  })

  it('nomor baris di pesan mengikuti nomor baris Excel yang terlihat manusia', () => {
    const hasil = parseSupplierWorkbook(wb([['Nama Supplier'], ['Toko Jaya'], ['A']]))
    // Header baris 1, Toko Jaya baris 2, 'A' baris 3.
    expect(hasil.errors.join(' ')).toContain('Baris 3')
  })

  it('kode akun disimpan apa adanya — parser tidak menyentuh database', () => {
    const hasil = parseSupplierWorkbook(
      wb([['Nama Supplier', 'Kode Akun Hutang'], ['Toko Jaya', 'entah-kode-apa']])
    )
    expect(hasil.errors).toEqual([])
    expect(hasil.rows[0].akunHutangKode).toBe('entah-kode-apa')
  })
})

describe('pemilihan sheet', () => {
  it('sheet bernama supplier menang atas sheet lain', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([['Nama Supplier'], ['Dari Sheet Lain']]),
      'Sheet1'
    )
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([['Nama Supplier'], ['Dari Sheet Supplier']]),
      'Data Supplier'
    )
    const buf = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const hasil = parseSupplierWorkbook(buf)
    expect(hasil.rows[0].nama).toBe('Dari Sheet Supplier')
  })
})
