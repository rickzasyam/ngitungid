import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas route buku besar — pola sama dengan lib/journals-api.test.ts.
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun, dan dua di
// antaranya mahal kalau lolos:
//   1. Saringan `status = 'posted'`. Kalau lepas, saldo di layar memuat jurnal
//      draf yang masih disunting seseorang — angka yang sudah diserahkan ke
//      klien berubah tanpa ada yang menyentuhnya.
//   2. Gerbang requireAkunting. Halaman /buku-besar staffOnly; API yang lebih
//      longgar membuat gerbang halaman itu jadi kosmetik.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LEDGER = read('app', 'api', 'ledger', 'route.ts')
const SUMMARY = read('app', 'api', 'ledger', 'summary', 'route.ts')
const QUERIES = read('lib', 'api', 'ledger-queries.ts')
const HALAMAN = read('app', 'buku-besar', 'page.tsx')

const SEMUA_ROUTE = [
  [LEDGER, 'buku besar'],
  [SUMMARY, 'neraca saldo'],
] as const

describe('gerbang buku besar', () => {
  it('keduanya requireAkunting — keputusan Ricko 2026-09-18, menyimpang dari MP', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      expect(src, nama).toContain('await requireAkunting()')
      expect(src, nama).not.toContain('requireUser()')
    }
  })

  it('batas antar-klien dinyatakan eksplisit di dua-duanya', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      expect(src, nama).toContain('canAccessClientData(')
    }
  })

  it('pemeriksaan akses mendahului query data', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      const cek = src.indexOf('canAccessClientData(')
      const ambil = src.indexOf('loadPostedLines(')
      expect(cek, nama).toBeGreaterThan(-1)
      expect(ambil, nama).toBeGreaterThan(-1)
      expect(cek, nama).toBeLessThan(ambil)
    }
  })

  it('akun dicari DENGAN clientId, bukan dicari lalu dibandingkan', () => {
    // Dibandingkan sesudahnya, "akun klien lain" dan "akun tidak ada" jadi dua
    // jawaban berbeda — dan selisihnya memberi tahu penebak bahwa id itu nyata.
    expect(QUERIES).toContain('eq(masterCoa.clientId, clientId), eq(masterCoa.id, masterCoaId)')
  })
})

// ══ PENJAGA BERDIRI: BUKU BESAR HANYA BERISI JURNAL TERPOSTING ═══════════
describe('hanya baris terposting yang masuk buku besar', () => {
  it('saringan posted ada di modul query', () => {
    expect(QUERIES).toContain("eq(journalEntries.status, 'posted')")
  })

  it('saringannya SATU tempat — route tidak menyusun query barisnya sendiri', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      expect(src, nama).not.toContain('.from(journalLines)')
      expect(src, nama).toContain('loadPostedLines(')
    }
  })

  it('tidak ada jalur yang meminta status selain posted', () => {
    expect(QUERIES).not.toContain("'draft'")
  })
})

describe('buku besar tidak menulis apa pun', () => {
  it('tanpa insert, update, delete, maupun batch', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      for (const needle of ['db.insert(', 'db.update(', 'db.delete(', 'db.batch(']) {
        expect(src, nama + ' ' + needle).not.toContain(needle)
      }
    }
    for (const needle of ['db.insert(', 'db.update(', 'db.delete(']) {
      expect(QUERIES, needle).not.toContain(needle)
    }
  })
})

