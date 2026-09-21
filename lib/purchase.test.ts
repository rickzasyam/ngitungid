import { describe, it, expect } from 'vitest'
import {
  buildPurchaseJournalLines,
  computeInvoiceTotals,
  invoiceAkunLawan,
  invoiceKomponen,
  isPurchasePaymentMethod,
  NO_INVOICE_MAX,
  validatePurchaseInvoice,
  type PurchaseInvoiceInput,
} from './purchase'
import { isBalanced, computeTotals } from './journal'

const AKUN = {
  tujuan: '11111111-1111-1111-1111-111111111111',
  kas: '22222222-2222-2222-2222-222222222222',
  hutang: '33333333-3333-3333-3333-333333333333',
  ppn: '44444444-4444-4444-4444-444444444444',
}
const SUPPLIER = '55555555-5555-5555-5555-555555555555'

const kredit = (o: Partial<PurchaseInvoiceInput> = {}): PurchaseInvoiceInput => ({
  tanggal: '2026-10-01',
  supplierId: SUPPLIER,
  noInvoice: 'INV-001',
  caraBayar: 'kredit',
  akunTujuanId: AKUN.tujuan,
  akunHutangId: AKUN.hutang,
  ppn: '',
  jumlahTermin: 3,
  jatuhTempoAkhir: '2027-01-01',
  lines: [{ namaBarang: 'Semen', qty: '10', hargaSatuan: '50000', subtotal: '500000' }],
  ...o,
})

const tunai = (o: Partial<PurchaseInvoiceInput> = {}): PurchaseInvoiceInput =>
  kredit({
    caraBayar: 'tunai',
    akunKasId: AKUN.kas,
    akunHutangId: undefined,
    jumlahTermin: undefined,
    jatuhTempoAkhir: undefined,
    ...o,
  })

describe('computeInvoiceTotals', () => {
  it('menjumlahkan subtotal BARIS, bukan qty × harga', () => {
    // qty pecahan: 2,5 × 333,33 = 833,325 → dibulatkan berbeda tergantung cara
    // menghitungnya. Yang dipakai adalah subtotal tersimpan (D28).
    const t = computeInvoiceTotals([{ subtotal: '833.33' }, { subtotal: '166.67' }], '0')
    expect(t.subtotalMinor).toBe(100_000)
    expect(t.totalMinor).toBe(100_000)
  })

  it('PPN ditambahkan di atas subtotal', () => {
    const t = computeInvoiceTotals([{ subtotal: '1000.00' }], '110.00')
    expect(t).toEqual({ subtotalMinor: 100_000, ppnMinor: 11_000, totalMinor: 111_000 })
  })

  it('seratus baris 0,01 berjumlah tepat 1,00 — sen bulat, bukan float', () => {
    const lines = Array.from({ length: 100 }, () => ({ subtotal: '0.01' }))
    expect(computeInvoiceTotals(lines).totalMinor).toBe(100)
  })

  it('PERMISIF: nominal belum sah dihitung nol, tidak melempar', () => {
    // Dipanggil tiap ketukan tombol oleh panel total di form.
    expect(computeInvoiceTotals([{ subtotal: '' }, { subtotal: 'abc' }, { subtotal: '5.00' }]).totalMinor).toBe(500)
    expect(computeInvoiceTotals(null).totalMinor).toBe(0)
    expect(computeInvoiceTotals(undefined, 'xyz').totalMinor).toBe(0)
  })
})

