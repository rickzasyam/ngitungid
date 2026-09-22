import { describe, it, expect } from 'vitest'
import {
  ageBuckets,
  allocatedToInvoice,
  applyPayments,
  bucketOf,
  emptyBuckets,
  hutangInvoices,
  invoiceOutstanding,
  jatuhTempoMendekat,
  mergeBuckets,
  supplierSummary,
  type AlokasiHutang,
  type InvoiceHutang,
} from './hutang'
import { buildTerminSchedule } from './termin'

const inv = (o: Partial<InvoiceHutang> = {}): InvoiceHutang => ({
  id: 'inv-1',
  caraBayar: 'kredit',
  totalMinor: 3_000_000, // Rp 30.000
  supplierId: 'sup-1',
  supplierNama: 'Toko Jaya',
  noInvoice: 'INV-001',
  tanggal: '2026-01-01',
  jumlahTermin: 3,
  jatuhTempoAkhir: '2026-04-01',
  ...o,
})

/** Jadwal 3 cicilan @ Rp 10.000, mundur dari 2026-04-01. */
const jadwal3 = buildTerminSchedule({
  jatuhTempoAkhir: '2026-04-01',
  jumlahTermin: 3,
  totalMinor: 3_000_000,
})

const alok = (nominal: string, terminUrutan: number | null = null, invoiceId = 'inv-1'): AlokasiHutang => ({
  invoiceId,
  nominal,
  terminUrutan,
})

describe('invoice TUNAI tidak pernah masuk monitoring hutang', () => {
  it('hutangInvoices menyaring di SATU tempat', () => {
    const daftar = [inv(), inv({ id: 'inv-2', caraBayar: 'tunai' })]
    expect(hutangInvoices(daftar).map(i => i.id)).toEqual(['inv-1'])
  })

  it('sisa invoice tunai selalu nol, berapa pun totalnya', () => {
    expect(invoiceOutstanding(inv({ caraBayar: 'tunai' }), [])).toBe(0)
  })

  it('rekap supplier tidak menghitungnya sama sekali', () => {
    const rekap = supplierSummary([inv({ id: 'inv-2', caraBayar: 'tunai' })], [])
    expect(rekap).toEqual([])
  })

  it('daftar jatuh tempo melewatinya walau cicilannya belum lunas', () => {
    const { cicilan } = applyPayments(jadwal3, [])
    const hasil = jatuhTempoMendekat(
      [{ invoice: inv({ caraBayar: 'tunai' }), cicilan }],
      '2026-04-01',
      365
    )
    expect(hasil).toEqual([])
  })
})

describe('invoiceOutstanding', () => {
  it('total dikurangi alokasi, dalam SEN', () => {
    expect(invoiceOutstanding(inv(), [alok('10000')])).toBe(2_000_000)
  })

  it('alokasi ke invoice LAIN tidak ikut mengurangi', () => {
    expect(invoiceOutstanding(inv(), [alok('10000', null, 'inv-lain')])).toBe(3_000_000)
  })

  it('lunas tepat → nol', () => {
    expect(invoiceOutstanding(inv(), [alok('30000')])).toBe(0)
  })

  it('kelebihan alokasi DIKEPIT ke nol — beda dari sisa mutasi', () => {
    // Di mutasi, sisa negatif sengaja terlihat. Di sini angkanya dijumlahkan
    // lintas-invoice jadi total hutang klien: satu invoice negatif akan
    // diam-diam MENGURANGI hutang invoice lain, dan totalnya terlihat wajar.
    expect(invoiceOutstanding(inv(), [alok('50000')])).toBe(0)
  })

  it('alokasi tak sah dihitung nol, tidak melempar', () => {
    expect(allocatedToInvoice('inv-1', [{ invoiceId: 'inv-1', nominal: 'abc', terminUrutan: null }])).toBe(0)
  })
})

