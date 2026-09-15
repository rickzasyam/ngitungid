import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas source route jurnal — pola sama dengan
// lib/contracts-api.test.ts.
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun: guard mana yang
// dipasang, URUTAN pemeriksaan akses, dan apakah aturan pembukuan benar-benar
// dipanggil di server. Ketiganya hanya bisa salah di sisi penulisan, dan
// ketiganya mahal kalau lolos — satu jalur tulis yang lupa memanggil
// validateJournalInput menerima jurnal yang tidak seimbang tanpa ada yang tahu,
// karena panel selisih di browser memang tidak menegakkan apa pun.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LIST = read('app', 'api', 'journals', 'route.ts')
const DETAIL = read('app', 'api', 'journals', '[id]', 'route.ts')
const QUERIES = read('lib', 'api', 'journal-queries.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

describe('guard jurnal', () => {
  // D3: /jurnal masuk ACCOUNTING_ONLY_PREFIXES, jadi halamannya tertutup untuk
  // klien DAN finance. Kalau API-nya requireUser, gerbang itu jadi kosmetik.
  it('SEMUA handler memakai requireAkunting, termasuk yang membaca', () => {
    for (const [src, m] of [
      [LIST, 'GET'],
      [LIST, 'POST'],
      [DETAIL, 'GET'],
      [DETAIL, 'PATCH'],
      [DETAIL, 'DELETE'],
    ] as const) {
      const body = m === 'GET' && src === DETAIL ? src : handler(src, m)
      expect(body.includes('requireAkunting') || src.includes('requireAkunting'), `${m}`).toBe(true)
    }
  })

  it('tidak ada handler jurnal yang MEMANGGIL requireUser', () => {
    // Needle-nya menyertakan tanda kurung: kata 'requireUser' sendiri muncul di
    // komentar yang menjelaskan kenapa justru TIDAK dipakai.
    expect(LIST).not.toContain('requireUser()')
    expect(DETAIL).not.toContain('requireUser()')
  })

  it('batas antar-klien dinyatakan eksplisit, bukan diwarisi daftar role', () => {
    expect(LIST).toContain('canAccessClientData(')
    expect(DETAIL).toContain('canAccessClientData(')
  })
})

// clientId tidak ada di URL detail, jadi satu-satunya cara tahu jurnal ini
// milik siapa adalah membaca barisnya. Memeriksa akses sebelum itu berarti
// memeriksa terhadap tebakan.
describe('route detail mengambil baris DULU, baru memeriksa klien', () => {
  it('select dari journalEntries mendahului canAccessClientData', () => {
    const ambil = DETAIL.indexOf('.from(journalEntries)')
    const cek = DETAIL.indexOf('canAccessClientData(')
    expect(ambil).toBeGreaterThan(-1)
    expect(ambil).toBeLessThan(cek)
  })

  it('404 dikembalikan sebelum pemeriksaan akses, bukan sesudah', () => {
    const notFound = DETAIL.indexOf('Jurnal tidak ditemukan.')
    const cek = DETAIL.indexOf('canAccessClientData(')
    expect(notFound).toBeLessThan(cek)
  })

  it('clientId diambil dari BARIS, tidak pernah dari body', () => {
    expect(DETAIL).toContain('g.row.clientId')
    expect(DETAIL).not.toContain('raw.clientId')
  })
})

describe('aturan pembukuan ditegakkan di server', () => {
  it('POST memanggil validateJournalInput', () => {
    expect(handler(LIST, 'POST')).toContain('validateJournalInput(')
  })

  it('PATCH memanggil validateJournalInput juga', () => {
    expect(handler(DETAIL, 'PATCH')).toContain('validateJournalInput(')
  })

  it('validasi terjadi sebelum db.batch, bukan sesudah', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      const validasi = body.indexOf('validateJournalInput(')
      const batch = body.indexOf('await db.batch(')
      expect(validasi, m).toBeGreaterThan(-1)
      expect(batch, m).toBeGreaterThan(-1)
      expect(validasi, m).toBeLessThan(batch)
    }
  })

  it('setiap akun diperiksa milik klien yang sama sebelum menulis', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      const cek = body.indexOf('assertAccountsBelongToClient(')
      const batch = body.indexOf('await db.batch(')
      expect(cek, m).toBeGreaterThan(-1)
      expect(cek, m).toBeLessThan(batch)
    }
  })

  it('penjaga akun memakai inArray + bandingkan panjang, bukan loop per baris', () => {
    expect(QUERIES).toContain('inArray(masterCoa.id, ids)')
    expect(QUERIES).toContain('found.length !== ids.length')
  })
})

