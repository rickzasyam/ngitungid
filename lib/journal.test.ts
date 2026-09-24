import { describe, it, expect } from 'vitest'
import {
  JOURNAL_STATUS,
  JOURNAL_SOURCE,
  JOURNAL_STATUS_LABEL,
  JOURNAL_SOURCE_LABEL,
  MIN_LINES,
  NO_BUKTI_MAX,
  toMinorUnits,
  fromMinorUnits,
  computeTotals,
  isBalanced,
  validateJournalInput,
  canEditJournal,
  isSumberModul,
  SUMBER_MODUL,
  SUMBER_MODUL_LABEL,
  sumberDokumenHref,
  canPost,
  canReverse,
  buildReversalLines,
  defaultReversalNoBukti,
  JOURNAL_EVENTS,
  type JournalInput,
} from './journal'

const AKUN_A = '11111111-1111-4111-8111-111111111111'
const AKUN_B = '22222222-2222-4222-8222-222222222222'

/** Jurnal sah paling sederhana: dua baris, seimbang. */
const base: JournalInput = {
  tanggal: '2026-09-15',
  noBukti: 'JU-2026-09-001',
  keterangan: 'Pembayaran gaji karyawan September',
  lines: [
    { masterCoaId: AKUN_A, debit: '5000000', kredit: '' },
    { masterCoaId: AKUN_B, debit: '', kredit: '5000000' },
  ],
}

/** Galat pertama yang cocok dengan potongan teks — pesan lengkapnya sengaja
 *  tidak diuji harfiah supaya penghalusan kalimat tidak memecahkan test. */
const punyaGalat = (errors: string[], potongan: string) =>
  errors.some((e) => e.includes(potongan))

describe('konstanta', () => {
  it('status dan sumber sesuai enum Postgres', () => {
    expect(JOURNAL_STATUS).toEqual(['draft', 'posted'])
    // 'manual' sejak 0010; 'pembelian' & 'mutasi_kas' ditambah 0016 lewat
    // ADD VALUE. URUTANNYA IKUT: daftar di lib harus mengikuti urutan fisik
    // enum di Postgres, kalau tidak perbandingan dengan migrasinya tak berarti.
    expect(JOURNAL_SOURCE).toEqual(['manual', 'pembelian', 'mutasi_kas'])
  })

  // ══ D32: jurnal bersumber modul dimiliki dokumen asalnya ══════════
  it('SUMBER_MODUL memuat sumber yang jurnalnya dibuat otomatis', () => {
    expect([...SUMBER_MODUL]).toEqual(['pembelian', 'mutasi_kas'])
    // 'manual' BUKAN sumber modul — jurnal yang diketik tangan tetap bisa
    // diubah dari /jurnal, dan itu seluruh gunanya pembedaan ini.
    expect(isSumberModul('manual')).toBe(false)
    for (const m of SUMBER_MODUL) expect(isSumberModul(m), m).toBe(true)
  })

  it('isSumberModul aman terhadap null/undefined/nilai asing', () => {
    for (const buruk of [null, undefined, '', 'Pembelian', 'entah']) {
      expect(isSumberModul(buruk as string | null), String(buruk)).toBe(false)
    }
  })

  it('setiap sumber modul punya label untuk tombol "Koreksi di …"', () => {
    for (const m of SUMBER_MODUL) expect(SUMBER_MODUL_LABEL[m], m).toBeTruthy()
  })

  it('setiap nilai enum punya label', () => {
    for (const s of JOURNAL_STATUS) expect(JOURNAL_STATUS_LABEL[s]).toBeTruthy()
    for (const s of JOURNAL_SOURCE) expect(JOURNAL_SOURCE_LABEL[s]).toBeTruthy()
  })

  it('batas sesuai spesifikasi', () => {
    expect(MIN_LINES).toBe(2)
    expect(NO_BUKTI_MAX).toBe(80)
  })
})

