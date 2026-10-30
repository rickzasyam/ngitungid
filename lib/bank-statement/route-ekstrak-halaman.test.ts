import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Route X4 diuji sungguhan dengan guard, akun kas, dan penyedia ditiru — tidak
// ada DB maupun panggilan AI. Gerbangnya (semua kombinasi sakelar) diuji di
// lib/ai-features.test.ts; di sini sakelarnya dinyalakan.
const guard = vi.hoisted(() => ({ user: { role: 'akunting', clientId: null as string | null } }))
vi.mock('@/lib/api/guards', () => ({ requireAkunting: vi.fn(async () => ({ user: guard.user })) }))
vi.mock('@/lib/api/cash-mutation-queries', () => ({ loadCashAccount: vi.fn() }))
vi.mock('@/lib/ai/pilih-penyedia', () => ({ penyediaDariEnv: vi.fn(), penyediaUlangDariEnv: vi.fn() }))

import { loadCashAccount } from '@/lib/api/cash-mutation-queries'
import { penyediaDariEnv, penyediaUlangDariEnv } from '@/lib/ai/pilih-penyedia'
import { GalatAi, type AiProvider } from '@/lib/ai/penyedia'
import { POST } from '@/app/api/cash-mutations/ekstrak-halaman/route'
import { bukaPdf } from './baca-pdf'
import { kolomSebelumnyaBerposisi } from './dokumen'
import { penyediaSempurna, penyediaTiruan } from './fikstur/jawaban-ai'
import { dokumenDuaKolom, dokumenSatuKolom } from './fikstur/koleksi'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const AKUN = '22222222-2222-4222-8222-222222222222'
const akun = vi.mocked(loadCashAccount)
const pilih = vi.mocked(penyediaDariEnv)
// Bawaan test: tanpa model pengulang — perilaku satu percobaan. Ulang diuji di blok sendiri.
const pilihUlang = vi.mocked(penyediaUlangDariEnv)