describe('immutabilitas jurnal terposting', () => {
  it('PATCH memanggil canEditJournal sebelum menyentuh apa pun', () => {
    const body = handler(DETAIL, 'PATCH')
    const cek = body.indexOf('assertEditable(')
    const batch = body.indexOf('await db.batch(')
    expect(cek).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(batch)
  })

  it('DELETE memanggil canEditJournal sebelum menghapus', () => {
    const body = handler(DETAIL, 'DELETE')
    const cek = body.indexOf('assertEditable(')
    const hapus = body.indexOf('db.delete(journalEntries)')
    expect(cek).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(hapus)
  })

  it('penjaganya benar-benar memakai predikat lib, bukan perbandingan lokal', () => {
    expect(DETAIL).toContain('canEditJournal(')
    expect(DETAIL).not.toContain("status === 'draft'")
  })

  it('penolakannya 409, bukan 403 atau 400', () => {
    const blok = DETAIL.slice(DETAIL.indexOf('function assertEditable'))
    expect(blok.slice(0, 600)).toContain('status: 409')
  })
})

describe('jejak pembuat & bentuk respons', () => {
  it('created_by diisi lewat lookup email, bukan dari body', () => {
    expect(handler(LIST, 'POST')).toContain('resolveUserId(g.user.email)')
    expect(QUERIES).toContain('eq(users.email, email)')
  })

  it('lib/auth.ts tidak diimpor oleh route jurnal mana pun', () => {
    expect(LIST).not.toContain('lib/auth')
    expect(DETAIL).not.toContain('lib/auth')
  })

  it('daftar membawa nama pembuat lewat join users', () => {
    expect(LIST).toContain('createdByName: users.name')
    expect(LIST).toContain('.innerJoin(users')
  })

  it('detail juga membawa nama pembuat', () => {
    expect(QUERIES).toContain('createdByName: users.name')
  })

  it('POST, PATCH, dan GET detail memakai SATU pembangun bentuk detail', () => {
    expect(handler(LIST, 'POST')).toContain('loadJournalDetail(')
    expect(handler(DETAIL, 'PATCH')).toContain('loadJournalDetail(')
    expect(handler(DETAIL, 'GET')).toContain('loadJournalDetail(')
  })
})

describe('uang & tanggal tidak berubah bentuk di jalur query', () => {
  it('total debit dijumlahkan di Postgres dan dikembalikan sebagai string', () => {
    expect(LIST).toContain('::numeric(18,2)::text')
  })

  it('tanggal divalidasi dengan isValidYmd, tanpa objek Date', () => {
    expect(LIST).toContain('isValidYmd(')
    expect(LIST).not.toContain('new Date(periodStart')
    expect(LIST).not.toContain('toISOString()')
  })

  it('daftar diurutkan tanggal turun lalu nomor bukti naik', () => {
    expect(LIST).toContain('desc(journalEntries.tanggal)')
    expect(LIST).toContain('asc(journalEntries.noBukti)')
  })

  it('baris detail diurutkan line_order, bukan urutan kebetulan planner', () => {
    expect(QUERIES).toContain('asc(journalLines.lineOrder)')
  })
})

describe('nomor bukti dobel jadi 409, bukan 500', () => {
  it('POST dan PATCH sama-sama menangani pelanggaran unique', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      expect(body, m).toContain('isUniqueViolation(e)')
      expect(body, m).toContain('status: 409')
    }
  })

  it('kegagalan tulis lain jatuh ke helper bersama, bukan 500 mentah', () => {
    expect(LIST).toContain('dbWriteErrorResponse(')
    expect(DETAIL).toContain('dbWriteErrorResponse(')
  })
})
