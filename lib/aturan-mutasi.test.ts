import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hitungKena,
  siapkanAturan,
  usulkanAkunLawan,
  validateAturanInput,
  POLA_MAX,
  type AturanMutasi,
} from './aturan-mutasi'

const KAS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const KAS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const GAJI = '22222222-2222-4222-8222-222222222222'
const JUAL = '33333333-3333-4333-8333-333333333333'

const atr = (o: Partial<AturanMutasi> & { id: string; pola: string; akunLawanId: string }): AturanMutasi => ({
  arah: 'keduanya',
  akunKasId: null,
  prioritas: 0,
  aktif: true,
  ...o,
})
const baris = (uraian: string, arah: 'masuk' | 'keluar' | null = 'keluar', akunKasId = KAS_A) => ({ uraian, arah, akunKasId })

describe('usulkanAkunLawan — includes sesudah normalisasi, tanpa RegExp', () => {
  it('cocok tanpa peduli besar-kecil, tanda baca, dan spasi ganda', () => {
    const a = siapkanAturan([atr({ id: 'r1', pola: 'biaya adm', akunLawanId: ADMIN })])
    expect(usulkanAkunLawan(baris('BIAYA-ADM  BULANAN'), a)).toEqual({ jenis: 'usulan', akunId: ADMIN, aturanId: 'r1' })
    expect(usulkanAkunLawan(baris('Biaya.Adm'), a)?.jenis).toBe('usulan')
    expect(usulkanAkunLawan(baris('BIAYA TRANSFER'), a)).toBeNull()
  })

  it('karakter RegExp di pola dibaca harfiah (bukan pola)', () => {
    const a = siapkanAturan([atr({ id: 'r1', pola: 'TRF.*BCA', akunLawanId: ADMIN })])
    // ".*" dinormalkan jadi spasi: cocok dengan "TRF BCA" harfiah, tidak dengan "TRF KE BCA".
    expect(usulkanAkunLawan(baris('TRF BCA'), a)?.jenis).toBe('usulan')
    expect(usulkanAkunLawan(baris('TRF KE BCA'), a)).toBeNull()
  })

  it('prioritas tertinggi menang, lalu pola terpanjang', () => {
    const a = siapkanAturan([
      atr({ id: 'pendek', pola: 'gaji', akunLawanId: GAJI }),
      atr({ id: 'panjang', pola: 'gaji bonus', akunLawanId: ADMIN }),
      atr({ id: 'prio', pola: 'gaji', akunLawanId: JUAL, prioritas: 5 }),
    ])
    expect(usulkanAkunLawan(baris('PEMBAYARAN GAJI BONUS'), a)).toMatchObject({ aturanId: 'prio' })
    const tanpaPrio = siapkanAturan([
      atr({ id: 'pendek', pola: 'gaji', akunLawanId: GAJI }),
      atr({ id: 'panjang', pola: 'gaji bonus', akunLawanId: ADMIN }),
    ])
    expect(usulkanAkunLawan(baris('PEMBAYARAN GAJI BONUS'), tanpaPrio)).toMatchObject({ aturanId: 'panjang' })
  })

  it('SERI di puncak dengan akun berbeda → tanpa usulan + bentrok', () => {
    const a = siapkanAturan([
      atr({ id: 'r1', pola: 'tokped', akunLawanId: JUAL }),
      atr({ id: 'r2', pola: 'shopee', akunLawanId: ADMIN }),
    ])
    expect(usulkanAkunLawan(baris('SETTLE TOKPED SHOPEE'), a)).toEqual({ jenis: 'bentrok', aturanId: ['r1', 'r2'] })
  })

  it('seri yang menunjuk akun YANG SAMA bukan bentrok', () => {
    const a = siapkanAturan([
      atr({ id: 'r1', pola: 'tokped', akunLawanId: JUAL }),
      atr({ id: 'r2', pola: 'shopee', akunLawanId: JUAL }),
    ])
    expect(usulkanAkunLawan(baris('SETTLE TOKPED SHOPEE'), a)).toEqual({ jenis: 'usulan', akunId: JUAL, aturanId: 'r1' })
  })

  it('arah: aturan masuk tidak berlaku untuk uang keluar; tanpa arah hanya "keduanya"', () => {
    const a = siapkanAturan([
      atr({ id: 'masuk', pola: 'transfer', akunLawanId: JUAL, arah: 'masuk' }),
      atr({ id: 'keluar', pola: 'transfer', akunLawanId: GAJI, arah: 'keluar' }),
    ])
    expect(usulkanAkunLawan(baris('TRANSFER', 'masuk'), a)).toMatchObject({ aturanId: 'masuk' })
    expect(usulkanAkunLawan(baris('TRANSFER', 'keluar'), a)).toMatchObject({ aturanId: 'keluar' })
    expect(usulkanAkunLawan(baris('TRANSFER', null), a)).toBeNull()
  })

  it('aturan berakun kas hanya berlaku untuk akun kas itu', () => {
    const a = siapkanAturan([atr({ id: 'r1', pola: 'admin', akunLawanId: ADMIN, akunKasId: KAS_B })])
    expect(usulkanAkunLawan(baris('BIAYA ADMIN', 'keluar', KAS_A), a)).toBeNull()
    expect(usulkanAkunLawan(baris('BIAYA ADMIN', 'keluar', KAS_B), a)).toMatchObject({ aturanId: 'r1' })
  })

  it('aturan nonaktif dilewati — juga saat memecah seri', () => {
    const a = siapkanAturan([
      atr({ id: 'r1', pola: 'admin', akunLawanId: ADMIN }),
      atr({ id: 'r2', pola: 'admin', akunLawanId: GAJI, aktif: false }),
    ])
    expect(usulkanAkunLawan(baris('ADMIN'), a)).toMatchObject({ jenis: 'usulan', aturanId: 'r1' })
  })

  it('aturan berperingkat lebih rendah tidak memecah seri di puncak', () => {
    const a = siapkanAturan([
      atr({ id: 'r1', pola: 'abc', akunLawanId: ADMIN, prioritas: 1 }),
      atr({ id: 'r2', pola: 'abc', akunLawanId: ADMIN, prioritas: 1 }),
      atr({ id: 'r3', pola: 'abc', akunLawanId: GAJI }),
    ])
    expect(usulkanAkunLawan(baris('ABC'), a)?.jenis).toBe('usulan')
  })

  it('10.000 baris × 200 aturan < 200 ms', () => {
    const aturan: AturanMutasi[] = []
    for (let i = 0; i < 200; i++) aturan.push(atr({ id: `r${i}`, pola: `vendor nomor ${i}`, akunLawanId: ADMIN, prioritas: i % 3 }))
    const siap = siapkanAturan(aturan)
    const data = Array.from({ length: 10_000 }, (_, i) => baris(`TRF KE VENDOR NOMOR ${i % 400} REF ${i}`))
    const t0 = performance.now()
    let kena = 0
    for (const b of data) if (usulkanAkunLawan(b, siap)) kena++
    const ms = performance.now() - t0
    expect(kena).toBeGreaterThan(0)
    expect(ms).toBeLessThan(200)
  })
})

