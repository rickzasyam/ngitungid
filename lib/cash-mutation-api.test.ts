import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas source route mutasi kas — pola sama dengan
// lib/purchase-api.test.ts dan lib/journals-api.test.ts.
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun: guard mana yang
// dipasang, urutan pemeriksaan, apakah jurnal benar-benar ikut di `db.batch`
// yang sama, dan apakah TIGA BATAS lintas-baris (§8.21) memang ditegakkan di
// server. Ketiganya tidak bisa jadi CHECK di Postgres, jadi satu-satunya yang
// menjaganya adalah kode di route — dan satu-satunya yang menjaga kode itu
// tetap ada adalah berkas ini.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LIST = read('app', 'api', 'cash-mutations', 'route.ts')
const DETAIL = read('app', 'api', 'cash-mutations', '[id]', 'route.ts')
const ALLOC = read('app', 'api', 'cash-mutations', '[id]', 'allocations', 'route.ts')
const ALLOC_DEL = read('app', 'api', 'cash-mutations', '[id]', 'allocations', '[allocId]', 'route.ts')
const IMPORT = read('app', 'api', 'cash-mutations', 'import', 'route.ts')
const QUERIES = read('lib', 'api', 'cash-mutation-queries.ts')
const LIST_JURNAL = read('app', 'api', 'journals', 'route.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

describe('gerbang — baca internal, tulis akunting (D45)', () => {
  it('GET daftar & detail memakai requireInternal', () => {
    expect(handler(LIST, 'GET')).toContain('requireInternal()')
    expect(handler(DETAIL, 'GET')).toContain('requireInternal()')
  })

  it('SETIAP jalur tulis memakai requireAkunting', () => {
    const tulis: [string, string, string][] = [
      ['POST mutasi', LIST, 'POST'],
      ['PATCH mutasi', DETAIL, 'PATCH'],
      ['DELETE mutasi', DETAIL, 'DELETE'],
      ['POST alokasi', ALLOC, 'POST'],
      ['DELETE alokasi', ALLOC_DEL, 'DELETE'],
      ['POST impor', IMPORT, 'POST'],
    ]
    for (const [nama, src, method] of tulis) {
      const body = handler(src, method)
      expect(body.includes('requireAkunting()'), nama).toBe(true)
      expect(body.includes('requireInternal()'), `${nama} tidak boleh cukup internal`).toBe(false)
    }
  })

  it('SETIAP route memeriksa kepemilikan klien', () => {
    for (const [nama, src] of [
      ['daftar', LIST],
      ['detail', DETAIL],
      ['alokasi', ALLOC],
      ['hapus alokasi', ALLOC_DEL],
      ['impor', IMPORT],
    ] as const) {
      expect(src.includes('canAccessClientData('), nama).toBe(true)
    }
  })

  it('kepemilikan diperiksa SEBELUM menulis, di setiap jalur tulis', () => {
    for (const [nama, src, method] of [
      ['POST mutasi', LIST, 'POST'],
      ['POST alokasi', ALLOC, 'POST'],
      ['POST impor', IMPORT, 'POST'],
    ] as const) {
      const body = handler(src, method)
      const cek = body.indexOf('canAccessClientData(')
      const tulis = body.indexOf('await db.batch(')
      expect(cek, nama).toBeGreaterThan(-1)
      expect(tulis, nama).toBeGreaterThan(-1)
      expect(cek, nama).toBeLessThan(tulis)
    }
  })
})

describe('akun kas datang dari penanda is_kas, bukan daftar hardcoded', () => {
  it('setiap jalur yang menerima akunKasId memanggil loadCashAccount', () => {
    for (const [nama, src] of [
      ['POST mutasi', LIST],
      ['PATCH mutasi', DETAIL],
      ['impor', IMPORT],
    ] as const) {
      expect(src.includes('loadCashAccount('), nama).toBe(true)
    }
  })

  it('loadCashAccount memakai resolveIsKas — eksplisit ?? turunan (E2)', () => {
    expect(QUERIES).toContain('resolveIsKas(row)')
    // Daftar akun kas di layar disaring dengan aturan yang sama (?kas=1), jadi
    // apa pun yang lolos ke route tanpa penanda itu datang dari luar layar.
    expect(QUERIES).not.toContain("kode === '1-1")
  })

  it('akun lawan BEBAS — tidak dibatasi tipe, hanya wajib milik klien', () => {
    expect(QUERIES).toContain('assertAccountBelongsToClient')
    expect(LIST).toContain('assertAccountBelongsToClient(check.value.akunLawanId')
  })
})

describe('tiga batas lintas-baris ditegakkan di route (P15, §8.21)', () => {
  const body = handler(ALLOC, 'POST')

  it('batas 1 — Σ alokasi ≤ nominal mutasi', () => {
    expect(body).toContain('allocationRemaining(mutation, alokasiLama)')
    expect(body).toContain('nominalMinor > sisaMutasiMinor')
  })

  it('batas 2 — Σ alokasi ≤ sisa invoice', () => {
    expect(body).toContain('invoice.sisaMinor')
    expect(body).toContain('nominalMinor > invoice.sisaMinor')
  })

  it('batas 3 — terminUrutan ≤ jumlah_termin invoice (D40)', () => {
    expect(body).toContain('terminUrutan > invoice.jumlahTermin')
  })

  it('ketiganya diperiksa SEBELUM db.batch', () => {
    const batch = body.indexOf('await db.batch(')
    for (const jejak of ['nominalMinor > sisaMutasiMinor', 'nominalMinor > invoice.sisaMinor', 'terminUrutan > invoice.jumlahTermin']) {
      expect(body.indexOf(jejak), jejak).toBeLessThan(batch)
    }
  })

  it('sisa invoice DITURUNKAN dari alokasi, bukan kolom tersimpan (D37)', () => {
    expect(QUERIES).toContain('sisaMinor: totalMinor - teralokasiMinor')
    expect(QUERIES).not.toContain('purchaseInvoices.sisa')
  })

  it('terminUrutan KOSONG = FIFO — bukan dipaksa terisi (D40)', () => {
    expect(body).toContain('let terminUrutan: number | null = null')
  })
})

describe('jurnal mutasi — satu pembangun, satu batch', () => {
  it('ketiga jalur yang mengubah keadaan memanggil syncMutationJournal', () => {
    for (const [nama, src] of [
      ['POST mutasi', LIST],
      ['PATCH mutasi', DETAIL],
      ['POST alokasi', ALLOC],
      ['DELETE alokasi', ALLOC_DEL],
    ] as const) {
      expect(src.includes('syncMutationJournal('), nama).toBe(true)
    }
  })

  it('statement jurnal MASUK ke batch yang sama, bukan ditulis terpisah', () => {
    for (const [nama, src, method] of [
      ['POST mutasi', LIST, 'POST'],
      ['PATCH mutasi', DETAIL, 'PATCH'],
      ['POST alokasi', ALLOC, 'POST'],
      ['DELETE alokasi', ALLOC_DEL, 'DELETE'],
    ] as const) {
      const b = handler(src, method)
      expect(b.includes('...jurnal.statements'), nama).toBe(true)
      expect(b.includes('await db.batch('), nama).toBe(true)
    }
  })

  it('syncMutationJournal TIDAK menulis sendiri — ia menyusun statement (P10)', () => {
    const mulai = QUERIES.indexOf('export async function syncMutationJournal')
    const blok = QUERIES.slice(mulai)
    expect(mulai).toBeGreaterThan(-1)
    expect(blok).not.toContain('await db.batch(')
    expect(blok).not.toContain('await db.insert(')
  })

  it('jurnal dari alokasi memakai akun hutang MILIK INVOICE (snapshot D30)', () => {
    // Membaca ulang dari supplier akan men-DEBIT akun yang berbeda dari yang
    // di-KREDIT invoicenya; selisihnya mengendap permanen di dua akun.
    expect(QUERIES).toContain('akunHutangId: purchaseInvoices.akunHutangId')
    expect(QUERIES).not.toContain('masterSupplier.akunHutangDefaultId')
  })

  it('jurnalnya lahir DRAF dan bersumber mutasi_kas', () => {
    expect(QUERIES).toContain("sumber: 'mutasi_kas'")
    // Tidak ada status yang disetel eksplisit: bawaannya draft (D31).
    expect(QUERIES).not.toContain("status: 'posted'")
  })

  it('no_bukti jurnal otomatis NULL — kolomnya unik per klien', () => {
    expect(QUERIES).toContain('noBukti: null')
  })

  it('jurnal TERPOSTING menolak dibangun ulang, dengan 409', () => {
    const mulai = QUERIES.indexOf('export async function syncMutationJournal')
    const blok = QUERIES.slice(mulai)
    expect(blok).toContain("jurnalLama.status === 'posted'")
    expect(blok).toContain('status: 409')
  })

  it('mutasi tanpa alokasi DAN tanpa akun lawan tidak punya jurnal', () => {
    const mulai = QUERIES.indexOf('export async function syncMutationJournal')
    const blok = QUERIES.slice(mulai)
    expect(blok).toContain('if (lines.length === 0)')
    // Jurnal lama ikut dihapus beserta riwayatnya — bukan ditinggal menggantung.
    expect(blok).toContain("purgeAuditEvents('journal'")
  })
})

describe('penghapusan mutasi', () => {
  const body = handler(DETAIL, 'DELETE')

  it('jurnal DAN riwayatnya dihapus di batch yang sama', () => {
    const batch = body.indexOf('await db.batch(')
    expect(body.indexOf('db.delete(journalEntries)')).toBeLessThan(batch)
    expect(body.indexOf("purgeAuditEvents('journal'")).toBeLessThan(batch)
    expect(body.indexOf("purgeAuditEvents('cash_mutation'")).toBeLessThan(batch)
  })

  it('riwayat mutasi IKUT MATI — mutasi bukan pengecualian riwayat abadi', () => {
    // lib/audit.ts hanya menyebut 'purchase_invoice' sebagai pengecualian.
    // Menambah pengecualian kedua tanpa menuliskannya di sana membuat aturan
    // umumnya berhenti benar.
    const AUDIT = read('lib', 'audit.ts')
    expect(AUDIT).toContain("RIWAYAT_ABADI: readonly AuditEntityType[] = ['purchase_invoice']")
    expect(body).not.toContain("event: 'deleted'")
  })

  it('jurnal TERPOSTING menahan penghapusan (409)', () => {
    expect(body).toContain("jurnal?.status === 'posted'")
    expect(body).toContain('status: 409')
  })
})

describe('PATCH mutasi — nominal tidak boleh bergeser di bawah alokasinya', () => {
  const body = handler(DETAIL, 'PATCH')

  it('mutasi beralokasi menolak perubahan nominal & akun kas', () => {
    expect(body).toContain('alokasi.length > 0')
    expect(body).toContain('status: 409')
  })

  it('perubahan yang sah tetap menulis riwayat ber-nilai sebelum & sesudah', () => {
    expect(body).toContain('nilaiSebelum: sebelum')
    expect(body).toContain('nilaiSesudah:')
    const batch = body.indexOf('await db.batch(')
    expect(body.indexOf('snapshotMutation(id)')).toBeLessThan(batch)
  })
})

describe('impor CSV', () => {
  const body = handler(IMPORT, 'POST')

  it('dryRun adalah FLAG di route yang sama, bukan endpoint terpisah', () => {
    expect(body).toContain("form.get('dryRun') === '1'")
    expect(body).toContain('if (dryRun)')
  })

  it('duplikat = PERINGATAN, tidak pernah menolak (D38)', () => {
    expect(body).toContain('duplikatDiDatabase')
    expect(body).toContain('duplikatDiBerkas')
    expect(body).toContain('dugaanDuplikat')
    // Tidak ada SATU PUN penolakan di jalur impor yang menyebut duplikat —
    // diperiksa dengan membaca tiap pesan galat, bukan sekadar mencari katanya
    // (kata itu memang muncul, di penanda dan di ringkasan).
    const pesanGalat = [...body.matchAll(/error: '([^']*)'/g)].map(m => m[1])
    expect(pesanGalat.length).toBeGreaterThan(0)
    for (const p of pesanGalat) {
      expect(p.toLowerCase().includes('duplikat'), p).toBe(false)
    }
    // Duplikat juga tidak boleh jadi 409: seluruh penolakan di route ini soal
    // berkas atau pemetaan, bukan soal isinya yang mirip.
    expect(body).not.toContain('status: 409')
  })

  it('MVP CSV saja — tidak menyentuh xlsx maupun pdf (N3)', () => {
    expect(body).not.toContain('XLSX')
    expect(body).not.toContain('xlsx')
  })

  it('impor TIDAK membuat jurnal — barisnya masuk "belum dijurnal"', () => {
    expect(body).not.toContain('syncMutationJournal')
    expect(body).not.toContain('journalEntries')
  })

  it('pemetaan manual didukung, dan tanggal wajib dipetakan', () => {
    expect(body).toContain("form.get('mapping')")
    expect(body).toContain('manual.tanggal === undefined')
  })

  it('header tak dikenali → layar pemetaan, BUKAN galat buntu', () => {
    expect(body).toContain('butuhPemetaan: true')
    expect(body).toContain('contoh: parsed.rows.slice(0, 10)')
  })

  it('pemisah boleh ditentukan, dan nilainya dibatasi daftar', () => {
    expect(body).toContain("form.get('pemisah')")
    expect(body).toContain('PEMISAH_SAH.includes(pemisahRaw)')
  })

  it('berkas MM/DD/YYYY DITOLAK seluruhnya, bukan dibaca separuh', () => {
    expect(body).toContain('deteksiTanggalMMDD(selTanggal)')
    expect(body).toContain('MM/DD/YYYY')
    // Diperiksa SEBELUM mapRows: kalau sesudahnya, sebagian baris sudah
    // terbaca dengan hari dan bulan tertukar.
    expect(body.indexOf('deteksiTanggalMMDD(')).toBeLessThan(body.indexOf('mapRows({'))
  })

  it('penolakannya menyebut baris buktinya, bukan sekadar "format salah"', () => {
    expect(body).toContain('mmdd.contoh.map')
  })

  it('duplikat dicari per (klien, akun kas) — bukan lintas rekening', () => {
    // Nominal & tanggal yang sama di dua rekening berbeda adalah dua transaksi
    // berbeda; menandainya duplikat melatih orang mengabaikan peringatan.
    expect(body).toContain('eq(cashMutations.akunKasId, akunKasId)')
  })
})

describe('bentuk respons daftar', () => {
  it('sisa & status DITURUNKAN di query, tidak dibaca dari kolom', () => {
    expect(QUERIES).toContain('mutationStatus(r, alokasiSemu)')
    expect(QUERIES).toContain('allocationRemaining(r, alokasiSemu)')
    expect(QUERIES).not.toContain('cashMutations.status')
    expect(QUERIES).not.toContain('cashMutations.sisa')
  })

  it('Σ alokasi dijumlahkan di Postgres sebagai text, bukan float JS (P1)', () => {
    expect(QUERIES).toContain('::numeric(18,2)::text')
  })
})


// ══ UI /mutasi-kas (N6) ══════════════════════════════════════════════════
// Struktural, bukan render: yang dijaga adalah janji-janji yang mudah hilang
// dalam satu polish pass — angka yang tidak dihitung ulang di browser, status
// "belum dijurnal" yang menonjol, dan tautan D32 yang tidak di-hardcode.
describe('halaman /mutasi-kas', () => {
  const PAGE = read('app', 'mutasi-kas', 'page.tsx')
  const PANEL = read('components', 'mutasi-kas', 'allocation-panel.tsx')
  const WIZARD = read('components', 'mutasi-kas', 'import-wizard.tsx')
  const JURNAL = read('app', 'jurnal', 'page.tsx')

  it('daftar akun kas datang dari ?kas=1, bukan disaring di browser', () => {
    // Penanda kas adalah aturan server (eksplisit ?? turunan). Menyalinnya ke
    // browser berarti dua definisi "akun kas" yang bisa menyimpang.
    expect(PAGE).toContain('/coa?kas=1')
  })

  it('sisa & status DIPAKAI apa adanya dari server, tidak dihitung ulang', () => {
    expect(PAGE).toContain('r.sisa')
    expect(PAGE).toContain('r.status')
    // Tidak ada penjumlahan alokasi di halaman ini.
    expect(PAGE).not.toContain('allocationRemaining(')
    expect(PAGE).not.toContain('mutationStatus(')
  })

  it('"belum dijurnal" memakai warna KRITIS, bukan abu-abu netral', () => {
    // Permintaan eksplisit Ricko: baris yang belum dijurnal tidak boleh
    // terlihat sama dengan yang sudah selesai.
    const i = PAGE.indexOf("'belum dijurnal'")
    expect(i).toBeGreaterThan(-1)
    expect(PAGE.slice(i, i + 200)).toContain('--color-accent-critical')
  })

  it('jumlah baris "belum dijurnal" ikut tampil di header', () => {
    expect(PAGE).toContain("r.status === 'belum dijurnal'")
  })

  it('panel alokasi menampilkan sisa TANPA disembunyikan di balik penutup', () => {
    expect(PANEL).toContain('Belum dialokasikan')
    // Sisa negatif ditampilkan apa adanya — tidak dikepit Math.max.
    expect(PANEL).not.toContain('Math.max(0')
    expect(PANEL).toContain('sisaAngka < 0')
  })

  it('pemilih cicilan bawaannya Otomatis (FIFO), dan penimpaan diberi tanda', () => {
    expect(PANEL).toContain('Otomatis (FIFO)')
    expect(PANEL).toContain('terminUrutan === null')
    expect(PANEL).toContain('Dipaku manual')
  })

  it('wizard impor: pratinjau dulu, commit terkunci sampai ada pratinjau', () => {
    expect(WIZARD).toContain("fd.append('dryRun', '1')")
    expect(WIZARD).toContain('disabled={!file || busy || !pratinjau}')
  })

  it('pratinjau memperingatkan agar arah beberapa baris pertama diperiksa', () => {
    // Arah yang terbalik tidak pernah menimbulkan galat — satu-satunya saat ia
    // murah diperbaiki adalah di layar ini, sebelum barisnya tersimpan.
    expect(WIZARD).toContain('Periksa arah beberapa baris pertama')
    expect(WIZARD).toContain('tidak menimbulkan galat')
  })

  it('wizard impor menandai duplikat DAN mengatakan ia tetap tersimpan (D38)', () => {
    expect(WIZARD).toContain('duplikatDiDatabase')
    expect(WIZARD).toContain('tetap akan tersimpan')
  })

  it('tautan "Koreksi di …" memakai satu sumber, bukan path yang di-hardcode', () => {
    expect(JURNAL).toContain('sumberDokumenHref(r.sumber, r.sumberDokumenId)')
    // Bentuk lamanya akan menunjuk halaman pembelian dengan id mutasi.
    expect(JURNAL).not.toContain('/pembelian?invoice=${')
  })

  it('dokumen asal dicari di KEDUA tabel, bukan hanya invoice', () => {
    expect(LIST_JURNAL).toContain('from purchase_invoices pi')
    expect(LIST_JURNAL).toContain('from cash_mutations cm')
  })
})
