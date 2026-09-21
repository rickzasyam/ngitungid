import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas route invoice pembelian — pola sama dengan
// lib/journals-api.test.ts.
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun, dan tiga di
// antaranya mahal kalau lolos:
//
//   1. **Invoice dan jurnalnya satu db.batch.** Invoice tanpa jurnal berarti
//      pembelian yang tidak pernah masuk buku; jurnal tanpa invoice berarti
//      angka tanpa dokumen sumber. Tidak ada FK yang bisa menangkap keduanya
//      (journal_id memang nullable).
//   2. **Akun di-SNAPSHOT dari supplier & setelan, bukan dibaca ulang nanti.**
//      Kalau default supplier berubah setelah ada invoice, pembayaran akan
//      mendebit akun berbeda dari yang dikredit invoice — selisihnya mengendap
//      permanen tanpa satu pun galat.
//   3. **Supplier tanpa akun hutang ditolak dengan arahan, bukan ditebak.**
//
// Ditambah satu yang berbeda dari jurnal: riwayat penghapusan invoice sengaja
// TIDAK dipurge — brief meminta isi invoice sebelum dihapus ikut tersimpan.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LIST = read('app', 'api', 'purchase-invoices', 'route.ts')
const DETAIL = read('app', 'api', 'purchase-invoices', '[id]', 'route.ts')
const QUERIES = read('lib', 'api', 'purchase-queries.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

// ══ PENJAGA BERDIRI: GERBANG BACA vs TULIS (D45) ═════════════════════════
describe('gerbang invoice pembelian', () => {
  it('BACA requireInternal — finance boleh melihat, klien tidak', () => {
    expect(handler(LIST, 'GET')).toContain('await requireInternal()')
    expect(handler(DETAIL, 'GET')).toContain('await guard(params, false)')
  })

  it('TULIS requireAkunting — finance tidak boleh menulis', () => {
    expect(handler(LIST, 'POST')).toContain('await requireAkunting()')
    for (const m of ['PATCH', 'DELETE'] as const) {
      expect(handler(DETAIL, m), m).toContain('await guard(params, true)')
    }
  })

  it('helper guard() memilih gerbangnya dari parameter tulis', () => {
    const helper = DETAIL.slice(DETAIL.indexOf('async function guard('))
    expect(helper.slice(0, 400)).toContain('tulis ? await requireAkunting() : await requireInternal()')
  })

  it('TIDAK ADA requireUser di mana pun — klien tidak melihat modul ini', () => {
    expect(LIST).not.toContain('requireUser()')
    expect(DETAIL).not.toContain('requireUser()')
  })

  it('setiap handler digerbangi, diperiksa per badan handler', () => {
    for (const [src, m] of [
      [LIST, 'GET'],
      [LIST, 'POST'],
      [DETAIL, 'GET'],
      [DETAIL, 'PATCH'],
      [DETAIL, 'DELETE'],
    ] as const) {
      const body = handler(src, m)
      const langsung = body.includes('await requireAkunting()') || body.includes('await requireInternal()')
      const lewatHelper = body.includes('await guard(params,')
      expect(langsung || lewatHelper, m).toBe(true)
    }
  })

  it('batas antar-klien dinyatakan eksplisit', () => {
    expect(LIST).toContain('canAccessClientData(')
    expect(DETAIL).toContain('canAccessClientData(')
  })

  it('route detail mengambil baris DULU, baru memeriksa klien', () => {
    const helper = DETAIL.slice(DETAIL.indexOf('async function guard('))
    const ambil = helper.indexOf('loadInvoiceHeaderForWrite(')
    const cek = helper.indexOf('canAccessClientData(')
    expect(ambil).toBeGreaterThan(-1)
    expect(ambil).toBeLessThan(cek)
  })
})

describe('aturan pembelian ditegakkan di server', () => {
  it('POST dan PATCH sama-sama memanggil validatePurchaseInvoice', () => {
    expect(handler(LIST, 'POST')).toContain('validatePurchaseInvoice(')
    expect(handler(DETAIL, 'PATCH')).toContain('validatePurchaseInvoice(')
  })

  it('validasi terjadi SEBELUM db.batch', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      expect(body.indexOf('validatePurchaseInvoice('), m).toBeLessThan(body.indexOf('await db.batch('))
    }
  })

  it('setiap akun diperiksa milik klien yang sama sebelum menulis', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      const cek = body.indexOf('assertInvoiceAccountsBelongToClient(')
      expect(cek, m).toBeGreaterThan(-1)
      expect(cek, m).toBeLessThan(body.indexOf('await db.batch('))
    }
  })

  it('supplier diperiksa milik klien lewat query, bukan dibandingkan sesudahnya', () => {
    expect(QUERIES).toContain('eq(masterSupplier.id, supplierId), eq(masterSupplier.clientId, clientId)')
  })

  it('clientId TIDAK diambil dari body saat PATCH — invoice tidak berpindah klien', () => {
    const body = handler(DETAIL, 'PATCH')
    expect(body).toContain('const clientId = g.row.clientId')
    expect(body).not.toContain('raw.clientId')
  })
})

