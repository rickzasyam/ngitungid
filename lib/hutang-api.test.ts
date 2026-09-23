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

// ══ UI /hutang (U4) ══════════════════════════════════════════════════════
// Struktural, bukan render: yang dijaga adalah janji-janji yang paling mudah
// hilang dalam satu polish pass.
describe('halaman /hutang', () => {
  const PAGE = read('app', 'hutang', 'page.tsx')
  const DETAIL_PANEL = read('components', 'hutang', 'supplier-detail.tsx')

  it('tidak menghitung satu angka pun — semuanya dari server', () => {
    for (const fn of ['ageBuckets(', 'applyPayments(', 'invoiceOutstanding(', 'bucketOf(']) {
      expect(PAGE.includes(fn), fn).toBe(false)
      expect(DETAIL_PANEL.includes(fn), `panel — ${fn}`).toBe(false)
    }
    // Yang diimpor dari lib/hutang hanya DAFTAR ember dan labelnya.
    expect(PAGE).toContain("AGE_BUCKETS, AGE_BUCKET_LABEL")
  })

  it('kelima ember tampil, warnanya dari TOKEN bukan hex lepas', () => {
    expect(PAGE).toContain('AGE_BUCKETS.map(k =>')
    expect(PAGE).toContain('--color-accent-critical')
    expect(PAGE).toContain('--color-accent-secondary')
  })

  it('daftar jatuh tempo per CICILAN, dan yang telat diberi tanda', () => {
    expect(PAGE).toContain('ke-{i.terminUrutan}')
    expect(PAGE).toContain('telat ${Math.abs(i.hariLagi)} hari')
  })

  it('rekap supplier bisa dibuka ke detail invoice + pembayaran', () => {
    expect(PAGE).toContain('<SupplierDetail')
    expect(DETAIL_PANEL).toContain('Pembayaran teralokasi')
    expect(DETAIL_PANEL).toContain('p.terminUrutan === null')
  })

  it('paku yatim ditampilkan di ringkasan DAN di detailnya (D40)', () => {
    expect(PAGE).toContain('aging.pakuYatim > 0')
    expect(DETAIL_PANEL).toContain('inv.pakuYatim.length > 0')
    // Dan dikatakan bahwa pembayarannya tetap terhitung — bukan sekadar
    // peringatan yang membuat orang mengira uangnya hilang.
    expect(DETAIL_PANEL).toContain('tetap terhitung')
  })

  it('unduh CSV dibentuk dari data yang SUDAH di layar', () => {
    // Berkas yang isinya berbeda dari yang barusan dibaca orangnya adalah
    // berkas yang tidak bisa dipertanggungjawabkan saat dikirim ke luar.
    expect(PAGE).toContain('suppliers.map(s => [')
    expect(PAGE).not.toContain("fetch('/api/hutang/export")
  })

  it('empty state menyebut bahwa invoice tunai memang tidak masuk', () => {
    expect(PAGE).toContain('Invoice tunai tidak masuk monitoring hutang')
  })

  it('bagian Rekonsiliasi SUDAH dipasang — catatan "menyusul" tidak tersisa (F4)', () => {
    expect(PAGE).toContain('<ReconciliationPanel')
    expect(PAGE).not.toContain('menyusul di fase berikutnya')
  })

  it('panel rekonsiliasi memakai tanggal acuan YANG SAMA dengan halaman', () => {
    expect(PAGE).toContain('asOf={asOf}')
  })
})

