import { describe, it, expect } from 'vitest'
import {
  buildReplacePlan,
  historyToReinsert,
  type PlanInput,
  type AffectedJournalLine,
  type AffectedSupplier,
} from './replace-plan'

// id lama dibuat mudah dibaca: OLD-<kode>.
const oldAcc = (kode: string) => ({ id: `OLD-${kode}`, kode })

const line = (o: Partial<PlanInput['lines'][number]> & { id: string; reportId: string }) => ({
  masterCoaId: null,
  suggestedCoaId: null,
  isSubtotal: false,
  status: 'matched',
  rawName: `raw-${o.id}`,
  amount: '1000.00',
  ...o,
})

const report = (id: string, status = 'mapped') => ({
  id,
  reportType: 'laba_rugi',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  status,
})

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  oldAccounts: [oldAcc('A-1'), oldAcc('A-2')],
  newKodeToId: new Map([
    ['A-1', 'NEW-A-1'],
    ['A-2', 'NEW-A-2'],
  ]),
  ambiguousKode: [],
  lines: [],
  history: [],
  reports: [],
  ...over,
})

describe('buildReplacePlan — re-link by kode', () => {
  it('kode yang masih ada → mapping tersambung ke id BARU', () => {
    const { plan, relinks } = buildReplacePlan(
      base({
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1')],
      })
    )

    expect(plan.relinkedLineCount).toBe(1)
    expect(plan.brokenLineCount).toBe(0)
    expect(relinks).toEqual([
      { lineItemId: 'L1', newMasterCoaId: 'NEW-A-1', newSuggestedCoaId: null, lostMapping: false },
    ])
    // Id BERUBAH walau kode sama — inti dari re-link ini.
    expect(relinks[0].newMasterCoaId).not.toBe('OLD-A-1')
  })

  it('kode yang hilang di file baru → putus (null) dan masuk laporan dampak', () => {
    const { plan, relinks } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]), // A-2 dihapus dari Excel
        lines: [
          line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' }),
          line({ id: 'L2', reportId: 'R1', masterCoaId: 'OLD-A-2', rawName: 'Beban Sewa', amount: '250.00' }),
        ],
        reports: [report('R1')],
      })
    )

    expect(plan.missingKode).toEqual(['A-2'])
    expect(plan.brokenLineCount).toBe(1)
    expect(relinks).toContainEqual({ lineItemId: 'L2', newMasterCoaId: null, newSuggestedCoaId: null, lostMapping: true })

    const impact = plan.reports[0]
    expect(impact.relinkedCount).toBe(1)
    expect(impact.brokenLines).toEqual([
      { lineItemId: 'L2', rawName: 'Beban Sewa', amount: '250.00', kode: 'A-2' },
    ])
  })

  it('kode hasil auto-suffix (ambigu) TIDAK di-re-link walau kode-nya ada', () => {
    const { plan, relinks } = buildReplacePlan(
      base({
        // 'A-1' ada di file baru, tapi dobel → tidak deterministik.
        newKodeToId: new Map([
          ['A-1', 'NEW-A-1'],
          ['A-1-2', 'NEW-A-1-2'],
          ['A-2', 'NEW-A-2'],
        ]),
        ambiguousKode: ['A-1'],
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1')],
      })
    )

    expect(plan.ambiguousKode).toEqual(['A-1'])
    expect(plan.matchedKode).not.toContain('A-1')
    expect(plan.missingKode).toContain('A-1')
    expect(plan.brokenLineCount).toBe(1)
    expect(relinks).toEqual([{ lineItemId: 'L1', newMasterCoaId: null, newSuggestedCoaId: null, lostMapping: true }])
  })

  it('suggested_coa_id ikut disambung / dihitung saat hilang', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]),
        lines: [
          line({ id: 'L1', reportId: 'R1', suggestedCoaId: 'OLD-A-1', status: 'unmatched' }),
          line({ id: 'L2', reportId: 'R1', suggestedCoaId: 'OLD-A-2', status: 'unmatched' }),
        ],
        reports: [report('R1', 'review')],
      })
    )
    expect(plan.suggestionsRelinked).toBe(1)
    expect(plan.suggestionsLost).toBe(1)
  })
})

