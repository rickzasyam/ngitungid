import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCoaWorkbook } from './coa-import'

// Workbook dibangun DI MEMORI — tidak memakai file klien asli sebagai fixture.
// Bentuknya meniru struktur template nyata yang pernah bikin parser gagal:
// baris banner di atas header, kolom nama bernama "COA", posisi disingkat D/K,
// kode dipakai ulang antar section, dan Master COA bukan di sheet pertama.
function makeWorkbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const book = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const HEADER = ['Kode', 'Nama Akun', 'Posisi', 'Kelompok', 'Sub Kelompok', 'Class CF']

describe('parseCoaWorkbook — happy path', () => {
  it('parse header standar', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({ Sheet1: [HEADER, ['1-1000', 'Kas', 'Debit', 'Neraca', 'Aktiva Lancar', 'Operating']] })
    )
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      {
        kode: '1-1000',
        nama: 'Kas',
        posisi: 'Debit',
        kelompok: 'Neraca',
        subKelompok: 'Aktiva Lancar',
        classCf: 'Operating',
        // Kolom opsional Fase 2 — berkas ini tidak memuatnya, jadi null
        // ("tidak diisi"), bukan nilai bawaan.
        tipeAkun: null,
        isKas: null,
      },
    ])
  })

  it('Class CF kosong → null (kolom opsional)', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({ Sheet1: [HEADER, ['1-1', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '']] })
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0].classCf).toBeNull()
  })

  it('baris kosong di bawah data dilewati diam-diam', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [HEADER, ['1-1', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', ''], ['', '', '', '', '', '']],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(1)
  })
})

describe('parseCoaWorkbook — toleransi template klien nyata', () => {
  it('melewati baris banner/judul di atas header', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [['DATA MASTER COA'], [], HEADER, ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '']],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].nama).toBe('Kas')
  })

  it('alias kolom "COA" → nama akun, dan posisi D/K → Debit/Kredit', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          ['Kode', 'COA', 'Posisi', 'Kelompok', 'Sub Kelompok'],
          ['4-1', 'Penjualan', 'K', 'Laba Rugi', 'Penjualan'],
          ['5-1', 'Biaya Gaji', 'D', 'Laba Rugi', 'Fixed Cost'],
        ],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows.map(x => [x.nama, x.posisi])).toEqual([
      ['Penjualan', 'Kredit'],
      ['Biaya Gaji', 'Debit'],
    ])
  })

  // Template klien memakai ulang nomor kode di section berbeda. Ditolak =
  // pemilik harus edit Excel; di-suffix = unique(client_id, kode) tetap aman
  // sementara nama akun (identitas mapping) utuh.
  it('kode dobel di-suffix otomatis + warning non-blocking (bukan error)', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          HEADER,
          ['24-1', 'Bunga Bank', 'K', 'Laba Rugi', 'Lain-Lain', ''],
          ['24-1', 'Jasa Giro', 'K', 'Laba Rugi', 'Lain-Lain', ''],
          ['24-1', 'Denda', 'D', 'Laba Rugi', 'Lain-Lain', ''],
        ],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows.map(x => x.kode)).toEqual(['24-1', '24-1-2', '24-1-3'])
    // Nama akun TIDAK disentuh — itu identitas untuk COA matching.
    expect(r.rows.map(x => x.nama)).toEqual(['Bunga Bank', 'Jasa Giro', 'Denda'])
    expect(r.warnings?.join(' ')).toContain('24-1 → 24-1-2')
  })

  // Workbook akuntansi klien bisa puluhan sheet; Master COA-nya bukan sheet[0].
  it('memilih sheet Master COA lintas-sheet, bukan sheet pertama', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Kas: [
          ['Tanggal', 'Uraian', 'Debet', 'Saldo'],
          ['2026-01-01', 'Saldo awal', 0, 0],
        ],
        'master data': [HEADER, ['1-1', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '']],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(1)
    // Admin diberi tahu sheet mana yang dipakai, kalau-kalau auto-pick salah.
    expect(r.warnings?.join(' ')).toContain('master data')
  })
})

