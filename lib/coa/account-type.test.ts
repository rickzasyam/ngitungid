import { describe, it, expect } from 'vitest'
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  carryAccountTypes,
  cashflowClassOf,
  deriveAccountType,
  deriveIsKas,
  explicitVsDerivedDiff,
  isAccountType,
  normalBalanceOf,
  parseKasCell,
  parseTipeAkunCell,
  resolveAccountType,
  resolveIsKas,
  type CoaTypeInput,
} from './account-type'
import { classifyBs } from '@/lib/financial-agg'

const akun = (o: Partial<CoaTypeInput> & { nama: string }): CoaTypeInput => ({
  posisi: 'Debit',
  kelompok: 'Neraca',
  subKelompok: 'Aktiva Lancar',
  classCf: null,
  tipeAkun: null,
  isKas: false,
  ...o,
})

describe('ACCOUNT_TYPES', () => {
  it('lima golongan persamaan akuntansi, tidak lebih', () => {
    expect([...ACCOUNT_TYPES]).toEqual(['asset', 'liability', 'equity', 'revenue', 'expense'])
  })

  it('setiap tipe punya label', () => {
    for (const t of ACCOUNT_TYPES) expect(ACCOUNT_TYPE_LABEL[t], t).toBeTruthy()
  })

  it('isAccountType menolak yang tidak terdaftar', () => {
    for (const buruk of ['aset', 'Asset', 'liabilities', '', null, 3]) {
      expect(isAccountType(buruk), String(buruk)).toBe(false)
    }
  })
})

describe('deriveAccountType — sisi Neraca', () => {
  it.each([
    ['Aktiva Lancar', 'asset'],
    ['Aktiva Tetap', 'asset'],
    ['Aktiva Tetap Tidak Berwujud', 'asset'],
    ['Aktiva Lainnya', 'asset'],
    ['Hutang Lancar', 'liability'],
    ['Kewajiban Jangka Panjang', 'liability'],
    ['Liabilitas', 'liability'],
    ['Modal', 'equity'],
    ['Ekuitas', 'equity'],
  ] as const)('%s → %s', (subKelompok, tipe) => {
    expect(deriveAccountType(akun({ nama: 'X', kelompok: 'Neraca', subKelompok }))).toBe(tipe)
  })

  it('sub kelompok yang tidak dikenali menghasilkan null, bukan tebakan', () => {
    expect(deriveAccountType(akun({ nama: 'X', kelompok: 'Neraca', subKelompok: 'Entah' }))).toBeNull()
  })
})

describe('deriveAccountType — sisi Laba Rugi', () => {
  it.each([
    ['Penjualan', 'revenue'],
    ['Pendapatan Usaha', 'revenue'],
    ['Harga Pokok Penjualan', 'expense'],
    ['Biaya Variabel', 'expense'],
    ['Fixed Cost', 'expense'],
    ['Pajak', 'expense'],
  ] as const)('%s → %s', (subKelompok, tipe) => {
    expect(deriveAccountType(akun({ nama: 'X', kelompok: 'Laba Rugi', subKelompok }))).toBe(tipe)
  })

  // "Pendapatan dan Biaya Lain-lain" adalah SATU sub kelompok yang memuat dua
  // arah sekaligus, jadi sub kelompoknya tidak bisa memutuskan sendirian.
  it('pos lain-lain diputus oleh posisi: kredit = pendapatan, debit = beban', () => {
    const lain = { nama: 'X', kelompok: 'Laba Rugi', subKelompok: 'Pendapatan dan Biaya Lain-lain' }
    expect(deriveAccountType(akun({ ...lain, posisi: 'Kredit' }))).toBe('revenue')
    expect(deriveAccountType(akun({ ...lain, posisi: 'Debit' }))).toBe('expense')
    // Ejaan Inggris dikenali juga — form baris COA menyimpan apa yang diketik.
    expect(deriveAccountType(akun({ ...lain, posisi: 'Credit' }))).toBe('revenue')
    expect(deriveAccountType(akun({ ...lain, posisi: 'Cr' }))).toBe('revenue')
  })
})

