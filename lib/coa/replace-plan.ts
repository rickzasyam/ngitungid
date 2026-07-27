import { statusAfterExtract } from '@/lib/reports/mapping-status'

// Perencana "ganti Master COA" — MURNI (tanpa I/O), supaya keputusan sambung/
// putus bisa diuji tanpa DB dan supaya route handler tinggal mengeksekusi.
//
// Kenapa perlu re-link sama sekali: POST /api/clients/[id]/coa mengganti Master
// COA dengan DELETE-all + INSERT-all, dan `master_coa.id` di-generate acak. Jadi
// walau file Excel-nya identik, SEMUA id berubah dan setiap
// `report_line_items.master_coa_id` kehilangan sasarannya. Satu-satunya identitas
// yang bertahan lintas import adalah `kode` (ada unique(client_id, kode)) —
// itulah jembatan yang dipakai di sini.

export interface OldAccount {
  id: string
  kode: string
}

export interface AffectedLine {
  id: string
  reportId: string
  masterCoaId: string | null
  suggestedCoaId: string | null
  isSubtotal: boolean
  status: string
  rawName: string
  amount: string
}

export interface HistoryRow {
  rawName: string
  masterCoaId: string
  confirmedCount: number
}

export interface ReportMeta {
  id: string
  reportType: string
  periodStart: string
  periodEnd: string
  status: string
}

/** Satu baris yang mapping-nya putus — bahan laporan dampak per laporan. */
export interface BrokenLine {
  lineItemId: string
  rawName: string
  amount: string
  kode: string
}

export interface ReportImpact {
  reportId: string
  reportType: string
  periodStart: string
  periodEnd: string
  statusBefore: string
  /** Status sesudah replace — hasil statusAfterExtract, bukan tebakan lokal. */
  statusAfter: string
  relinkedCount: number
  brokenCount: number
  brokenLines: BrokenLine[]
}

export interface ReplacePlan {
  /** kode yang ada di COA lama DAN baru → mapping-nya bisa disambung. */
  matchedKode: string[]
  /** kode lama yang hilang di file baru → mapping ke situ pasti putus. */
  missingKode: string[]
  /** kode baru yang sebelumnya belum ada. */
  addedKode: string[]
  /** kode dobel di file baru — sengaja tidak di-re-link (lihat CoaParseResult). */
  ambiguousKode: string[]
  relinkedLineCount: number
  brokenLineCount: number
  /** saran COA (suggested_coa_id) yang tidak bisa disambung lagi. */
  suggestionsLost: number
  suggestionsRelinked: number
  historySaved: number
  historyLost: number
  /** Hanya laporan yang benar-benar tersentuh. */
  reports: ReportImpact[]
  /** Laporan yang turun 'mapped' → 'review' akibat replace ini. */
  demotedReportIds: string[]
}

/** Baris ini akan disambung ke id baru, atau diputus (null). */
export interface LineRelink {
  lineItemId: string
  /** null = putus → master_coa_id null. */
  newMasterCoaId: string | null
  newSuggestedCoaId: string | null
  /**
   * Baris ini BENAR-BENAR kehilangan mapping yang tadinya ada
   * (punya master_coa_id, sekarang tidak).
   *
   * Dibedakan dari `newMasterCoaId === null` karena yang terakhir juga benar
   * untuk baris yang memang belum pernah dipetakan dan cuma kehilangan SARAN
   * COA. Hanya baris ber-`lostMapping` yang statusnya boleh direset ke
   * 'unmatched' — mereset baris lain adalah tulisan yang tidak perlu dan,
   * untuk baris ber-status 'edited' tanpa mapping, salah.
   */
  lostMapping: boolean
}

export interface PlanInput {
  oldAccounts: OldAccount[]
  /** kode → id BARU. Id di-generate pemanggil SEBELUM menulis (lihat route). */
  newKodeToId: Map<string, string>
  ambiguousKode: string[]
  lines: AffectedLine[]
  history: HistoryRow[]
  reports: ReportMeta[]
}

/**
 * Menghitung dampak lengkap + instruksi re-link. Tidak menyentuh DB.
 * Dipakai DUA kali oleh route: sekali untuk dry-run (hanya `plan` yang dipakai)
 * dan sekali untuk eksekusi — satu sumber kebenaran, jadi angka yang dilihat
 * admin di layar konfirmasi mustahil berbeda dari yang benar-benar terjadi.
 */