// ══ PENJAGA BERDIRI: AKUN DI-SNAPSHOT (D30) ══════════════════════════════
describe('akun hutang & PPN di-snapshot saat invoice dibuat', () => {
  it('akun hutang datang dari supplier, akun PPN dari setelan klien', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      expect(body, m).toContain('akunHutangId: supplier.akunHutangDefaultId')
      expect(body, m).toContain('akunPpnMasukanId: settings?.akunPpnMasukanId')
    }
  })

  it('nilainya DISIMPAN ke kolom invoice, bukan cuma dipakai memvalidasi', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      expect(body, m).toContain('akunHutangId: check.value.akunHutangId')
      expect(body, m).toContain('akunPpnMasukanId: check.value.akunPpnMasukanId')
    }
  })
})

// ══ PENJAGA BERDIRI: INVOICE & JURNALNYA SATU TRANSAKSI (D31) ════════════
describe('jurnal lahir, berubah, dan mati bersama invoicenya', () => {
  const potongStatements = (body: string): string => {
    const mulai = body.indexOf('const statements')
    expect(mulai, 'array statements ada').toBeGreaterThan(-1)
    return body.slice(mulai, body.indexOf('await db.batch(', mulai))
  }

  it('POST menyisipkan invoice DAN jurnal di batch yang sama', () => {
    const st = potongStatements(handler(LIST, 'POST'))
    expect(st).toContain('db.insert(journalEntries)')
    expect(st).toContain('db.insert(journalLines)')
    expect(st).toContain('db.insert(purchaseInvoices)')
    expect(st).toContain('db.insert(purchaseInvoiceLines)')
  })

  it('jurnalnya lahir sebagai DRAF bersumber pembelian', () => {
    const body = handler(LIST, 'POST')
    expect(body).toContain("sumber: 'pembelian'")
    // Tidak ada status eksplisit = default 'draft' di skema. Yang dilarang
    // adalah memaksanya jadi posted.
    expect(body).not.toContain("status: 'posted'")
  })

  it('PATCH memperbarui jurnalnya di batch yang sama', () => {
    const st = potongStatements(handler(DETAIL, 'PATCH'))
    // Needle-nya tanpa awalan "db." karena prettier memecah pemanggilannya
    // antar-baris; needle yang menuntut keduanya menyatu akan merah karena
    // pemformatan, bukan karena perilaku yang berubah.
    expect(st).toContain('.update(purchaseInvoices)')
    expect(st).toContain('db.delete(journalLines)')
    expect(st).toContain('db.insert(journalLines)')
  })

  it('DELETE menghapus invoice DAN jurnalnya di batch yang sama', () => {
    const st = potongStatements(handler(DETAIL, 'DELETE'))
    expect(st).toContain('db.delete(purchaseInvoices)')
    expect(st).toContain('db.delete(journalEntries)')
  })

  it('TIDAK ADA tulis mandiri di jalur mana pun — semuanya lewat db.batch', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
      [DETAIL, 'DELETE'],
    ] as const) {
      const body = handler(src, m)
      expect(body.match(/await db\.(insert|update|delete)\(/g), m).toBeNull()
      expect(body, m).toContain('await db.batch(')
    }
  })

  it('barisnya dibangun buildPurchaseJournalLines, bukan disusun di route', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      expect(handler(src, m), m).toContain('buildPurchaseJournalLines(')
    }
  })

  // no_bukti jurnal unik PER KLIEN, sementara nomor invoice hanya unik per
  // (klien, supplier): dua supplier yang sama-sama memakai "INV-001" akan
  // membuat jurnal kedua ditolak unique constraint — galat yang tidak punya
  // hubungan apa pun dengan yang dilakukan akunting.
  it('nomor invoice TIDAK dipakai sebagai no_bukti jurnal', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      expect(handler(src, m), m).not.toContain('noBukti: check.value.noInvoice')
    }
    expect(handler(LIST, 'POST')).toContain('noBukti: null')
  })
})