describe('parseCoaWorkbook — validasi all-or-nothing', () => {
  it('kolom wajib hilang → error, tidak ada rows sama sekali', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          ['Nama Akun', 'Posisi', 'Kelompok', 'Sub Kelompok'],
          ['Kas', 'D', 'Neraca', 'Aktiva Lancar'],
        ],
      })
    )
    expect(r.rows).toEqual([])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('Kode')
  })

  it('baris dengan kolom wajib kosong → error menyebut nomor baris Excel', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({ Sheet1: [HEADER, ['1-1', '', 'D', 'Neraca', 'Aktiva Lancar', '']] })
    )
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('Baris 2')
    expect(r.errors[0]).toContain('Nama Akun')
  })

  it('tidak ada sheet ber-kolom COA → error yang menjelaskan header wajib', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({ Kas: [['Tanggal', 'Debet', 'Saldo'], ['2026-01-01', 100, 100]] })
    )
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toContain('Tidak ada sheet')
  })

  it('file bukan Excel valid → error yang ramah', () => {
    const bogus = new TextEncoder().encode('ini bukan excel').buffer as ArrayBuffer
    const r = parseCoaWorkbook(bogus)
    expect(r.rows).toEqual([])
    expect(r.errors).toHaveLength(1)
  })
})

// ── Kolom opsional Fase 2 (E3) ──────────────────────────────────────────
const HEADER_TIPE = [...HEADER, 'Tipe Akun', 'Kas?']

describe('kolom Tipe Akun & Kas? (opsional)', () => {
  it('dibaca kalau ada, dalam ejaan enum maupun Indonesia', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          HEADER_TIPE,
          ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', 'Operating', 'Aset', 'Ya'],
          ['2-1000', 'Hutang Usaha', 'K', 'Neraca', 'Hutang Lancar', '', 'liability', 'tidak'],
        ],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toMatchObject({ tipeAkun: 'asset', isKas: true })
    expect(r.rows[1]).toMatchObject({ tipeAkun: 'liability', isKas: false })
  })

  // Berkas klien lazimnya TIDAK punya kolom ini — itu keadaan normal, bukan
  // galat, dan null-nya yang membuat carryAccountTypes tahu harus mewariskan.
  it('kolomnya tidak ada sama sekali → null, bukan galat', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({ Sheet1: [HEADER, ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '']] })
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toMatchObject({ tipeAkun: null, isKas: null })
  })

  it('sel kosong → null, bukan nilai bawaan', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({ Sheet1: [HEADER_TIPE, ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '', '', '']] })
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toMatchObject({ tipeAkun: null, isKas: null })
  })

  // Salah ketik yang diam-diam dibaca sebagai "tidak diisi" tidak pernah
  // terlihat siapa pun sampai laporannya salah.
  it('nilai terisi yang tidak dikenali = GALAT yang menyebut barisnya', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [HEADER_TIPE, ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '', 'aktivas', '']],
      })
    )
    expect(r.errors.join(' ')).toContain('Tipe Akun')
    expect(r.errors.join(' ')).toContain('aktivas')
    expect(r.rows).toEqual([])
  })

  it('Kas? yang tidak dikenali juga galat, dengan petunjuk isiannya', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [HEADER_TIPE, ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '', '', 'mungkin']],
      })
    )
    expect(r.errors.join(' ')).toContain('ya/tidak')
    expect(r.rows).toEqual([])
  })

  it('alias header lain dikenali', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          ['Kode', 'Nama Akun', 'Posisi', 'Kelompok', 'Sub Kelompok', 'Account Type', 'Is Cash'],
          ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', 'asset', 'true'],
        ],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toMatchObject({ tipeAkun: 'asset', isKas: true })
  })

  // 'Tipe' dan 'Kas' telanjang SENGAJA tidak jadi alias: di sheet akuntansi
  // keduanya jauh lebih mungkin kolom lain (tipe transaksi, nominal saldo kas).
  it('header "Tipe" dan "Kas" telanjang TIDAK menyerobot kolom lain', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          ['Kode', 'Nama Akun', 'Posisi', 'Kelompok', 'Sub Kelompok', 'Tipe', 'Kas'],
          ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', 'apa saja', '1.500.000'],
        ],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toMatchObject({ tipeAkun: null, isKas: null })
  })

  it('baris yang HANYA berisi tipe (tanpa kode/nama) dilewati, bukan jadi lima galat', () => {
    const r = parseCoaWorkbook(
      makeWorkbook({
        Sheet1: [
          HEADER_TIPE,
          ['1-1000', 'Kas', 'D', 'Neraca', 'Aktiva Lancar', '', 'Aset', 'Ya'],
          ['', '', '', '', '', '', '', ''],
        ],
      })
    )
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(1)
  })
})
