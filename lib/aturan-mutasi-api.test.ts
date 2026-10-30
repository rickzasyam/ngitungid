import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas route aturan mutasi (S4, D57) — pola P15
// (lib/suppliers-api.test.ts): yang dijaga adalah penjaga & URUTAN cek, yang
// tidak muncul di nilai kembalian mana pun.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
const BASE = ['app', 'api', 'clients', '[id]', 'cash-mutation-rules']
const LIST = read(...BASE, 'route.ts')
const ITEM = read(...BASE, '[ruleId]', 'route.ts')
const UJI = read(...BASE, 'uji', 'route.ts')
const QUERIES = read('lib', 'api', 'cash-mutation-rule-queries.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

describe('baca = requireInternal (finance melihat), tulis = requireAkunting', () => {
  it('GET daftar & uji pola memakai requireInternal — bukan requireUser (klien tidak boleh)', () => {
    for (const src of [handler(LIST, 'GET'), handler(UJI, 'GET')]) {
      expect(src).toContain('await requireInternal()')
      expect(src).not.toContain('requireUser')
    }
  })

  it('POST, PATCH, DELETE memakai requireAkunting', () => {
    expect(handler(LIST, 'POST')).toContain('await requireAkunting()')
    // PATCH & DELETE lewat guard() bersama, yang memanggil requireAkunting.
    const guard = ITEM.slice(ITEM.indexOf('async function guard('), ITEM.indexOf('export async function PATCH('))
    expect(guard).toContain('await requireAkunting()')
    expect(handler(ITEM, 'PATCH')).toContain('await guard(params)')
    expect(handler(ITEM, 'DELETE')).toContain('await guard(params)')
  })

  it('setiap handler memeriksa canAccessClientData sebelum menyentuh DB', () => {
    for (const src of [handler(LIST, 'GET'), handler(LIST, 'POST'), handler(UJI, 'GET')]) {
      const akses = src.indexOf('canAccessClientData(')
      const db = src.indexOf('await db')
      expect(akses).toBeGreaterThan(-1)
      expect(akses).toBeLessThan(db)
    }
  })
})

describe('aturan milik klien di URL (P7)', () => {
  it('guard mengambil baris DENGAN clientId — id aturan klien lain tidak bisa diubah lewat path ini', () => {
    expect(ITEM).toContain('eq(cashMutationRules.id, ruleId), eq(cashMutationRules.clientId, id)')
  })

  it('PATCH & POST: validasi lalu cek akun milik klien SEBELUM menulis', () => {
    for (const src of [handler(LIST, 'POST'), handler(ITEM, 'PATCH')]) {
      const valid = src.indexOf('validateAturanInput(')
      const akun = src.indexOf('assertAkunAturanMilikKlien(')
      const tulis = Math.max(src.indexOf('.insert(cashMutationRules)'), src.indexOf('.update(cashMutationRules)'))
      expect(valid).toBeGreaterThan(-1)
      expect(akun).toBeGreaterThan(valid)
      expect(tulis).toBeGreaterThan(akun)
    }
  })

  it('akun lawan = akun mana pun milik klien; akun kas = akun KAS milik klien', () => {
    expect(QUERIES).toContain('assertAccountBelongsToClient(v.akunLawanId, clientId)')
    expect(QUERIES).toContain('loadCashAccount(clientId, v.akunKasId)')
  })
})

describe('uji pola: pencocok yang SAMA dengan grid', () => {
  it('memakai hitungKena (normalizeKeterangan + includes), bukan SQL LIKE', () => {
    expect(UJI).toContain('hitungKena(')
    expect(UJI.toLowerCase()).not.toContain('ilike')
    expect(UJI).not.toContain(' like(')
  })

  it('"30 hari terakhir" dihitung dari tanggal WIB', () => {
    expect(UJI).toContain('hariIniJakarta()')
  })

  it('hanya membaca — tidak ada insert/update/delete', () => {
    for (const jejak of ['.insert(', '.update(', '.delete(']) expect(UJI).not.toContain(jejak)
  })
})

describe('tanpa RegExp dari input pengguna (D22)', () => {
  it('tidak ada RegExp yang disusun di route aturan', () => {
    for (const src of [LIST, ITEM, UJI, QUERIES]) expect(src).not.toContain('new RegExp')
  })
})
