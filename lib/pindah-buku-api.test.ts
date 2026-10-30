import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL route Pindah Buku (S5, D59) — pola P15.
const SRC = readFileSync(join(process.cwd(), 'app', 'api', 'cash-mutations', 'pindah-buku', 'route.ts'), 'utf8')

describe('GET /api/cash-mutations/pindah-buku', () => {
  it('requireInternal, lalu canAccessClientData sebelum DB', () => {
    expect(SRC).toContain('await requireInternal()')
    const akses = SRC.indexOf('canAccessClientData(')
    const db = SRC.indexOf('await db')
    expect(akses).toBeGreaterThan(-1)
    expect(akses).toBeLessThan(db)
  })

  it('hanya membaca — turunan, tidak ada yang disimpan (P3/P4)', () => {
    for (const jejak of ['.insert(', '.update(', '.delete(', 'db.batch(']) expect(SRC).not.toContain(jejak)
  })

  it('saldo & pasangan dari modul murni yang sama (tidak dihitung ulang di route)', () => {
    expect(SRC).toContain('saldoPindahBuku(pb, akunId, periodEnd)')
    expect(SRC).toContain('cariPasangan(')
  })

  it('usulan hanya dari mutasi TANPA akun lawan dan TANPA alokasi', () => {
    expect(SRC).toContain('isNull(cashMutations.akunLawanId)')
    expect(SRC).toContain('isNull(cashMutationAllocations.id)')
  })

  it('akun Pindah Buku belum disetel → jawaban kosong yang jelas, bukan tebakan', () => {
    expect(SRC).toContain('akunPindahBuku: null')
  })
})