describe('buildReplacePlan — demote status laporan', () => {
  it("'mapped' yang kehilangan sebagian mapping → 'review'", () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]),
        lines: [
          line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' }),
          line({ id: 'L2', reportId: 'R1', masterCoaId: 'OLD-A-2' }),
        ],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(plan.reports[0].statusAfter).toBe('review')
    expect(plan.demotedReportIds).toEqual(['R1'])
  })

  it("tetap 100% ter-mapping → tetap 'mapped', tidak ikut di-demote", () => {
    const { plan } = buildReplacePlan(
      base({
        lines: [
          line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' }),
          line({ id: 'L2', reportId: 'R1', masterCoaId: 'OLD-A-2' }),
        ],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(plan.reports[0].statusAfter).toBe('mapped')
    expect(plan.demotedReportIds).toEqual([])
  })

  it('baris subtotal & rejected tidak membuat laporan ter-demote', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]),
        lines: [
          line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' }),
          // subtotal & rejected memang tidak pernah punya COA
          line({ id: 'L2', reportId: 'R1', isSubtotal: true, status: 'matched' }),
          line({ id: 'L3', reportId: 'R1', status: 'rejected' }),
        ],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(plan.demotedReportIds).toEqual([])
    expect(plan.reports[0].statusAfter).toBe('mapped')
  })

  it("status 'confirmed' TIDAK disentuh walau mapping-nya putus", () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1', 'confirmed')],
      })
    )
    expect(plan.reports[0].statusAfter).toBe('confirmed')
    expect(plan.demotedReportIds).toEqual([])
  })

  it("'review' tidak ikut naik jadi 'mapped' gara-gara replace", () => {
    const { plan } = buildReplacePlan(
      base({
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1', 'review')],
      })
    )
    expect(plan.reports[0].statusAfter).toBe('review')
  })
})

describe('historyToReinsert — riwayat auto-match', () => {
  const history = [
    { rawName: 'Penjualan Shopee', masterCoaId: 'OLD-A-1', confirmedCount: 3 },
    { rawName: 'Beban Sewa', masterCoaId: 'OLD-A-2', confirmedCount: 1 },
  ]

  it('kode yang masih ada → terselamatkan, menunjuk id baru', () => {
    const saved = historyToReinsert({
      oldAccounts: [oldAcc('A-1'), oldAcc('A-2')],
      newKodeToId: new Map([['A-1', 'NEW-A-1']]),
      ambiguousKode: [],
      history,
    })
    expect(saved).toEqual([
      { rawName: 'Penjualan Shopee', masterCoaId: 'NEW-A-1', confirmedCount: 3 },
    ])
  })

  it('kode ambigu tidak diselamatkan (tebakan lebih buruk dari kosong)', () => {
    const saved = historyToReinsert({
      oldAccounts: [oldAcc('A-1')],
      newKodeToId: new Map([['A-1', 'NEW-A-1']]),
      ambiguousKode: ['A-1'],
      history: [history[0]],
    })
    expect(saved).toEqual([])
  })

  it('hitungan saved/lost di plan cocok dengan yang benar-benar di-insert', () => {
    const input = base({
      newKodeToId: new Map([['A-1', 'NEW-A-1']]),
      history,
      reports: [],
    })
    const { plan } = buildReplacePlan(input)
    expect(plan.historySaved).toBe(1)
    expect(plan.historyLost).toBe(1)
    expect(historyToReinsert(input)).toHaveLength(plan.historySaved)
  })
})