// ══ REKONSILIASI (F3) ════════════════════════════════════════════════════
describe('GET /api/hutang/reconciliation', () => {
  const REKON = read('app', 'api', 'hutang', 'reconciliation', 'route.ts')
  const RQ = read('lib', 'api', 'hutang-reconciliation-queries.ts')

  it('requireInternal lewat penjaga bersama, dan baca-saja', () => {
    expect(REKON).toContain('guardHutang(req)')
    expect(GUARD).toContain('requireInternal()')
    expect(REKON).not.toContain('export async function POST(')
    for (const tulis of ['db.insert(', 'db.update(', 'db.delete(', 'db.batch(']) {
      expect(REKON.includes(tulis), tulis).toBe(false)
      expect(RQ.includes(tulis), `queries — ${tulis}`).toBe(false)
    }
  })

  it('totalNeraca lewat lib/financial-agg.ts — bukan agregator kedua (P5)', () => {
    expect(RQ).toContain("from '@/lib/financial-agg'")
    expect(RQ).toContain('aggregateBalanceSheet(lines)')
    // Tidak ada penjumlahan baris neraca sendiri di modul ini.
    expect(RQ).not.toContain('.reduce((s, l) => s + l.amount')
  })

  it('memakai HUTANG USAHA, bukan totalHutang yang mencampur pajak & gaji', () => {
    expect(RQ).toContain('bs.hutangUsaha')
    expect(RQ).not.toContain('bs.balanceSheet.totalHutang')
  })

  it('AggLine.nama diisi RAW NAME dari PDF, bukan nama Master COA', () => {
    // Predikat "dagang" mencocokkan nama ini; mengisinya dengan nama COA
    // membuat hutang usaha bergeser saat seseorang merapikan label akun.
    expect(RQ).toContain('nama: it.rawName')
    expect(RQ).not.toContain('nama: it.coaNama')
  })

  it('KEDUA sisi dipotong di tanggal neraca yang sama', () => {
    expect(REKON).toContain('const tanggalPembanding = neraca?.periodEnd ?? g.asOf')
    expect(REKON).toContain('sampaiTanggal: tanggalPembanding')
    // Dua kali: sekali untuk invoice/alokasi, sekali untuk penjelas.
    expect(REKON.split('sampaiTanggal: tanggalPembanding').length - 1).toBe(2)
  })

  it('pembayaran dipotong menurut tanggal MUTASI, bukan waktu alokasi dicatat', () => {
    expect(QUERIES).toContain('sql`${cashMutations.tanggal} <= ${opts.sampaiTanggal}`')
    expect(QUERIES).toContain('sql`${purchaseInvoices.tanggal} <= ${opts.sampaiTanggal}`')
  })

  it('neraca dipilih: terbaru dengan period_end ≤ asOf', () => {
    expect(RQ).toContain("eq(financialReports.reportType, 'neraca')")
    expect(RQ).toContain('${financialReports.periodEnd} <= ${asOf}')
    expect(RQ).toContain('desc(financialReports.periodEnd)')
  })

  it('sisi supplier lewat supplierSummary — tidak dihitung ulang di route', () => {
    expect(REKON).toContain('supplierSummary(invoices, alokasi)')
    expect(REKON).toContain('reconcileHutang({')
    expect(REKON).not.toContain('applyPayments(')
  })

  it('selisih null dikirim sebagai null — bukan "0.00"', () => {
    expect(REKON).toContain('r.selisihMinor === null ? null')
    expect(REKON).toContain('r.totalNeracaMinor === null ? null')
  })

  it('tanggal pembanding ikut dikirim supaya selalu tampil di layar', () => {
    expect(REKON).toContain('tanggalPembanding,')
  })

  it('penjelas: jurnal MANUAL, TERPOSTING, ke akun hutang supplier', () => {
    expect(RQ).toContain("eq(journalEntries.sumber, 'manual')")
    expect(RQ).toContain("eq(journalEntries.status, 'posted')")
    expect(RQ).toContain('inArray(journalLines.masterCoaId, [...opts.akunIds])')
  })

  it('akun hutang supplier didefinisikan dari PEMAKAIANNYA, bukan dari tipe akun', () => {
    // "Semua akun liability" menyeret utang pajak & gaji ke daftar penjelas.
    expect(RQ).toContain('purchaseInvoices.akunHutangId')
    expect(RQ).toContain('masterSupplier.akunHutangDefaultId')
    expect(RQ).not.toContain("'liability'")
  })
})

