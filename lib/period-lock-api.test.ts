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
  // Posting: bentuk penolakannya wajib sama dengan jalur tulis lain (temuan CP-13).
  ['app/api/journals/[id]/post/route.ts', 'POST', '[header.tanggal]'],
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

  it('pesan penolakan memakai tanggal terformat ("30 Sep 2026"), bukan YYYY-MM-DD', () => {
    const f = PL.slice(PL.indexOf('export async function tolakBilaPeriodeTerkunci'))
    expect(f).toContain('fmtTanggal(kunci.terkunciSampai)')
    expect(f).toContain('fmtTanggal(kena)')
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

// K3 — route kunci & buka. Hak aksesnya keputusan D17, dan satu-satunya yang
// menjaganya tetap di tempat adalah berkas ini.
describe('route /api/period-locks (K3)', () => {
  const LIST = read('app', 'api', 'period-locks', 'route.ts')
  const ONE = read('app', 'api', 'period-locks', '[id]', 'route.ts')

  it('baca = requireInternal (finance ikut melihat), kunci = requireAkunting, buka = requireOwner', () => {
    expect(handler(LIST, 'GET')).toContain('await requireInternal()')
    expect(handler(LIST, 'POST')).toContain('await requireAkunting()')
    expect(handler(ONE, 'DELETE')).toContain('await requireOwner()')
    for (const b of [handler(LIST, 'GET'), handler(LIST, 'POST'), handler(ONE, 'DELETE')]) {
      expect(b).toContain('canAccessClientData(')
    }
  })

  it('mengunci: divalidasi aturan murni K1 terhadap kunci berlaku & hari ini', () => {
    const b = handler(LIST, 'POST')
    expect(b).toContain('latestLock(await loadPeriodLocks(clientId))')
    expect(b).toContain('validateLockInput({ terkunciSampai: raw.terkunciSampai }, { latest, hariIni: hariIniJakarta() })')
  })

  it('mengunci: baris kunci + riwayat period_locked di SATU batch', () => {
    const b = handler(LIST, 'POST')
    const batch = b.indexOf('await db.batch(')
    expect(b.indexOf('db.insert(periodLocks)')).toBeLessThan(batch)
    expect(b.indexOf("event: 'period_locked'")).toBeLessThan(batch)
    expect(b).toContain("entityType: 'period_lock'")
  })

  it('membuka: alasan wajib, hanya kunci TERBARU, riwayat period_unlocked membawa alasannya', () => {
    const b = handler(ONE, 'DELETE')
    expect(b).toContain('validateUnlockReason(')
    expect(b).toContain('latestLock(semua)?.id !== row.id')
    const batch = b.indexOf('await db.batch(')
    expect(b.indexOf('db.delete(periodLocks)')).toBeLessThan(batch)
    expect(b.indexOf("event: 'period_unlocked'")).toBeLessThan(batch)
    expect(b).toContain('catatan: alasan.value')
  })

  it('baris DIBACA dulu, baru kliennya diperiksa (P7)', () => {
    const b = handler(ONE, 'DELETE')
    expect(b.indexOf('.from(periodLocks)')).toBeLessThan(b.indexOf('canAccessClientData('))
  })
})

// K4 — layar. Layar tidak menegakkan apa pun (server sudah, K2/K3), tapi pesan
// dan tombolnya wajib memakai aturan murni yang SAMA — kalau tidak, layar
// mengizinkan yang ditolak server, atau sebaliknya.
describe('UI kunci periode (K4)', () => {
  const KARTU = read('components', 'settings', 'kunci-periode-card.tsx')
  const SETTINGS = read('app', 'settings', 'page.tsx')
  const FORM = read('components', 'jurnal', 'journal-form-modal.tsx')
  const JURNAL = read('app', 'jurnal', 'page.tsx')
  const WIZARD = read('components', 'mutasi-kas', 'import-wizard.tsx')

  it('tab Pembukuan memuat kartu Kunci Periode; membuka = owner saja (D17)', () => {
    expect(SETTINGS).toContain('<KunciPeriodeCard clientId={clientId} bolehKunci={!readOnly} bolehBuka={bolehBuka} />')
    expect(SETTINGS).toContain('bolehBuka={isOwner}')
  })

  it('kartu memakai aturan murni yang sama dengan server, dan batas hari ini WIB', () => {
    expect(KARTU).toContain('validateLockInput({ terkunciSampai: tanggal }, { latest, hariIni })')
    expect(KARTU).toContain('validateUnlockReason(alasan)')
    expect(KARTU).toContain('const hariIni = hariIniJakarta()')
    expect(KARTU).toContain('max={hariIni}')
  })

  it('kartu: kunci lewat POST, buka lewat DELETE kunci TERBARU, tombol mengikuti hak akses', () => {
    expect(KARTU).toContain("fetch('/api/period-locks', {")
    expect(KARTU).toContain('fetch(`/api/period-locks/${terbaru.id}`, {')
    expect(KARTU).toContain('{!loading && bolehKunci && (')
    expect(KARTU).toContain('{!loading && bolehBuka && kunci.length > 0 && (')
    expect(KARTU).toContain('<ModalShell')
  })

  it('form jurnal: tanggal BARU dan LAMA diperiksa lewat isDateLocked, Simpan tertahan', () => {
    expect(FORM).toContain("isDateLocked(form.tanggal, kunci) || (mode === 'edit' && isDateLocked(initial.tanggal, kunci))")
    expect(FORM).toContain('!submitting && !tanggalTerkunci')
  })

  it('halaman /jurnal membaca kunci, meneruskannya ke form, dan menahan tombol Posting', () => {
    expect(JURNAL).toContain('fetch(`/api/period-locks?clientId=${clientId}`)')
    expect(JURNAL).toContain('terkunciSampai={terkunciSampai}')
    expect(JURNAL).toContain('isDateLocked(postingTarget.tanggal, [{ terkunciSampai }])')
    expect(JURNAL).toContain('disabled={postingBusy || postingTerkunci}')
  })

  it('wizard impor memperingatkan bahwa berkas akan ditolak seluruhnya', () => {
    expect(WIZARD).toContain('fetch(`/api/period-locks?clientId=${clientId}`)')
    expect(WIZARD).toContain('ditolak seluruhnya')
  })
})

// Membuka kunci MENGHAPUS barisnya — siapa, kapan, dan alasannya hanya hidup di
// audit_events. Kartu yang hanya membaca period_locks tidak akan pernah
// menampilkan pembukaan sama sekali.
describe('riwayat kunci & buka (siapa, kapan, alasan)', () => {
  const LIST = read('app', 'api', 'period-locks', 'route.ts')
  const KARTU = read('components', 'settings', 'kunci-periode-card.tsx')

  it('GET membaca riwayat dari audit_events klien itu, entity period_lock', () => {
    const b = handler(LIST, 'GET')
    expect(b).toContain('.from(auditEvents)')
    expect(b).toContain("and(eq(auditEvents.clientId, clientId), eq(auditEvents.entityType, 'period_lock'))")
    expect(b).toContain('alasan: auditEvents.catatan')
    expect(b).toContain('kunci, riwayat })')
  })

  it('kartu menampilkan peristiwa buka beserta alasannya', () => {
    expect(KARTU).toContain("if (r.event === 'period_unlocked')")
    expect(KARTU).toContain('{r.alasan && (')
    expect(KARTU).toContain('fmtWaktu(r.at)')
  })
})