// ══ PENJAGA BERDIRI: SEN TIDAK PERNAH MELESET ═══════════════════
// Seluruh alasan modul ini ada. Kalau penjumlahan pindah ke float, test di blok
// ini yang jatuh lebih dulu — sebelum ada neraca yang tidak bisa dijelaskan.
describe('sen bulat — tidak ada drift float', () => {
  it('0.1 + 0.2 seimbang lawan 0.3 (yang GAGAL kalau dijumlah sebagai float)', () => {
    // Bukti bahwa jalur naifnya memang meleset:
    expect(0.1 + 0.2).not.toBe(0.3)

    const lines = [
      { masterCoaId: AKUN_A, debit: '0.10', kredit: '' },
      { masterCoaId: AKUN_A, debit: '0.20', kredit: '' },
      { masterCoaId: AKUN_B, debit: '', kredit: '0.30' },
    ]
    const t = computeTotals(lines)
    expect(t.debit).toBe(30)
    expect(t.kredit).toBe(30)
    expect(t.selisih).toBe(0)
    expect(isBalanced(lines)).toBe(true)
  })

  it('seratus baris 0.01 berjumlah tepat 1.00', () => {
    const lines = Array.from({ length: 100 }, () => ({
      masterCoaId: AKUN_A,
      debit: '0.01',
      kredit: '',
    }))
    expect(computeTotals(lines).debit).toBe(100)
    expect(fromMinorUnits(computeTotals(lines).debit)).toBe('1.00')
  })

  it('toMinorUnits menerima bentuk yang sah dan menolak yang tidak', () => {
    expect(toMinorUnits('0')).toBe(0)
    expect(toMinorUnits('1000')).toBe(100_000)
    expect(toMinorUnits('1000.00')).toBe(100_000)
    expect(toMinorUnits('1000.5')).toBe(100_050)
    expect(toMinorUnits('1000.05')).toBe(100_005)
    expect(toMinorUnits(1234.56)).toBe(123_456)

    expect(toMinorUnits('')).toBeNull()
    expect(toMinorUnits('abc')).toBeNull()
    expect(toMinorUnits('12.345.67')).toBeNull() // kelompok ribuan bukan 3 angka
    expect(toMinorUnits('1.000,505')).toBeNull() // lebih dari 2 desimal
    expect(toMinorUnits(null)).toBeNull()
    expect(toMinorUnits(undefined)).toBeNull()
  })

  // Sampai 2026-09-24 pemisah ribuan DITOLAK di sini ('1.234' dan '1,000' → null).
  // Keputusan Ricko hari itu: input uang menerima format Indonesia. Aturannya
  // hidup di lib/nominal.ts dan diuji lengkap di sana; ini memastikan jalurnya
  // benar-benar sampai ke toMinorUnits, yang dipakai form DAN server.
  it('toMinorUnits membaca format Indonesia lewat lib/nominal', () => {
    expect(toMinorUnits('1.500.000,25')).toBe(150_000_025)
    expect(toMinorUnits('500000,25')).toBe(50_000_025)
    expect(toMinorUnits('1.000')).toBe(100_000) // seribu, bukan satu
    expect(toMinorUnits('1,000')).toBe(100_000)
    expect(toMinorUnits('1.234')).toBe(123_400)
    expect(toMinorUnits('1.000,5')).toBe(100_050)
  })

  it('nominal negatif ditolak di kedua bentuk', () => {
    expect(toMinorUnits('-5')).toBeNull()
    expect(toMinorUnits('-5.00')).toBeNull()
    expect(toMinorUnits(-5)).toBeNull()
  })

  it('nilai di atas batas aman ditolak, bukan dibulatkan diam-diam', () => {
    // MAX_SAFE_INTEGER ≈ 9.007e15 sen ≈ Rp 90,07 triliun. Rp 90 triliun tepat
    // masih di bawahnya, jadi harus lolos; yang jauh di atas harus null.
    expect(toMinorUnits('99999999999999999')).toBeNull()
    expect(toMinorUnits('90000000000000')).toBe(9_000_000_000_000_000)
    expect(9_000_000_000_000_000).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })

  it('fromMinorUnits adalah kebalikan toMinorUnits', () => {
    for (const s of ['0.00', '0.01', '0.10', '1.00', '999.99', '1000000.00']) {
      expect(fromMinorUnits(toMinorUnits(s)!)).toBe(s)
    }
  })
})

