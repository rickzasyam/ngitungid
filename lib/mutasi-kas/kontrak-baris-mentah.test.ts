import { describe, expect, expectTypeOf, it } from 'vitest'
import type { BarisMentah, HalamanMentah, NominalMentah } from './kontrak-baris-mentah'

// Test TIPE: penjaganya `tsc --noEmit` (berkas test ikut tsconfig). Baris
// `@ts-expect-error` gagal dikompilasi bila kontraknya melonggar.

const bca: HalamanMentah = {
  halaman: 1,
  kolom: ['TANGGAL', 'KETERANGAN', 'CBG', 'MUTASI', 'SALDO'],
  periodeTeks: 'PERIODE : OKTOBER 2026',
  baris: [
    { halaman: 1, tanggal: '', uraian: 'SALDO AWAL', nominal: { bentuk: 'satu-kolom', judul: 'MUTASI', teks: '', penanda: '' }, saldo: '10,000,000.00', lain: [] },
    { halaman: 1, tanggal: '05/10', uraian: 'TRSF E-BANKING DB UJI-B-001', nominal: { bentuk: 'satu-kolom', judul: 'MUTASI', teks: '1,500,000.00', penanda: 'DB' }, saldo: '8,500,000.00', lain: [{ judul: 'CBG', teks: '0000' }] },
  ],
}

const template: HalamanMentah = {
  halaman: 2,
  kolom: ['Tanggal', 'Uraian', 'Debet', 'Kredit', 'Saldo', 'Reff'],
  periodeTeks: null,
  baris: [
    { halaman: 2, tanggal: '26/10/2026', uraian: 'Penjualan UJI-B-002', nominal: { bentuk: 'dua-kolom', pertama: { judul: 'Debet', teks: '250.000' }, kedua: { judul: 'Kredit', teks: '' } }, saldo: '8.750.000', lain: [{ judul: 'Reff', teks: 'INV-1' }] },
  ],
}

describe('kontrak baris mentah PDF → grid', () => {
  it('nominal, tanggal, dan saldo adalah TEKS — tidak ada angka atau arah', () => {
    expectTypeOf<BarisMentah['tanggal']>().toEqualTypeOf<string>()
    expectTypeOf<BarisMentah['saldo']>().toEqualTypeOf<string>()
    expectTypeOf<Extract<NominalMentah, { bentuk: 'satu-kolom' }>['teks']>().toEqualTypeOf<string>()
    expectTypeOf<Extract<NominalMentah, { bentuk: 'dua-kolom' }>['pertama']['teks']>().toEqualTypeOf<string>()
    expectTypeOf<BarisMentah>().not.toHaveProperty('masuk')
    expectTypeOf<BarisMentah>().not.toHaveProperty('keluar')
    expectTypeOf<BarisMentah>().not.toHaveProperty('arah')
  })

  it('setiap baris membawa nomor halaman', () => {
    expectTypeOf<BarisMentah['halaman']>().toEqualTypeOf<number>()
    for (const h of [bca, template]) for (const b of h.baris) expect(b.halaman).toBe(h.halaman)
  })

  it('bentuk yang salah ditolak kompilator', () => {
    // @ts-expect-error — nominal sebagai angka berarti sudah ditafsirkan
    const angka: NominalMentah = { bentuk: 'satu-kolom', judul: 'MUTASI', teks: 1500000, penanda: 'DB' }
    // @ts-expect-error — arah tidak diputuskan di kontrak
    const berarah: NominalMentah = { bentuk: 'dua-kolom', masuk: '1', keluar: '' }
    // @ts-expect-error — baris tanpa nomor halaman
    const tanpaHalaman: BarisMentah = { tanggal: '', uraian: '', nominal: { bentuk: 'satu-kolom', judul: '', teks: '', penanda: '' }, saldo: '', lain: [] }
    expect([angka, berarah, tanpaHalaman]).toHaveLength(3)
  })
})
