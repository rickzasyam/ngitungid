import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// S8 — muatan grid. Perilaku diuji SUNGGUHAN dengan sumber data di-mock
// (pola lib/cash-mutation-batch.test.ts); urutan & SQL jangkar dikunci lewat
// baca-sumber (P15) karena keduanya hanya bermakna di Postgres.

vi.mock('@/lib/db', () => ({
  db: { execute: vi.fn(async () => ({ rows: jangkarRows })) },
}))
vi.mock('@/lib/api/cash-mutation-queries', () => ({
  listCashMutations: vi.fn(async () => daftar),
}))
vi.mock('@/lib/api/period-lock', () => ({ loadPeriodLocks: vi.fn(async () => locks) }))
vi.mock('@/lib/api/cash-mutation-journal', () => ({
  muatInfoJurnal: vi.fn(async () => infoJurnal),
}))

import { gunzipSync } from 'node:zlib'
import { muatGridMutasi, muatSaldoJangkar } from './api/cash-mutation-grid'
import { jsonGzip, terimaGzip } from './api/json-gzip'
import { listCashMutations } from './api/cash-mutation-queries'
import { ALASAN_TERALOKASI, ALASAN_TERPOSTING } from './cash-mutation'

let jangkarRows: Record<string, unknown>[] = []
let daftar: Record<string, unknown>[] = []
let locks: { terkunciSampai: string }[] = []
let infoJurnal = new Map<string, { id: string; status: 'draft' | 'posted'; dibalik: boolean }>()

const CLIENT = '99999999-9999-4999-8999-999999999999'
const KAS = '11111111-1111-4111-8111-111111111111'
const opts = { clientId: CLIENT, akunKasId: KAS, periodStart: '2026-10-01', periodEnd: '2026-10-31' }

const baris = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  tanggal: '2026-10-15',
  journalId: null,
  alokasiCount: 0,
  updatedAt: new Date('2026-10-20T03:04:05.678Z'),
  ...o,
})

beforeEach(() => {
  jangkarRows = []
  daftar = []
  locks = []
  infoJurnal = new Map()
  vi.mocked(listCashMutations).mockClear()
})

describe('muatGridMutasi — kunci per baris dari kunciMutasi (satu aturan dengan Simpan)', () => {
  it('terposting & belum dibalik → baris terkunci; sudah dibalik → terbuka; draf beralokasi → nominal terkunci', async () => {
    daftar = [
      baris('posted', { journalId: 'j1' }),
      baris('dibalik', { journalId: 'j2' }),
      baris('alokasi', { journalId: 'j3', alokasiCount: 2 }),
      baris('bebas'),
    ]
    infoJurnal = new Map([
      ['j1', { id: 'j1', status: 'posted', dibalik: false }],
      ['j2', { id: 'j2', status: 'posted', dibalik: true }],
      ['j3', { id: 'j3', status: 'draft', dibalik: false }],
    ])
    const g = await muatGridMutasi(opts)
    const per = new Map(g.mutations.map(m => [m.id, m]))
    expect(per.get('posted')!.kunci).toEqual({ baris: ALASAN_TERPOSTING, kolom: {} })
    expect(per.get('posted')!.jurnalStatus).toBe('posted')
    expect(per.get('dibalik')!.kunci).toEqual({ baris: null, kolom: {} })
    expect(per.get('dibalik')!.jurnalDibalik).toBe(true)
    expect(per.get('alokasi')!.kunci).toEqual({ baris: null, kolom: { masuk: ALASAN_TERALOKASI, keluar: ALASAN_TERALOKASI } })
    expect(per.get('alokasi')!.jumlahAlokasi).toBe(2)
    expect(per.get('bebas')!.jurnalStatus).toBeNull()
    expect(per.get('bebas')!.kunci).toEqual({ baris: null, kolom: {} })
  })

  it('kunci periode: baris di/sebelum tanggal kunci terkunci, sesudahnya tidak; terkunciSampai = kunci TERAKHIR', async () => {
    locks = [{ terkunciSampai: '2026-09-30' }, { terkunciSampai: '2026-10-10' }]
    daftar = [baris('a', { tanggal: '2026-10-10' }), baris('b', { tanggal: '2026-10-11' })]
    const g = await muatGridMutasi(opts)
    expect(g.terkunciSampai).toBe('2026-10-10')
    expect(g.mutations[0].kunci.baris).toContain('Periode terkunci')
    expect(g.mutations[1].kunci.baris).toBeNull()
  })

  it('memanggil daftar dengan urut "buku" dan mempertahankan urutannya', async () => {
    daftar = [baris('1'), baris('2'), baris('3')]
    const g = await muatGridMutasi(opts)
    expect(vi.mocked(listCashMutations)).toHaveBeenCalledWith(expect.objectContaining({ urut: 'buku', akunKasId: KAS }))
    expect(g.mutations.map(m => m.id)).toEqual(['1', '2', '3'])
  })

  it('bentuk RAMPING: tidak membawa kolom yang tidak dibaca grid', async () => {
    daftar = [baris('x', { fingerprint: 'f'.repeat(64), importId: 'i', createdByName: 'Budi', akunKasNama: 'Bank', teralokasiDb: '0.00' })]
    const g = await muatGridMutasi(opts)
    const kolom = Object.keys(g.mutations[0])
    for (const k of ['fingerprint', 'importId', 'createdByName', 'akunKasNama', 'teralokasiDb', 'alokasiCount', 'createdAt']) {
      expect(kolom).not.toContain(k)
    }
    for (const k of ['updatedAt', 'catatan', 'urutan', 'jurnalStatus', 'jurnalDibalik', 'jumlahAlokasi', 'status', 'sisa', 'kunci', 'akunLawanKode']) {
      expect(kolom).toContain(k)
    }
  })

  it('updatedAt dikirim ISO lengkap dengan milidetik (pembanding 409 S7)', async () => {
    daftar = [baris('x')]
    const g = await muatGridMutasi(opts)
    expect(g.mutations[0].updatedAt).toBe('2026-10-20T03:04:05.678Z')
  })
})

