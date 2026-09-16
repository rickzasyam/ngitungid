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
const SUGGEST = read('app', 'api', 'journals', 'suggest-account', 'route.ts')
const SUGGEST_LIB = read('lib', 'gemini', 'suggest-journal-account.ts')

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
  // Tiap handler diperiksa PER BADANNYA, bukan "asal kata itu ada di berkasnya".
  // Bentuk longgar (mencari di seluruh berkas) akan tetap hijau walau salah satu
  // handler gerbangnya diganti, selama handler tetangganya masih memakainya —
  // penjaga yang berhenti menjaga tanpa terlihat rusak.
  //
  // Route detail memusatkan gerbangnya di satu helper `guard()`, jadi yang sah
  // bagi handler di sana adalah memanggil helper itu; `guard()` sendiri diuji
  // terpisah di bawah.
  it('SETIAP handler digerbangi, diperiksa per badan handler', () => {
    for (const [src, m] of [
      [LIST, 'GET'],
      [LIST, 'POST'],
      [DETAIL, 'GET'],
      [DETAIL, 'PATCH'],
      [DETAIL, 'DELETE'],
      [SUGGEST, 'POST'],
    ] as const) {
      const body = handler(src, m)
      const langsung = body.includes('await requireAkunting()')
      const lewatHelper = body.includes('await guard(params)')
      expect(langsung || lewatHelper, `${m} di ${src === LIST ? 'daftar' : src === DETAIL ? 'detail' : 'saran'}`).toBe(true)
    }
  })

  it('helper guard() route detail benar-benar memanggil requireAkunting', () => {
    const helper = DETAIL.slice(DETAIL.indexOf('async function guard('))
    expect(helper.slice(0, 400)).toContain('await requireAkunting()')
  })

  it('tidak ada handler yang lolos tanpa gerbang sama sekali', () => {
    // Menghitung: jumlah handler yang diekspor harus sama dengan jumlah yang
    // tergerbangi. Kalau ada handler BARU ditambahkan tanpa gerbang, selisihnya
    // muncul di sini alih-alih menunggu seseorang menyadarinya.
    for (const src of [LIST, DETAIL, SUGGEST]) {
      const diekspor = (src.match(/export async function (GET|POST|PATCH|DELETE)\(/g) ?? []).length
      const tergerbang = (src.match(/await (requireAkunting\(\)|guard\(params\))/g) ?? []).length
      expect(tergerbang, `handler diekspor ${diekspor}`).toBeGreaterThanOrEqual(diekspor)
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

// A5 — saran akun AI. Modul gemini/* di repo ini memang tidak di-unit-test
// (tidak ada satu pun berkas uji di lib/gemini), jadi yang dijaga di sini
// invarian route-nya: gerbang, penyaring, dan JANGAN MENULIS APA PUN.
describe('route saran akun AI', () => {
  it('digerbangi requireAkunting, bukan requireUser', () => {
    expect(SUGGEST).toContain('requireAkunting()')
    expect(SUGGEST).not.toContain('requireUser()')
  })

  it('batas antar-klien tetap dinyatakan eksplisit', () => {
    expect(SUGGEST).toContain('canAccessClientData(')
  })

  // D10: saran TIDAK PERNAH otomatis dipakai. Route ini membaca saja; yang
  // memutuskan adalah manusia lewat tombol Terapkan di form.
  it('tidak menulis apa pun — tanpa insert, update, delete, maupun batch', () => {
    for (const needle of ['db.insert(', 'db.update(', 'db.delete(', 'db.batch(']) {
      expect(SUGGEST, needle).not.toContain(needle)
    }
  })

  it('membuang saran di bawah ambang keyakinan', () => {
    expect(SUGGEST).toContain('AI_MIN_CONFIDENCE')
    expect(SUGGEST).toContain('p.confidence >= AI_MIN_CONFIDENCE')
  })

  // Model bisa mengembalikan kode yang tidak ada di Master COA klien ini.
  // Tanpa penyaring ini, kode karangan itu sampai ke layar sebagai saran.
  it('membuang kode yang tidak ada di Master COA klien', () => {
    expect(SUGGEST).toContain('byKode.get(p.debitKode)')
    expect(SUGGEST).toContain('byKode.get(p.kreditKode)')
    expect(SUGGEST).toContain('if (!debit || !kredit) return null')
  })

  it('membedakan key belum diisi (400), kuota (429), dan sisanya (502)', () => {
    expect(SUGGEST).toContain('GEMINI_API_KEY')
    expect(SUGGEST).toContain('status: 400')
    expect(SUGGEST).toContain('isQuota ? 429 : 502')
  })

  it('memberi maxDuration supaya tidak terpotong saat free-tier antre', () => {
    expect(SUGGEST).toContain('export const maxDuration = 60')
  })

  it('keterangan kosong ditolak sebelum Gemini dipanggil', () => {
    const tolak = SUGGEST.indexOf("keterangan === ''")
    const panggil = SUGGEST.indexOf('suggestJournalAccounts(')
    expect(tolak).toBeGreaterThan(-1)
    expect(tolak).toBeLessThan(panggil)
  })

  it('panjang keterangan dibatasi sebelum dikirim ke Gemini', () => {
    const batas = SUGGEST.indexOf('KETERANGAN_MAX')
    const panggil = SUGGEST.indexOf('suggestJournalAccounts(')
    expect(batas).toBeGreaterThan(-1)
    expect(batas).toBeLessThan(panggil)
  })
})

describe('modul saran akun jurnal', () => {
  it('mengembalikan paling banyak tiga pasangan (R1)', () => {
    expect(SUGGEST_LIB).toContain('MAX_SUGGESTION_PAIRS = 3')
    expect(SUGGEST_LIB).toContain('.slice(0, MAX_SUGGESTION_PAIRS)')
  })

  it('terurut keyakinan menurun, jadi pilihan teratas yang paling mungkin benar', () => {
    expect(SUGGEST_LIB).toContain('.sort((a, b) => b.confidence - a.confidence)')
  })

  it('pasangan dengan sisi kosong atau dua sisi sama dibuang di modul', () => {
    expect(SUGGEST_LIB).toContain("r.debitKode !== ''")
    expect(SUGGEST_LIB).toContain('r.debitKode !== r.kreditKode')
  })

  it('temperature 0 — saran akuntansi tidak boleh berubah tiap ditekan', () => {
    expect(SUGGEST_LIB).toContain('temperature: 0')
  })

  it('prompt meminta array kosong saat keterangannya kabur', () => {
    expect(SUGGEST_LIB).toContain('array KOSONG')
  })

  it('mengembalikan KODE akun, bukan id basis data', () => {
    expect(SUGGEST_LIB).toContain('debitKode')
    expect(SUGGEST_LIB).not.toContain('masterCoa.id')
  })
})

// Nomor bukti opsional sejak 2026-09-16. Jurnal tanpa nomor bukti TIDAK BISA
// bentrok (NULL tidak pernah sama dengan NULL), jadi pelanggaran unique di situ
// pasti berasal dari hal lain — menyebutnya "nomor bukti dobel" akan mengirim
// orang mencari masalah yang tidak ada.
describe('409 nomor bukti dilewati saat nomor buktinya kosong', () => {
  it('POST dan PATCH sama-sama menjaga syarat noBukti !== null', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      expect(body, m).toContain("isUniqueViolation(e) && check.value.noBukti !== null")
    }
  })

  it('kegagalan tulis lain tetap jatuh ke helper bersama', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      expect(handler(src, m), m).toContain('dbWriteErrorResponse(')
    }
  })
})