describe('applyPayments — FIFO sebagai bawaan', () => {
  it('pembayaran sebagian menutup cicilan PERTAMA lebih dulu', () => {
    const { cicilan } = applyPayments(jadwal3, [alok('10000')])
    expect(cicilan[0].lunas).toBe(true)
    expect(cicilan[1].lunas).toBe(false)
    expect(cicilan[1].tertutupMinor).toBe(0)
  })

  it('pembayaran berlebih MELUBER ke cicilan berikutnya', () => {
    const { cicilan } = applyPayments(jadwal3, [alok('15000')])
    expect(cicilan[0].lunas).toBe(true)
    expect(cicilan[1].tertutupMinor).toBe(500_000)
    expect(cicilan[1].lunas).toBe(false)
  })

  it('total tertutup tidak pernah melebihi total invoice', () => {
    const { cicilan, luberMinor } = applyPayments(jadwal3, [alok('50000')])
    const total = cicilan.reduce((s, c) => s + c.tertutupMinor, 0)
    expect(total).toBe(3_000_000)
    expect(luberMinor).toBe(2_000_000)
  })

  it('beberapa alokasi kecil menumpuk sampai cicilan lunas', () => {
    const { cicilan } = applyPayments(jadwal3, [alok('4000'), alok('6000')])
    expect(cicilan[0].lunas).toBe(true)
    expect(cicilan[1].tertutupMinor).toBe(0)
  })

  it('tanpa alokasi, tidak ada satu cicilan pun tertutup', () => {
    const { cicilan, luberMinor, pakuYatim } = applyPayments(jadwal3, [])
    expect(cicilan.every(c => c.tertutupMinor === 0 && !c.lunas)).toBe(true)
    expect(luberMinor).toBe(0)
    expect(pakuYatim).toEqual([])
  })
})

describe('applyPayments — penimpaan manual (D40)', () => {
  it('alokasi berpaku menutup cicilan yang dipakunya, bukan yang terlama', () => {
    const { cicilan } = applyPayments(jadwal3, [alok('10000', 3)])
    expect(cicilan[0].lunas).toBe(false)
    expect(cicilan[2].lunas).toBe(true)
    expect(cicilan[2].dipakuManual).toBe(true)
  })

  it('cicilan berpaku TIDAK DISEROBOT FIFO walau urutan bacanya ditukar', () => {
    // Penjaga yang paling penting di modul ini. Kalau FIFO jalan lebih dulu, ia
    // memakan cicilan yang sudah dipaku seseorang — dan hasilnya jadi
    // bergantung pada urutan baca dari database, sehingga dua pembacaan yang
    // sama-sama sah menghasilkan umur hutang yang BERBEDA.
    const berpaku = alok('10000', 3)
    const bebas = alok('10000')

    const a = applyPayments(jadwal3, [berpaku, bebas])
    const b = applyPayments(jadwal3, [bebas, berpaku])

    for (const hasil of [a, b]) {
      expect(hasil.cicilan[0].lunas).toBe(true) // yang bebas → FIFO
      expect(hasil.cicilan[1].lunas).toBe(false)
      expect(hasil.cicilan[2].lunas).toBe(true) // yang berpaku
    }
    expect(a.cicilan.map(c => c.tertutupMinor)).toEqual(b.cicilan.map(c => c.tertutupMinor))
  })

  it('dua paku ke cicilan berbeda: hasilnya sama apa pun urutan masukannya', () => {
    const p2 = alok('10000', 2)
    const p3 = alok('10000', 3)
    const a = applyPayments(jadwal3, [p2, p3])
    const b = applyPayments(jadwal3, [p3, p2])
    expect(a.cicilan.map(c => c.tertutupMinor)).toEqual(b.cicilan.map(c => c.tertutupMinor))
    expect(a.cicilan[0].lunas).toBe(false)
  })

  it('LUBERAN alokasi berpaku jatuh ke cicilan SESUDAHNYA, bukan ditolak', () => {
    // Menolaknya berarti memaksa akunting memecah satu pembayaran jadi
    // beberapa alokasi hanya supaya angkanya pas.
    const { cicilan, luberMinor } = applyPayments(jadwal3, [alok('15000', 2)])
    expect(cicilan[1].lunas).toBe(true)
    expect(cicilan[2].tertutupMinor).toBe(500_000)
    expect(cicilan[0].tertutupMinor).toBe(0) // TIDAK mundur ke cicilan sebelumnya
    expect(luberMinor).toBe(0)
  })

  it('luberan dari cicilan TERAKHIR tercatat sebagai luber, bukan hilang', () => {
    const { luberMinor } = applyPayments(jadwal3, [alok('15000', 3)])
    expect(luberMinor).toBe(500_000)
  })
})

