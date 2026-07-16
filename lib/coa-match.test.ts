import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  suggestCoa,
  isAutoMappable,
  FUZZY_THRESHOLD,
  type CoaCandidate,
} from './coa-match'

const accounts: CoaCandidate[] = [
  { id: 'a1', nama: 'Biaya Gaji Karyawan' },
  { id: 'a2', nama: 'Beban Pengiriman' },
  { id: 'a3', nama: 'Penjualan Shopee' },
]

describe('normalizeName', () => {
  it('lowercase, buang tanda baca, ratakan spasi', () => {
    expect(normalizeName('HPP - Shopee!')).toBe('hpp shopee')
    expect(normalizeName('  Biaya   Adm & ATK  ')).toBe('biaya adm atk')
  })
})

describe('suggestCoa — prioritas history > exact > fuzzy', () => {
  it('history menang walau nama sama sekali tidak mirip', () => {
    const history = new Map([[normalizeName('Ongkir'), 'a2']])
    expect(suggestCoa('Ongkir', accounts, history)).toEqual({
      masterCoaId: 'a2',
      score: 1,
      via: 'history',
    })
  })

  // Master COA bisa di-replace lewat import ulang → id lama bisa hilang.
  it('history diabaikan kalau COA-nya sudah tidak ada lagi', () => {
    const history = new Map([[normalizeName('Ongkir'), 'sudah-dihapus']])
    expect(suggestCoa('Ongkir', accounts, history)).toBeNull()
  })

  it('history mengalahkan exact untuk nama yang sama', () => {
    const history = new Map([[normalizeName('Beban Pengiriman'), 'a1']])
    const s = suggestCoa('Beban Pengiriman', accounts, history)
    expect(s?.via).toBe('history')
    expect(s?.masterCoaId).toBe('a1') // bukan a2 (exact-nya)
  })

  it('exact setelah normalisasi → auto-map', () => {
    expect(suggestCoa('  biaya   gaji karyawan ', accounts)).toEqual({
      masterCoaId: 'a1',
      score: 1,
      via: 'exact',
    })
  })

  // Dua akun berbeda bisa punya nama identik setelah normalisasi. Auto-map di
  // sini = salah petakan diam-diam → sengaja diturunkan jadi saran biasa.
  it('exact AMBIGU (>1 akun bernama sama) diturunkan jadi saran, bukan auto-map', () => {
    const ambigu: CoaCandidate[] = [
      { id: 'x1', nama: 'Biaya Adm & ATK' },
      { id: 'x2', nama: 'Biaya Adm ATK' },
    ]
    const s = suggestCoa('Biaya Adm ATK', ambigu)
    expect(s?.via).toBe('fuzzy')
    expect(isAutoMappable(s!)).toBe(false)
  })

  it('fuzzy di atas ambang → saran saja (menunggu konfirmasi admin)', () => {
    const s = suggestCoa('Biaya Gaji Karyawan Tetap', accounts)
    expect(s?.via).toBe('fuzzy')
    expect(s?.masterCoaId).toBe('a1')
    expect(s!.score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD)
    expect(isAutoMappable(s!)).toBe(false)
  })

  // Kasus nyata: akun yang memang tidak ada di Master COA klien. Saran yang
  // salah lebih mahal daripada tidak ada saran — admin cenderung menerimanya.
  it('di bawah ambang → TIDAK menyarankan apa pun', () => {
    const s = suggestCoa('Biaya Langganan Zoom Pro', accounts)
    expect(s).toBeNull()
  })

  it('Master COA kosong atau nama kosong → null', () => {
    expect(suggestCoa('Apa saja', [])).toBeNull()
    expect(suggestCoa('   ', accounts)).toBeNull()
    expect(suggestCoa('!!!', accounts)).toBeNull()
  })

  it('memilih kandidat dengan skor tertinggi', () => {
    const s = suggestCoa('Penjualan Shopee Official', accounts)
    expect(s?.masterCoaId).toBe('a3')
  })
})

describe('isAutoMappable — satu kebijakan dipakai upload & backfill', () => {
  it('history & exact boleh auto-map; fuzzy tidak', () => {
    expect(isAutoMappable({ masterCoaId: 'a', score: 1, via: 'history' })).toBe(true)
    expect(isAutoMappable({ masterCoaId: 'a', score: 1, via: 'exact' })).toBe(true)
    expect(isAutoMappable({ masterCoaId: 'a', score: 0.99, via: 'fuzzy' })).toBe(false)
  })
})
