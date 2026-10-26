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
const POSTING = read('app', 'api', 'journals', '[id]', 'post', 'route.ts')
const REVERSE = read('app', 'api', 'journals', '[id]', 'reverse', 'route.ts')
const AUDIT = read('lib', 'api', 'audit.ts')

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
    // Perbandingan status lokal akan menduplikasi aturan yang hidup di
    // lib/journal.ts — dan duplikat itulah yang menyimpang diam-diam saat
    // aturannya berubah (D42 menambah tiga syarat sekaligus).
    expect(DETAIL).not.toContain("status === 'draft'")
    expect(DETAIL).not.toContain("status === 'posted'")
  })

  it('SETIAP penolakan di assertEditable 409, bukan 403 atau 400', () => {
    // Bentuk lamanya memotong 600 karakter pertama; sejak assertEditable punya
    // beberapa cabang penolakan (D32, kunci periode, sudah dibalik, sakelar
    // D42), potongan itu berhenti sebelum sebagian cabangnya. Sekarang SETIAP
    // respons di dalam fungsi itu diperiksa.
    const mulai = DETAIL.indexOf('async function assertEditable')
    expect(mulai).toBeGreaterThan(-1)
    const blok = DETAIL.slice(mulai, DETAIL.indexOf('export async function GET('))
    const status = [...blok.matchAll(/\{ status: (\d{3}) \}/g)].map(m => m[1])
    expect(status.length).toBeGreaterThanOrEqual(3)
    expect([...new Set(status)]).toEqual(['409'])
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

// ══════════════════════════════════════════════════════════════════════════
// FASE 2 — posting, jurnal balik, riwayat
// ══════════════════════════════════════════════════════════════════════════

describe('gerbang route posting & pembalikan', () => {
  it('keduanya requireAkunting, bukan requireUser', () => {
    for (const [src, nama] of [
      [POSTING, 'post'],
      [REVERSE, 'reverse'],
    ] as const) {
      expect(handler(src, 'POST'), nama).toContain('await requireAkunting()')
      expect(src, nama).not.toContain('requireUser()')
    }
  })

  it('batas antar-klien dinyatakan, dan SESUDAH barisnya dibaca', () => {
    for (const [src, nama] of [
      [POSTING, 'post'],
      [REVERSE, 'reverse'],
    ] as const) {
      const body = handler(src, 'POST')
      const ambil = body.indexOf('loadJournalHeaderForWrite(')
      const cek = body.indexOf('canAccessClientData(')
      expect(ambil, nama).toBeGreaterThan(-1)
      expect(cek, nama).toBeGreaterThan(-1)
      expect(ambil, nama).toBeLessThan(cek)
    }
  })

  it('clientId diambil dari barisnya, tidak pernah dari body atau query', () => {
    expect(POSTING).not.toContain('raw.clientId')
    expect(REVERSE).not.toContain('raw.clientId')
    expect(POSTING).toContain('header.clientId')
    expect(REVERSE).toContain('asli.clientId')
  })
})

describe('predikat pembukuan ditegakkan di server, bukan di layar', () => {
  it('posting memanggil canPost sebelum db.batch', () => {
    const body = handler(POSTING, 'POST')
    const cek = body.indexOf('canPost(')
    const tulis = body.indexOf('db.batch(')
    expect(cek).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(tulis)
  })

  it('pembalikan memanggil canReverse sebelum menyentuh apa pun', () => {
    const body = handler(REVERSE, 'POST')
    const cek = body.indexOf('canReverse(')
    const tulis = body.indexOf('db.batch(')
    expect(cek).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(tulis)
  })

  it('gagal predikat = 409 dengan ALASANNYA, bukan pesan generik', () => {
    for (const [src, nama] of [
      [POSTING, 'post'],
      [REVERSE, 'reverse'],
    ] as const) {
      const body = handler(src, 'POST')
      expect(body, nama).toContain('verdict.reason')
      expect(body, nama).toContain('status: 409')
    }
  })

  // canPost menerima isLocked sebagai parameter supaya modulnya tetap murni.
  // Fase 2 mengopernya dari SATU tempat (lib/api/period-lock.ts) — §7.B cukup
  // mengganti isi berkas itu. Kalau route menuliskan `() => false` sendiri,
  // §7.B harus menemukan setiap tempat yang menuliskannya, dan yang terlewat
  // meloloskan posting ke periode terkunci tanpa galat.
  it('isLocked datang dari periodLockChecker, bukan ditulis ulang di route', () => {
    expect(POSTING).toContain('periodLockChecker(')
    expect(POSTING).not.toContain('() => false')
  })

  it('pembalik memakai buildReversalLines, bukan menukar D/K sendiri', () => {
    expect(REVERSE).toContain('buildReversalLines(')
  })

  it('pembalik tetap lewat validateJournalInput — tidak ada jalur tulis khusus', () => {
    const body = handler(REVERSE, 'POST')
    const validasi = body.indexOf('validateJournalInput(')
    const tulis = body.indexOf('db.batch(')
    expect(validasi).toBeGreaterThan(-1)
    expect(validasi).toBeLessThan(tulis)
  })

  it('pembalik lahir sebagai DRAF, bukan langsung terposting', () => {
    const body = handler(REVERSE, 'POST')
    expect(body).toContain('reversalOfId: id')
    expect(body).not.toContain("status: 'posted'")
  })

  // Antara pembacaan header dan UPDATE, permintaan lain bisa sudah memposting
  // jurnal yang sama. Tanpa syarat ini yang kedua menimpa posted_by milik yang
  // pertama — pemosting sebenarnya hilang dari satu-satunya catatan yang ada.
  it('UPDATE posting menyaring status draft di WHERE, bukan cuma di predikat', () => {
    const body = handler(POSTING, 'POST')
    expect(body).toContain("eq(journalEntries.status, 'draft')")
    expect(body).toContain('.returning(')
  })
})

describe('riwayat ditulis DI DALAM batch yang sama (P10)', () => {
  const potongStatements = (body: string): string => {
    const mulai = body.indexOf('const statements')
    expect(mulai, 'array statements ada').toBeGreaterThan(-1)
    const batch = body.indexOf('db.batch(', mulai)
    return body.slice(mulai, batch)
  }

  it('POST, PATCH, posting, dan pembalikan semuanya menulis event', () => {
    for (const [src, m, nama] of [
      [LIST, 'POST', 'buat'],
      [DETAIL, 'PATCH', 'ubah'],
      [POSTING, 'POST', 'posting'],
      [REVERSE, 'POST', 'balik'],
    ] as const) {
      expect(potongStatements(handler(src, m)), nama).toContain('recordJournalEvent(')
    }
  })

  it('pembalikan menulis DUA event: pada pembalik baru DAN pada jurnal aslinya', () => {
    const statements = potongStatements(handler(REVERSE, 'POST'))
    expect((statements.match(/recordJournalEvent\(/g) ?? []).length).toBe(2)
    expect(statements).toContain("event: 'created'")
    expect(statements).toContain("event: 'reversal_created'")
  })

  it('tidak ada route jurnal yang menulis event di luar batch', () => {
    // `await recordJournalEvent(...)` akan MENJALANKAN query-nya sendiri
    // (pembangun drizzle bersifat thenable), di transaksi yang berbeda dari
    // perubahan yang diriwayatkannya.
    for (const [src, nama] of [
      [LIST, 'daftar'],
      [DETAIL, 'detail'],
      [POSTING, 'posting'],
      [REVERSE, 'balik'],
    ] as const) {
      expect(src, nama).not.toContain('await recordJournalEvent(')
      expect(src, nama).not.toContain('await purgeAuditEvents(')
      expect(src, nama).not.toContain('db.insert(auditEvents)')
    }
  })

  it('audit_events append-only: tidak ada UPDATE di mana pun', () => {
    for (const src of [LIST, DETAIL, POSTING, REVERSE, AUDIT]) {
      expect(src).not.toContain('update(auditEvents)')
    }
  })
})

// ══ PENJAGA BERDIRI: HAPUS JURNAL = HAPUS RIWAYATNYA, SATU TRANSAKSI ══════
// audit_events.entity_id polimorfik → tidak punya FK → Postgres TIDAK akan
// meng-cascade apa pun. Kewajiban ini yang menggantikannya, dan ia hanya hidup
// di kode. Kalau purge-nya dilepas dari batch (atau hilang), tidak ada satu pun
// batasan database yang akan mengeluh — yang tertinggal adalah riwayat yang
// menunjuk jurnal yang sudah tidak ada.
describe('penghapusan jurnal ikut menghapus riwayatnya', () => {
  const DEL = handler(DETAIL, 'DELETE')

  it('purgeAuditEvents dipanggil di handler DELETE', () => {
    expect(DEL).toContain("purgeAuditEvents('journal'")
  })

  it('purge dan penghapusan jurnal berada di ARRAY statements yang sama', () => {
    // Dipotong sampai KURUNG TUTUP arraynya, bukan sampai db.batch — kalau
    // batasnya db.batch, purge yang sudah dipindah keluar array (tapi masih di
    // atas batch) akan tetap lolos, dan penjaga ini berhenti menjaga tanpa
    // terlihat rusak.
    const mulai = DEL.indexOf('const statements')
    const tutup = DEL.indexOf('\n  ]', mulai)
    expect(mulai).toBeGreaterThan(-1)
    expect(tutup).toBeGreaterThan(mulai)
    const statements = DEL.slice(mulai, tutup)
    expect(statements).toContain('purgeAuditEvents(')
    expect(statements).toContain('db.delete(journalEntries)')
  })

  it('TIDAK ADA tulis mandiri di DELETE — semuanya lewat db.batch', () => {
    // Bentuk inilah yang merah kalau purge-nya dipindah keluar transaksi:
    // memindahkannya berarti menulis `await db.delete(...)` atau
    // `await purgeAuditEvents(...)` berdiri sendiri.
    expect(DEL.match(/await db\.(insert|update|delete)\(/g)).toBeNull()
    expect(DEL).not.toContain('await purgeAuditEvents(')
    expect(DEL).toContain('await db.batch(')
  })

  it('purge hanya boleh lahir dari helper bersama, bukan delete langsung', () => {
    // Satu-satunya DELETE yang sah atas tabel append-only ini ada di lib/api/audit.ts.
    expect(DETAIL).not.toContain('delete(auditEvents)')
    expect(AUDIT).toContain('.delete(auditEvents)')
  })

  it('helper purge menyaring entity_type DAN entity_id, bukan salah satunya', () => {
    // Menyaring entity_id saja akan menghapus event entitas lain yang kebetulan
    // ber-uuid sama — mustahil hari ini, tapi uuid bukan jaminan yang dinyatakan.
    expect(AUDIT).toContain('eq(auditEvents.entityType, entityType)')
    expect(AUDIT).toContain('eq(auditEvents.entityId, entityId)')
  })
})

describe('detail jurnal membawa riwayat & keterkaitan pembalik', () => {
  it('events disaring entity_type journal + entity_id jurnalnya', () => {
    expect(QUERIES).toContain("eq(auditEvents.entityType, 'journal')")
    expect(QUERIES).toContain('eq(auditEvents.entityId, journalId)')
  })

  it('nama pelaku lewat leftJoin — riwayat tidak hilang saat usernya dihapus', () => {
    expect(QUERIES).toContain('.leftJoin(users, eq(auditEvents.userId, users.id))')
  })

  it('"sudah dibalik" DITURUNKAN dari pembalik terposting, tidak disimpan (P3)', () => {
    expect(QUERIES).toContain("reversals.find(r => r.status === 'posted')")
    expect(SCHEMA_TIDAK_PUNYA_KOLOM_SUDAH_DIBALIK()).toBe(true)
  })

  it('pembalik yang masih draf tidak menghalangi pembalikan berikutnya', () => {
    expect(QUERIES).toContain("eq(journalEntries.status, 'posted')")
  })
})

function SCHEMA_TIDAK_PUNYA_KOLOM_SUDAH_DIBALIK(): boolean {
  const schema = read('lib', 'db', 'schema.ts')
  return !schema.includes('sudahDibalik') && !schema.includes('is_reversed')
}

// ══ D42 — TIGA MITIGASI, DIBANGUN BERSAMAAN (M8) ═════════════════════════
// Syarat Ricko: sakelar "posting bisa diedit" hanya boleh ada bersama ketiga
// mitigasinya. Test di bawah gagal kalau salah satunya dilepas — termasuk
// kalau sakelarnya dinyalakan tanpa nilai_sebelum/nilai_sesudah tertulis.
describe('D42 — sakelar posting dan ketiga mitigasinya', () => {
  const ASSERT = DETAIL.slice(
    DETAIL.indexOf('async function assertEditable'),
    DETAIL.indexOf('export async function GET(')
  )

  it('assertEditable membaca sakelar dari SETELAN KLIEN, bukan konstanta', () => {
    expect(ASSERT).toContain('loadAccountingSettings(row.clientId)')
    expect(ASSERT).toContain('bolehEditPosting(settings)')
  })

  it('D32 diperiksa PALING DULU — dokumen asal mengalahkan setelan apa pun', () => {
    const d32 = ASSERT.indexOf('isSumberModul(row.sumber)')
    const setelan = ASSERT.indexOf('loadAccountingSettings(')
    expect(d32).toBeGreaterThan(-1)
    expect(d32).toBeLessThan(setelan)
  })

  it('mitigasi (a) kunci periode: dibaca, dan urutannya di ATAS sakelar', () => {
    // Kalau sakelar diperiksa lebih dulu, klien yang menyalakannya bisa
    // mengubah periode yang sudah dikunci.
    const kunci = ASSERT.indexOf('periodLockChecker(')
    const izin = ASSERT.indexOf('bolehEditPosting(settings)')
    expect(kunci).toBeGreaterThan(-1)
    expect(kunci).toBeLessThan(izin)
    expect(ASSERT).toContain('isLocked: terkunci')
  })

  it('mitigasi (a) jurnal yang sudah dibalik tetap tidak bisa diubah', () => {
    expect(ASSERT).toContain('findPostedReversal(row.id)')
    expect(ASSERT).toContain('sudahDibalik,')
  })

  it('mitigasi (b) nilai_sebelum & nilai_sesudah ditulis untuk jurnal TERPOSTING', () => {
    const patch = handler(DETAIL, 'PATCH')
    expect(patch).toContain('nilaiSebelum')
    expect(patch).toContain('nilaiSesudah')
    // Snapshot diambil SEBELUM tulisannya masuk batch — sesudahnya ia sudah
    // berisi nilai baru dan riwayatnya mencatat dua nilai yang identik.
    const snap = patch.indexOf('nilaiSebelum')
    expect(snap).toBeLessThan(patch.indexOf('await db.batch('))
  })

  it('mitigasi (b) riwayatnya ditulis DI DALAM batch yang sama, bukan sesudahnya', () => {
    // Event-nya berupa STATEMENT di dalam array yang diserahkan ke db.batch —
    // bukan tulisan terpisah sesudahnya. Kalau ia dilepas dari batch, jurnal
    // bisa berubah tanpa riwayat saat tulisan kedua gagal, dan justru saat itu
    // riwayatnya paling dibutuhkan (P10).
    const patch = handler(DETAIL, 'PATCH')
    const arr = patch.indexOf("const statements: BatchItem<'pg'>[] = [")
    const batch = patch.indexOf('await db.batch(')
    const event = patch.indexOf('recordJournalEvent(')
    expect(arr).toBeGreaterThan(-1)
    expect(event).toBeGreaterThan(arr)
    expect(event).toBeLessThan(batch)
    expect(patch).toContain('db.batch(statements as')
  })

  it('helper riwayat memang menerima kedua nilai itu', () => {
    expect(AUDIT).toContain('nilaiSebelum')
    expect(AUDIT).toContain('nilaiSesudah')
  })

  it('mitigasi (c) lencana DITURUNKAN dari riwayat, tidak disimpan sebagai kolom', () => {
    const schema = read('lib', 'db', 'schema.ts')
    expect(schema).not.toContain('diubahSetelahPosting')
    expect(schema).not.toContain('diubah_setelah_posting')
  })

  it('detail jurnal menurunkan penandanya dari riwayat lewat predikat lib', () => {
    // Detail sudah memuat seluruh riwayatnya, jadi ia memakai predikat murni —
    // bukan query kedua yang bisa menjawab beda dari yang tampil di panelnya.
    expect(QUERIES).toContain('diubahSetelahPosting(events)')
  })

  it('mitigasi (c) daftar jurnal & buku besar sama-sama membawa penandanya', () => {
    const LEDGER = read('lib', 'api', 'ledger-queries.ts')
    for (const [nama, src] of [
      ['daftar jurnal', LIST],
      ['buku besar', LEDGER],
    ] as const) {
      expect(src.includes('diubahSetelahPosting'), nama).toBe(true)
      // "updated SESUDAH posted TERAKHIR" — bukan sekadar "pernah ada updated",
      // yang akan menyala untuk setiap draf yang pernah disunting.
      expect(src.includes("u.event = 'updated'"), nama).toBe(true)
      expect(src.includes("p.event = 'posted'"), nama).toBe(true)
      expect(src.includes('max(p.at)'), nama).toBe(true)
    }
  })
})

// ══ supplierId DI JALUR TULIS JURNAL (F1) ════════════════════════════════
describe('POST & PATCH jurnal menegakkan aturan supplier', () => {
  const JALUR = [
    ['POST', handler(LIST, 'POST')],
    ['PATCH', handler(DETAIL, 'PATCH')],
  ] as const

  it('tipe akun dibaca dan DIOPER ke validator — tanpa itu supplier diabaikan', () => {
    for (const [nama, body] of JALUR) {
      expect(body.includes('loadTipeAkunById('), nama).toBe(true)
      expect(body.includes('tipeAkunById,'), nama).toBe(true)
      // Dibaca SEBELUM validasi, karena validasinya bergantung padanya.
      expect(body.indexOf('loadTipeAkunById('), nama).toBeLessThan(body.indexOf('validateJournalInput('))
    }
  })

  it('supplier diperiksa milik klien yang sama, SEBELUM db.batch', () => {
    for (const [nama, body] of JALUR) {
      const cek = body.indexOf('assertSuppliersBelongToClient(')
      expect(cek, nama).toBeGreaterThan(-1)
      expect(cek, nama).toBeLessThan(body.indexOf('await db.batch('))
    }
  })

  it('supplierId benar-benar ikut TERSIMPAN di baris jurnal', () => {
    for (const [nama, body] of JALUR) {
      expect(body.includes('supplierId: l.supplierId ?? null'), nama).toBe(true)
    }
  })

  it('tipe akun memakai resolveAccountType — eksplisit ?? turunan (E2)', () => {
    expect(QUERIES).toContain('resolveAccountType(r)')
  })
})

// ══ supplierId TIDAK HILANG DI JALUR BACA & PEMBALIK (celah F1) ═════════
describe('supplierId bertahan melewati edit dan jurnal balik', () => {
  it('detail jurnal membawa supplierId — form edit tidak menghapusnya diam-diam', () => {
    // PATCH mengganti SELURUH baris. Detail tanpa supplierId berarti form edit
    // dibuka tanpa tanda supplier, lalu simpan menghapusnya.
    const mulai = QUERIES.indexOf('export async function loadJournalDetail')
    const blok = QUERIES.slice(mulai, QUERIES.indexOf('export async function', mulai + 10))
    expect(blok).toContain('supplierId: journalLines.supplierId')
    expect(blok).toContain('.leftJoin(masterSupplier, eq(journalLines.supplierId, masterSupplier.id))')
  })

  it('nilai baris (bahan pembalik & snapshot D42) membawa supplierId', () => {
    const mulai = QUERIES.indexOf('export async function loadJournalLineValues')
    const blok = QUERIES.slice(mulai, mulai + 900)
    expect(blok).toContain('supplierId: journalLines.supplierId')
  })

  it('pembalik MENCERMINKAN supplier dari baris asli, lalu menyimpannya', () => {
    const body = handler(REVERSE, 'POST')
    expect(body).toContain('supplierId: lines[i]?.supplierId ?? null')
    expect(body).toContain('barisPembalik.map(l => ({')
    expect(body).toContain('supplierId: l.supplierId,')
    // Yang disimpan adalah baris yang sudah dicerminkan, bukan keluaran
    // validator yang membuang supplierId.
    const insert = body.indexOf('db.insert(journalLines)')
    expect(body.slice(insert, insert + 120)).toContain('barisPembalik')
  })
})

describe('loadNasibJurnalModul — satu pembaca nasib jurnal modul', () => {
  const JQ = readFileSync(join(process.cwd(), 'lib', 'api', 'journal-queries.ts'), 'utf8')
  const muat = JQ.slice(JQ.indexOf('export async function loadNasibJurnalModul'))

  it('rantai pembalik dihitung lewat findPostedReversal — definisi canReverse', () => {
    const lapis = JQ.slice(JQ.indexOf('export async function lapisPembalik'), JQ.indexOf('export async function loadNasibJurnalModul'))
    expect(lapis).toContain('findPostedReversal(r.id)')
  })

  it('setelan klien dibaca lewat bolehEditPosting — ketiadaan baris = false (D42)', () => {
    expect(muat).toContain('bolehEditPosting(await loadAccountingSettings(clientId))')
    expect(muat).toContain('nasibJurnalModul(jurnal, {')
  })
})