// ══ PENJAGA BERDIRI: SUPPLIER TANPA AKUN HUTANG DITOLAK, TIDAK DITEBAK ═══
describe('supplier tanpa akun hutang default', () => {
  it('validator yang menolaknya, dan pesannya menyebut Settings', () => {
    const PURE = read('lib', 'purchase.ts')
    expect(PURE).toContain('belum punya akun hutang default')
    expect(PURE).toContain('Settings')
  })

  it('route tidak pernah memilih akun hutang sendiri sebagai cadangan', () => {
    for (const src of [LIST, DETAIL]) {
      expect(src).not.toContain('akunHutangId: akunHutangFallback')
      expect(src).not.toContain('?? defaultHutang')
    }
  })
})

// ══ PENJAGA BERDIRI: RIWAYAT PENGHAPUSAN INVOICE BERTAHAN ════════════════
describe('riwayat invoice', () => {
  it('setiap mutasi menulis audit_events di dalam batch', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
      [DETAIL, 'DELETE'],
    ] as const) {
      const body = handler(src, m)
      expect(body, m).toContain("entityType: 'purchase_invoice'")
      expect(body, m).not.toContain('await recordAuditEvent(')
    }
  })

  it('PATCH menyimpan nilai_sebelum DAN nilai_sesudah', () => {
    const body = handler(DETAIL, 'PATCH')
    expect(body).toContain('nilaiSebelum: sebelum')
    expect(body).toContain('nilaiSesudah:')
    // Snapshot diambil SEBELUM batch, kalau tidak ia sudah berisi nilai baru.
    expect(body.indexOf('snapshotInvoice(')).toBeLessThan(body.indexOf('await db.batch('))
  })

  it('DELETE menyimpan snapshot isinya dan TIDAK memurnikan event invoice', () => {
    const body = handler(DETAIL, 'DELETE')
    expect(body).toContain("event: 'deleted'")
    expect(body).toContain('nilaiSebelum: sebelum')
    // Pengecualian yang diminta brief: riwayat invoice hidup lebih lama dari
    // barisnya. Yang dipurge hanyalah riwayat JURNALnya (aturan C2).
    expect(body).not.toContain("purgeAuditEvents('purchase_invoice'")
    expect(body).toContain("purgeAuditEvents('journal'")
  })
})