describe('computeTotals', () => {
  it('sengaja permisif — nominal belum sah dihitung 0, tidak melempar', () => {
    const t = computeTotals([
      { masterCoaId: AKUN_A, debit: '', kredit: '' },
      { masterCoaId: AKUN_A, debit: 'abc', kredit: undefined },
      { masterCoaId: AKUN_A, debit: '100', kredit: null },
    ])
    expect(t.debit).toBe(10_000)
    expect(t.kredit).toBe(0)
  })

  it('daftar kosong / null / undefined berjumlah nol dan seimbang', () => {
    for (const v of [[], null, undefined]) {
      expect(computeTotals(v).selisih).toBe(0)
      expect(isBalanced(v)).toBe(true)
    }
  })

  it('sisiLebih menunjuk sisi yang lebih besar, null kalau seimbang', () => {
    expect(computeTotals([{ debit: '100' }, { kredit: '40' }]).sisiLebih).toBe('debit')
    expect(computeTotals([{ debit: '40' }, { kredit: '100' }]).sisiLebih).toBe('kredit')
    expect(computeTotals([{ debit: '100' }, { kredit: '100' }]).sisiLebih).toBeNull()
  })

  it('selisih selalu MUTLAK, apa pun sisi yang lebih besar', () => {
    expect(computeTotals([{ debit: '100' }, { kredit: '40' }]).selisih).toBe(6_000)
    expect(computeTotals([{ debit: '40' }, { kredit: '100' }]).selisih).toBe(6_000)
  })

  it('isBalanced HANYA soal kesamaan — jurnal serba nol lolos di sini', () => {
    // Yang menolaknya adalah validateJournalInput, supaya pesannya bisa
    // menunjuk baris yang mana.
    expect(isBalanced([{ debit: '0', kredit: '0' }, { debit: '0', kredit: '0' }])).toBe(true)
  })
})

describe('validateJournalInput — jurnal yang sah', () => {
  it('menerima jurnal dua baris yang seimbang', () => {
    const r = validateJournalInput(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.noBukti).toBe('JU-2026-09-001')
    expect(r.value.lines).toHaveLength(2)
  })

  it('menormalkan nominal ke 2 desimal dan mengisi sisi kosong dengan 0.00', () => {
    const r = validateJournalInput(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.lines[0]).toMatchObject({ debit: '5000000.00', kredit: '0.00' })
    expect(r.value.lines[1]).toMatchObject({ debit: '0.00', kredit: '5000000.00' })
  })

  it("'1000' dan '1000.00' tidak pernah terbaca berbeda", () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '1000', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '1000.00' },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('lineOrder diberikan berurutan dari 0, mengikuti urutan input', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '300', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '100' },
        { masterCoaId: AKUN_B, debit: '', kredit: '200' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.lines.map((l) => l.lineOrder)).toEqual([0, 1, 2])
  })

  it('keterangan baris kosong jadi null, yang terisi di-trim', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '100', kredit: '', keterangan: '   ' },
        { masterCoaId: AKUN_B, debit: '', kredit: '100', keterangan: '  bank BCA  ' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.lines[0].keterangan).toBeNull()
    expect(r.value.lines[1].keterangan).toBe('bank BCA')
  })

  it('no bukti & keterangan header di-trim', () => {
    const r = validateJournalInput({ ...base, noBukti: '  JU-1  ', keterangan: '  sewa  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.noBukti).toBe('JU-1')
    expect(r.value.keterangan).toBe('sewa')
  })

  it('no bukti tepat 80 karakter masih diterima', () => {
    const r = validateJournalInput({ ...base, noBukti: 'A'.repeat(NO_BUKTI_MAX) })
    expect(r.ok).toBe(true)
  })
})

describe('validateJournalInput — keseimbangan', () => {
  it('menolak jurnal yang tidak seimbang dan menyebut selisih + sisi', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '5000000', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '4000000' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, '1000000.00')).toBe(true)
    expect(punyaGalat(r.errors, 'debit lebih besar')).toBe(true)
  })

  it('selisih satu sen pun ditolak — tidak ada toleransi', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '100.01', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '100.00' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, '0.01')).toBe(true)
  })

  it('menyebut sisi kredit ketika kredit yang lebih besar', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '100', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '400' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'kredit lebih besar')).toBe(true)
  })
})