beforeEach(() => {
  vi.stubEnv('AI_FEATURES_ENABLED', 'true')
  vi.stubEnv('AI_EKSTRAKSI_REKENING_KORAN', 'true')
  guard.user = { role: 'akunting', clientId: null }
  akun.mockResolvedValue({ id: AKUN } as never)
  pilihUlang.mockReturnValue(null)
})
afterEach(() => {
  vi.unstubAllEnvs()
  akun.mockReset()
  pilih.mockReset()
  pilihUlang.mockReset()
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
    expect(await res.json()).toEqual(d.kebenaranHalaman[0])

    const dd = dokumenDuaKolom()
    pilih.mockReturnValue(await penyediaSempurna(dd))
    const res2 = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 2, baris: await barisHalaman(dd.pdf, 2), kolomSebelumnya: dd.kebenaran[0].kolom })
    expect(res2.status).toBe(200)
    expect(await res2.json()).toEqual(dd.kebenaranHalaman[1])
    expect(akun).toHaveBeenCalledWith(CLIENT, AKUN)
  })

  // Keputusan Ricko 2026-10-29: posisi judul halaman sebelumnya lewat route.
  it('halaman lanjutan dengan judul BERPOSISI: jawaban benar diterima, kolom tertukar ditolak 422', async () => {
    const dd = dokumenDuaKolom()
    const doc = await bukaPdf(dd.pdf)
    const [h1, h2] = [await doc.bacaHalaman(1), await doc.bacaHalaman(2)]
    await doc.tutup()
    const kolomSebelumnya = kolomSebelumnyaBerposisi({ kolom: dd.kebenaran[0].kolom, baris: h1.baris.map(b => b.teks), grid: h1.grid }, h2.grid)
    expect(kolomSebelumnya.every(k => typeof k !== 'string')).toBe(true)
    const body = { clientId: CLIENT, akunKasId: AKUN, halaman: 2, baris: h2.baris.map(b => b.teks), kolomSebelumnya }
    pilih.mockReturnValue(await penyediaSempurna(dd))
    const ok = await kirim(body)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual(dd.kebenaranHalaman[1])
    pilih.mockReturnValue(await penyediaSempurna(dd, (j, h) => (h !== 2 ? j : { ...j, baris: j.baris.map((b, i) => (i === 0 ? { ...b, nominalPertama: b.nominalKedua, nominalKedua: b.nominalPertama } : b)) })))
    const tolak = await kirim(body)
    expect(tolak.status).toBe(422)
    expect(JSON.stringify(await tolak.json())).toContain('tidak sejajar')
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
    ['kolomSebelumnya campuran nama & berposisi', { ...sah, kolomSebelumnya: ['Debet', { judul: 'Kredit', awal: 10, akhir: 16 }] }, 400],
    ['kolomSebelumnya berposisi: kunci tambahan', { ...sah, kolomSebelumnya: [{ judul: 'Debet', awal: 1, akhir: 6, x: 1 }] }, 400],
    ['kolomSebelumnya berposisi: awal ≥ akhir', { ...sah, kolomSebelumnya: [{ judul: 'Debet', awal: 6, akhir: 6 }] }, 400],
    ['kolomSebelumnya berposisi: posisi pecahan', { ...sah, kolomSebelumnya: [{ judul: 'Debet', awal: 1.5, akhir: 6 }] }, 400],
    ['kolomSebelumnya berposisi: posisi di luar batas', { ...sah, kolomSebelumnya: [{ judul: 'Debet', awal: 1, akhir: 99_999 }] }, 400],
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

  it('kuota HARIAN habis → 429 dengan pesan sendiri (bukan "tunggu sebentar")', async () => {
    pilih.mockReturnValue(gagal(new GalatAi('kuotaHarian', 'x')))
    const res = await kirim(sah)
    expect(res.status).toBe(429)
    expect((await res.json()).error).toContain('harian')
  })

  it('penyedia belum dikonfigurasi (AI_PROVIDER_EKSTRAKSI salah) → 503', async () => {
    pilih.mockImplementation(() => {
      throw new GalatAi('konfigurasi', 'AI_PROVIDER_EKSTRAKSI "x" tidak dikenal')
    })
    expect((await kirim(sah)).status).toBe(503)
  })

  it('422 penjaga menyebut halaman dan daftar masalahnya', async () => {
    pilih.mockReturnValue(penyediaTiruan(() => '{"rusak":'))
    expect(await (await kirim(sah)).json()).toEqual({
      error: 'Halaman 3 tidak bisa disusun dengan yakin — ulangi halaman ini.',
      masalah: ['jawaban AI bukan JSON yang valid'],
      model: ['tiruan'],
      inputManual: false,
    })
  })
})