describe('buildReplacePlan — kemurnian (dasar dry-run)', () => {
  // Dry-run memanggil planner yang SAMA dengan jalur commit lalu berhenti
  // sebelum statement apa pun disusun. Yang bisa bocor cuma kalau planner
  // memutasi input; kunci itu di sini.
  it('tidak memutasi input sama sekali', () => {
    const input = base({
      newKodeToId: new Map([['A-1', 'NEW-A-1']]),
      lines: [
        line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' }),
        line({ id: 'L2', reportId: 'R1', masterCoaId: 'OLD-A-2' }),
      ],
      history: [{ rawName: 'Kas', masterCoaId: 'OLD-A-1', confirmedCount: 4 }],
      reports: [report('R1', 'mapped')],
    })
    const snapshot = JSON.stringify({
      oldAccounts: input.oldAccounts,
      lines: input.lines,
      history: input.history,
      reports: input.reports,
      newKodeToId: [...input.newKodeToId],
    })

    buildReplacePlan(input)
    buildReplacePlan(input) // dipanggil dua kali: dry-run lalu commit

    expect(
      JSON.stringify({
        oldAccounts: input.oldAccounts,
        lines: input.lines,
        history: input.history,
        reports: input.reports,
        newKodeToId: [...input.newKodeToId],
      })
    ).toBe(snapshot)
  })

  it('dua pemanggilan berturut-turut memberi hasil identik', () => {
    const input = base({
      newKodeToId: new Map([['A-1', 'NEW-A-1']]),
      lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-2' })],
      reports: [report('R1', 'mapped')],
    })
    const a = buildReplacePlan(input)
    const b = buildReplacePlan(input)
    // Inti janji ke admin: angka di layar konfirmasi = angka yang dieksekusi.
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
})

describe('buildReplacePlan — ringkasan kode', () => {
  it('memisahkan matched / missing / added', () => {
    const { plan } = buildReplacePlan(
      base({
        oldAccounts: [oldAcc('A-1'), oldAcc('A-2')],
        newKodeToId: new Map([
          ['A-1', 'NEW-A-1'],
          ['B-9', 'NEW-B-9'],
        ]),
      })
    )
    expect(plan.matchedKode).toEqual(['A-1'])
    expect(plan.missingKode).toEqual(['A-2'])
    expect(plan.addedKode).toEqual(['B-9'])
  })

  it('laporan yang tidak menyentuh COA sama sekali tidak masuk laporan dampak', () => {
    const { plan } = buildReplacePlan(
      base({
        lines: [line({ id: 'L1', reportId: 'R1', status: 'unmatched' })], // tanpa COA
        reports: [report('R1', 'review')],
      })
    )
    expect(plan.reports).toEqual([])
  })
})

// ── Hapus SATU baris COA memakai mesin yang sama ─────────────
// Triknya: newKodeToId diisi seluruh kode BESERTA ID-NYA YANG SEKARANG, minus
// kode yang dihapus. Baris yang menunjuk akun lain me-resolve ke id yang sama
// (no-op), yang menunjuk akun terhapus me-resolve ke null.
describe('buildReplacePlan dipakai untuk hapus satu baris COA', () => {
  const survivorsExcept = (kode: string) =>
    new Map([['A-1', 'OLD-A-1'], ['A-2', 'OLD-A-2']].filter(([k]) => k !== kode) as [string, string][])

  it('baris yang memakai akun terhapus jadi putus; akun lain tidak tersentuh', () => {
    const { plan, relinks } = buildReplacePlan(
      base({
        newKodeToId: survivorsExcept('A-2'),
        lines: [
          line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' }), // akun lain
          line({ id: 'L2', reportId: 'R1', masterCoaId: 'OLD-A-2', rawName: 'Beban Sewa', amount: '250.00' }),
        ],
        reports: [report('R1', 'mapped')],
      })
    )

    // Hanya baris yang memakai akun terhapus yang menghasilkan instruksi.
    expect(relinks).toEqual([
      { lineItemId: 'L2', newMasterCoaId: null, newSuggestedCoaId: null, lostMapping: true },
    ])
    expect(plan.brokenLineCount).toBe(1)
    expect(plan.relinkedLineCount).toBe(1) // L1 tetap tersambung
    expect(plan.reports[0].brokenLines[0]).toEqual({
      lineItemId: 'L2', rawName: 'Beban Sewa', amount: '250.00', kode: 'A-2',
    })
  })

  it('laporan ter-demote mapped → review saat akunnya dihapus', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: survivorsExcept('A-2'),
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-2' })],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(plan.demotedReportIds).toEqual(['R1'])
  })

  it('menghapus akun yang tidak dipakai laporan → tidak ada dampak sama sekali', () => {
    const { plan, relinks } = buildReplacePlan(
      base({
        newKodeToId: survivorsExcept('A-2'),
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(relinks).toEqual([])
    expect(plan.brokenLineCount).toBe(0)
    expect(plan.demotedReportIds).toEqual([])
  })

  it('history & saran COA milik akun terhapus terhitung di dampak', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: survivorsExcept('A-2'),
        lines: [
          line({ id: 'L1', reportId: 'R1', suggestedCoaId: 'OLD-A-2', status: 'unmatched' }),
          line({ id: 'L2', reportId: 'R1', suggestedCoaId: 'OLD-A-1', status: 'unmatched' }),
        ],
        history: [
          { rawName: 'Sewa', masterCoaId: 'OLD-A-2', confirmedCount: 3 },
          { rawName: 'Kas', masterCoaId: 'OLD-A-1', confirmedCount: 9 },
        ],
        reports: [report('R1', 'review')],
      })
    )
    expect(plan.suggestionsLost).toBe(1)
    expect(plan.suggestionsRelinked).toBe(1)
    expect(plan.historyLost).toBe(1)
    expect(plan.historySaved).toBe(1)
  })
})