// ══ PENJAGA BERDIRI: KELOMPOK DIPERIKSA SEBELUM SUB KELOMPOK ═════════════
// Kata "tetap" ada di KEDUA sisi: "Aktiva Tetap" (aset) dan "Biaya Tetap"
// (beban). Kalau sub kelompok diperiksa tanpa melihat kelompok, seluruh Aktiva
// Tetap sebuah klien bisa terbaca sebagai beban — angkanya pindah dari Neraca
// ke Laba Rugi tanpa satu pun galat.
describe('kata kunci yang sama di dua kelompok tidak tertukar', () => {
  it('"Aktiva Tetap" di Neraca = asset, "Biaya Tetap" di Laba Rugi = expense', () => {
    expect(deriveAccountType(akun({ nama: 'Mesin', kelompok: 'Neraca', subKelompok: 'Aktiva Tetap' }))).toBe('asset')
    expect(deriveAccountType(akun({ nama: 'Sewa', kelompok: 'Laba Rugi', subKelompok: 'Biaya Tetap' }))).toBe('expense')
  })

  it('kelompok yang tidak dikenali menghasilkan null, tidak jatuh ke salah satu sisi', () => {
    expect(deriveAccountType(akun({ nama: 'X', kelompok: '', subKelompok: 'Aktiva Lancar' }))).toBeNull()
    expect(deriveAccountType(akun({ nama: 'X', kelompok: 'Judul', subKelompok: 'Penjualan' }))).toBeNull()
  })
})

// ══ PENJAGA BERDIRI: AKUN KONTRA ═════════════════════════════════════════
// Inilah alasan tipe TIDAK boleh diturunkan dari `posisi`.
describe('akun kontra — posisi terbalik dari tipenya', () => {
  it('Akumulasi Penyusutan bersaldo KREDIT tapi tetap asset', () => {
    const row = akun({
      nama: 'Akumulasi Penyusutan Kendaraan',
      posisi: 'Kredit',
      kelompok: 'Neraca',
      subKelompok: 'Aktiva Tetap',
    })
    expect(deriveAccountType(row)).toBe('asset')
    expect(normalBalanceOf(row)).toBe('Kredit')
  })

  it('Prive bersaldo DEBIT tapi tetap equity', () => {
    const row = akun({ nama: 'Prive', posisi: 'Debit', kelompok: 'Neraca', subKelompok: 'Modal' })
    expect(deriveAccountType(row)).toBe('equity')
  })
})

describe('resolveAccountType — eksplisit ?? turunan', () => {
  it('eksplisit menang atas turunan', () => {
    const row = akun({ nama: 'Kas', subKelompok: 'Aktiva Lancar', tipeAkun: 'expense' })
    expect(deriveAccountType(row)).toBe('asset')
    expect(resolveAccountType(row)).toBe('expense')
  })

  it('null jatuh ke turunan, bukan ke nilai bawaan', () => {
    expect(resolveAccountType(akun({ nama: 'Kas', tipeAkun: null }))).toBe('asset')
  })

  it('keduanya tidak ada → null', () => {
    expect(resolveAccountType(akun({ nama: 'X', kelompok: 'Judul', subKelompok: '-' }))).toBeNull()
  })
})

describe('deriveIsKas', () => {
  it('aktiva lancar bernama kas/bank', () => {
    for (const nama of ['Kas', 'Kas Kecil', 'Bank BCA', 'Kas di Bank Mandiri']) {
      expect(deriveIsKas(akun({ nama, subKelompok: 'Aktiva Lancar' })), nama).toBe(true)
    }
  })

  it('bukan aktiva lancar tidak pernah kas, walau namanya memuat bank', () => {
    // "Hutang Bank" adalah kewajiban. Tanpa syarat aktiva lancar, ia akan ikut
    // ke daftar akun kas dan muncul sebagai sumber mutasi di §5.E.
    expect(deriveIsKas(akun({ nama: 'Hutang Bank', kelompok: 'Neraca', subKelompok: 'Hutang Lancar' }))).toBe(false)
    expect(deriveIsKas(akun({ nama: 'Biaya Administrasi Bank', kelompok: 'Laba Rugi', subKelompok: 'Fixed Cost' }))).toBe(false)
  })

  it('aktiva lancar tanpa kata kas/bank bukan kas', () => {
    for (const nama of ['Piutang Usaha', 'Persediaan Barang', 'Sewa Dibayar Dimuka']) {
      expect(deriveIsKas(akun({ nama })), nama).toBe(false)
    }
  })

  // Predikatnya HARUS menjawab sama dengan yang dipakai aggregateBalanceSheet
  // untuk baris "Kas & Setara Kas". Disalin sengaja (bentuk barisnya berbeda),
  // jadi kesamaannya yang dikunci, bukan implementasinya.
  it('jawabannya identik dengan predikat kas di financial-agg', () => {
    const sample = [
      { nama: 'Kas', subKelompok: 'Aktiva Lancar' },
      { nama: 'Bank BCA', subKelompok: 'Aktiva Lancar' },
      { nama: 'Piutang Usaha', subKelompok: 'Aktiva Lancar' },
      { nama: 'Hutang Bank', subKelompok: 'Hutang Lancar' },
      { nama: 'Mesin', subKelompok: 'Aktiva Tetap' },
    ]
    for (const s of sample) {
      const agg =
        classifyBs(s.subKelompok) === 'aktivaLancar' &&
        (s.nama.toLowerCase().includes('kas') || s.nama.toLowerCase().includes('bank'))
      expect(deriveIsKas(akun(s)), s.nama).toBe(agg)
    }
  })
})