describe('applyPayments — paku YATIM', () => {
  // Invoice yang terminnya dikurangi setelah pembayaran dialokasikan
  // meninggalkan paku yang menunjuk cicilan yang sudah tidak ada.
  const jadwal2 = buildTerminSchedule({
    jatuhTempoAkhir: '2026-03-01',
    jumlahTermin: 2,
    totalMinor: 2_000_000,
  })

  it('TIDAK melempar — laporan tidak boleh mati karena satu baris', () => {
    expect(() => applyPayments(jadwal2, [alok('10000', 5)])).not.toThrow()
  })

  it('jatuh kembali ke FIFO, bukan dianggap cicilan terakhir', () => {
    // Menganggapnya cicilan terakhir berarti menebak maksud orang.
    const { cicilan } = applyPayments(jadwal2, [alok('10000', 5)])
    expect(cicilan[0].lunas).toBe(true)
    expect(cicilan[1].lunas).toBe(false)
  })

  it('DITANDAI di pakuYatim, lengkap dengan nominalnya', () => {
    const { pakuYatim } = applyPayments(jadwal2, [alok('10000', 5)])
    expect(pakuYatim).toEqual([{ terminUrutan: 5, nominalMinor: 1_000_000 }])
  })

  it('tidak ada cicilan yang ditandai dipakuManual oleh paku yatim', () => {
    const { cicilan } = applyPayments(jadwal2, [alok('10000', 5)])
    expect(cicilan.every(c => c.dipakuManual !== true)).toBe(true)
  })
})

describe('applyPayments — sen bulat', () => {
  it('tiga cicilan dari total ganjil tetap berjumlah persis', () => {
    // 1.000.000 sen dibagi 3: sisa sennya ada di cicilan TERAKHIR (lib/termin).
    const jadwal = buildTerminSchedule({
      jatuhTempoAkhir: '2026-04-01',
      jumlahTermin: 3,
      totalMinor: 1_000_000,
    })
    const { cicilan, luberMinor } = applyPayments(jadwal, [alok('10000')])
    const total = cicilan.reduce((s, c) => s + c.tertutupMinor, 0)
    expect(total).toBe(1_000_000)
    expect(luberMinor).toBe(0)
    expect(cicilan.every(c => c.lunas)).toBe(true)
  })

  it('pembayaran satu sen kurang menyisakan tepat satu sen', () => {
    const { cicilan } = applyPayments(jadwal3, [alok('29999.99')])
    expect(cicilan[2].sisaMinor).toBe(1)
    expect(cicilan[2].lunas).toBe(false)
  })
})