describe('bentuk respons & angka', () => {
  it('total dan sisa DITURUNKAN di query, bukan kolom tersimpan', () => {
    expect(QUERIES).toContain('computeInvoiceTotals(')
    expect(QUERIES).not.toContain('purchaseInvoices.total')
    expect(QUERIES).not.toContain('purchaseInvoices.sisa')
  })

  it('jadwal termin diturunkan buildTerminSchedule, tidak disimpan', () => {
    expect(QUERIES).toContain('buildTerminSchedule(')
  })

  it('subtotal dijumlahkan di Postgres dan dikembalikan sebagai string', () => {
    expect(QUERIES).toContain('::numeric(18,2)::text')
  })

  it('tanggal divalidasi isValidYmd, tanpa objek Date', () => {
    expect(LIST).toContain('isValidYmd(')
    expect(LIST).not.toContain('new Date(period')
  })

  it('POST, PATCH, dan GET detail memakai SATU pembangun bentuk detail', () => {
    expect(handler(LIST, 'POST')).toContain('loadInvoiceDetail(')
    expect(handler(DETAIL, 'PATCH')).toContain('loadInvoiceDetail(')
    expect(handler(DETAIL, 'GET')).toContain('loadInvoiceDetail(')
  })
})

describe('nomor invoice dobel jadi 409, bukan 500', () => {
  it('POST dan PATCH menjaga syarat noInvoice !== null', () => {
    for (const [src, m] of [
      [LIST, 'POST'],
      [DETAIL, 'PATCH'],
    ] as const) {
      const body = handler(src, m)
      expect(body, m).toContain('isUniqueViolation(e) && check.value.noInvoice !== null')
      expect(body, m).toContain('status: 409')
    }
  })

  it('kegagalan tulis lain jatuh ke helper bersama', () => {
    expect(LIST).toContain('dbWriteErrorResponse(')
    expect(DETAIL).toContain('dbWriteErrorResponse(')
  })
})

// ══ PENJAGA BERDIRI: D32 — JALAN KELUAR DI /jurnal ═══════════════════════
describe('tombol "Koreksi di Pembelian" di /jurnal', () => {
  const HAL = read('app', 'jurnal', 'page.tsx')
  const JQ = read('lib', 'api', 'journal-queries.ts')
  const JLIST = read('app', 'api', 'journals', 'route.ts')

  it('halaman menawarkan tautan, bukan sekadar menyembunyikan tombol edit', () => {
    expect(HAL).toContain('Koreksi di')
    expect(HAL).toContain('isSumberModul(')
  })

  it('bila dokumen asalnya TIDAK ketemu, yang tampil keterangan jujur', () => {
    // Invoicenya bisa saja dihapus lewat jalur lain. Tombol yang menuju
    // halaman kosong lebih buruk daripada kalimat yang menjelaskan.
    expect(HAL).toContain('dokumen asal tidak ditemukan')
    expect(HAL).toContain('dariModul && !r.sumberDokumenId')
  })

  it('idnya dari pencarian MUNDUR, bukan kolom balik di journal_entries', () => {
    // Kolom balik akan jadi kolom polimorfik KEDUA tanpa FK (invoice? mutasi?
    // kelak marketplace?). Kita sudah membayar harga satu di audit_events.
    expect(JQ).toContain('eq(purchaseInvoices.journalId, journalId)')
    expect(JLIST).toContain('where pi.journal_id =')
    const SCHEMA = read('lib', 'db', 'schema.ts')
    for (const terlarang of ['purchaseInvoiceId', 'purchase_invoice_id', 'sumberDokumenId:']) {
      const blok = SCHEMA.slice(
        SCHEMA.indexOf('export const journalEntries'),
        SCHEMA.indexOf('export const journalLines')
      )
      expect(blok, terlarang).not.toContain(terlarang)
    }
  })

  it('route detail menolak PATCH/DELETE jurnal bersumber modul, dengan pesan tersendiri', () => {
    const DET = read('app', 'api', 'journals', '[id]', 'route.ts')
    expect(DET).toContain('isSumberModul(sumber)')
    expect(DET).toContain('tidak bisa diubah dari halaman Jurnal')
    // Pesan yang sama untuk dua sebab berbeda membuat akunting mencoba jalan
    // yang tidak akan pernah berhasil.
    expect(DET).toContain('Koreksi jurnal terposting dilakukan lewat jurnal balik')
  })
})