describe('resolveIsKas', () => {
  it('true eksplisit menang', () => {
    expect(resolveIsKas(akun({ nama: 'Dompet Digital', isKas: true }))).toBe(true)
  })

  it('false TIDAK menimpa turunan yang positif', () => {
    // Kolomnya NOT NULL default false, jadi `false` tersimpan tidak bisa
    // dibedakan dari "belum pernah disetel". Akun kas yang TERLEWAT lebih
    // berbahaya daripada yang salah ikut: yang terlewat membuat mutasi kasnya
    // tidak pernah muncul di mana pun.
    expect(resolveIsKas(akun({ nama: 'Bank BCA', isKas: false }))).toBe(true)
  })

  it('null/undefined diperlakukan seperti belum disetel', () => {
    expect(resolveIsKas(akun({ nama: 'Bank BCA', isKas: null }))).toBe(true)
    expect(resolveIsKas(akun({ nama: 'Piutang', isKas: null }))).toBe(false)
  })
})

describe('normalBalanceOf & cashflowClassOf — membaca kolom yang SUDAH ada', () => {
  it('tidak menghitung apa pun, hanya meneruskan', () => {
    const row = akun({ nama: 'Kas', posisi: 'Debit', classCf: 'Operating' })
    expect(normalBalanceOf(row)).toBe('Debit')
    expect(cashflowClassOf(row)).toBe('Operating')
  })

  it('classCf kosong tetap null, bukan string kosong', () => {
    expect(cashflowClassOf(akun({ nama: 'Kas', classCf: null }))).toBeNull()
    expect(cashflowClassOf(akun({ nama: 'Kas', classCf: undefined }))).toBeNull()
  })
})

describe('explicitVsDerivedDiff', () => {
  it('hanya baris yang eksplisitnya BERBEDA dari turunan', () => {
    const rows = [
      akun({ nama: 'Kas', subKelompok: 'Aktiva Lancar', tipeAkun: 'asset' }), // sama
      akun({ nama: 'Sewa', kelompok: 'Laba Rugi', subKelompok: 'Fixed Cost', tipeAkun: 'asset' }), // beda
      akun({ nama: 'Tanpa Tipe', subKelompok: 'Aktiva Lancar', tipeAkun: null }), // dilewati
    ]
    const diff = explicitVsDerivedDiff(rows)
    expect(diff.map(d => d.row.nama)).toEqual(['Sewa'])
    expect(diff[0]).toMatchObject({ eksplisit: 'asset', turunan: 'expense' })
  })

  it('turunan null IKUT dilaporkan — ia menandai sub kelompok yang belum dikenali', () => {
    const rows = [akun({ nama: 'X', kelompok: 'Neraca', subKelompok: 'Entah', tipeAkun: 'asset' })]
    const diff = explicitVsDerivedDiff(rows)
    expect(diff).toHaveLength(1)
    expect(diff[0].turunan).toBeNull()
  })

  it('baris tanpa tipe eksplisit tidak pernah muncul — perbedaan butuh dua sisi', () => {
    const rows = [akun({ nama: 'X', kelompok: 'Judul', subKelompok: '-' })]
    expect(explicitVsDerivedDiff(rows)).toEqual([])
  })
})

