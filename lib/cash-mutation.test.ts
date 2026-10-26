import { describe, it, expect } from 'vitest'
import {
  allocatedMinor,
  allocationRemaining,
  buildAllocationJournalLines,
  buildCounterAccountJournalLines,
  fingerprintMutasi,
  jurnalMengunciMutasi,
  mutationAmountMinor,
  mutationStatus,
  normalizeKeterangan,
  validateCashMutation,
  KETERANGAN_MAX,
} from './cash-mutation'
import { isBalanced, computeTotals } from './journal'

const AKUN_KAS = '11111111-1111-4111-8111-111111111111'
const AKUN_LAWAN = '22222222-2222-4222-8222-222222222222'
const AKUN_HUTANG_A = '33333333-3333-4333-8333-333333333333'
const AKUN_HUTANG_B = '44444444-4444-4444-8444-444444444444'

const dasar = { tanggal: '2026-09-21', akunKasId: AKUN_KAS }

describe('validateCashMutation — sisi debit/kredit (D36)', () => {
  it('menerima mutasi uang masuk (debit terisi)', () => {
    const r = validateCashMutation({ ...dasar, debit: '250000', kredit: '' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.debit).toBe('250000.00')
      expect(r.value.kredit).toBe('0.00')
    }
  })

  it('menerima mutasi uang keluar (kredit terisi)', () => {
    const r = validateCashMutation({ ...dasar, debit: '', kredit: '99.99' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.kredit).toBe('99.99')
  })

  it('MENOLAK dua sisi terisi sekaligus', () => {
    const r = validateCashMutation({ ...dasar, debit: '100', kredit: '100' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('SATU sisi')
  })

  it('MENOLAK kedua sisi kosong', () => {
    const r = validateCashMutation({ ...dasar, debit: '', kredit: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('salah satu sisi')
  })

  it('MENOLAK nominal negatif — arah uang ditentukan sisinya, bukan tandanya', () => {
    // Ditolak di lapis parsing (toMinorUnits menolak tanda minus), jadi yang
    // diuji di sini adalah PENOLAKANNYA, bukan bunyi pesannya.
    expect(validateCashMutation({ ...dasar, debit: '-100', kredit: '' }).ok).toBe(false)
    expect(validateCashMutation({ ...dasar, debit: '', kredit: '-100' }).ok).toBe(false)
  })

  it('aturannya sama persis dengan CHECK di DB: debit>=0, kredit>=0, tepat satu terisi', () => {
    // Tabel kebenaran kecil yang mencerminkan ekspresi CHECK-nya.
    const kasus: [string, string, boolean][] = [
      ['100', '0', true],
      ['0', '100', true],
      ['0', '0', false],
      ['100', '100', false],
    ]
    for (const [d, k, harusLolos] of kasus) {
      const r = validateCashMutation({ ...dasar, debit: d, kredit: k })
      expect(r.ok, `debit=${d} kredit=${k}`).toBe(harusLolos)
    }
  })
})

describe('validateCashMutation — field lain', () => {
  it('mengumpulkan SELURUH galat sekaligus, bukan berhenti di yang pertama', () => {
    const r = validateCashMutation({ tanggal: '21-09-2026', akunKasId: 'bukan-uuid', debit: '', kredit: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('tanggal wajib YYYY-MM-DD', () => {
    expect(validateCashMutation({ ...dasar, tanggal: '2026-13-01', debit: '1' }).ok).toBe(false)
    expect(validateCashMutation({ ...dasar, tanggal: '2026-02-29', debit: '1' }).ok).toBe(false)
  })

  it('keterangan kosong disimpan NULL, bukan string kosong', () => {
    const r = validateCashMutation({ ...dasar, debit: '1', keterangan: '   ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.keterangan).toBeNull()
  })

  it('keterangan terlalu panjang ditolak dengan batas yang disebut', () => {
    const r = validateCashMutation({ ...dasar, debit: '1', keterangan: 'x'.repeat(KETERANGAN_MAX + 1) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain(String(KETERANGAN_MAX))
  })

  it('saldo berjalan boleh NEGATIF — rekening bisa minus', () => {
    const r = validateCashMutation({ ...dasar, debit: '1', saldo: '-50000' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.saldo).toBe('-50000.00')
  })

  it('saldo kosong tetap null — mutasi manual tidak punya kolom itu', () => {
    const r = validateCashMutation({ ...dasar, debit: '1' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.saldo).toBeNull()
  })

  it('akunLawanId yang bukan uuid diabaikan jadi null, tidak menggagalkan barisnya', () => {
    const r = validateCashMutation({ ...dasar, debit: '1', akunLawanId: 'x' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.akunLawanId).toBeNull()
  })
})

describe('normalizeKeterangan — tanpa RegExp dari input (D22)', () => {
  it('huruf kecil, tanda baca jadi pemisah, spasi dirapatkan', () => {
    expect(normalizeKeterangan('  TRF   E-BANKING/BRI  ')).toBe('trf e banking bri')
  })

  it('"BRI-TRF" dan "BRI TRF" menghasilkan bentuk yang sama', () => {
    expect(normalizeKeterangan('BRI-TRF')).toBe(normalizeKeterangan('bri  trf'))
  })

  it('angka dipertahankan — nomor referensi sering jadi pembeda satu-satunya', () => {
    expect(normalizeKeterangan('TRF REF 00912')).toBe('trf ref 00912')
  })

  it('huruf non-ASCII tidak dibuang', () => {
    expect(normalizeKeterangan('Café Süd')).toBe('café süd')
  })

  it('masukan bukan string tidak melempar', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(normalizeKeterangan(v)).toBe('')
    }
  })

  it('teks panjang berulang selesai seketika — tidak ada backtracking (D22)', () => {
    const jahat = ' '.repeat(20000) + 'a' + '-'.repeat(20000)
    const mulai = Date.now()
    expect(normalizeKeterangan(jahat)).toBe('a')
    expect(Date.now() - mulai).toBeLessThan(500)
  })
})

describe('fingerprintMutasi — penanda duplikat, bukan penolak (D38)', () => {
  const m = { tanggal: '2026-09-21', debit: '250000', kredit: '', keterangan: 'TRF BRI' }

  it('dua baris identik menghasilkan sidik jari yang sama', () => {
    expect(fingerprintMutasi(m)).toBe(fingerprintMutasi({ ...m, keterangan: 'trf  bri!' }))
  })

  it('tanggal berbeda → sidik jari berbeda', () => {
    expect(fingerprintMutasi(m)).not.toBe(fingerprintMutasi({ ...m, tanggal: '2026-09-22' }))
  })

  it('nominal berbeda → sidik jari berbeda', () => {
    expect(fingerprintMutasi(m)).not.toBe(fingerprintMutasi({ ...m, debit: '250000.01' }))
  })

  it('SISI berbeda dengan nominal sama → sidik jari BERBEDA', () => {
    // Uang masuk 250rb dan uang keluar 250rb pada hari yang sama bukan duplikat
    // — kalau sisinya ikut lebur, penarikan akan disangka setoran ganda.
    const masuk = fingerprintMutasi({ ...m, debit: '250000', kredit: '' })
    const keluar = fingerprintMutasi({ ...m, debit: '', kredit: '250000' })
    expect(masuk).not.toBe(keluar)
  })

  it('bentuk nominalnya dinormalkan — "250000" dan "250000.00" sama', () => {
    expect(fingerprintMutasi({ ...m, debit: '250000' })).toBe(
      fingerprintMutasi({ ...m, debit: '250000.00' })
    )
  })
})

describe('sisa & status DITURUNKAN (D37, P3)', () => {
  const masuk = { debit: '1000000', kredit: '0.00' }

  it('mutationAmountMinor membaca sisi mana pun yang terisi', () => {
    expect(mutationAmountMinor({ debit: '1000', kredit: '0' })).toBe(100000)
    expect(mutationAmountMinor({ debit: '0', kredit: '1000' })).toBe(100000)
  })

  it('allocatedMinor menjumlahkan dalam SEN', () => {
    expect(allocatedMinor([{ nominal: '0.10' }, { nominal: '0.20' }])).toBe(30)
  })

  it('tiga pecahan sepertiga tidak kehilangan satu sen pun', () => {
    // 1.000.000 dibagi tiga: 333333.34 + 333333.33 + 333333.33
    const alokasi = [{ nominal: '333333.34' }, { nominal: '333333.33' }, { nominal: '333333.33' }]
    expect(allocationRemaining(masuk, alokasi)).toBe(0)
    expect(mutationStatus(masuk, alokasi)).toBe('selesai')
  })

  it('tanpa alokasi & tanpa akun lawan → "belum dijurnal"', () => {
    expect(mutationStatus(masuk, [])).toBe('belum dijurnal')
    expect(mutationStatus(masuk, null)).toBe('belum dijurnal')
  })

  it('alokasi sebagian → "sebagian", dan sisanya benar', () => {
    const alokasi = [{ nominal: '400000' }]
    expect(mutationStatus(masuk, alokasi)).toBe('sebagian')
    expect(allocationRemaining(masuk, alokasi)).toBe(60000000)
  })

  it('akun lawan bebas menutup mutasi sepenuhnya → "selesai"', () => {
    expect(mutationStatus({ ...masuk, akunLawanId: AKUN_LAWAN }, [])).toBe('selesai')
  })

  it('sisa NEGATIF tidak dikepit ke nol — kelebihan alokasi harus terlihat', () => {
    // Route yang mencegahnya terjadi; fungsi ini yang membuatnya kelihatan
    // kalau ia terlanjur terjadi. Math.max(0, …) di sini akan menyembunyikan
    // data rusak dari satu-satunya layar yang bisa menunjukkannya.
    expect(allocationRemaining(masuk, [{ nominal: '1500000' }])).toBe(-50000000)
  })

  it('alokasi tak sah dihitung nol, tidak melempar', () => {
    expect(allocatedMinor([{ nominal: 'abc' }, { nominal: null }, {}])).toBe(0)
  })
})

describe('buildAllocationJournalLines — kasus (a) bayar invoice', () => {
  it('satu invoice: D hutang / K kas, seimbang', () => {
    const lines = buildAllocationJournalLines({
      alokasi: [{ akunHutangId: AKUN_HUTANG_A, minor: 500000 }],
      akunKasId: AKUN_KAS,
    })
    expect(lines).toHaveLength(2)
    expect(lines[0].masterCoaId).toBe(AKUN_HUTANG_A)
    expect(lines[0].debit).toBe('5000.00')
    expect(lines[1].masterCoaId).toBe(AKUN_KAS)
    expect(lines[1].kredit).toBe('5000.00')
    expect(isBalanced(lines)).toBe(true)
  })

  it('beberapa invoice: beberapa baris debit, SATU baris kredit kas', () => {
    const lines = buildAllocationJournalLines({
      alokasi: [
        { akunHutangId: AKUN_HUTANG_A, minor: 300000 },
        { akunHutangId: AKUN_HUTANG_B, minor: 200000 },
      ],
      akunKasId: AKUN_KAS,
    })
    expect(lines).toHaveLength(3)
    expect(lines.filter(l => l.masterCoaId === AKUN_KAS)).toHaveLength(1)
    expect(computeTotals(lines).kredit).toBe(500000)
    expect(isBalanced(lines)).toBe(true)
  })

  it('dua alokasi ke akun hutang yang SAMA tetap dua baris', () => {
    // Yang dibaca akunting adalah "invoice mana dibayar berapa"; menggabungkan
    // barisnya membuang persis informasi itu.
    const lines = buildAllocationJournalLines({
      alokasi: [
        { akunHutangId: AKUN_HUTANG_A, minor: 100000, keterangan: 'INV-1' },
        { akunHutangId: AKUN_HUTANG_A, minor: 100000, keterangan: 'INV-2' },
      ],
      akunKasId: AKUN_KAS,
    })
    expect(lines.filter(l => l.masterCoaId === AKUN_HUTANG_A)).toHaveLength(2)
    expect(lines[0].keterangan).toBe('INV-1')
    expect(lines[1].keterangan).toBe('INV-2')
  })

  it('alokasi bernominal nol atau negatif DILEWATI — baris nol melanggar CHECK', () => {
    const lines = buildAllocationJournalLines({
      alokasi: [
        { akunHutangId: AKUN_HUTANG_A, minor: 0 },
        { akunHutangId: AKUN_HUTANG_B, minor: -5 },
        { akunHutangId: AKUN_HUTANG_A, minor: 100000 },
      ],
      akunKasId: AKUN_KAS,
    })
    expect(lines).toHaveLength(2)
    expect(isBalanced(lines)).toBe(true)
  })

  it('tanpa alokasi sah → daftar KOSONG, bukan jurnal timpang', () => {
    expect(
      buildAllocationJournalLines({ alokasi: [{ akunHutangId: AKUN_HUTANG_A, minor: 0 }], akunKasId: AKUN_KAS })
    ).toEqual([])
  })

  it('lineOrder berurutan dari 0 tanpa lompat', () => {
    const lines = buildAllocationJournalLines({
      alokasi: [
        { akunHutangId: AKUN_HUTANG_A, minor: 100 },
        { akunHutangId: AKUN_HUTANG_B, minor: 200 },
      ],
      akunKasId: AKUN_KAS,
    })
    expect(lines.map(l => l.lineOrder)).toEqual([0, 1, 2])
  })
})

describe('buildCounterAccountJournalLines — kasus (b) COA lawan bebas', () => {
  it('uang KELUAR (kredit kas) → D lawan / K kas', () => {
    const lines = buildCounterAccountJournalLines({
      mutasi: { debit: '0', kredit: '75000' },
      akunKasId: AKUN_KAS,
      akunLawanId: AKUN_LAWAN,
    })
    expect(lines[0].masterCoaId).toBe(AKUN_LAWAN)
    expect(lines[0].debit).toBe('75000.00')
    expect(lines[1].masterCoaId).toBe(AKUN_KAS)
    expect(lines[1].kredit).toBe('75000.00')
    expect(isBalanced(lines)).toBe(true)
  })

  it('uang MASUK (debit kas) → D kas / K lawan', () => {
    const lines = buildCounterAccountJournalLines({
      mutasi: { debit: '75000', kredit: '0' },
      akunKasId: AKUN_KAS,
      akunLawanId: AKUN_LAWAN,
    })
    expect(lines[0].masterCoaId).toBe(AKUN_KAS)
    expect(lines[0].debit).toBe('75000.00')
    expect(lines[1].masterCoaId).toBe(AKUN_LAWAN)
    expect(lines[1].kredit).toBe('75000.00')
    expect(isBalanced(lines)).toBe(true)
  })

  it('membalik sisi mutasinya membalik jurnalnya — bukan menghasilkan yang sama', () => {
    // Penjaga arah. Jurnal terbalik tetap seimbang dan tetap bisa diposting;
    // salahnya baru terlihat saat saldo kas bergerak berlawanan dengan
    // rekening korannya, berbulan-bulan kemudian.
    const masuk = buildCounterAccountJournalLines({
      mutasi: { debit: '1000', kredit: '0' },
      akunKasId: AKUN_KAS,
      akunLawanId: AKUN_LAWAN,
    })
    const keluar = buildCounterAccountJournalLines({
      mutasi: { debit: '0', kredit: '1000' },
      akunKasId: AKUN_KAS,
      akunLawanId: AKUN_LAWAN,
    })
    const sisiKas = (l: { masterCoaId: string; debit: string }[]) =>
      l.find(x => x.masterCoaId === AKUN_KAS)!.debit !== '0.00' ? 'debit' : 'kredit'
    expect(sisiKas(masuk)).toBe('debit')
    expect(sisiKas(keluar)).toBe('kredit')
  })

  it('baris DEBIT selalu di atas, sama dengan jurnal manual', () => {
    for (const mutasi of [{ debit: '500', kredit: '0' }, { debit: '0', kredit: '500' }]) {
      const lines = buildCounterAccountJournalLines({ mutasi, akunKasId: AKUN_KAS, akunLawanId: AKUN_LAWAN })
      expect(lines[0].debit).not.toBe('0.00')
      expect(lines[0].lineOrder).toBe(0)
      expect(lines[1].lineOrder).toBe(1)
    }
  })

  it('mutasi tanpa nominal → daftar KOSONG', () => {
    expect(
      buildCounterAccountJournalLines({
        mutasi: { debit: '0', kredit: '0' },
        akunKasId: AKUN_KAS,
        akunLawanId: AKUN_LAWAN,
      })
    ).toEqual([])
  })

  it('keterangan diteruskan ke KEDUA baris', () => {
    const lines = buildCounterAccountJournalLines({
      mutasi: { debit: '0', kredit: '500' },
      akunKasId: AKUN_KAS,
      akunLawanId: AKUN_LAWAN,
      keterangan: 'Biaya admin bank',
    })
    expect(lines.every(l => l.keterangan === 'Biaya admin bank')).toBe(true)
  })
})

describe('jurnalMengunciMutasi — terposting mengunci, kecuali sudah dibalik', () => {
  const posted = { status: 'posted' }

  it('tanpa jurnal atau jurnal draf → tidak mengunci', () => {
    expect(jurnalMengunciMutasi(null, 0)).toBe(false)
    expect(jurnalMengunciMutasi({ status: 'draft' }, 0)).toBe(false)
  })

  it('terposting tanpa pembalik terposting → mengunci', () => {
    expect(jurnalMengunciMutasi(posted, 0)).toBe(true)
  })

  // Inti perbaikannya: dulu jalan buntu — pesan 409 menyuruh membalik jurnal,
  // tapi mutasinya tetap ditolak sesudah dibalik.
  it('terposting yang sudah dibalik → terbuka', () => {
    expect(jurnalMengunciMutasi(posted, 1)).toBe(false)
  })

  // Membalik pembalik menghidupkan lagi angka aslinya di buku besar; membuka
  // mutasinya di sini akan menghitung angka itu dua kali.
  it('pembaliknya ikut dibalik → mengunci lagi (genap = efek hidup)', () => {
    expect(jurnalMengunciMutasi(posted, 2)).toBe(true)
    expect(jurnalMengunciMutasi(posted, 3)).toBe(false)
  })
})