describe('muatSaldoJangkar (D61)', () => {
  it('tanpa baris bersaldo sebelum rentang → null (grid memakai isian manual)', async () => {
    expect(await muatSaldoJangkar({ clientId: CLIENT, akunKasId: KAS, sebelum: '2026-10-01' })).toBeNull()
  })

  it('baris hasil kueri dipetakan apa adanya — teks numeric, tidak lewat float', async () => {
    jangkarRows = [{ dariTanggal: '2026-09-29', saldoTercetak: '1000000.10', saldo: '900000000000.20', barisSesudah: 3 }]
    expect(await muatSaldoJangkar({ clientId: CLIENT, akunKasId: KAS, sebelum: '2026-10-01' })).toEqual({
      saldo: '900000000000.20',
      dariTanggal: '2026-09-29',
      saldoTercetak: '1000000.10',
      barisSesudah: 3,
    })
  })
})

describe('jsonGzip — kompres di fungsi (batas respons Vercel 4,5 MB)', () => {
  it('terimaGzip: gzip/* diterima, q=0 ditolak, tanpa header ditolak', () => {
    expect(terimaGzip('gzip, deflate, br, zstd')).toBe(true)
    expect(terimaGzip('br;q=1.0, gzip;q=0.8')).toBe(true)
    expect(terimaGzip('*')).toBe(true)
    expect(terimaGzip('gzip;q=0')).toBe(false)
    expect(terimaGzip('br, deflate')).toBe(false)
    expect(terimaGzip(null)).toBe(false)
  })

  it('body gzip yang di-gunzip = JSON aslinya persis; header content-encoding & vary terpasang', async () => {
    const isi = { count: 2, mutations: [{ id: 'a', keterangan: 'TRF ✓ é' }, { id: 'b', keterangan: null }] }
    const res = await jsonGzip(new Request('http://x', { headers: { 'accept-encoding': 'gzip' } }), isi)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(res.headers.get('vary')).toBe('accept-encoding')
    expect(JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'))).toEqual(isi)
  })

  it('klien tanpa gzip → JSON biasa', async () => {
    const res = await jsonGzip(new Request('http://x'), { a: 1 })
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.json()).toEqual({ a: 1 })
  })
})

// ── Baca-sumber (P15) ──
const baca = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('struktural — urutan baku & jangkar', () => {
  const queries = baca('lib/api/cash-mutation-queries.ts')
  const grid = baca('lib/api/cash-mutation-grid.ts')
  const route = baca('app/api/cash-mutations/route.ts')

  it('urut "buku" = tanggal, created_at, urutan, id — NAIK, dalam urutan itu (D49)', () => {
    expect(queries).toContain(
      '[asc(cashMutations.tanggal), asc(cashMutations.createdAt), asc(cashMutations.urutan), asc(cashMutations.id)]'
    )
  })

  it('jangkar memakai kunci urutan yang SETARA (urutan NULL di akhir) dan membandingkan posisi di SQL', () => {
    expect(grid).toContain('order by tanggal desc, created_at desc, coalesce(urutan, 2147483647) desc, id desc')
    expect(grid).toContain(
      '(m.tanggal, m.created_at, coalesce(m.urutan, 2147483647), m.id) > (p.tanggal, p.created_at, p.u, p.id)'
    )
    expect(grid).toContain('tanggal < ${sebelum} and saldo is not null')
    expect(grid).toContain('::numeric(18,2)::text as "saldo"')
    expect(grid).not.toMatch(/parseFloat|Number\(r\.saldo/)
  })

  it('grid tidak punya aturan kunci sendiri — hanya kunciMutasi', () => {
    expect(grid).toContain("import { kunciMutasi, type KunciBaris } from '@/lib/cash-mutation'")
    expect(grid).not.toContain("=== 'posted'")
  })

  it('route: mode grid wajib akunKasId akun kas klien, baca requireInternal, lewat muatGridMutasi', () => {
    const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
    expect(get).toContain('requireInternal()')
    expect(get).toContain('canAccessClientData(')
    const cabang = get.slice(get.indexOf("if (urut === 'buku')"))
    expect(cabang).toContain("akunKasId === ''")
    expect(cabang).toContain('loadCashAccount(clientId, akunKasId)')
    expect(cabang).toContain('muatGridMutasi(')
    expect(cabang).toContain('jsonGzip(req,')
    // akses klien diperiksa SEBELUM cabang grid
    expect(get.indexOf('canAccessClientData(')).toBeLessThan(get.indexOf("if (urut === 'buku')"))
  })
})