describe('validateJournalInput — aturan per baris', () => {
  it('menolak jurnal satu baris', () => {
    const r = validateJournalInput({
      ...base,
      lines: [{ masterCoaId: AKUN_A, debit: '100', kredit: '' }],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'minimal 2 baris')).toBe(true)
  })

  it('menolak jurnal tanpa baris sama sekali', () => {
    for (const lines of [[], undefined, null, 'bukan array']) {
      const r = validateJournalInput({ ...base, lines })
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(punyaGalat(r.errors, 'minimal 2 baris')).toBe(true)
    }
  })

  it('menolak baris yang mengisi debit DAN kredit sekaligus', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '100', kredit: '100' },
        { masterCoaId: AKUN_B, debit: '', kredit: '100' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'Baris 1')).toBe(true)
    expect(punyaGalat(r.errors, 'tidak keduanya')).toBe(true)
  })

  it('menolak baris yang kedua sisinya kosong', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'Baris 1')).toBe(true)
    expect(punyaGalat(r.errors, 'Baris 2')).toBe(true)
    expect(punyaGalat(r.errors, 'salah satu sisi')).toBe(true)
  })

  it('menolak baris bernilai 0 eksplisit di kedua sisi', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '0', kredit: '0' },
        { masterCoaId: AKUN_B, debit: '0.00', kredit: '0' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'salah satu sisi')).toBe(true)
  })

  it('menolak nominal negatif, menyebut barisnya', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '-100', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '-100' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'Baris 1: nominal debit tidak valid')).toBe(true)
    expect(punyaGalat(r.errors, 'Baris 2: nominal kredit tidak valid')).toBe(true)
  })

  it('menolak akun yang belum dipilih atau bukan UUID', () => {
    for (const id of ['', '   ', 'bukan-uuid', 123, null, undefined]) {
      const r = validateJournalInput({
        ...base,
        lines: [
          { masterCoaId: id, debit: '100', kredit: '' },
          { masterCoaId: AKUN_B, debit: '', kredit: '100' },
        ],
      })
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(punyaGalat(r.errors, 'Baris 1: akun belum dipilih')).toBe(true)
    }
  })

  it('baris null/undefined di dalam array tidak melempar', () => {
    const r = validateJournalInput({
      ...base,
      lines: [null, undefined] as unknown as JournalInput['lines'],
    })
    expect(r.ok).toBe(false)
  })
})

describe('validateJournalInput — header', () => {
  it('menolak tanggal yang formatnya benar tapi tidak ada (31 Februari)', () => {
    for (const tanggal of ['2026-02-31', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31']) {
      const r = validateJournalInput({ ...base, tanggal })
      expect(r.ok, tanggal).toBe(false)
      if (r.ok) continue
      expect(punyaGalat(r.errors, 'Tanggal tidak valid'), tanggal).toBe(true)
    }
  })

  it('menerima 29 Februari di tahun kabisat, menolak di tahun biasa', () => {
    expect(validateJournalInput({ ...base, tanggal: '2028-02-29' }).ok).toBe(true)
    expect(validateJournalInput({ ...base, tanggal: '2026-02-29' }).ok).toBe(false)
  })

  it('menolak tanggal yang bukan string YYYY-MM-DD', () => {
    for (const tanggal of ['15/09/2026', '2026-9-15', '', null, undefined, 20260915]) {
      expect(validateJournalInput({ ...base, tanggal }).ok, String(tanggal)).toBe(false)
    }
  })

  it('menolak nomor bukti yang melebihi batas', () => {
    const r = validateJournalInput({ ...base, noBukti: 'A'.repeat(NO_BUKTI_MAX + 1) })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, `maksimal ${NO_BUKTI_MAX} karakter`)).toBe(true)
  })
})