describe('LineRelink.lostMapping', () => {
  it('true hanya kalau mapping yang TADINYA ADA hilang', () => {
    const { relinks } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(relinks[0].lostMapping).toBe(true)
  })

  it('false untuk baris yang cuma kehilangan SARAN COA', () => {
    // Baris ini belum pernah dipetakan; statusnya tidak boleh ikut direset.
    const { relinks } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        lines: [line({ id: 'L1', reportId: 'R1', suggestedCoaId: 'OLD-A-1', status: 'edited' })],
        reports: [report('R1', 'review')],
      })
    )
    expect(relinks[0].newMasterCoaId).toBeNull()
    expect(relinks[0].lostMapping).toBe(false)
  })
})

// ══ PENJAGA BERDIRI: journal_lines TIDAK BISA DIPUTUS ════════════
// report_line_items boleh kehilangan akun — baris itu kembali ke antrean
// pemetaan dan angkanya tetap utuh. journal_lines TIDAK: kolomnya NOT NULL
// dengan FK restrict, dan isinya pencatatan yang sudah terjadi. Satu-satunya
// jawaban yang jujur adalah menolak penggantiannya.
describe('buildReplacePlan — journal_lines memblokir, bukan diputus', () => {
  const jline = (o: Partial<AffectedJournalLine> & { id: string }): AffectedJournalLine => ({
    journalId: 'J1',
    noBukti: 'JU-001',
    masterCoaId: 'OLD-A-1',
    ...o,
  })

  it('kode yang masih ada → baris jurnal disambung ke id BARU, tanpa blokir', () => {
    const { plan, journalRelinks } = buildReplacePlan(
      base({ journalLines: [jline({ id: 'JL1' })] })
    )
    expect(plan.journalBlocked).toEqual([])
    expect(plan.journalRelinkedCount).toBe(1)
    expect(journalRelinks).toEqual([{ journalLineId: 'JL1', newMasterCoaId: 'NEW-A-1' }])
  })

  it('kode HILANG di berkas baru → jurnal masuk daftar blokir, bukan diputus', () => {
    const { plan, journalRelinks } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]), // A-2 hilang
        journalLines: [jline({ id: 'JL1', masterCoaId: 'OLD-A-2', noBukti: 'JU-007' })],
      })
    )
    expect(plan.journalRelinkedCount).toBe(0)
    expect(journalRelinks).toEqual([])
    expect(plan.journalBlocked).toEqual([{ journalId: 'J1', noBukti: 'JU-007', kode: 'A-2' }])
  })

  it('kode AMBIGU (dobel di berkas baru) → blokir juga', () => {
    const { plan } = buildReplacePlan(
      base({
        ambiguousKode: ['A-1'],
        journalLines: [jline({ id: 'JL1', masterCoaId: 'OLD-A-1', noBukti: 'JU-009' })],
      })
    )
    expect(plan.journalBlocked).toEqual([{ journalId: 'J1', noBukti: 'JU-009', kode: 'A-1' }])
    expect(plan.journalRelinkedCount).toBe(0)
  })

  it('satu jurnal dengan banyak baris berkode sama dilaporkan SEKALI', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        journalLines: [
          jline({ id: 'JL1', masterCoaId: 'OLD-A-1' }),
          jline({ id: 'JL2', masterCoaId: 'OLD-A-1' }),
          jline({ id: 'JL3', masterCoaId: 'OLD-A-1' }),
        ],
      })
    )
    expect(plan.journalBlocked).toHaveLength(1)
  })

  it('kode berbeda di jurnal yang sama dilaporkan terpisah', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        journalLines: [
          jline({ id: 'JL1', masterCoaId: 'OLD-A-1' }),
          jline({ id: 'JL2', masterCoaId: 'OLD-A-2' }),
        ],
      })
    )
    expect(plan.journalBlocked.map(b => b.kode)).toEqual(['A-1', 'A-2'])
  })

  it('sebagian tersambung, sebagian terblokir — keduanya dilaporkan', () => {
    const { plan, journalRelinks } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]),
        journalLines: [
          jline({ id: 'JL1', masterCoaId: 'OLD-A-1', journalId: 'J1', noBukti: 'JU-001' }),
          jline({ id: 'JL2', masterCoaId: 'OLD-A-2', journalId: 'J2', noBukti: 'JU-002' }),
        ],
      })
    )
    expect(plan.journalRelinkedCount).toBe(1)
    expect(journalRelinks).toEqual([{ journalLineId: 'JL1', newMasterCoaId: 'NEW-A-1' }])
    expect(plan.journalBlocked).toEqual([{ journalId: 'J2', noBukti: 'JU-002', kode: 'A-2' }])
  })

  it('daftar blokir terurut nomor bukti supaya terbaca stabil', () => {
    const { plan } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        journalLines: [
          jline({ id: 'JL1', journalId: 'J3', noBukti: 'JU-030' }),
          jline({ id: 'JL2', journalId: 'J1', noBukti: 'JU-010' }),
          jline({ id: 'JL3', journalId: 'J2', noBukti: 'JU-020' }),
        ],
      })
    )
    expect(plan.journalBlocked.map(b => b.noBukti)).toEqual(['JU-010', 'JU-020', 'JU-030'])
  })

  it('akun yang tidak dikenal sama sekali tetap memblokir, tidak lolos diam-diam', () => {
    const { plan } = buildReplacePlan(base({ journalLines: [jline({ id: 'JL1', masterCoaId: 'OLD-ENTAH' })] }))
    expect(plan.journalBlocked).toHaveLength(1)
    expect(plan.journalBlocked[0].kode).toBe('(tidak diketahui)')
  })
})