describe('bucketOf — batas hari INKLUSIF', () => {
  it('jatuh tempo hari ini BELUM telat', () => {
    expect(bucketOf('2026-09-22', '2026-09-22')).toBe('belumJatuhTempo')
  })

  it('jatuh tempo besok belum telat', () => {
    expect(bucketOf('2026-09-23', '2026-09-22')).toBe('belumJatuhTempo')
  })

  it('telat 1 hari → ember 1–30', () => {
    expect(bucketOf('2026-09-21', '2026-09-22')).toBe('telat1_30')
  })

  it('batas 30/31 ditulis eksplisit', () => {
    // Batas yang tidak ditulis adalah batas yang bergeser satu hari saat
    // seseorang menyentuh perbandingannya.
    expect(bucketOf('2026-08-23', '2026-09-22')).toBe('telat1_30') // telat 30
    expect(bucketOf('2026-08-22', '2026-09-22')).toBe('telat31_60') // telat 31
  })

  it('batas 60/61 ditulis eksplisit', () => {
    expect(bucketOf('2026-07-24', '2026-09-22')).toBe('telat31_60') // telat 60
    expect(bucketOf('2026-07-23', '2026-09-22')).toBe('telat61_90') // telat 61
  })

  it('batas 90/91 ditulis eksplisit', () => {
    expect(bucketOf('2026-06-24', '2026-09-22')).toBe('telat61_90') // telat 90
    expect(bucketOf('2026-06-23', '2026-09-22')).toBe('telatLebih90') // telat 91
  })

  it('melintasi kabisat tanpa bergeser', () => {
    // 2024 kabisat: 29 Feb ada. Telat 1 hari, bukan 2.
    expect(bucketOf('2024-02-29', '2024-03-01')).toBe('telat1_30')
  })
})

describe('ageBuckets', () => {
  const asOf = '2026-09-22'

  it('menjumlahkan SISA cicilan, bukan nominal penuhnya', () => {
    // Cicilan yang sudah terbayar separuh hanya menyisakan separuh sebagai
    // kewajiban; memakai nominal penuh membuat total hutang lebih besar dari
    // yang sebenarnya terutang.
    const jadwal = buildTerminSchedule({
      jatuhTempoAkhir: '2026-09-01',
      jumlahTermin: 1,
      totalMinor: 1_000_000,
    })
    const { cicilan } = applyPayments(jadwal, [alok('4000')])
    const ember = ageBuckets(cicilan, asOf)
    expect(ember.telat1_30).toBe(600_000)
  })

  it('cicilan LUNAS tidak masuk ember mana pun', () => {
    const jadwal = buildTerminSchedule({
      jatuhTempoAkhir: '2026-09-01',
      jumlahTermin: 1,
      totalMinor: 1_000_000,
    })
    const { cicilan } = applyPayments(jadwal, [alok('10000')])
    expect(ageBuckets(cicilan, asOf)).toEqual(emptyBuckets())
  })

  it('cicilan tersebar ke ember yang berbeda', () => {
    const jadwal = buildTerminSchedule({
      jatuhTempoAkhir: '2026-10-01',
      jumlahTermin: 3,
      totalMinor: 3_000_000,
    })
    // Cicilannya: 2026-08-01, 2026-09-01, 2026-10-01.
    const { cicilan } = applyPayments(jadwal, [])
    const ember = ageBuckets(cicilan, asOf)
    expect(ember.telat31_60).toBe(1_000_000) // 1 Agu → telat 52
    expect(ember.telat1_30).toBe(1_000_000) // 1 Sep → telat 21
    expect(ember.belumJatuhTempo).toBe(1_000_000) // 1 Okt
  })

  it('mergeBuckets menjumlahkan lintas invoice tanpa mengubah masukannya', () => {
    const a = { ...emptyBuckets(), telat1_30: 100 }
    const b = { ...emptyBuckets(), telat1_30: 50, telatLebih90: 7 }
    expect(mergeBuckets(a, b)).toEqual({ ...emptyBuckets(), telat1_30: 150, telatLebih90: 7 })
    expect(a.telat1_30).toBe(100)
  })
})