// ══ UI REKONSILIASI (F4) ═════════════════════════════════════════════════
describe('panel Rekonsiliasi di /hutang', () => {
  const PANEL = read('components', 'hutang', 'reconciliation-panel.tsx')

  it('SEMUA nominal lewat rupiahPersis — rupiah() membulatkan ke rupiah utuh', () => {
    // Selisih Rp 0,01 lewat rupiah() tampil "Rp 0" dan terbaca COCOK.
    expect(PANEL).toContain('rupiahPersis(data.selisih)')
    expect(PANEL).toContain('rupiahPersis(data.totalSupplier)')
    expect(PANEL).toContain('rupiahPersis(data.totalNeraca)')
    expect(PANEL).toContain('rupiahPersis(r.sisa)')
    expect(PANEL).toContain('rupiahPersis(b.efek)')
    // Tidak satu pun pemanggilan rupiah(...) yang membulatkan.
    expect(PANEL).not.toMatch(/[^A-Za-z]rupiah\(/)
  })

  it('tanggal pembanding tampil MENONJOL, dengan penjelasan invoice sesudahnya', () => {
    expect(PANEL).toContain('fmtTanggal(data.tanggalPembanding)')
    expect(PANEL).toContain('tidak')
    expect(PANEL).toContain('ikut dihitung')
  })

  it('neraca belum ada → "belum bisa dihitung", BUKAN Rp 0', () => {
    expect(PANEL).toContain('data.selisih === null')
    expect(PANEL).toContain('belum bisa dihitung')
    expect(PANEL).toContain("data.totalNeraca === null ? '—'")
  })

  it('arah selisih dijelaskan dengan KATA, bukan warna saja', () => {
    expect(PANEL).toContain('LEBIH BESAR')
    expect(PANEL).toContain('LEBIH KECIL')
    expect(PANEL).toContain('Cocok')
  })

  it('penjelas dinyatakan TIDAK dikurangkan dari selisih', () => {
    expect(PANEL).toContain('Tidak dikurangkan dari selisih')
    expect(PANEL).toContain("['Bersupplier', data.penjelas.berSupplier]")
    expect(PANEL).toContain("['Tanpa supplier', data.penjelas.tanpaSupplier]")
  })

  it('tidak menghitung satu angka pun di browser', () => {
    for (const fn of ['reconcileHutang(', 'supplierSummary(', 'efekHutangMinor(', 'Number(a', '+ Number(']) {
      expect(PANEL.includes(fn), fn).toBe(false)
    }
  })
})

describe('pemilih supplier di form jurnal (F4)', () => {
  const FORM = read('components', 'jurnal', 'journal-form-modal.tsx')
  const JPAGE = read('app', 'jurnal', 'page.tsx')

  it('muncul HANYA pada baris yang akunnya liability', () => {
    expect(FORM).toContain("resolvedType === 'liability'")
    expect(FORM).toContain('akunLiability(l.masterCoaId) && suppliers.length > 0')
  })

  it('supplier dikirim HANYA bila akunnya liability — bukan sisa pilihan lama', () => {
    // Akun baris bisa berganti lewat banyak jalan (dipilih ulang, saran AI).
    expect(FORM).toContain('export function supplierUntukDikirim(')
    expect(JPAGE).toContain('supplierId: supplierUntukDikirim(l, accounts)')
  })

  it('form EDIT memuat supplierId — kalau tidak, PATCH menghapusnya', () => {
    expect(JPAGE).toContain("supplierId: l.supplierId ?? ''")
  })

  it('daftar supplier dimuat bersama COA, dan gagalnya tidak menggagalkan form', () => {
    expect(JPAGE).toContain('/suppliers`')
    expect(JPAGE).toContain('suppliers={suppliers}')
  })

  it('panel rincian jurnal menampilkan supplier yang ditandai', () => {
    const DETAIL = read('components', 'jurnal', 'journal-detail.tsx')
    expect(DETAIL).toContain('l.supplierNama &&')
  })
})
