import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Route X4 diuji sungguhan dengan guard, akun kas, dan penyedia ditiru — tidak
// ada DB maupun panggilan AI. Gerbangnya (semua kombinasi sakelar) diuji di
// lib/ai-features.test.ts; di sini sakelarnya dinyalakan.
const guard = vi.hoisted(() => ({ user: { role: 'akunting', clientId: null as string | null } }))
vi.mock('@/lib/api/guards', () => ({ requireAkunting: vi.fn(async () => ({ user: guard.user })) }))
vi.mock('@/lib/api/cash-mutation-queries', () => ({ loadCashAccount: vi.fn() }))
vi.mock('@/lib/ai/pilih-penyedia', () => ({ penyediaDariEnv: vi.fn() }))

import { loadCashAccount } from '@/lib/api/cash-mutation-queries'
import { penyediaDariEnv } from '@/lib/ai/pilih-penyedia'
import { GalatAi, type AiProvider } from '@/lib/ai/penyedia'
import { POST } from '@/app/api/cash-mutations/ekstrak-halaman/route'
import { bukaPdf } from './baca-pdf'
import { penyediaSempurna, penyediaTiruan } from './fikstur/jawaban-ai'
import { dokumenDuaKolom, dokumenSatuKolom } from './fikstur/koleksi'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const AKUN = '22222222-2222-4222-8222-222222222222'
const akun = vi.mocked(loadCashAccount)
const pilih = vi.mocked(penyediaDariEnv)

beforeEach(() => {
  vi.stubEnv('AI_FEATURES_ENABLED', 'true')
  vi.stubEnv('AI_EKSTRAKSI_REKENING_KORAN', 'true')
  guard.user = { role: 'akunting', clientId: null }
  akun.mockResolvedValue({ id: AKUN } as never)
})
afterEach(() => {
  vi.unstubAllEnvs()
  akun.mockReset()
  pilih.mockReset()
})

const kirim = async (body: unknown, headers: Record<string, string> = {}) =>
  (await POST(new Request('http://x/api/cash-mutations/ekstrak-halaman', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers })))!

async function barisHalaman(pdf: Uint8Array, n: number): Promise<string[]> {
  const doc = await bukaPdf(pdf)
  try {
    return (await doc.bacaHalaman(n)).baris.map(b => b.teks)
  } finally {
    await doc.tutup()
  }
}

describe('jawaban = HalamanMentah persis kontrak', () => {
  it('halaman 1 (satu kolom + DB) dan halaman lanjutan tanpa judul (dua kolom)', async () => {
    const d = dokumenSatuKolom()
    pilih.mockReturnValue(await penyediaSempurna(d))
    const res = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: await barisHalaman(d.pdf, 1) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(d.kebenaran[0])

    const dd = dokumenDuaKolom()
    pilih.mockReturnValue(await penyediaSempurna(dd))
    const res2 = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 2, baris: await barisHalaman(dd.pdf, 2), kolomSebelumnya: dd.kebenaran[0].kolom })
    expect(res2.status).toBe(200)
    expect(await res2.json()).toEqual(dd.kebenaran[1])
    expect(akun).toHaveBeenCalledWith(CLIENT, AKUN)
  })
})