describe('validateAturanInput', () => {
  it('bawaan: arah keduanya, prioritas 0, aktif true, akun kas null', () => {
    const r = validateAturanInput({ pola: ' Biaya Adm ', akunLawanId: ADMIN })
    expect(r).toEqual({
      ok: true,
      value: { pola: 'Biaya Adm', arah: 'keduanya', akunLawanId: ADMIN, akunKasId: null, prioritas: 0, aktif: true },
    })
  })

  it('pola 2..100 karakter, dan harus memuat huruf/angka sesudah dinormalkan', () => {
    expect(validateAturanInput({ pola: 'a', akunLawanId: ADMIN }).ok).toBe(false)
    expect(validateAturanInput({ pola: 'x'.repeat(POLA_MAX + 1), akunLawanId: ADMIN }).ok).toBe(false)
    expect(validateAturanInput({ pola: '--', akunLawanId: ADMIN }).ok).toBe(false)
    expect(validateAturanInput({ pola: 'ab', akunLawanId: ADMIN }).ok).toBe(true)
  })

  it('arah, akun, prioritas dan aktif divalidasi; semua galat dikumpulkan', () => {
    const r = validateAturanInput({ pola: 'ab', arah: 'kanan', akunLawanId: 'x', akunKasId: 'y', prioritas: 1.5, aktif: 'ya' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toHaveLength(5)
  })

  it('akun lawan = akun kas aturannya → ditolak', () => {
    expect(validateAturanInput({ pola: 'ab', akunLawanId: KAS_A, akunKasId: KAS_A }).ok).toBe(false)
  })
})

describe('hitungKena — uji pola terhadap mutasi 30 hari terakhir', () => {
  it('menghitung yang kena dengan aturan yang sama dengan pencocok', () => {
    const m = [
      { keterangan: 'BIAYA ADM', arah: 'keluar' as const, akunKasId: KAS_A },
      { keterangan: 'biaya-adm', arah: 'keluar' as const, akunKasId: KAS_B },
      { keterangan: 'BIAYA ADM', arah: 'masuk' as const, akunKasId: KAS_A },
      { keterangan: null, arah: 'keluar' as const, akunKasId: KAS_A },
    ]
    expect(hitungKena({ pola: 'biaya adm', arah: 'keduanya', akunKasId: null }, m).jumlah).toBe(3)
    expect(hitungKena({ pola: 'biaya adm', arah: 'keluar', akunKasId: KAS_A }, m)).toEqual({ jumlah: 1, contoh: ['BIAYA ADM'] })
  })
})

describe('kontrak modul', () => {
  it('TIDAK ada satu pun RegExp di berkasnya (D22)', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'aturan-mutasi.ts'), 'utf8')
    for (const jejak of ['new RegExp', 'RegExp(', '.match(', '.replace(/', '.test(', '.split(/', '= /^']) {
      expect(src.includes(jejak), jejak).toBe(false)
    }
  })
})