describe('parseTipeAkunCell', () => {
  it('menerima nilai enum maupun ejaan Indonesia', () => {
    expect(parseTipeAkunCell('asset')).toBe('asset')
    expect(parseTipeAkunCell('Aset')).toBe('asset')
    expect(parseTipeAkunCell('AKTIVA')).toBe('asset')
    expect(parseTipeAkunCell('liabilitas')).toBe('liability')
    expect(parseTipeAkunCell('Hutang')).toBe('liability')
    expect(parseTipeAkunCell('Ekuitas')).toBe('equity')
    expect(parseTipeAkunCell('Modal')).toBe('equity')
    expect(parseTipeAkunCell('Pendapatan')).toBe('revenue')
    expect(parseTipeAkunCell('Beban')).toBe('expense')
    expect(parseTipeAkunCell('  Biaya  ')).toBe('expense')
  })

  // Perbedaan null vs undefined di sini BUKAN detail: kosong berarti "biarkan
  // apa adanya", tidak dikenali berarti ada salah ketik yang harus dilaporkan.
  // Menjadikan keduanya null membuat salah ketik lolos tanpa ada yang tahu.
  it('kosong → null, tidak dikenali → undefined', () => {
    for (const kosong of ['', '   ', null, undefined]) {
      expect(parseTipeAkunCell(kosong), String(kosong)).toBeNull()
    }
    for (const asing of ['aktivas', 'liabilities', 'xyz', '??']) {
      expect(parseTipeAkunCell(asing), asing).toBeUndefined()
    }
  })
})

describe('parseKasCell', () => {
  it('ya/tidak dalam beberapa ejaan, termasuk tanda centang tangan', () => {
    for (const ya of ['ya', 'Y', 'true', '1', 'yes', 'x', 'v', true]) {
      expect(parseKasCell(ya), String(ya)).toBe(true)
    }
    for (const tidak of ['tidak', 'T', 'false', '0', 'no', 'bukan', '-', false]) {
      expect(parseKasCell(tidak), String(tidak)).toBe(false)
    }
  })

  it('kosong → null, tidak dikenali → undefined', () => {
    expect(parseKasCell('')).toBeNull()
    expect(parseKasCell(null)).toBeNull()
    expect(parseKasCell('mungkin')).toBeUndefined()
  })
})

// ══ PENJAGA BERDIRI: GANTI-MASSAL TIDAK MENGHAPUS TIPE AKUN ══════════════
// Keputusan Ricko 2026-09-18. Kedua kolom diisi MANUAL lewat layar, sementara
// berkas Excel klien lazimnya tidak memuatnya. Tanpa carryAccountTypes, setiap
// impor ulang COA — yang dilakukan rutin — menghapus seluruh tipe akun yang
// sudah disetel, diam-diam, tanpa satu pun galat.
describe('carryAccountTypes — regresi kehilangan senyap', () => {
  const lama = [
    { kode: '1101', tipeAkun: 'asset' as const, isKas: true },
    { kode: '2101', tipeAkun: 'liability' as const, isKas: false },
  ]

  it('berkas TANPA kolom tipe: nilai lama bertahan seluruhnya', () => {
    const baru = [
      { kode: '1101', nama: 'Bank BCA', tipeAkun: null, isKas: null },
      { kode: '2101', nama: 'Hutang Usaha', tipeAkun: null, isKas: null },
    ]
    expect(carryAccountTypes(lama, baru)).toEqual([
      { kode: '1101', nama: 'Bank BCA', tipeAkun: 'asset', isKas: true },
      { kode: '2101', nama: 'Hutang Usaha', tipeAkun: 'liability', isKas: false },
    ])
  })

  it('berkas YANG mengisi kolomnya menang atas nilai lama', () => {
    const baru = [{ kode: '1101', tipeAkun: 'expense' as const, isKas: false }]
    expect(carryAccountTypes(lama, baru)[0]).toMatchObject({ tipeAkun: 'expense', isKas: false })
  })

  it('kode baru yang belum pernah ada tidak mewarisi apa pun', () => {
    const baru = [{ kode: '9999', tipeAkun: null, isKas: null }]
    expect(carryAccountTypes(lama, baru)).toEqual([{ kode: '9999', tipeAkun: null, isKas: null }])
  })

  it('kode yang HILANG dari berkas baru memang ikut hilang — itu memang ganti-massal', () => {
    const baru = [{ kode: '1101', tipeAkun: null, isKas: null }]
    expect(carryAccountTypes(lama, baru).map(r => r.kode)).toEqual(['1101'])
  })

  it('isKas tidak pernah null di keluaran — kolomnya NOT NULL', () => {
    const baru = [{ kode: '9999', nama: 'Akun Baru', tipeAkun: null, isKas: null }]
    const hasil = carryAccountTypes([{ kode: '9999' }], baru)
    expect(hasil[0].isKas).toBe(false)
  })

  it('baris masukan tidak dimutasi', () => {
    const baru = [{ kode: '1101', tipeAkun: null, isKas: null }]
    carryAccountTypes(lama, baru)
    expect(baru[0]).toEqual({ kode: '1101', tipeAkun: null, isKas: null })
  })
})