describe('validasi sebelum penyedia dipanggil', () => {
  const sah = { clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: ['[001] x'] }
  const kasus: [string, unknown, number][] = [
    ['bukan JSON', '{', 400],
    ['clientId', { ...sah, clientId: 'x' }, 400],
    ['akunKasId', { ...sah, akunKasId: 'x' }, 400],
    ['halaman 0', { ...sah, halaman: 0 }, 400],
    ['halaman pecahan', { ...sah, halaman: 1.5 }, 400],
    ['halaman teks', { ...sah, halaman: '1' }, 400],
    ['baris DAN gambar', { ...sah, gambarPng: 'iVBORw0KGgoAAA' }, 400],
    ['tanpa baris maupun gambar', { clientId: CLIENT, akunKasId: AKUN, halaman: 1 }, 400],
    ['baris bukan teks', { ...sah, baris: [1, 2] }, 400],
    ['baris terlalu banyak', { ...sah, baris: Array(401).fill('x') }, 400],
    ['baris terlalu panjang', { ...sah, baris: ['x'.repeat(2001)] }, 400],
    ['gambar bukan PNG', { clientId: CLIENT, akunKasId: AKUN, halaman: 1, gambarPng: '/9j/4AAQ' }, 400],
    ['kolomSebelumnya bukan teks', { ...sah, kolomSebelumnya: 'Debet' }, 400],
  ]
  for (const [nama, body, status] of kasus) {
    it(`${nama} → ${status}`, async () => {
      const res = await kirim(body)
      expect(res.status).toBe(status)
      expect(pilih).not.toHaveBeenCalled()
    })
  }

  it('body > batas → 413 (header maupun isi)', async () => {
    expect((await kirim({}, { 'content-length': '5000000' })).status).toBe(413)
    expect((await kirim({ ...sah, pad: 'x'.repeat(4_000_001) })).status).toBe(413)
    expect(pilih).not.toHaveBeenCalled()
  })

  it('klien lain → 403; akun bukan kas/bukan milik klien → 400', async () => {
    guard.user = { role: 'user', clientId: '33333333-3333-4333-8333-333333333333' }
    expect((await kirim(sah)).status).toBe(403)
    guard.user = { role: 'akunting', clientId: null }
    akun.mockResolvedValue(null)
    expect((await kirim(sah)).status).toBe(400)
    expect(pilih).not.toHaveBeenCalled()
  })
})

describe('galat penyedia & penjaga → status yang bisa ditindaklanjuti, tanpa isi baris', () => {
  const sah = { clientId: CLIENT, akunKasId: AKUN, halaman: 3, baris: ['[001] 05/10 RAHASIA-UJI-B 1,500,000.00'] }
  const gagal = (e: unknown): AiProvider => ({ nama: 'gemini', model: 'm', mintaJson: async () => { throw e } })
  const kasus: [string, () => AiProvider, number][] = [
    ['penjaga menolak', () => penyediaTiruan(() => '{"rusak":'), 422],
    ['kuota', () => gagal(Object.assign(new Error('x'), { status: 429 })), 429],
    ['batas waktu', () => gagal(new GalatAi('batasWaktu', 'x')), 504],
    ['model menolak', () => gagal(new GalatAi('ditolak', 'x')), 422],
    ['galat lain', () => gagal(new Error('server 500 RAHASIA-UJI-B')), 502],
  ]
  for (const [nama, ai, status] of kasus) {
    it(`${nama} → ${status}`, async () => {
      pilih.mockReturnValue(ai())
      const res = await kirim(sah)
      expect(res.status).toBe(status)
      const teks = JSON.stringify(await res.json())
      expect(teks).not.toContain('RAHASIA-UJI-B')
      expect(teks).not.toContain('1,500,000.00')
    })
  }

  it('penyedia belum dikonfigurasi (AI_PROVIDER salah) → 503', async () => {
    pilih.mockImplementation(() => {
      throw new GalatAi('konfigurasi', 'AI_PROVIDER "x" tidak dikenal')
    })
    expect((await kirim(sah)).status).toBe(503)
  })

  it('422 penjaga menyebut halaman dan daftar masalahnya', async () => {
    pilih.mockReturnValue(penyediaTiruan(() => '{"rusak":'))
    expect(await (await kirim(sah)).json()).toEqual({ error: 'Halaman 3 tidak bisa disusun dengan yakin — ulangi halaman ini.', masalah: ['jawaban AI bukan JSON yang valid'] })
  })
})

describe('route tidak menulis dan tidak mencatat isi (D56)', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'api', 'cash-mutations', 'ekstrak-halaman', 'route.ts'), 'utf8')

  it('tanpa jalur tulis, log, berkas, maupun Sentry', () => {
    for (const s of ['db.insert(', 'db.update(', 'db.delete(', 'db.batch(', 'console.', 'writeFile', 'Sentry', 'captureException']) {
      expect(src, s).not.toContain(s)
    }
  })

  it('gerbang fitur diperiksa sebelum body dibaca', () => {
    const gerbang = src.indexOf("aiFeaturesEnabled('ekstraksiRekeningKoran')")
    expect(gerbang).toBeGreaterThan(-1)
    expect(gerbang).toBeLessThan(src.indexOf('req.text()'))
    expect(src.indexOf('requireAkunting()')).toBeLessThan(gerbang)
  })

  it('memberi maxDuration', () => {
    expect(src).toContain('export const maxDuration = 60')
  })
})
