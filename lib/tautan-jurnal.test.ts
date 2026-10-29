import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hrefJurnal, PARAM_TAUTAN_JURNAL } from './journal'
import { canDoAccounting } from './roles'
import { isPathAllowedForRole } from './route-access'

// CP-20 (Ricko 2026-10-29): baris grid mutasi kas → jurnal (ringkasan)-nya.
// Satu bentuk tautan (`hrefJurnal`), dibaca /jurnal lewat parameter yang sama,
// dan hanya ditampilkan kepada peran yang memang boleh membuka /jurnal.

const baca = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const JURNAL = baca('app', 'jurnal', 'page.tsx')
const GRID = baca('components', 'mutasi-kas', 'grid', 'grid-mutasi.tsx')
const LEMBAR = baca('components', 'mutasi-kas', 'grid', 'lembar-mutasi.tsx')
const MUTASI = baca('app', 'mutasi-kas', 'page.tsx')

const ID = '11111111-1111-4111-8111-111111111111'

describe('hrefJurnal', () => {
  it('satu bentuk: /jurnal?jurnal=<id>, id di-encode', () => {
    expect(PARAM_TAUTAN_JURNAL).toBe('jurnal')
    expect(hrefJurnal(ID)).toBe(`/jurnal?jurnal=${ID}`)
    expect(hrefJurnal('a b&c')).toBe('/jurnal?jurnal=a%20b%26c')
  })
})

describe('gerbang peran: tautan tampil = /jurnal boleh dibuka', () => {
  it.each(['owner', 'akunting', 'finance', 'user'] as const)('%s', role => {
    expect(canDoAccounting(role)).toBe(isPathAllowedForRole(role, hrefJurnal(ID).split('?')[0]))
  })
  it('halaman /mutasi-kas meneruskan canDoAccounting sebagai bolehLihatJurnal', () => {
    expect(MUTASI).toContain('bolehLihatJurnal={canDoAccounting}')
  })
  it('sel Status dan bilah alat hanya menautkan bila bolehLihatJurnal', () => {
    expect(GRID).toContain('{info?.journalId && kt.bolehLihatJurnal && (')
    expect(GRID).toContain('href={hrefJurnal(info.journalId)}')
    expect(LEMBAR).toContain('{bolehLihatJurnal &&')
    expect(LEMBAR).toContain('href={hrefJurnal(jurnalAktif)}')
  })
  it('jurnal ringkasan (dipakai > 1 baris) disebut jumlah barisnya', () => {
    expect(GRID).toContain('`jurnal ringkasan (${kt.jumlahPerJurnal.get(info.journalId)} baris) ↗`')
  })
})

describe('/jurnal?jurnal=<id>', () => {
  it('membaca parameter yang sama, menolak yang bukan UUID', () => {
    expect(JURNAL).toContain('searchParams.get(PARAM_TAUTAN_JURNAL)')
    expect(JURNAL).toContain('return id && UUID_RE.test(id) ? id : null')
  })
  it('jurnalnya WAJIB milik klien aktif; kalau tidak, pesan — bukan rincian klien lain', () => {
    expect(JURNAL).toContain("const res = await fetch(`/api/journals/${tautan}`)")
    expect(JURNAL).toContain('if (!res.ok || !d || d.clientId !== clientId) {')
    expect(JURNAL).toContain('setTautanGalat(')
  })
  it('periode pindah ke bulan jurnalnya, rincian terbuka, baris digulir ke tengah', () => {
    // Bulan yang sama dengan yang tampil → TANPA setLoading(true): tidak ada
    // pemuatan ulang yang akan mematikannya (uji klik 2026-10-29: macet di
    // "Memuat jurnal…").
    expect(JURNAL).toContain('if (b.start !== periode.start || b.end !== periode.end) {\n          setLoading(true)\n          setPeriode(b)\n        }')
    expect(JURNAL).toContain('setExpanded(d.id)')
    expect(JURNAL).toContain('id={`jurnal-baris-${r.id}`}')
    expect(JURNAL).toContain("document.getElementById(`jurnal-baris-${id}`)?.scrollIntoView({ block: 'center' })")
  })
  it('useSearchParams di balik batas Suspense', () => {
    expect(JURNAL).toContain('<Suspense fallback={null}>\n      <JurnalContent />')
  })
})