describe('jatuhTempoMendekat — PER CICILAN, bukan per invoice', () => {
  const invoice = inv({ jatuhTempoAkhir: '2026-12-01', jumlahTermin: 6, totalMinor: 6_000_000 })
  const jadwal6 = buildTerminSchedule({
    jatuhTempoAkhir: '2026-12-01',
    jumlahTermin: 6,
    totalMinor: 6_000_000,
  })
  const { cicilan } = applyPayments(jadwal6, [])

  it('cicilan yang jatuh tempo minggu ini terlihat walau invoicenya berakhir Desember', () => {
    // Daftar yang memakai jatuh_tempo_akhir saja akan menyembunyikan lima dari
    // enam kewajiban sampai bulan terakhir — dan saat itu semuanya sudah telat.
    const hasil = jatuhTempoMendekat([{ invoice, cicilan }], '2026-08-25', 14)
    expect(hasil.length).toBeGreaterThan(0)
    expect(hasil.some(h => h.tanggal === '2026-09-01')).toBe(true)
  })

  it('yang sudah LEWAT dan belum lunas ikut tampil', () => {
    const hasil = jatuhTempoMendekat([{ invoice, cicilan }], '2026-09-22', 7)
    expect(hasil.some(h => h.hariLagi < 0)).toBe(true)
  })

  it('paling telat di ATAS', () => {
    const hasil = jatuhTempoMendekat([{ invoice, cicilan }], '2026-09-22', 30)
    for (let i = 1; i < hasil.length; i++) {
      expect(hasil[i].hariLagi).toBeGreaterThanOrEqual(hasil[i - 1].hariLagi)
    }
  })

  it('cicilan lunas tidak pernah muncul', () => {
    const lunasSemua = applyPayments(jadwal6, [alok('60000')])
    expect(jatuhTempoMendekat([{ invoice, cicilan: lunasSemua.cicilan }], '2026-12-01', 365)).toEqual([])
  })

  it('membawa nomor cicilan & supplier supaya barisnya bisa ditindak', () => {
    const [pertama] = jatuhTempoMendekat([{ invoice, cicilan }], '2026-09-22', 30)
    expect(pertama.terminUrutan).toBeGreaterThanOrEqual(1)
    expect(pertama.supplierNama).toBe('Toko Jaya')
    expect(pertama.noInvoice).toBe('INV-001')
  })
})

describe('supplierSummary', () => {
  const daftar = [
    inv({ id: 'a', supplierId: 's1', supplierNama: 'Toko Jaya', totalMinor: 3_000_000 }),
    inv({ id: 'b', supplierId: 's1', supplierNama: 'Toko Jaya', totalMinor: 2_000_000 }),
    inv({ id: 'c', supplierId: 's2', supplierNama: 'CV Abadi', totalMinor: 1_000_000 }),
  ]

  it('menggabungkan invoice per supplier', () => {
    const rekap = supplierSummary(daftar, [])
    expect(rekap).toHaveLength(2)
    const jaya = rekap.find(r => r.supplierId === 's1')!
    expect(jaya.invoiceCount).toBe(2)
    expect(jaya.totalMinor).toBe(5_000_000)
    expect(jaya.sisaMinor).toBe(5_000_000)
  })

  it('total = dibayar + sisa, selalu', () => {
    const rekap = supplierSummary(daftar, [alok('10000', null, 'a'), alok('5000', null, 'c')])
    for (const r of rekap) {
      expect(r.dibayarMinor + r.sisaMinor).toBe(r.totalMinor)
    }
  })

  it('kelebihan alokasi tidak membuat "dibayar" melebihi total', () => {
    const rekap = supplierSummary(daftar, [alok('99999', null, 'c')])
    const abadi = rekap.find(r => r.supplierId === 's2')!
    expect(abadi.dibayarMinor).toBe(1_000_000)
    expect(abadi.sisaMinor).toBe(0)
  })

  it('urut menurun menurut sisa — yang paling besar di atas', () => {
    const rekap = supplierSummary(daftar, [])
    expect(rekap[0].supplierId).toBe('s1')
  })

  it('daftar kosong menghasilkan rekap kosong, bukan melempar', () => {
    expect(supplierSummary([], null)).toEqual([])
  })
})