// ══ PENJAGA BERDIRI: KOSONG JADI NULL, BUKAN STRING KOSONG ═══════
// Nomor bukti & keterangan jadi OPSIONAL 2026-09-16 (keputusan Ricko sesudah
// uji klik CP-3). Dua test di blok ini dulu berbunyi kebalikannya — "menolak
// nomor bukti kosong" dan "menolak keterangan kosong" — dan sengaja dibalik.
//
// Yang TIDAK boleh berubah: hasilnya harus NULL, bukan ''. `no_bukti` punya
// unique(client_id, no_bukti), dan '' adalah satu nilai konkret — jurnal KEDUA
// tanpa nomor bukti akan bentrok dengan yang pertama. NULL tidak pernah bentrok
// dengan NULL di Postgres. Kalau normalisasi ini bergeser balik ke '', gejalanya
// muncul jauh dari sini: akunting tidak bisa menyimpan jurnal kedua tanpa nomor
// bukti, dengan pesan "nomor bukti sudah dipakai" yang tidak masuk akal.
describe('nomor bukti & keterangan opsional', () => {
  it('nomor bukti kosong DITERIMA dan disimpan sebagai null', () => {
    for (const noBukti of ['', '   ', null, undefined, 42]) {
      const r = validateJournalInput({ ...base, noBukti })
      expect(r.ok, String(noBukti)).toBe(true)
      if (!r.ok) continue
      expect(r.value.noBukti, String(noBukti)).toBeNull()
    }
  })

  it('keterangan kosong DITERIMA dan disimpan sebagai null', () => {
    for (const keterangan of ['', '   ', null, undefined, 42]) {
      const r = validateJournalInput({ ...base, keterangan })
      expect(r.ok, String(keterangan)).toBe(true)
      if (!r.ok) continue
      expect(r.value.keterangan, String(keterangan)).toBeNull()
    }
  })

  it('keduanya kosong sekaligus tetap diterima', () => {
    const r = validateJournalInput({ ...base, noBukti: '', keterangan: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.noBukti).toBeNull()
    expect(r.value.keterangan).toBeNull()
  })

  it('hasilnya TIDAK PERNAH string kosong — itu yang membuat unique tetap bekerja', () => {
    const r = validateJournalInput({ ...base, noBukti: '   ', keterangan: '   ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.noBukti).not.toBe('')
    expect(r.value.keterangan).not.toBe('')
  })

  it('yang terisi tetap di-trim dan dipertahankan apa adanya', () => {
    const r = validateJournalInput({ ...base, noBukti: '  JU-9  ', keterangan: '  sewa  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.noBukti).toBe('JU-9')
    expect(r.value.keterangan).toBe('sewa')
  })

  it('aturan lain TIDAK ikut longgar — jurnal tanpa keduanya masih harus seimbang', () => {
    const r = validateJournalInput({
      ...base,
      noBukti: '',
      keterangan: '',
      lines: [
        { masterCoaId: AKUN_A, debit: '100', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '40' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'tidak seimbang')).toBe(true)
  })
})

// Inti kenapa validateJournalInput tidak berhenti di galat pertama: satu
// transaksi diisi sekaligus, jadi akunting harus melihat semua yang salah
// dalam sekali kirim.
describe('validateJournalInput mengumpulkan SEMUA galat', () => {
  it('jurnal yang salah di banyak tempat melaporkan semuanya sekaligus', () => {
    // Nomor bukti & keterangan SENGAJA tidak lagi ikut di sini: keduanya
    // opsional sejak 2026-09-16, jadi mengosongkannya bukan galat. Yang diuji
    // tetap sama — beberapa galat dari lapisan berbeda dilaporkan sekaligus.
    const r = validateJournalInput({
      tanggal: '2026-02-31',
      noBukti: 'A'.repeat(NO_BUKTI_MAX + 1),
      keterangan: '',
      lines: [{ masterCoaId: 'bukan-uuid', debit: '100', kredit: '50' }],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'Tanggal tidak valid')).toBe(true)
    expect(punyaGalat(r.errors, `maksimal ${NO_BUKTI_MAX} karakter`)).toBe(true)
    expect(punyaGalat(r.errors, 'minimal 2 baris')).toBe(true)
    expect(punyaGalat(r.errors, 'akun belum dipilih')).toBe(true)
    expect(punyaGalat(r.errors, 'tidak keduanya')).toBe(true)
    expect(r.errors.length).toBeGreaterThanOrEqual(5)
  })

  it('galat tiap baris disebut terpisah dengan nomor barisnya', () => {
    const r = validateJournalInput({
      ...base,
      lines: [
        { masterCoaId: AKUN_A, debit: '', kredit: '' },
        { masterCoaId: AKUN_B, debit: '', kredit: '' },
        { masterCoaId: AKUN_A, debit: '', kredit: '' },
      ],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    for (const n of [1, 2, 3]) expect(punyaGalat(r.errors, `Baris ${n}`), `baris ${n}`).toBe(true)
  })
})

describe('canEditJournal', () => {
  it('draf boleh diubah & dihapus', () => {
    expect(canEditJournal('draft')).toBe(true)
  })

  it('terposting TIDAK boleh — koreksinya lewat jurnal balik (Fase 2)', () => {
    expect(canEditJournal('posted')).toBe(false)
  })

  it('setiap nilai status punya jawaban pasti', () => {
    for (const s of JOURNAL_STATUS) expect(typeof canEditJournal(s)).toBe('boolean')
  })
})

// ══ FASE 2: POSTING & JURNAL BALIK ═══════════════════════════════
// Posting adalah pintu SATU ARAH: sesudahnya jurnal hanya bisa dibalik, tidak
// diubah. Predikatnya diperiksa ulang di server meski UI sudah menyaring,
// karena daftar di layar bisa basi beberapa detik.
describe('canPost', () => {
  const draf = {
    status: 'draft' as const,
    tanggal: '2026-09-18',
    lines: [
      { debit: '100.00', kredit: '0.00' },
      { debit: '0.00', kredit: '100.00' },
    ],
  }
  const tidakTerkunci = { isLocked: () => false }

  it('draf seimbang boleh diposting', () => {
    expect(canPost(draf, tidakTerkunci)).toEqual({ ok: true })
  })

  it('jurnal terposting ditolak, dengan alasan yang menyebut statusnya', () => {
    const r = canPost({ ...draf, status: 'posted' }, tidakTerkunci)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('Terposting')
  })

  it('tidak seimbang ditolak, alasannya menyebut selisih', () => {
    const r = canPost(
      { ...draf, lines: [{ debit: '100.00' }, { kredit: '40.00' }] },
      tidakTerkunci
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('60.00')
  })

  it('kurang dari dua baris ditolak', () => {
    const r = canPost({ ...draf, lines: [{ debit: '100.00' }] }, tidakTerkunci)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('minimal 2 baris')
  })

  it('periode terkunci ditolak — predikatnya dioper, bukan diputuskan di sini', () => {
    // Fase 2 mengoper () => false; §7.B menggantinya dengan kunci sungguhan
    // tanpa menyentuh canPost.
    const r = canPost(draf, { isLocked: t => t <= '2026-09-30' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('dikunci')
  })

  it('tanggal yang dilewatkan ke isLocked adalah tanggal jurnalnya', () => {
    let dilihat: string | null = null
    canPost(draf, { isLocked: t => { dilihat = t; return false } })
    expect(dilihat).toBe('2026-09-18')
  })
})

describe('canReverse', () => {
  it('jurnal terposting yang belum dibalik boleh dibalik', () => {
    expect(canReverse({ status: 'posted' }, null)).toEqual({ ok: true })
  })

  it('draf tidak bisa dibalik — belum masuk buku besar', () => {
    const r = canReverse({ status: 'draft' }, null)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('terposting')
  })

  it('yang sudah punya pembalik TERPOSTING ditolak', () => {
    const r = canReverse({ status: 'posted' }, { status: 'posted' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('sudah pernah dibalik')
  })

  it('pembalik yang masih DRAF tidak menghitung — boleh dibalik lagi', () => {
    // Pembalik draf belum masuk buku besar, jadi secara akuntansi jurnalnya
    // belum terbalik. "Sudah dibalik" diturunkan, bukan disimpan (P3).
    expect(canReverse({ status: 'posted' }, { status: 'draft' })).toEqual({ ok: true })
  })
})

describe('buildReversalLines', () => {
  // Bentuk NYATA dari loadJournalLineValues — sejak F1 ia selalu membawa
  // supplierId (null bila baris tidak bersupplier).
  const lines = [
    { masterCoaId: 'A1', debit: '100.00', kredit: '0.00', keterangan: 'sewa', lineOrder: 0, supplierId: null },
    { masterCoaId: 'A2', debit: '0.00', kredit: '100.00', keterangan: null, lineOrder: 1, supplierId: 'SUP-1' },
  ]

  it('supplierId IKUT dicerminkan — bukan dibuang (F1)', () => {
    // Pembalik tanpa supplier atas baris asli yang bersupplier membelah
    // pasangan itu ke dua kelompok penjelas rekonsiliasi, padahal keduanya
    // saling meniadakan.
    const balik = buildReversalLines(lines)
    expect(balik.map(l => l.supplierId)).toEqual([null, 'SUP-1'])
  })

  it('baris tanpa kolom supplierId sama sekali tetap dibalik, dengan supplierId null', () => {
    const lama = [{ masterCoaId: 'A1', debit: '5.00', kredit: '0.00', keterangan: null, lineOrder: 0 }]
    expect(buildReversalLines(lama)[0].supplierId).toBeNull()
  })

  it('menukar sisi debit dan kredit', () => {
    const balik = buildReversalLines(lines)
    expect(balik[0]).toMatchObject({ debit: '0.00', kredit: '100.00' })
    expect(balik[1]).toMatchObject({ debit: '100.00', kredit: '0.00' })
  })

  it('akun, keterangan, dan urutan baris dipertahankan', () => {
    const balik = buildReversalLines(lines)
    expect(balik.map(l => l.masterCoaId)).toEqual(['A1', 'A2'])
    expect(balik.map(l => l.keterangan)).toEqual(['sewa', null])
    expect(balik.map(l => l.lineOrder)).toEqual([0, 1])
  })

  it('hasil pembalik tetap seimbang', () => {
    expect(isBalanced(buildReversalLines(lines))).toBe(true)
  })

  it('membalik dua kali mengembalikan bentuk semula', () => {
    expect(buildReversalLines(buildReversalLines(lines))).toEqual(lines)
  })

  it('tidak memutasi baris masukan', () => {
    buildReversalLines(lines)
    expect(lines[0]).toMatchObject({ debit: '100.00', kredit: '0.00' })
  })
})

describe('defaultReversalNoBukti', () => {
  it('jurnal bernomor menghasilkan usulan REV-<asli>', () => {
    expect(defaultReversalNoBukti('JU-2026-09-001')).toBe('REV-JU-2026-09-001')
  })

  it('jurnal TANPA nomor bukti menghasilkan pembalik tanpa nomor bukti juga', () => {
    // Keputusan Ricko 2026-09-18: jangan mengarang penanda. Keterkaitan asli ↔
    // pembalik dijaga kolom reversal_of_id, bukan konvensi penamaan.
    expect(defaultReversalNoBukti(null)).toBeNull()
  })
})

describe('JOURNAL_EVENTS', () => {
  it('memuat peristiwa yang dipakai Fase 1 dan Fase 2', () => {
    for (const e of ['created', 'updated', 'deleted', 'posted', 'reversal_created']) {
      expect([...JOURNAL_EVENTS]).toContain(e)
    }
  })

  it('tidak ada duplikat', () => {
    expect(new Set(JOURNAL_EVENTS).size).toBe(JOURNAL_EVENTS.length)
  })
})

// ══ PENJAGA BERDIRI: JURNAL BERSUMBER MODUL TIDAK BISA DIUBAH DI /jurnal ══
// Tanpa aturan ini ada DUA penulis untuk satu jurnal, dan yang kedua tidak
// pernah tahu dokumen asalnya berubah. Alternatifnya — sinkronisasi dua arah —
// adalah kelas bug yang tidak selesai-selesai.
describe('canEditJournal sadar sumber (D32)', () => {
  it('draf manual boleh diubah', () => {
    expect(canEditJournal('draft', 'manual')).toBe(true)
  })

  it('draf BERSUMBER MODUL tidak boleh diubah, walau masih draf', () => {
    for (const m of SUMBER_MODUL) {
      expect(canEditJournal('draft', m), m).toBe(false)
    }
  })

  it('terposting tetap tidak boleh, apa pun sumbernya', () => {
    expect(canEditJournal('posted', 'manual')).toBe(false)
    expect(canEditJournal('posted', 'pembelian')).toBe(false)
  })

  // Pemanggil lama cuma punya status. Tanpa kompatibilitas ini, setiap
  // pemanggil harus diubah sekaligus — dan yang terlewat gagal diam-diam.
  it('tanpa argumen sumber, perilakunya persis seperti sebelumnya', () => {
    expect(canEditJournal('draft')).toBe(true)
    expect(canEditJournal('posted')).toBe(false)
    expect(canEditJournal('draft', null)).toBe(true)
    expect(canEditJournal('draft', undefined)).toBe(true)
  })
})


// ══ TAUTAN "KOREKSI DI …" (D32, N6) ══════════════════════════════════════
// Bentuk lamanya menulis `/pembelian?invoice=` langsung di JSX /jurnal. Begitu
// sumber kedua lahir, tombolnya diam-diam menunjuk halaman PEMBELIAN dengan id
// MUTASI — halaman yang benar-benar ada, tidak melempar galat apa pun, dan
// menampilkan "tidak ditemukan" untuk dokumen yang sebenarnya ada.
describe('sumberDokumenHref', () => {
  it('setiap sumber modul punya halamannya sendiri', () => {
    expect(sumberDokumenHref('pembelian', 'inv-1')).toBe('/pembelian?invoice=inv-1')
    expect(sumberDokumenHref('mutasi_kas', 'mut-1')).toBe('/mutasi-kas?mutasi=mut-1')
  })

  it('SETIAP anggota SUMBER_MODUL punya tautan — tidak ada yang tertinggal', () => {
    // Penjaga untuk sumber ketiga kelak: menambahkannya ke SUMBER_MODUL tanpa
    // memberinya halaman membuat test ini merah, bukan membuat tombol mati.
    for (const m of SUMBER_MODUL) {
      expect(sumberDokumenHref(m, 'x'), m).not.toBeNull()
    }
  })

  it('jurnal manual tidak punya dokumen asal', () => {
    expect(sumberDokumenHref('manual', 'x')).toBeNull()
    expect(sumberDokumenHref(null, 'x')).toBeNull()
    expect(sumberDokumenHref(undefined, 'x')).toBeNull()
  })

  it('dokumen yang tidak ditemukan → null, bukan tautan ke halaman kosong', () => {
    expect(sumberDokumenHref('pembelian', null)).toBeNull()
    expect(sumberDokumenHref('mutasi_kas', '')).toBeNull()
  })
})

// ══ supplierId PER BARIS — HANYA PADA AKUN LIABILITY (F1, D41) ═══════════
// Baris beban atau kas yang ditandai supplier akan muncul di daftar penjelas
// rekonsiliasi sebagai "jurnal manual ke akun hutang" padahal tidak menyentuh
// hutang sama sekali. Selisih yang dijelaskan oleh baris yang tidak relevan
// lebih buruk daripada selisih yang tidak dijelaskan.
describe('validateJournalInput — supplierId per baris', () => {
  const AKUN_HUTANG = '11111111-1111-4111-8111-111111111111'
  const AKUN_BEBAN = '22222222-2222-4222-8222-222222222222'
  const AKUN_TANPA_TIPE = '33333333-3333-4333-8333-333333333333'
  const SUPPLIER = '44444444-4444-4444-8444-444444444444'

  const tipeAkunById = {
    [AKUN_HUTANG]: 'liability',
    [AKUN_BEBAN]: 'expense',
    [AKUN_TANPA_TIPE]: null,
  }

  const jurnal = (supplierPada: string | null, supplierId: unknown = SUPPLIER) => ({
    tanggal: '2026-09-23',
    tipeAkunById,
    lines: [
      {
        masterCoaId: AKUN_BEBAN,
        debit: '1000',
        kredit: '',
        supplierId: supplierPada === AKUN_BEBAN ? supplierId : undefined,
      },
      {
        masterCoaId: supplierPada === AKUN_TANPA_TIPE ? AKUN_TANPA_TIPE : AKUN_HUTANG,
        debit: '',
        kredit: '1000',
        supplierId: supplierPada !== AKUN_BEBAN && supplierPada !== null ? supplierId : undefined,
      },
    ],
  })

  it('DITERIMA pada baris berakun liability, dan ikut di nilai yang siap ditulis', () => {
    const r = validateJournalInput(jurnal(AKUN_HUTANG))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.lines[1].supplierId).toBe(SUPPLIER)
      expect(r.value.lines[0].supplierId).toBeNull()
    }
  })

  it('DITOLAK pada baris berakun beban, dengan pesan yang menyebut barisnya', () => {
    const r = validateJournalInput(jurnal(AKUN_BEBAN))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const pesan = r.errors.join(' ')
      expect(pesan).toContain('Baris 1')
      expect(pesan).toContain('liability')
    }
  })

  it('DITOLAK pada akun yang tipenya BELUM disetel — null bukan liability', () => {
    // Akun tanpa tipe bisa saja akun hutang yang belum dirapikan, tapi menebak
    // begitu berarti membuka pintu untuk baris mana pun.
    const r = validateJournalInput(jurnal(AKUN_TANPA_TIPE))
    expect(r.ok).toBe(false)
  })

  it('supplierId yang bukan uuid ditolak', () => {
    const r = validateJournalInput(jurnal(AKUN_HUTANG, 'bukan-uuid'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('supplier tidak valid')
  })

  it('supplierId kosong bukan galat — ia sekadar tidak ditandai', () => {
    const r = validateJournalInput(jurnal(AKUN_HUTANG, '   '))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.lines[1].supplierId).toBeNull()
  })

  it('TANPA peta tipe akun, supplierId DIABAIKAN — bukan diterima tanpa pemeriksaan', () => {
    // Penjaga yang paling penting di blok ini. Bentuk sebaliknya membuat
    // pemanggil yang lupa mengoper peta diam-diam menerima supplier di baris
    // beban sekalipun — dan tidak ada yang melempar.
    const { tipeAkunById: _abaikan, ...tanpaPeta } = jurnal(AKUN_BEBAN)
    void _abaikan
    const r = validateJournalInput(tanpaPeta)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.lines.every(l => l.supplierId === null)).toBe(true)
  })

  it('pemanggil lama tanpa supplierId sama sekali tidak berubah perilakunya', () => {
    const r = validateJournalInput({
      tanggal: '2026-09-23',
      lines: [
        { masterCoaId: AKUN_BEBAN, debit: '1000' },
        { masterCoaId: AKUN_HUTANG, kredit: '1000' },
      ],
    })
    expect(r.ok).toBe(true)
  })
})
