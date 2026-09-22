import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas route monitoring hutang (U2) dan sumbu aksesnya (U3).
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun: bahwa TIDAK
// ADA satu pun jalur tulis, bahwa angkanya benar-benar diturunkan alih-alih
// dibaca dari kolom, dan bahwa invoice tunai disaring di dua lapis.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const AGING = read('app', 'api', 'hutang', 'aging', 'route.ts')
const SUPPLIERS = read('app', 'api', 'hutang', 'suppliers', 'route.ts')
const SUPPLIER_DETAIL = read('app', 'api', 'hutang', 'suppliers', '[supplierId]', 'route.ts')
const JATUH_TEMPO = read('app', 'api', 'hutang', 'jatuh-tempo', 'route.ts')
const GUARD = read('lib', 'api', 'hutang-guard.ts')
const QUERIES = read('lib', 'api', 'hutang-queries.ts')

const SEMUA_ROUTE = [
  ['aging', AGING],
  ['suppliers', SUPPLIERS],
  ['supplier detail', SUPPLIER_DETAIL],
  ['jatuh tempo', JATUH_TEMPO],
] as const

describe('monitoring hutang BACA-SAJA (D45)', () => {
  it('keempat route hanya punya handler GET', () => {
    for (const [nama, src] of SEMUA_ROUTE) {
      expect(src.includes('export async function GET('), nama).toBe(true)
      for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        expect(src.includes(`export async function ${m}(`), `${nama} tidak boleh punya ${m}`).toBe(false)
      }
    }
  })

  it('tidak satu pun menulis ke database', () => {
    for (const [nama, src] of [...SEMUA_ROUTE, ['queries', QUERIES] as const]) {
      for (const tulis of ['db.insert(', 'db.update(', 'db.delete(', 'db.batch(']) {
        expect(src.includes(tulis), `${nama} — ${tulis}`).toBe(false)
      }
    }
  })

  it('penjaganya requireInternal — finance membaca dan mengunduh', () => {
    expect(GUARD).toContain('requireInternal()')
    // Tidak perlu requireAkunting di mana pun: tidak ada yang bisa ditulis.
    for (const [nama, src] of SEMUA_ROUTE) {
      expect(src.includes('requireAkunting'), nama).toBe(false)
    }
  })

  it('keempatnya lewat penjaga yang SAMA — bukan empat salinan', () => {
    for (const [nama, src] of SEMUA_ROUTE) {
      expect(src.includes('guardHutang(req)'), nama).toBe(true)
    }
    expect(GUARD).toContain('canAccessClientData(')
  })
})

describe('asOf', () => {
  it('punya bawaan hari ini lewat todayYmd, bukan new Date di tiap route', () => {
    // Pemanggil yang memakai new Date().toISOString() meleset satu hari di WIB
    // untuk sebagian jam (P2).
    expect(GUARD).toContain('todayYmd()')
    for (const [nama, src] of SEMUA_ROUTE) {
      expect(src.includes('new Date('), nama).toBe(false)
    }
  })

  it('divalidasi sebagai YMD, bukan diterima apa adanya', () => {
    expect(GUARD).toContain('isValidYmd(asOfParam)')
  })
})

describe('angkanya DITURUNKAN, bukan dibaca dari kolom (D39)', () => {
  it('tidak ada kolom sisa/status/terbayar yang dibaca di query', () => {
    for (const kolom of ['purchaseInvoices.sisa', 'purchaseInvoices.status', 'purchaseInvoices.terbayar']) {
      expect(QUERIES.includes(kolom), kolom).toBe(false)
    }
  })

  it('jadwal cicilan diturunkan buildTerminSchedule tiap permintaan (D34)', () => {
    expect(QUERIES).toContain('buildTerminSchedule({')
  })

  it('pencocokan pembayaran lewat applyPayments — satu aturan, bukan dua', () => {
    expect(QUERIES).toContain('applyPayments(jadwal, milikInvoice)')
    // Route tidak boleh menghitung sendiri; kalau ia menghitung, aturan D40
    // hidup di dua tempat dan keduanya akan menyimpang.
    for (const [nama, src] of SEMUA_ROUTE) {
      expect(src.includes('terminUrutan ==='), `${nama} menghitung pencocokan sendiri`).toBe(false)
    }
  })

  it('nominal dikirim sebagai STRING 2 desimal, bukan angka float (P1)', () => {
    for (const [nama, src] of SEMUA_ROUTE) {
      expect(src.includes('fromMinorUnits('), nama).toBe(true)
    }
  })

  it('invoice & alokasi dibaca DUA query, bukan satu join yang mengalikan', () => {
    // Satu join akan menggandakan Σ subtotal dan Σ alokasi sekaligus —
    // terlihat masuk akal sampai ada invoice dengan dua baris dan dua
    // pembayaran (pelajaran yang sama sudah dibayar sekali di listInvoices).
    expect(QUERIES).toContain('.from(cashMutationAllocations)')
    expect(QUERIES).toContain('.from(purchaseInvoices)')
    const joinInvoice = QUERIES.indexOf('.from(purchaseInvoices)')
    const blok = QUERIES.slice(joinInvoice, QUERIES.indexOf('.groupBy('))
    expect(blok).not.toContain('cashMutationAllocations')
  })
})

describe('invoice TUNAI tidak pernah masuk', () => {
  it('disaring di SQL dan sekali lagi di modul murni', () => {
    expect(QUERIES).toContain("eq(purchaseInvoices.caraBayar, 'kredit')")
    expect(QUERIES).toContain('hutangInvoices(invoices)')
  })
})

describe('jatuh tempo — per cicilan, dan yang telat ikut', () => {
  it('memakai jatuhTempoMendekat, bukan jatuh_tempo_akhir saja', () => {
    expect(JATUH_TEMPO).toContain('jatuhTempoMendekat(denganCicilan')
    expect(JATUH_TEMPO).not.toContain('jatuhTempoAkhir >=')
  })

  it('dalamHari dibatasi — bukan angka bebas dari URL', () => {
    expect(JATUH_TEMPO).toContain('DALAM_HARI_MAX')
    expect(JATUH_TEMPO).toContain('Number.isInteger(n)')
  })
})

describe('detail supplier', () => {
  it('supplier klien lain menjawab 404, bukan daftar kosong', () => {
    // Daftar kosong terbaca seperti "supplier ini tidak punya hutang".
    expect(SUPPLIER_DETAIL).toContain('loadSupplier(supplierId, g.clientId)')
    expect(SUPPLIER_DETAIL).toContain('status: 404')
  })

  it('membawa pembayaran per invoice supaya "kenapa sisanya sekian" terjawab', () => {
    expect(SUPPLIER_DETAIL).toContain('loadPembayaranInvoice(')
    expect(SUPPLIER_DETAIL).toContain('pembayaran: bayarInvoice.map')
  })

  it('paku yatim & cicilan berpaku ikut dikirim, tidak ditelan (D40)', () => {
    expect(SUPPLIER_DETAIL).toContain('pakuYatim')
    expect(SUPPLIER_DETAIL).toContain('dipakuManual')
  })

  it('id invoice dioper lewat inArray, bukan dirangkai jadi SQL', () => {
    expect(QUERIES).toContain('inArray(cashMutationAllocations.invoiceId')
    expect(QUERIES).not.toContain('sql.raw(')
  })
})
