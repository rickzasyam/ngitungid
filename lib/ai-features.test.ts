import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Route-nya diuji sungguhan: guard, DB, dan Gemini di-mock, jadi yang diuji
// hanya gerbang sakelarnya — tidak ada panggilan AI atau DB.
vi.mock('@/lib/api/guards', () => ({
  requireAkunting: vi.fn(async () => ({ user: { role: 'owner', clientId: null } })),
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/ai/saran-akun-jurnal', () => ({ suggestJournalAccounts: vi.fn() }))
vi.mock('@/lib/gemini/suggest-coa', () => ({ suggestCoaWithGemini: vi.fn() }))
vi.mock('@/lib/gemini/extract', () => ({ extractReport: vi.fn() }))
vi.mock('@/lib/api/cash-mutation-queries', () => ({ loadCashAccount: vi.fn() }))
vi.mock('@/lib/ai/pilih-penyedia', () => ({ penyediaDariEnv: vi.fn() }))

import { AI_NONAKTIF, FITUR_LAMA, aiFeaturesEnabled, envSakelarSendiri, type FiturBaru, type FiturLama } from './ai-features'
import { POST as ekstrakHalaman } from '@/app/api/cash-mutations/ekstrak-halaman/route'
import { POST as saranAkun } from '@/app/api/journals/suggest-account/route'
import { POST as saranCoa } from '@/app/api/reports/[id]/suggest-ai/route'
import { POST as ekstrakUlang } from '@/app/api/reports/[id]/retry-extract/route'
import { POST as upload } from '@/app/api/upload/route'

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
const req = () => new Request('http://x/api', { method: 'POST', body: '{}' })
const idSalah = { params: Promise.resolve({ id: 'bukan-uuid' }) }

// Tiap route: yang dipanggil + jawaban ketika gerbang SUDAH dilewati
// (validasi biasa menolak body/ID palsu — bukti tidak berhenti di 503).
const ROUTE: Record<FiturLama, { nama: string; panggil: () => Promise<Response | undefined> }[]> = {
  saranAkunJurnal: [{ nama: 'POST /api/journals/suggest-account', panggil: () => saranAkun(req()) }],
  saranCoa: [{ nama: 'POST /api/reports/[id]/suggest-ai', panggil: () => saranCoa(req(), idSalah) }],
  ekstraksiLaporan: [
    { nama: 'POST /api/upload', panggil: () => upload(req()) },
    { nama: 'POST /api/reports/[id]/retry-extract', panggil: () => ekstrakUlang(req(), idSalah) },
  ],
}

// Keadaan produksi hari ini = env tidak diisi.
const HARAPAN: Record<FiturLama, { kosong: boolean; true: boolean; false: boolean }> = {
  saranAkunJurnal: { kosong: false, true: true, false: false },
  saranCoa: { kosong: true, true: true, false: false },
  ekstraksiLaporan: { kosong: true, true: true, false: false },
}

afterEach(() => vi.unstubAllEnvs())

describe('aiFeaturesEnabled', () => {
  for (const [fitur, h] of Object.entries(HARAPAN) as [FiturLama, (typeof HARAPAN)[FiturLama]][]) {
    it(`${fitur}: kosong → ${h.kosong}, "true" → menyala, nilai lain → mati`, () => {
      expect(aiFeaturesEnabled(fitur, '')).toBe(h.kosong)
      expect(aiFeaturesEnabled(fitur, 'true')).toBe(true)
      for (const v of ['false', 'TRUE', '1', ' true', '0']) expect(aiFeaturesEnabled(fitur, v)).toBe(false)
    })
  }

  it('env yang benar-benar tidak ada sama dengan string kosong', () => {
    vi.stubEnv('AI_FEATURES_ENABLED', undefined as unknown as string)
    for (const fitur of Object.keys(HARAPAN) as FiturLama[]) {
      expect(aiFeaturesEnabled(fitur)).toBe(HARAPAN[fitur].kosong)
    }
  })
})

describe('route menghormati sakelar', () => {
  for (const [fitur, routes] of Object.entries(ROUTE) as [FiturLama, (typeof ROUTE)[FiturLama]][]) {
    for (const r of routes) {
      for (const [keadaan, env] of [['kosong', ''], ['true', 'true'], ['false', 'false']] as const) {
        const menyala = HARAPAN[fitur][keadaan]
        it(`${r.nama} — env ${keadaan} → ${menyala ? 'lolos gerbang' : '503'}`, async () => {
          vi.stubEnv('AI_FEATURES_ENABLED', env)
          const res = (await r.panggil())!
          if (menyala) {
            expect(res.status).toBe(400)
          } else {
            expect(res.status).toBe(503)
            expect(await res.json()).toEqual({ error: AI_NONAKTIF })
          }
        })
      }
    }
  }
})

describe('UI mengikuti sakelar yang sama dengan route-nya', () => {
  const gerbang = (berkas: string, kunci: string, sesudah: string) => {
    const src = read(...berkas.split('/'))
    const i = src.indexOf(kunci)
    expect(i, `${berkas} memuat ${kunci}`).toBeGreaterThan(-1)
    expect(src.indexOf(sesudah, i), `${sesudah} sesudah gerbang`).toBeGreaterThan(i)
  }

  it('tombol "Sarankan akun (AI)" hanya bila saranAkunJurnal menyala', () =>
    gerbang('components/jurnal/journal-form-modal.tsx', "{aiFeaturesEnabled('saranAkunJurnal') && (", 'Sarankan akun (AI)'))
  it('tombol Saran AI COA Mapping hanya bila saranCoa menyala', () =>
    gerbang('app/coa-mapping/page.tsx', "aiFeaturesEnabled('saranCoa') && (", 'Saran AI (Gemini)'))
  it('tombol "Coba lagi" ekstraksi hanya bila ekstraksiLaporan menyala', () =>
    gerbang('app/laporan/page.tsx', "aiFeaturesEnabled('ekstraksiLaporan') && (", 'Coba lagi'))
  it('Proses Laporan tidak siap bila ekstraksiLaporan mati', () =>
    gerbang('components/upload-session.tsx', "const ekstraksiAktif = aiFeaturesEnabled('ekstraksiLaporan')", 'const isReadyToProcess = ekstraksiAktif &&'))

  it('sakelarnya sampai ke browser lewat env next.config', () => {
    expect(read('next.config.mjs')).toContain('AI_FEATURES_ENABLED: process.env.AI_FEATURES_ENABLED')
  })
})

// ── Fitur AI BARU: sakelar SENDIRI, bawaan MATI (keputusan Ricko 2026-10-27) ──
// Menyala hanya bila sakelarnya "true" persis DAN AI_FEATURES_ENABLED tidak
// mematikan semuanya. Production hari ini AI_FEATURES_ENABLED="true" — fitur
// baru tetap mati sampai sakelarnya sendiri diisi.
const GLOBAL = [undefined, '', 'true', 'false', 'TRUE', '1'] as const
const KHUSUS = [undefined, '', 'true', 'false', 'TRUE', '1', ' true'] as const
const nyalaBaru = (v: string | undefined, k: string | undefined) => k === 'true' && (v === undefined || v === '' || v === 'true')
const env = (nama: string, v: string | undefined) => vi.stubEnv(nama, v as string)

describe('fitur baru — ekstraksiRekeningKoran', () => {
  it('fitur lama terdaftar persis; fitur baru punya env sakelar sendiri', () => {
    expect([...FITUR_LAMA]).toEqual(['saranAkunJurnal', 'saranCoa', 'ekstraksiLaporan'])
    const baru: FiturBaru[] = ['ekstraksiRekeningKoran']
    expect(baru.map(envSakelarSendiri)).toEqual(['AI_EKSTRAKSI_REKENING_KORAN'])
  })

  for (const v of GLOBAL) {
    for (const k of KHUSUS) {
      const harap = nyalaBaru(v, k)
      it(`AI_FEATURES_ENABLED=${JSON.stringify(v)} · AI_EKSTRAKSI_REKENING_KORAN=${JSON.stringify(k)} → ${harap ? 'menyala' : 'mati'}`, () => {
        env('AI_FEATURES_ENABLED', v)
        env('AI_EKSTRAKSI_REKENING_KORAN', k)
        expect(aiFeaturesEnabled('ekstraksiRekeningKoran')).toBe(harap)
        expect(aiFeaturesEnabled('ekstraksiRekeningKoran', v ?? '', k)).toBe(harap)
      })
    }
  }

  it('produksi hari ini (AI_FEATURES_ENABLED="true", sakelar sendiri tidak diisi) → MATI', () => {
    env('AI_FEATURES_ENABLED', 'true')
    env('AI_EKSTRAKSI_REKENING_KORAN', undefined)
    expect(aiFeaturesEnabled('ekstraksiRekeningKoran')).toBe(false)
  })

  it('sakelar sendiri TIDAK mengubah fitur lama, dalam kombinasi apa pun', () => {
    for (const k of KHUSUS) {
      env('AI_EKSTRAKSI_REKENING_KORAN', k)
      for (const fitur of FITUR_LAMA) {
        for (const [keadaan, v] of [['kosong', ''], ['true', 'true'], ['false', 'false']] as const) {
          expect(aiFeaturesEnabled(fitur, v), `${fitur} ${keadaan} khusus=${k}`).toBe(HARAPAN[fitur][keadaan])
        }
      }
    }
  })

  for (const v of GLOBAL) {
    for (const k of KHUSUS) {
      const harap = nyalaBaru(v, k)
      it(`POST /api/cash-mutations/ekstrak-halaman — global ${JSON.stringify(v)} · khusus ${JSON.stringify(k)} → ${harap ? 'lolos gerbang' : '503'}`, async () => {
        env('AI_FEATURES_ENABLED', v)
        env('AI_EKSTRAKSI_REKENING_KORAN', k)
        const res = (await ekstrakHalaman(req()))!
        if (harap) {
          expect(res.status).toBe(400)
        } else {
          expect(res.status).toBe(503)
          expect(await res.json()).toEqual({ error: AI_NONAKTIF })
        }
      })
    }
  }

  it('sakelar sendiri sampai ke browser lewat env next.config', () => {
    expect(read('next.config.mjs')).toContain('AI_EKSTRAKSI_REKENING_KORAN: process.env.AI_EKSTRAKSI_REKENING_KORAN')
  })
})
