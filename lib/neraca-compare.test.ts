import { describe, it, expect } from 'vitest'
import { buildNeracaDetail, type CompareLine, type NeracaDetailResult } from './neraca-compare'

const cl = (over: Partial<CompareLine> = {}): CompareLine => ({
  kode: '1-1',
  nama: 'Kas',
  kelompok: 'Neraca',
  subKelompok: 'Aktiva Lancar',
  amount: 0,
  isSubtotal: false,
  status: 'matched',
  ...over,
})

const sectionOf = (r: NeracaDetailResult, key: string) => r.sections.find(s => s.key === key)!

describe('buildNeracaDetail — neraca itu point-in-time', () => {
  // Keputusan Ricko: kolom = saldo AKHIR tiap periode, TIDAK diakumulasi antar
  // periode (beda dengan P&L yang memang dijumlah).
  it('nilai per periode = saldo periode itu, bukan akumulasi', () => {
    const r = buildNeracaDetail([
      [cl({ kode: '1-1', amount: 100 })],
      [cl({ kode: '1-1', amount: 150 })],
    ])
    const kas = sectionOf(r, 'aktivaLancar').accounts.find(a => a.kode === '1-1')!
    expect(kas.values).toEqual([100, 150]) // bukan [100, 250]
    expect(r.totalAktiva).toEqual([100, 150])
  })

  it('akun yang hanya ada di sebagian periode → 0 di periode lainnya', () => {
    const r = buildNeracaDetail([
      [cl({ kode: '1-1', amount: 100 })],
      [cl({ kode: '1-1', amount: 100 }), cl({ kode: '1-2', nama: 'Piutang', amount: 40 })],
    ])
    const sec = sectionOf(r, 'aktivaLancar')
    expect(sec.accounts.find(a => a.kode === '1-2')!.values).toEqual([0, 40])
    expect(sec.totals).toEqual([100, 140])
  })

  it('akun nol di SEMUA periode dibuang; nol sebagian tetap ditampilkan', () => {
    const r = buildNeracaDetail([
      [cl({ kode: '1-1', amount: 0 }), cl({ kode: '1-2', nama: 'Piutang', amount: 0 })],
      [cl({ kode: '1-1', amount: 0 }), cl({ kode: '1-2', nama: 'Piutang', amount: 50 })],
    ])
    const sec = sectionOf(r, 'aktivaLancar')
    expect(sec.accounts.map(a => a.kode)).toEqual(['1-2'])
    expect(sec.accounts[0].values).toEqual([0, 50])
  })
})

describe('buildNeracaDetail — penjumlahan BERTANDA & identitas neraca', () => {
  it('akun kontra mengurangi section, identitas AKTIVA = PASIVA terjaga', () => {
    const r = buildNeracaDetail([
      [
        cl({ kode: '1-1', nama: 'Kas', subKelompok: 'Aktiva Lancar', amount: 500 }),
        cl({ kode: '1-2', nama: 'Kendaraan', subKelompok: 'Aktiva Tetap', amount: 300 }),
        cl({ kode: '1-3', nama: 'Akumulasi Penyusutan', subKelompok: 'Aktiva Tetap', amount: -100 }),
        cl({ kode: '2-1', nama: 'Hutang Dagang', subKelompok: 'Hutang', amount: 200 }),
        cl({ kode: '3-1', nama: 'Modal Disetor', subKelompok: 'Modal', amount: 550 }),
        cl({ kode: '3-2', nama: 'Prive', subKelompok: 'Modal', amount: -50 }),
      ],
    ])
    expect(sectionOf(r, 'aktivaTetap').totals).toEqual([200]) // 300 − 100
    expect(sectionOf(r, 'modal').totals).toEqual([500]) // 550 − 50
    expect(r.totalAktiva).toEqual([700])
    expect(r.totalPasiva).toEqual([700])
  })
})

describe('buildNeracaDetail — baris yang tidak boleh ikut', () => {
  it('subtotal, non-matched, rejected, dan baris Laba Rugi diabaikan', () => {
    const r = buildNeracaDetail([
      [
        cl({ kode: '1-1', amount: 100 }),
        cl({ kode: '9-9', nama: 'TOTAL AKTIVA', amount: 999, isSubtotal: true }),
        cl({ kode: '9-8', nama: 'Belum dipetakan', amount: 888, status: 'unmatched' }),
        cl({ kode: '9-7', nama: 'Ditolak', amount: 777, status: 'rejected' }),
        cl({ kode: '9-6', nama: 'Penjualan', kelompok: 'Laba Rugi', subKelompok: 'Penjualan', amount: 666 }),
      ],
    ])
    expect(r.totalAktiva).toEqual([100])
    expect(r.sections.map(s => s.key)).toEqual(['aktivaLancar'])
  })

  it('status "edited" tetap ikut dihitung', () => {
    const r = buildNeracaDetail([[cl({ kode: '1-1', amount: 100, status: 'edited' })]])
    expect(r.totalAktiva).toEqual([100])
  })
})

describe('buildNeracaDetail — subKelompok tak dikenali', () => {
  // Ditampilkan terpisah supaya tidak hilang diam-diam, tapi TIDAK ikut total
  // (kemunculannya = sinyal mapping/COA bermasalah; UI menampilkan banner).
  it('masuk section "other" dan di LUAR total aktiva/pasiva', () => {
    const r = buildNeracaDetail([
      [
        cl({ kode: '1-1', amount: 100 }),
        cl({ kode: '9-1', nama: 'Entah', subKelompok: 'Suspense', amount: 500 }),
      ],
    ])
    expect(sectionOf(r, 'other').totals).toEqual([500])
    expect(r.totalAktiva).toEqual([100]) // 'other' tidak ikut
    expect(r.totalPasiva).toEqual([0])
  })
})

describe('buildNeracaDetail — bentuk keluaran', () => {
  it('section tanpa akun dibuang; akun diurutkan by kode', () => {
    const r = buildNeracaDetail([
      [
        cl({ kode: '1-3', nama: 'Piutang', amount: 30 }),
        cl({ kode: '1-1', nama: 'Kas', amount: 10 }),
        cl({ kode: '1-2', nama: 'Bank', amount: 20 }),
      ],
    ])
    expect(r.sections.map(s => s.key)).toEqual(['aktivaLancar'])
    expect(sectionOf(r, 'aktivaLancar').accounts.map(a => a.kode)).toEqual(['1-1', '1-2', '1-3'])
  })

  it('tanpa periode → total kosong, tanpa section', () => {
    const r = buildNeracaDetail([])
    expect(r.sections).toEqual([])
    expect(r.totalAktiva).toEqual([])
    expect(r.totalPasiva).toEqual([])
  })

  it('baris duplikat kode dalam satu periode dijumlahkan', () => {
    const r = buildNeracaDetail([
      [cl({ kode: '1-1', amount: 100 }), cl({ kode: '1-1', amount: 50 })],
    ])
    expect(sectionOf(r, 'aktivaLancar').accounts[0].values).toEqual([150])
  })
})