describe('validatePurchaseInvoice — jalur yang benar', () => {
  it('invoice kredit lengkap diterima', () => {
    const r = validatePurchaseInvoice(kredit())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.caraBayar).toBe('kredit')
      expect(r.value.akunHutangId).toBe(AKUN.hutang)
      expect(r.value.akunKasId).toBeNull()
      expect(r.value.jatuhTempoAkhir).toBe('2027-01-01')
      expect(r.value.lines[0]).toMatchObject({ namaBarang: 'Semen', subtotal: '500000.00', lineOrder: 0 })
    }
  })

  it('invoice tunai lengkap diterima, dan field kreditnya dinolkan', () => {
    const r = validatePurchaseInvoice(tunai())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.akunKasId).toBe(AKUN.kas)
      expect(r.value.akunHutangId).toBeNull()
      expect(r.value.jatuhTempoAkhir).toBeNull()
      expect(r.value.jumlahTermin).toBe(1)
    }
  })

  it('qty pecahan dinormalkan ke 4 desimal', () => {
    const r = validatePurchaseInvoice(
      kredit({ lines: [{ namaBarang: 'Pasir', qty: '2,5', hargaSatuan: '1000', subtotal: '2500' }] })
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.lines[0].qty).toBe('2.5000')
  })

  it('MENGUMPULKAN SEMUA galat, bukan berhenti di yang pertama', () => {
    const r = validatePurchaseInvoice({
      tanggal: 'bukan-tanggal',
      caraBayar: 'entah',
      lines: [{ namaBarang: '', qty: '0', hargaSatuan: 'x', subtotal: 'y' }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(4)
  })
})

// ══ PENJAGA BERDIRI: NOMOR INVOICE KOSONG = NULL, BUKAN '' (D29) ═════════
// Pelajaran no_bukti Fase 1 diulang persis: kolomnya unik per (klien,
// supplier), dan '' adalah satu nilai konkret sehingga invoice kedua tanpa
// nomor akan bentrok dengan yang pertama.
describe('no_invoice opsional', () => {
  it.each([undefined, null, '', '   '])('%s → null', v => {
    const r = validatePurchaseInvoice(kredit({ noInvoice: v }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.noInvoice).toBeNull()
  })

  it('nilai terisi di-trim', () => {
    const r = validatePurchaseInvoice(kredit({ noInvoice: '  INV-9  ' }))
    if (r.ok) expect(r.value.noInvoice).toBe('INV-9')
  })

  it('melewati batas panjang ditolak', () => {
    const r = validatePurchaseInvoice(kredit({ noInvoice: 'x'.repeat(NO_INVOICE_MAX + 1) }))
    expect(r.ok).toBe(false)
  })
})

describe('syarat yang bergantung cara bayar', () => {
  it('kredit tanpa jatuh tempo ditolak', () => {
    const r = validatePurchaseInvoice(kredit({ jatuhTempoAkhir: undefined }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('jatuh tempo')
  })

  it('kredit tanpa akun hutang ditolak DENGAN arahan ke Settings — bukan menebak akun', () => {
    const r = validatePurchaseInvoice(kredit({ akunHutangId: undefined }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('Settings')
  })

  it('tunai tanpa akun kas ditolak', () => {
    const r = validatePurchaseInvoice(tunai({ akunKasId: undefined }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('Akun kas')
  })

  it('jatuh tempo SEBELUM tanggal invoice ditolak', () => {
    // Hampir pasti salah ketik tahun; kalau lolos ia langsung mendarat di ember
    // ">90 hari" monitoring hutang tanpa ada yang tahu kenapa.
    const r = validatePurchaseInvoice(kredit({ tanggal: '2026-10-01', jatuhTempoAkhir: '2026-09-01' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('sebelum tanggal invoice')
  })

  it('termin kurang dari 1 ditolak untuk kredit', () => {
    expect(validatePurchaseInvoice(kredit({ jumlahTermin: 0 })).ok).toBe(false)
  })
})

// ══ PENJAGA BERDIRI: PPN TANPA AKUNNYA DITOLAK, TIDAK DITEBAK (D33) ══════
describe('PPN', () => {
  it('PPN diisi tanpa akun PPN Masukan → ditolak, pesannya menyebut Settings', () => {
    const r = validatePurchaseInvoice(kredit({ ppn: '110000', akunPpnMasukanId: undefined }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('Settings')
  })

  it('PPN diisi dengan akunnya → diterima dan akunnya disimpan', () => {
    const r = validatePurchaseInvoice(kredit({ ppn: '110000', akunPpnMasukanId: AKUN.ppn }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.akunPpnMasukanId).toBe(AKUN.ppn)
  })

  it('tanpa PPN, akun PPN TIDAK disimpan walau dikirim', () => {
    // Snapshot yang tidak pernah dipakai cuma menahan akun itu dari penghapusan
    // (FK restrict) tanpa alasan.
    const r = validatePurchaseInvoice(kredit({ ppn: '', akunPpnMasukanId: AKUN.ppn }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.akunPpnMasukanId).toBeNull()
      expect(r.value.ppn).toBe('0.00')
    }
  })

  it('PPN negatif ditolak', () => {
    expect(validatePurchaseInvoice(kredit({ ppn: '-1000', akunPpnMasukanId: AKUN.ppn })).ok).toBe(false)
  })
})

describe('baris barang', () => {
  it('tanpa baris sama sekali ditolak', () => {
    expect(validatePurchaseInvoice(kredit({ lines: [] })).ok).toBe(false)
  })

  it('qty nol atau negatif ditolak', () => {
    for (const qty of ['0', '-1', '0.0000']) {
      const r = validatePurchaseInvoice(
        kredit({ lines: [{ namaBarang: 'X', qty, hargaSatuan: '1', subtotal: '1' }] })
      )
      expect(r.ok, qty).toBe(false)
    }
  })

  it('total nol dengan baris yang ada ditolak — jurnalnya tidak mencatat apa pun', () => {
    const r = validatePurchaseInvoice(
      kredit({ lines: [{ namaBarang: 'X', qty: '1', hargaSatuan: '0', subtotal: '0' }] })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('lebih dari nol')
  })

  it('lineOrder berurutan dari 0, apa pun urutan masukannya', () => {
    const r = validatePurchaseInvoice(
      kredit({
        lines: [
          { namaBarang: 'A', qty: '1', hargaSatuan: '1000', subtotal: '1000' },
          { namaBarang: 'B', qty: '2', hargaSatuan: '1000', subtotal: '2000' },
          { namaBarang: 'C', qty: '3', hargaSatuan: '1000', subtotal: '3000' },
        ],
      })
    )
    if (r.ok) expect(r.value.lines.map(l => l.lineOrder)).toEqual([0, 1, 2])
  })
})

// ══ PENJAGA BERDIRI: JURNAL PEMBELIAN SELALU SEIMBANG ════════════════════
describe('buildPurchaseJournalLines', () => {
  it('kredit: D tujuan + D ppn, K hutang sebesar total', () => {
    const lines = buildPurchaseJournalLines({
      komponen: [
        { jenis: 'barang', akunId: AKUN.tujuan, minor: 100_000 },
        { jenis: 'ppn', akunId: AKUN.ppn, minor: 11_000 },
      ],
      akunLawanId: AKUN.hutang,
    })
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ masterCoaId: AKUN.tujuan, debit: '1000.00', kredit: '0.00' })
    expect(lines[1]).toMatchObject({ masterCoaId: AKUN.ppn, debit: '110.00' })
    expect(lines[2]).toMatchObject({ masterCoaId: AKUN.hutang, debit: '0.00', kredit: '1110.00' })
    expect(isBalanced(lines)).toBe(true)
  })

  it('tunai: lawannya akun kas, sisanya identik', () => {
    const lines = buildPurchaseJournalLines({
      komponen: [{ jenis: 'barang', akunId: AKUN.tujuan, minor: 500_000 }],
      akunLawanId: AKUN.kas,
    })
    expect(lines.at(-1)).toMatchObject({ masterCoaId: AKUN.kas, kredit: '5000.00' })
    expect(isBalanced(lines)).toBe(true)
  })

  it('SEIMBANG untuk kombinasi apa pun — Σ debit === Σ kredit', () => {
    for (const [barang, ppn] of [[1, 0], [100_000, 11_000], [999_999, 1], [7, 3]] as const) {
      const lines = buildPurchaseJournalLines({
        komponen: [
          { jenis: 'barang', akunId: AKUN.tujuan, minor: barang },
          { jenis: 'ppn', akunId: AKUN.ppn, minor: ppn },
        ],
        akunLawanId: AKUN.hutang,
      })
      const t = computeTotals(lines)
      expect(t.selisih, `${barang}/${ppn}`).toBe(0)
      expect(t.debit, `${barang}/${ppn}`).toBe(barang + ppn)
    }
  })

  // Baris jurnal bernominal nol melanggar CHECK journal_lines_satu_sisi_check
  // (tepat satu sisi terisi), jadi menyertakannya menggagalkan seluruh batch.
  it('komponen bernilai NOL dilewati, tidak jadi baris nol', () => {
    const lines = buildPurchaseJournalLines({
      komponen: [
        { jenis: 'barang', akunId: AKUN.tujuan, minor: 100_000 },
        { jenis: 'ppn', akunId: AKUN.ppn, minor: 0 },
      ],
      akunLawanId: AKUN.hutang,
    })
    expect(lines).toHaveLength(2)
    expect(lines.some(l => l.masterCoaId === AKUN.ppn)).toBe(false)
  })

  it('tanpa komponen bernilai positif → tidak ada baris sama sekali', () => {
    expect(
      buildPurchaseJournalLines({
        komponen: [{ jenis: 'barang', akunId: AKUN.tujuan, minor: 0 }],
        akunLawanId: AKUN.hutang,
      })
    ).toEqual([])
  })

  // Bentuk daftar komponen ADALAH asuransi untuk ongkir/diskon yang belum
  // diputuskan: menambahkannya nanti = satu elemen baru, bukan pembongkaran.
  it('komponen keempat (ongkir) ikut tanpa mengubah bentuk fungsi', () => {
    const lines = buildPurchaseJournalLines({
      komponen: [
        { jenis: 'barang', akunId: AKUN.tujuan, minor: 100_000 },
        { jenis: 'ongkir', akunId: AKUN.ppn, minor: 25_000 },
      ],
      akunLawanId: AKUN.hutang,
    })
    expect(lines).toHaveLength(3)
    expect(isBalanced(lines)).toBe(true)
    expect(lines.at(-1)!.kredit).toBe('1250.00')
  })
})

describe('invoiceKomponen & invoiceAkunLawan', () => {
  it('kredit → komponen barang, lawan = akun hutang', () => {
    const r = validatePurchaseInvoice(kredit())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(invoiceKomponen(r.value)).toEqual([
      { jenis: 'barang', akunId: AKUN.tujuan, minor: 50_000_000 },
    ])
    expect(invoiceAkunLawan(r.value)).toBe(AKUN.hutang)
  })

  it('dengan PPN → dua komponen', () => {
    const r = validatePurchaseInvoice(kredit({ ppn: '55000', akunPpnMasukanId: AKUN.ppn }))
    if (!r.ok) throw new Error(r.errors.join(' '))
    const k = invoiceKomponen(r.value)
    expect(k).toHaveLength(2)
    expect(k[1]).toMatchObject({ jenis: 'ppn', akunId: AKUN.ppn, minor: 5_500_000 })
  })

  it('tunai → lawan = akun kas', () => {
    const r = validatePurchaseInvoice(tunai())
    if (!r.ok) throw new Error(r.errors.join(' '))
    expect(invoiceAkunLawan(r.value)).toBe(AKUN.kas)
  })

  it('jurnal dari invoice nyata selalu seimbang', () => {
    const r = validatePurchaseInvoice(kredit({ ppn: '55000', akunPpnMasukanId: AKUN.ppn }))
    if (!r.ok) throw new Error(r.errors.join(' '))
    const lawan = invoiceAkunLawan(r.value)!
    const lines = buildPurchaseJournalLines({ komponen: invoiceKomponen(r.value), akunLawanId: lawan })
    expect(isBalanced(lines)).toBe(true)
    expect(computeTotals(lines).kredit).toBe(computeInvoiceTotals(r.value.lines, r.value.ppn).totalMinor)
  })
})

describe('isPurchasePaymentMethod', () => {
  it('hanya kredit & tunai', () => {
    expect(isPurchasePaymentMethod('kredit')).toBe(true)
    expect(isPurchasePaymentMethod('tunai')).toBe(true)
    for (const buruk of ['Kredit', 'cash', '', null, 1]) {
      expect(isPurchasePaymentMethod(buruk), String(buruk)).toBe(false)
    }
  })
})
