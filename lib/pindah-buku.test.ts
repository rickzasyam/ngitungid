import { describe, it, expect } from 'vitest'
import { cariPasangan, pisahArah, saldoPindahBuku, type MutasiPindahBuku } from './pindah-buku'

const A = 'kas-a'
const B = 'kas-b'
const C = 'kas-c'
const PB = 'akun-pindah-buku'

const keluar = (id: string, akun: string, tanggal: string, sen: number): MutasiPindahBuku => ({ id, akunKasId: akun, tanggal, masuk: 0, keluar: sen })
const masuk = (id: string, akun: string, tanggal: string, sen: number): MutasiPindahBuku => ({ id, akunKasId: akun, tanggal, masuk: sen, keluar: 0 })

describe('saldoPindahBuku — Σ(masuk − keluar) berakun-lawan Pindah Buku, dalam sen', () => {
  it('transfer lengkap (keluar A + masuk B) → nol', () => {
    const m = [
      { ...keluar('k1', A, '2026-04-10', 5_000_000_00), akunLawanId: PB },
      { ...masuk('m1', B, '2026-04-11', 5_000_000_00), akunLawanId: PB },
    ]
    expect(saldoPindahBuku(m, PB, '2026-04-30')).toBe(0)
  })

  it('sisi masuk belum dicatat → ≠ 0 (peringatan)', () => {
    const m = [{ ...keluar('k1', A, '2026-04-10', 100), akunLawanId: PB }]
    expect(saldoPindahBuku(m, PB, '2026-04-30')).toBe(-100)
  })

  it('hanya mutasi berakun lawan Pindah Buku dan bertanggal ≤ akhir periode yang dihitung', () => {
    const m = [
      { ...keluar('k1', A, '2026-04-30', 100), akunLawanId: PB },
      { ...masuk('m1', B, '2026-05-01', 100), akunLawanId: PB }, // lintas periode
      { ...masuk('m2', B, '2026-04-15', 999), akunLawanId: 'akun-lain' },
    ]
    expect(saldoPindahBuku(m, PB, '2026-04-30')).toBe(-100)
    expect(saldoPindahBuku(m, PB, '2026-05-31')).toBe(0)
  })
})

describe('cariPasangan — keluar(A) ↔ masuk(B), nominal sama, ≤ 3 hari', () => {
  it('pasangan TUNGGAL diusulkan', () => {
    const h = cariPasangan([keluar('k1', A, '2026-04-10', 500)], [masuk('m1', B, '2026-04-11', 500)])
    expect(h.pasangan).toEqual([{ keluarId: 'k1', masukId: 'm1', selisihHari: 1 }])
    expect(h.ganda).toEqual([])
  })

  it('dua kandidat dengan nominal sama → TIDAK diusulkan otomatis; tampil sebagai kandidat ganda', () => {
    const h = cariPasangan(
      [keluar('k1', A, '2026-04-10', 500)],
      [masuk('m1', B, '2026-04-10', 500), masuk('m2', C, '2026-04-11', 500)]
    )
    expect(h.pasangan).toEqual([])
    expect(h.ganda).toEqual([
      { id: 'k1', arah: 'keluar', kandidat: ['m1', 'm2'] },
      { id: 'm1', arah: 'masuk', kandidat: ['k1'] },
      { id: 'm2', arah: 'masuk', kandidat: ['k1'] },
    ])
  })

  it('dua keluar berebut satu masuk → juga ganda, bukan pasangan', () => {
    const h = cariPasangan(
      [keluar('k1', A, '2026-04-10', 500), keluar('k2', C, '2026-04-10', 500)],
      [masuk('m1', B, '2026-04-10', 500)]
    )
    expect(h.pasangan).toEqual([])
    expect(h.ganda.map(g => g.id).sort()).toEqual(['k1', 'k2', 'm1'])
  })

  it('batas 3 hari masuk, 4 hari tidak — ke dua arah waktu', () => {
    expect(cariPasangan([keluar('k1', A, '2026-04-10', 500)], [masuk('m1', B, '2026-04-13', 500)]).pasangan).toHaveLength(1)
    expect(cariPasangan([keluar('k1', A, '2026-04-10', 500)], [masuk('m1', B, '2026-04-07', 500)]).pasangan).toHaveLength(1)
    const empat = cariPasangan([keluar('k1', A, '2026-04-10', 500)], [masuk('m1', B, '2026-04-14', 500)])
    expect(empat.pasangan).toEqual([])
    expect(empat.tanpaPasangan).toEqual([
      { id: 'k1', arah: 'keluar' },
      { id: 'm1', arah: 'masuk' },
    ])
  })

  it('lintas periode (akhir April ↔ awal Mei) tetap dipasangkan — peringatan saldo, bukan galat', () => {
    const h = cariPasangan([keluar('k1', A, '2026-04-30', 500)], [masuk('m1', B, '2026-05-02', 500)])
    expect(h.pasangan).toEqual([{ keluarId: 'k1', masukId: 'm1', selisihHari: 2 }])
  })

  it('akun kas SAMA tidak dipasangkan', () => {
    const h = cariPasangan([keluar('k1', A, '2026-04-10', 500)], [masuk('m1', A, '2026-04-10', 500)])
    expect(h.pasangan).toEqual([])
  })

  it('nominal beda satu sen tidak dipasangkan', () => {
    expect(cariPasangan([keluar('k1', A, '2026-04-10', 500)], [masuk('m1', B, '2026-04-10', 501)]).pasangan).toEqual([])
  })

  it('pisahArah memilah dari satu daftar mutasi', () => {
    const { keluar: k, masuk: m } = pisahArah([keluar('k1', A, '2026-04-10', 5), masuk('m1', B, '2026-04-10', 5)])
    expect(k.map(x => x.id)).toEqual(['k1'])
    expect(m.map(x => x.id)).toEqual(['m1'])
  })

  it('5.000 keluar × 5.000 masuk cepat (dikelompokkan per nominal)', () => {
    const k: MutasiPindahBuku[] = []
    const m: MutasiPindahBuku[] = []
    for (let i = 0; i < 5_000; i++) {
      k.push(keluar(`k${i}`, A, '2026-04-10', 1000 + i))
      m.push(masuk(`m${i}`, B, '2026-04-11', 1000 + i))
    }
    const t0 = performance.now()
    const h = cariPasangan(k, m)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(h.pasangan).toHaveLength(5_000)
  })
})
