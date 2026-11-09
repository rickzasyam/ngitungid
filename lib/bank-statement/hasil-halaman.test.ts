import { describe, it, expect } from 'vitest'
import { halamanTersusun, peringatanHalaman, tafsirJawaban, type HasilHalaman } from './hasil-halaman'
import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// X5 — status per halaman di panel "Unggah PDF rekening koran", dari jawaban
// route X4. Yang dikunci: model per halaman disimpan, `inputManual` = isi manual
// (bukan tombol ulangi), dan galat yang pasti berulang menghentikan dokumen.

const halaman = (n: number): HalamanMentah => ({
  halaman: n,
  kolom: ['Tanggal', 'Keterangan', 'Debet', 'Kredit', 'Saldo'],
  periodeTeks: null,
  baris: [
    { halaman: n, tanggal: '02/10', uraian: 'TRF', nominal: { bentuk: 'dua-kolom', pertama: { judul: 'Debet', teks: '1.000' }, kedua: { judul: 'Kredit', teks: '' } }, saldo: '9.000', lain: [] },
  ],
})
const header = (h: Record<string, string>) => (nama: string) => h[nama] ?? null
const tanpaHeader = header({})

describe('tafsirJawaban', () => {
  it('200 → tersusun, model & tanda diulang dari header, asal gambar dicatat', () => {
    const r = tafsirJawaban(2, 200, halaman(2), header({ 'X-Model-Ekstraksi': 'gemini-3.5-flash', 'X-Ekstraksi-Diulang': '1' }), true)
    expect(r.henti).toBeNull()
    expect(r.hasil).toMatchObject({ halaman: 2, status: 'ok', model: 'gemini-3.5-flash', diulang: true, dariGambar: true })
    expect(tafsirJawaban(2, 200, halaman(2), header({ 'X-Ekstraksi-Diulang': '0' }), false).hasil).toMatchObject({ model: null, diulang: false })
  })

  it('200 dengan bentuk salah atau nomor halaman lain → gagal yang bisa diulang, tidak diam-diam kosong', () => {
    expect(tafsirJawaban(2, 200, { halaman: 2 }, tanpaHeader, false).hasil).toMatchObject({ status: 'gagal', bisaUlang: true })
    expect(tafsirJawaban(3, 200, halaman(2), tanpaHeader, false).hasil).toMatchObject({ status: 'gagal', bisaUlang: true })
    expect(tafsirJawaban(2, 200, null, tanpaHeader, false).hasil.status).toBe('gagal')
  })

  it('422 inputManual → "isi manual", bukan gagal yang bisa diulang (keputusan Ricko 2026-10-30)', () => {
    const r = tafsirJawaban(4, 422, { error: 'isi halaman ini secara manual', inputManual: true }, tanpaHeader, false)
    expect(r).toEqual({ hasil: { halaman: 4, status: 'manual', pesan: 'isi halaman ini secara manual' }, henti: null })
  })

  it('422 tanpa inputManual (penjaga menolak, penyedia menolak) → gagal yang bisa diulang', () => {
    expect(tafsirJawaban(4, 422, { error: 'ulangi', inputManual: false }, tanpaHeader, false).hasil).toEqual({ halaman: 4, status: 'gagal', pesan: 'ulangi', bisaUlang: true })
  })

  it.each([429, 503, 401, 403])('%i → dokumen BERHENTI; halaman ini tetap bisa diulang nanti', http => {
    const r = tafsirJawaban(1, http, { error: `galat ${http}` }, tanpaHeader, false)
    expect(r.henti).toBe(`galat ${http}`)
    expect(r.hasil).toMatchObject({ status: 'gagal', bisaUlang: true })
  })

  it('400/413 → gagal TANPA ulangi (masukan yang sama ditolak lagi); 502/504 → bisa diulang, dokumen jalan terus', () => {
    expect(tafsirJawaban(1, 413, { error: 'terlalu besar' }, tanpaHeader, false)).toMatchObject({ hasil: { bisaUlang: false }, henti: null })
    expect(tafsirJawaban(1, 400, null, tanpaHeader, false)).toMatchObject({ hasil: { bisaUlang: false }, henti: null })
    expect(tafsirJawaban(1, 504, { error: 'lama' }, tanpaHeader, false)).toMatchObject({ hasil: { bisaUlang: true, pesan: 'lama' }, henti: null })
    expect(tafsirJawaban(1, 502, null, tanpaHeader, false)).toMatchObject({ hasil: { bisaUlang: true }, henti: null })
  })
})

describe('peringatanHalaman — halaman gambar tanpa baris tidak boleh ✓ diam-diam', () => {
  const ok = (dariGambar: boolean, baris: HalamanMentah['baris']): HasilHalaman => ({
    halaman: 2, status: 'ok', data: { ...halaman(2), baris }, model: null, diulang: false, dariGambar,
  })
  it('gambar + 0 baris → peringatan; gambar berisi baris atau teks kosong → tidak', () => {
    expect(peringatanHalaman(ok(true, []))).toMatch(/Halaman 2 dibaca dari gambar tanpa satu baris pun/)
    expect(peringatanHalaman(ok(true, halaman(2).baris))).toBeNull()
    // Halaman BERTEKS yang kosong sudah lolos penjaga cakupan X3 (jawaban kosong di halaman bertransaksi ditolak).
    expect(peringatanHalaman(ok(false, []))).toBeNull()
    expect(peringatanHalaman({ halaman: 2, status: 'manual', pesan: 'x' })).toBeNull()
  })
})

describe('halamanTersusun', () => {
  it('hanya halaman tersusun, urut nomor halaman walau diulang tidak berurutan', () => {
    const hasil: HasilHalaman[] = [
      { halaman: 3, status: 'ok', data: halaman(3), model: null, diulang: false, dariGambar: false },
      { halaman: 2, status: 'manual', pesan: 'x' },
      { halaman: 1, status: 'ok', data: halaman(1), model: null, diulang: false, dariGambar: false },
      { halaman: 4, status: 'gagal', pesan: 'y', bisaUlang: true },
    ]
    expect(halamanTersusun(hasil).map(h => h.halaman)).toEqual([1, 3])
  })
})