describe('buildReplacePlan — master_supplier boleh diputus (kolom NULL-able)', () => {
  const sup = (o: Partial<AffectedSupplier> & { id: string }): AffectedSupplier => ({
    nama: `Supplier ${o.id}`,
    akunHutangDefaultId: 'OLD-A-1',
    ...o,
  })

  it('kode masih ada → akun hutang default disambung ke id baru', () => {
    const { plan, supplierRelinks } = buildReplacePlan(base({ suppliers: [sup({ id: 'S1' })] }))
    expect(plan.supplierRelinkedCount).toBe(1)
    expect(plan.supplierUnlinkedCount).toBe(0)
    expect(supplierRelinks).toEqual([{ supplierId: 'S1', newAkunHutangDefaultId: 'NEW-A-1' }])
  })

  it('kode hilang → di-null-kan dan dihitung, TIDAK memblokir', () => {
    const { plan, supplierRelinks } = buildReplacePlan(
      base({ newKodeToId: new Map(), suppliers: [sup({ id: 'S1' })] })
    )
    expect(plan.supplierUnlinkedCount).toBe(1)
    expect(plan.supplierRelinkedCount).toBe(0)
    expect(plan.journalBlocked).toEqual([])
    expect(supplierRelinks).toEqual([{ supplierId: 'S1', newAkunHutangDefaultId: null }])
  })

  it('kode ambigu → di-null-kan juga', () => {
    const { plan } = buildReplacePlan(base({ ambiguousKode: ['A-1'], suppliers: [sup({ id: 'S1' })] }))
    expect(plan.supplierUnlinkedCount).toBe(1)
  })

  it('supplier tanpa akun default tidak menghasilkan instruksi apa pun', () => {
    const { plan, supplierRelinks } = buildReplacePlan(
      base({ newKodeToId: new Map(), suppliers: [sup({ id: 'S1', akunHutangDefaultId: null })] })
    )
    expect(supplierRelinks).toEqual([])
    expect(plan.supplierRelinkedCount).toBe(0)
    expect(plan.supplierUnlinkedCount).toBe(0)
  })
})