describe('urutan & saldo datang dari mesin murni, bukan dari SQL', () => {
  it('route memakai computeRunningBalance / summarizeByAccount', () => {
    expect(LEDGER).toContain('computeRunningBalance(')
    expect(SUMMARY).toContain('summarizeByAccount(')
  })

  // Keputusan Ricko 2026-09-24: urutan diterapkan SAMA PERSIS di SQL dan di
  // lib/ledger.ts. Sebelumnya query sengaja tanpa ORDER BY (urutan hanya di
  // compareLedgerLines); sekarang keduanya ada, jadi yang dijaga adalah bahwa
  // mereka tidak pernah berbeda — kunci demi kunci, dalam urutan yang sama.
  it('ORDER BY query = URUTAN_BUKU_BESAR, kunci demi kunci', async () => {
    const { URUTAN_BUKU_BESAR } = await import('./ledger')
    const KOLOM: Record<(typeof URUTAN_BUKU_BESAR)[number], string> = {
      tanggal: 'asc(journalEntries.tanggal)',
      journalCreatedAt: 'asc(journalEntries.createdAt)',
      journalId: 'asc(journalEntries.id)',
      lineOrder: 'asc(journalLines.lineOrder)',
      id: 'asc(journalLines.id)',
    }
    const potong = QUERIES.slice(QUERIES.indexOf('export async function loadPostedLines'))
    const awal = potong.indexOf('.orderBy(')
    expect(awal, 'loadPostedLines wajib punya ORDER BY').toBeGreaterThan(-1)
    const isi = potong.slice(awal + '.orderBy('.length, potong.indexOf('\n    )', awal))
    const kunci = isi
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    expect(kunci).toEqual(URUTAN_BUKU_BESAR.map(k => KOLOM[k]))
  })

  it('journalCreatedAt diambil sebagai teks UTC lebar tetap sampai mikrodetik', () => {
    // Urutan string di JS harus sama dengan urutan timestamptz di SQL: zona
    // waktu tetap (UTC) dan presisi penuh (US = mikrodetik), bukan Date.
    expect(QUERIES).toContain(`at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`)
    expect(QUERIES).toContain('journalCreatedAt: sql<string>')
  })

  it('saldo awal dipisah dengan perbandingan STRING tanggal, tanpa objek Date', () => {
    expect(LEDGER).toContain('l.tanggal < periodStart')
    expect(LEDGER).toContain('l.tanggal >= periodStart')
    expect(LEDGER).not.toContain('new Date(')
  })
})

describe('uang tetap sen sampai ujung', () => {
  it('konversi ke desimal hanya lewat fromMinorUnits', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      expect(src, nama).toContain('fromMinorUnits(')
      expect(src, nama).not.toContain('toFixed(')
      expect(src, nama).not.toContain('Number(')
    }
  })

  it('debit/kredit dilewatkan apa adanya — sudah string dari driver', () => {
    expect(LEDGER).toContain('debit: r.debit')
    expect(LEDGER).toContain('kredit: r.kredit')
  })

  it('total neraca saldo dijumlahkan dari baris yang DITAMPILKAN, bukan query kedua', () => {
    // Dua sumber untuk angka yang seharusnya sama persis adalah cara paling
    // mudah membuat total tidak cocok dengan rinciannya.
    expect(SUMMARY).toContain('for (const r of ringkasan)')
    expect(SUMMARY).toContain('totalDebit === totalKredit')
  })
})

describe('validasi parameter', () => {
  it('tanggal lewat isValidYmd, bukan konstruktor Date', () => {
    for (const [src, nama] of SEMUA_ROUTE) {
      expect(src, nama).toContain('isValidYmd(')
    }
  })

  it('buku besar menolak periode terbalik', () => {
    expect(LEDGER).toContain('periodEnd < periodStart')
  })

  it('neraca saldo memang tidak punya periodStart — ia keadaan satu tanggal', () => {
    // Needle-nya pembacaan parameternya, bukan katanya: kata 'periodStart'
    // muncul di komentar yang menjelaskan kenapa justru TIDAK ada.
    expect(SUMMARY).not.toContain("searchParams.get('periodStart')")
  })
})

// ══ PENJAGA BERDIRI: HALAMAN TIDAK MENGHITUNG SALDO ══════════════════════
// Saldo datang JADI dari server, dihitung di sen bulat oleh lib/ledger.ts. Dua
// tempat yang menghitung saldo berarti dua jawaban yang bisa berbeda — dan yang
// di layar yang akan dipercaya orang.
describe('halaman /buku-besar menampilkan, tidak menghitung', () => {
  it('tidak menjumlahkan debit/kredit sendiri', () => {
    for (const needle of ['reduce(', 'computeRunningBalance(', 'summarizeByAccount(']) {
      expect(HALAMAN, needle).not.toContain(needle)
    }
  })

  it('tidak memakai objek Date untuk tanggal kalender', () => {
    // Satu-satunya `new Date` yang sah adalah penentu akhir bulan di
    // bulanBerjalan(), pola yang sama dengan /jurnal.
    expect((HALAMAN.match(/new Date\(/g) ?? []).length).toBe(1)
    expect(HALAMAN).toContain('new Date(y, m, 0).getDate()')
  })

  it('memakai fmtTanggal bersama, bukan pemformat tanggal sendiri', () => {
    expect(HALAMAN).toContain('fmtTanggal(')
    expect(HALAMAN).not.toContain('toLocaleDateString(')
  })

  it('saldo awal SELALU dirender, termasuk saat nol', () => {
    // Baris yang hilang saat nol membuat "memang nol" tidak bisa dibedakan
    // dari "belum dihitung".
    expect(HALAMAN).toContain('Saldo awal per')
    expect(HALAMAN).not.toContain('Number(ledger.opening) !== 0 &&')
  })
})
