import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// K2 — kunci periode di SETIAP jalur tulis. Test STRUKTURAL (P15): yang dijaga
// tidak terlihat di nilai kembalian mana pun — apakah sebuah route memeriksa
// kuncinya SEBELUM menulis, dan apakah ia memeriksa SEMUA tanggal yang disentuhnya.
// Satu route yang lupa = jalur yang diam-diam menulis ulang bulan yang sudah
// diserahkan ke klien.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').split('\r\n').join('\n')
const PL = read('lib', 'api', 'period-lock.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length ? Math.min(...next) : undefined)
}

describe('lib/api/period-lock.ts — kunci sungguhan, bukan stub', () => {
  it('periodLockChecker membaca period_locks lewat aturan murni K1', () => {
    expect(PL).not.toContain('return () => false')
    expect(PL).toContain('.from(periodLocks)')
    expect(PL).toContain('isDateLocked(tanggal, locks)')
  })

  it('penolakan = 409 dengan lockedUntil', () => {
    const f = PL.slice(PL.indexOf('export async function tolakBilaPeriodeTerkunci'))
    expect(f).toContain('lockedUntil: kunci.terkunciSampai')
    expect(f).toContain('status: 409')
  })
})

// [berkas, method, daftar tanggal yang WAJIB diperiksa]
const JALUR: [string, string, string][] = [
  ['app/api/journals/route.ts', 'POST', '[check.value.tanggal]'],
  ['app/api/journals/[id]/route.ts', 'PATCH', '[g.row.tanggal, check.value.tanggal]'],
  ['app/api/journals/[id]/route.ts', 'DELETE', '[g.row.tanggal]'],
  ['app/api/journals/[id]/reverse/route.ts', 'POST', '[check.value.tanggal]'],
  ['app/api/purchase-invoices/route.ts', 'POST', '[check.value.tanggal]'],
  ['app/api/purchase-invoices/[id]/route.ts', 'PATCH', '[g.row.tanggal, check.value.tanggal]'],
  ['app/api/purchase-invoices/[id]/route.ts', 'DELETE', '[g.row.tanggal]'],
  ['app/api/cash-mutations/route.ts', 'POST', '[check.value.tanggal]'],
  ['app/api/cash-mutations/[id]/route.ts', 'PATCH', '[row.tanggal, check.value.tanggal]'],
  ['app/api/cash-mutations/[id]/route.ts', 'DELETE', '[row.tanggal]'],
  ['app/api/cash-mutations/[id]/allocations/route.ts', 'POST', '[mutation.tanggal]'],
  ['app/api/cash-mutations/[id]/allocations/[allocId]/route.ts', 'DELETE', '[mutation.tanggal]'],
  ['app/api/cash-mutations/import/route.ts', 'POST', '[...rows.map(r => r.tanggal)]'],
]

describe('setiap jalur tulis memeriksa kunci SEBELUM menulis', () => {
  for (const [berkas, method, tanggal] of JALUR) {
    it(`${method} ${berkas} — ${tanggal}`, () => {
      const body = handler(read(...berkas.split('/')), method)
      const cek = body.indexOf('await tolakBilaPeriodeTerkunci(')
      expect(cek, 'memanggil tolakBilaPeriodeTerkunci').toBeGreaterThan(-1)
      expect(body.slice(cek, body.indexOf('\n', cek))).toContain(tanggal)
      expect(body).toContain('if (terkunci) return terkunci')
      // Sebelum tulisan apa pun — termasuk penyusun jurnal yang membaca DB.
      for (const tulis of ['db.batch(', 'syncMutationJournal(', 'syncInvoiceJournal(']) {
        const i = body.indexOf(tulis)
        if (i > -1) expect(cek, `sebelum ${tulis}`).toBeLessThan(i)
      }
    })
  }

  it('posting memakai kunci sungguhan lewat canPost', () => {
    const body = handler(read('app', 'api', 'journals', '[id]', 'post', 'route.ts'), 'POST')
    expect(body).toContain('await periodLockChecker(header.clientId)')
    expect(body).toContain('{ isLocked }')
  })
})

// Penjaga untuk route yang BELUM ada: route baru yang menulis jurnal atau mutasi
// kas tanpa memeriksa kunci akan merah di sini, bukan lolos diam-diam.
describe('pemindai: tidak ada route penulis jurnal/mutasi tanpa pemeriksaan kunci', () => {
  const routes: string[] = []
  const jelajah = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) jelajah(p)
      else if (n === 'route.ts') routes.push(p)
    }
  }
  jelajah(join(process.cwd(), 'app', 'api'))
  const MENULIS = /db\.(insert|delete)\((journalEntries|cashMutations)\)|\.update\((journalEntries|cashMutations)\)|sync(Mutation|Invoice)Journal\(/

  const penulis = routes.filter(p => MENULIS.test(readFileSync(p, 'utf8')))

  it('daftarnya tidak kosong (pemindai benar-benar menemukan sesuatu)', () => {
    expect(penulis.length).toBeGreaterThanOrEqual(11)
  })

  for (const p of penulis) {
    const nama = relative(process.cwd(), p).split('\\').join('/')
    it(nama, () => {
      const src = readFileSync(p, 'utf8')
      expect(src.includes('tolakBilaPeriodeTerkunci(') || src.includes('periodLockChecker(')).toBe(true)
    })
  }
})