// Keputusan Ricko 2026-10-30: halaman yang DITOLAK PENJAGA diulang sekali dengan
// model pengulang (Flash); ditolak lagi → input manual; model per halaman dicatat.
describe('ulang otomatis dengan model pengulang', () => {
  const rusak = () => '{"rusak":'
  /** Penyedia bernama `model` yang menghitung panggilannya. */
  function bernama(model: string, p: AiProvider) {
    const mintaJson = vi.fn(p.mintaJson)
    return { ...p, model, mintaJson }
  }

  it('ditolak penjaga → diulang dengan model pengulang → 200 + header model', async () => {
    const d = dokumenSatuKolom()
    const lite = bernama('lite', penyediaTiruan(rusak))
    const flash = bernama('flash', await penyediaSempurna(d))
    pilih.mockReturnValue(lite)
    pilihUlang.mockReturnValue(flash)
    const res = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: await barisHalaman(d.pdf, 1) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(d.kebenaranHalaman[0])
    expect(res.headers.get('X-Model-Ekstraksi')).toBe('flash')
    expect(res.headers.get('X-Ekstraksi-Diulang')).toBe('1')
    expect(lite.mintaJson).toHaveBeenCalledTimes(1)
    expect(flash.mintaJson).toHaveBeenCalledTimes(1)
  })

  it('lolos pada percobaan pertama → pengulang tidak dipanggil; header model utama', async () => {
    const d = dokumenSatuKolom()
    const lite = bernama('lite', await penyediaSempurna(d))
    const flash = bernama('flash', await penyediaSempurna(d))
    pilih.mockReturnValue(lite)
    pilihUlang.mockReturnValue(flash)
    const res = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: await barisHalaman(d.pdf, 1) })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Model-Ekstraksi')).toBe('lite')
    expect(res.headers.get('X-Ekstraksi-Diulang')).toBe('0')
    expect(flash.mintaJson).not.toHaveBeenCalled()
  })

  it('pengulang juga ditolak → 422 inputManual, paling banyak SATU ulang, tanpa isi baris', async () => {
    const sah = { clientId: CLIENT, akunKasId: AKUN, halaman: 3, baris: ['[001] 05/10 RAHASIA-UJI-B 1,500,000.00'] }
    const lite = bernama('lite', penyediaTiruan(rusak))
    const flash = bernama('flash', penyediaTiruan(rusak))
    pilih.mockReturnValue(lite)
    pilihUlang.mockReturnValue(flash)
    const res = await kirim(sah)
    expect(res.status).toBe(422)
    const j = await res.json()
    expect(j).toEqual({
      error: 'Halaman 3 tetap tidak bisa disusun dengan yakin sesudah diulang dengan model lain — isi halaman ini secara manual.',
      masalah: ['jawaban AI bukan JSON yang valid'],
      model: ['lite', 'flash'],
      inputManual: true,
    })
    expect(JSON.stringify(j)).not.toContain('RAHASIA-UJI-B')
    expect(lite.mintaJson).toHaveBeenCalledTimes(1)
    expect(flash.mintaJson).toHaveBeenCalledTimes(1)
  })

  it('galat SELAIN penjaga (kuota, batas waktu, model menolak, galat lain) tidak diulang', async () => {
    const sah = { clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: ['[001] x'] }
    for (const [e, status] of [
      [Object.assign(new Error('x'), { status: 429 }), 429],
      [new GalatAi('kuotaHarian', 'x'), 429],
      [new GalatAi('batasWaktu', 'x'), 504],
      [new GalatAi('ditolak', 'x'), 422],
      [new Error('server 500'), 502],
    ] as const) {
      const flash = bernama('flash', penyediaTiruan(rusak))
      pilih.mockReturnValue({ nama: 'gemini', model: 'lite', mintaJson: async () => { throw e } })
      pilihUlang.mockReturnValue(flash)
      expect((await kirim(sah)).status).toBe(status)
      expect(flash.mintaJson).not.toHaveBeenCalled()
    }
  })

  it('ditolak penjaga lalu kuota HARIAN model pengulang habis → 429 harian (bukan input manual)', async () => {
    pilih.mockReturnValue(bernama('lite', penyediaTiruan(rusak)))
    pilihUlang.mockReturnValue({ nama: 'gemini', model: 'flash', mintaJson: async () => { throw new GalatAi('kuotaHarian', 'x') } })
    const res = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: ['[001] x'] })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toContain('harian')
  })

  it('model pengulang sama dengan model utama → tidak diulang', async () => {
    const lite = bernama('lite', penyediaTiruan(rusak))
    pilih.mockReturnValue(lite)
    pilihUlang.mockReturnValue(lite)
    const res = await kirim({ clientId: CLIENT, akunKasId: AKUN, halaman: 1, baris: ['[001] x'] })
    expect(res.status).toBe(422)
    expect((await res.json()).inputManual).toBe(false)
    expect(lite.mintaJson).toHaveBeenCalledTimes(1)
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