export function buildReplacePlan(input: PlanInput): { plan: ReplacePlan; relinks: LineRelink[] } {
  const { oldAccounts, newKodeToId, ambiguousKode, lines, history, reports } = input

  const ambiguous = new Set(ambiguousKode)
  const oldIdToKode = new Map(oldAccounts.map(a => [a.id, a.kode]))
  const oldKodeSet = new Set(oldAccounts.map(a => a.kode))

  /** id lama → id baru, hanya untuk kode yang aman disambung. */
  const resolve = (oldId: string | null): string | null => {
    if (!oldId) return null
    const kode = oldIdToKode.get(oldId)
    if (kode === undefined || ambiguous.has(kode)) return null
    return newKodeToId.get(kode) ?? null
  }

  const matchedKode = [...oldKodeSet].filter(k => newKodeToId.has(k) && !ambiguous.has(k)).sort()
  const missingKode = [...oldKodeSet].filter(k => !newKodeToId.has(k) || ambiguous.has(k)).sort()
  const addedKode = [...newKodeToId.keys()].filter(k => !oldKodeSet.has(k)).sort()

  const relinks: LineRelink[] = []
  let relinkedLineCount = 0
  let brokenLineCount = 0
  let suggestionsLost = 0
  let suggestionsRelinked = 0

  // Dampak per laporan — hanya baris yang PUNYA mapping/saran lama yang relevan.
  const byReport = new Map<string, { relinked: number; broken: BrokenLine[] }>()
  // Semua baris per laporan (termasuk yang tak tersentuh) — dibutuhkan untuk
  // menghitung ulang status laporan: "masih 100% ter-mapping?" tidak bisa
  // dijawab hanya dari baris yang berubah.
  const linesByReport = new Map<string, AffectedLine[]>()

  for (const l of lines) {
    const arr = linesByReport.get(l.reportId) ?? []
    arr.push(l)
    linesByReport.set(l.reportId, arr)

    const newMaster = resolve(l.masterCoaId)
    const newSuggested = resolve(l.suggestedCoaId)

    if (l.suggestedCoaId) {
      if (newSuggested) suggestionsRelinked++
      else suggestionsLost++
    }

    if (l.masterCoaId) {
      const bucket = byReport.get(l.reportId) ?? { relinked: 0, broken: [] }
      if (newMaster) {
        relinkedLineCount++
        bucket.relinked++
      } else {
        brokenLineCount++
        bucket.broken.push({
          lineItemId: l.id,
          rawName: l.rawName,
          amount: l.amount,
          kode: oldIdToKode.get(l.masterCoaId) ?? '(tidak diketahui)',
        })
      }
      byReport.set(l.reportId, bucket)
    }

    // Hanya kirim instruksi untuk baris yang benar-benar berubah.
    if (l.masterCoaId !== newMaster || l.suggestedCoaId !== newSuggested) {
      relinks.push({
        lineItemId: l.id,
        newMasterCoaId: newMaster,
        newSuggestedCoaId: newSuggested,
        lostMapping: l.masterCoaId !== null && newMaster === null,
      })
    }
  }

  // Riwayat auto-match: FK-nya CASCADE, jadi baris history ikut terhapus saat
  // master_coa lama dihapus. Yang kode-nya selamat di-INSERT ulang menunjuk id
  // baru — tanpa ini, memori mapping klien hilang senyap tiap ganti Excel.
  let historySaved = 0
  let historyLost = 0
  for (const h of history) {
    if (resolve(h.masterCoaId)) historySaved++
    else historyLost++
  }

  // Status laporan SESUDAH replace — pakai helper yang sama dengan jalur upload
  // & route /mapping. `masterCoaId` di-proyeksikan ke nilai barunya dulu, dan
  // baris yang putus statusnya dianggap 'unmatched' (persis yang akan ditulis).
  const reportById = new Map(reports.map(r => [r.id, r]))
  const impacts: ReportImpact[] = []
  const demotedReportIds: string[] = []

  for (const [reportId, bucket] of byReport) {
    const meta = reportById.get(reportId)
    if (!meta) continue
    const projected = (linesByReport.get(reportId) ?? []).map(l => {
      const newMaster = resolve(l.masterCoaId)
      const broke = l.masterCoaId !== null && newMaster === null
      // rawName & amount diteruskan apa adanya: replace COA tidak mengubah
      // keduanya, tapi isMappable() memerlukannya untuk mengenali baris kosong.
      return {
        isSubtotal: l.isSubtotal,
        status: broke ? 'unmatched' : l.status,
        masterCoaId: newMaster,
        rawName: l.rawName,
        amount: l.amount,
      }
    })
    const computed = statusAfterExtract(projected)

    // Demote HANYA 'mapped' → 'review'. 'confirmed' tidak disentuh: itu tanda
    // persetujuan klien, mencabutnya keputusan produk tersendiri.
    const statusAfter =
      meta.status === 'mapped' && computed === 'review' ? 'review' : meta.status
    if (statusAfter !== meta.status) demotedReportIds.push(reportId)

    impacts.push({
      reportId,
      reportType: meta.reportType,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      statusBefore: meta.status,
      statusAfter,
      relinkedCount: bucket.relinked,
      brokenCount: bucket.broken.length,
      brokenLines: bucket.broken,
    })
  }

  impacts.sort((a, b) =>
    a.periodStart === b.periodStart
      ? a.reportType.localeCompare(b.reportType)
      : a.periodStart.localeCompare(b.periodStart)
  )

  return {
    plan: {
      matchedKode,
      missingKode,
      addedKode,
      ambiguousKode: [...ambiguous].sort(),
      relinkedLineCount,
      brokenLineCount,
      suggestionsLost,
      suggestionsRelinked,
      historySaved,
      historyLost,
      reports: impacts,
      demotedReportIds,
    },
    relinks,
  }
}

/** Riwayat yang kode-nya selamat — dipisah supaya route bisa langsung insert. */
export function historyToReinsert(
  input: Pick<PlanInput, 'oldAccounts' | 'newKodeToId' | 'ambiguousKode' | 'history'>
): { rawName: string; masterCoaId: string; confirmedCount: number }[] {
  const ambiguous = new Set(input.ambiguousKode)
  const oldIdToKode = new Map(input.oldAccounts.map(a => [a.id, a.kode]))
  const out: { rawName: string; masterCoaId: string; confirmedCount: number }[] = []
  for (const h of input.history) {
    const kode = oldIdToKode.get(h.masterCoaId)
    if (kode === undefined || ambiguous.has(kode)) continue
    const target = input.newKodeToId.get(kode)
    if (target) out.push({ rawName: h.rawName, masterCoaId: target, confirmedCount: h.confirmedCount })
  }
  return out
}
