import { describe, it, expect } from 'vitest'
import {
  COA_EVENTS,
  perubahanTipeGantiMassal,
  rencanaRiwayatGantiMassal,
  ringkasPerubahanTipe,
  snapshotTipeKas,
  SUMBER_PERUBAHAN_TIPE,
  tipeKasBerubah,
} from './type-history'

describe('tipeKasBerubah', () => {
  it('tipe berubah, kas berubah, atau keduanya → true', () => {
    expect(tipeKasBerubah({ tipeAkun: null, isKas: false }, { tipeAkun: 'liability', isKas: false })).toBe(true)
    expect(tipeKasBerubah({ tipeAkun: 'asset', isKas: false }, { tipeAkun: 'asset', isKas: true })).toBe(true)
    expect(tipeKasBerubah({ tipeAkun: 'asset', isKas: true }, { tipeAkun: null, isKas: false })).toBe(true)
  })

  it('sama persis → false — riwayat tanpa perubahan tidak boleh lahir', () => {
    expect(tipeKasBerubah({ tipeAkun: 'expense', isKas: false }, { tipeAkun: 'expense', isKas: false })).toBe(false)
    expect(tipeKasBerubah({ tipeAkun: null, isKas: false }, { tipeAkun: null, isKas: false })).toBe(false)
  })

  it('"kosong" dan null dianggap sama — undefined dari data lama tidak memicu riwayat palsu', () => {
    const lama = { tipeAkun: undefined, isKas: undefined } as unknown as Parameters<typeof tipeKasBerubah>[0]
    expect(tipeKasBerubah(lama, { tipeAkun: null, isKas: false })).toBe(false)
  })
})

describe('snapshotTipeKas', () => {
  it('selalu dua kunci, dengan bentuk baku', () => {
    expect(snapshotTipeKas({ tipeAkun: 'revenue', isKas: true })).toEqual({ tipeAkun: 'revenue', isKas: true })
    expect(Object.keys(snapshotTipeKas({ tipeAkun: null, isKas: false })).sort()).toEqual(['isKas', 'tipeAkun'])
  })
})

describe('perubahanTipeGantiMassal — dicocokkan by KODE', () => {
  const lama = [
    { kode: '11-0001', tipeAkun: null, isKas: true },
    { kode: '14-0002', tipeAkun: null, isKas: false },
    { kode: '21-0001', tipeAkun: 'revenue' as const, isKas: false },
    { kode: '99-0009', tipeAkun: 'asset' as const, isKas: false },
  ]
  const baru = [
    { id: 'baru-1', kode: '11-0001', tipeAkun: null, isKas: true }, // tidak berubah
    { id: 'baru-2', kode: '14-0002', tipeAkun: 'liability' as const, isKas: false }, // tipe diisi berkas
    { id: 'baru-3', kode: '21-0001', tipeAkun: 'revenue' as const, isKas: true }, // kas berubah
    { id: 'baru-4', kode: '30-0001', tipeAkun: 'equity' as const, isKas: false }, // akun BARU
  ]

  it('hanya akun yang BERUBAH, dengan id BARU sebagai sasaran riwayatnya', () => {
    const p = perubahanTipeGantiMassal(lama, baru)
    expect(p.map(x => x.entityId)).toEqual(['baru-2', 'baru-3'])
    expect(p[0].sebelum).toEqual({ tipeAkun: null, isKas: false })
    expect(p[0].sesudah).toEqual({ tipeAkun: 'liability', isKas: false })
  })

  it('akun baru bukan "perubahan", akun yang hilang juga bukan', () => {
    const p = perubahanTipeGantiMassal(lama, baru)
    expect(p.find(x => x.kode === '30-0001')).toBeUndefined()
    expect(p.find(x => x.kode === '99-0009')).toBeUndefined()
  })
})

describe('rencanaRiwayatGantiMassal — riwayat mengikuti kode, bukan id', () => {
  it('kode bertahan → disambung ke id baru; kode hilang → dihapus', () => {
    const r = rencanaRiwayatGantiMassal(
      [
        { id: 'lama-1', kode: 'A' },
        { id: 'lama-2', kode: 'B' },
        { id: 'lama-3', kode: 'C' },
      ],
      new Map([
        ['A', 'baru-1'],
        ['C', 'baru-3'],
        ['D', 'baru-4'],
      ])
    )
    expect(r.sambung).toEqual([
      { idLama: 'lama-1', idBaru: 'baru-1' },
      { idLama: 'lama-3', idBaru: 'baru-3' },
    ])
    expect(r.hapus).toEqual(['lama-2'])
  })

  it('id yang tidak berubah tidak menghasilkan instruksi apa pun', () => {
    const r = rencanaRiwayatGantiMassal([{ id: 'x', kode: 'A' }], new Map([['A', 'x']]))
    expect(r).toEqual({ sambung: [], hapus: [] })
  })
})

describe('ringkasPerubahanTipe — kalimat untuk form akun', () => {
  it('menyebut hanya kolom yang berubah, dengan label manusia', () => {
    expect(ringkasPerubahanTipe({ tipeAkun: null, isKas: false }, { tipeAkun: 'liability', isKas: false })).toEqual([
      'Tipe: otomatis (turunan) → Liabilitas',
    ])
    expect(ringkasPerubahanTipe({ tipeAkun: 'asset', isKas: false }, { tipeAkun: 'asset', isKas: true })).toEqual([
      'Akun kas: tidak → ya',
    ])
  })

  it('keduanya berubah → dua kalimat, tipe dulu', () => {
    expect(
      ringkasPerubahanTipe({ tipeAkun: 'asset', isKas: true }, { tipeAkun: null, isKas: false })
    ).toEqual(['Tipe: Aset → otomatis (turunan)', 'Akun kas: ya → tidak'])
  })

  it('jsonb yang rusak atau asing → daftar kosong, tidak melempar', () => {
    expect(ringkasPerubahanTipe(null, { tipeAkun: 'asset', isKas: true })).toEqual([])
    expect(ringkasPerubahanTipe('teks', 42)).toEqual([])
    expect(ringkasPerubahanTipe({ tipeAkun: 'bukan-tipe', isKas: true }, { tipeAkun: 'asset', isKas: true })).toEqual([])
  })
})

describe('konstanta', () => {
  it('nama peristiwa resmi dan tiga sumber perubahan', () => {
    expect([...COA_EVENTS]).toEqual(['tipe_diubah'])
    expect(Object.keys(SUMBER_PERUBAHAN_TIPE).sort()).toEqual(['berkas', 'form', 'ganti_massal'])
  })
})
