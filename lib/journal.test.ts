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
  it('status dan sumber sesuai enum Postgres (migrasi 0010)', () => {
    expect(JOURNAL_STATUS).toEqual(['draft', 'posted'])
    expect(JOURNAL_SOURCE).toEqual(['manual'])
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
    expect(toMinorUnits('1.234')).toBeNull() // lebih dari 2 desimal
    expect(toMinorUnits('1,000')).toBeNull() // pemisah ribuan bukan input sah
    expect(toMinorUnits(null)).toBeNull()
    expect(toMinorUnits(undefined)).toBeNull()
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
  const lines = [
    { masterCoaId: 'A1', debit: '100.00', kredit: '0.00', keterangan: 'sewa', lineOrder: 0 },
    { masterCoaId: 'A2', debit: '0.00', kredit: '100.00', keterangan: null, lineOrder: 1 },
  ]

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