// Inti kontrak A3: menambah kesadaran jurnal TIDAK BOLEH mengubah satu pun
// perilaku lama. Kalau blok ini jatuh, jalur ganti-massal COA yang sudah jalan
// ikut berubah diam-diam.
describe('buildReplacePlan — tanpa journalLines/suppliers, perilaku lama utuh', () => {
  it('input lama menghasilkan hitungan jurnal & supplier nol, tanpa blokir', () => {
    const { plan, journalRelinks, supplierRelinks } = buildReplacePlan(
      base({
        newKodeToId: new Map(),
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-1' })],
        reports: [report('R1', 'mapped')],
      })
    )
    expect(plan.journalBlocked).toEqual([])
    expect(plan.journalRelinkedCount).toBe(0)
    expect(plan.supplierRelinkedCount).toBe(0)
    expect(plan.supplierUnlinkedCount).toBe(0)
    expect(journalRelinks).toEqual([])
    expect(supplierRelinks).toEqual([])
  })

  it('daftar kosong diperlakukan sama dengan tidak diberikan', () => {
    const tanpa = buildReplacePlan(base({ lines: [], reports: [] }))
    const kosong = buildReplacePlan(base({ lines: [], reports: [], journalLines: [], suppliers: [] }))
    expect(kosong.plan).toEqual(tanpa.plan)
  })

  it('baris laporan tetap DIPUTUS meski di input yang sama ada jurnal yang tersambung', () => {
    // Dua kebijakan berbeda hidup berdampingan: laporan diputus, jurnal
    // disambung. Yang satu tidak boleh menular ke yang lain.
    const { plan, relinks } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'NEW-A-1']]),
        lines: [line({ id: 'L1', reportId: 'R1', masterCoaId: 'OLD-A-2' })],
        reports: [report('R1', 'mapped')],
        journalLines: [{ id: 'JL1', journalId: 'J1', noBukti: 'JU-001', masterCoaId: 'OLD-A-1' }],
      })
    )
    expect(relinks).toEqual([
      { lineItemId: 'L1', newMasterCoaId: null, newSuggestedCoaId: null, lostMapping: true },
    ])
    expect(plan.brokenLineCount).toBe(1)
    expect(plan.journalRelinkedCount).toBe(1)
    expect(plan.journalBlocked).toEqual([])
  })
})

// Jalur hapus-satu-baris memanggil planner dengan peta kode ke id yang SEKARANG
// (lihat route rows/[coaId]). Tanpa penyaringan no-op, setiap baris jurnal dan
// setiap supplier klien akan ditulis ulang tanpa berubah sedikit pun.
describe('buildReplacePlan — instruksi no-op tidak dikirim', () => {
  it('baris jurnal yang id akunnya tidak berubah tidak menghasilkan instruksi', () => {
    const { plan, journalRelinks } = buildReplacePlan(
      base({
        // Peta menunjuk id yang sama persis — pola jalur hapus-satu-baris.
        newKodeToId: new Map([['A-1', 'OLD-A-1']]),
        journalLines: [{ id: 'JL1', journalId: 'J1', noBukti: 'JU-001', masterCoaId: 'OLD-A-1' }],
      })
    )
    expect(plan.journalRelinkedCount).toBe(1) // akunnya selamat
    expect(journalRelinks).toEqual([]) // tapi tidak ada yang perlu ditulis
    expect(plan.journalBlocked).toEqual([])
  })

  it('supplier yang akun default-nya tidak berubah tidak menghasilkan instruksi', () => {
    const { plan, supplierRelinks } = buildReplacePlan(
      base({
        newKodeToId: new Map([['A-1', 'OLD-A-1']]),
        suppliers: [{ id: 'S1', nama: 'Supplier S1', akunHutangDefaultId: 'OLD-A-1' }],
      })
    )
    expect(plan.supplierRelinkedCount).toBe(1)
    expect(supplierRelinks).toEqual([])
  })
})
