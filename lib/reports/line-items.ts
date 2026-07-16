import type { ExtractedLine } from '@/lib/gemini/extract'
import { isAutoMappable, suggestCoa, type CoaCandidate } from '@/lib/coa-match'

// Baris hasil ekstraksi Gemini → row `report_line_items`, lengkap dengan
// auto-map/saran COA. Murni (tanpa I/O) dan dipakai BARENG oleh
// POST /api/upload dan POST /api/reports/[id]/retry-extract, supaya kebijakan
// mapping di jalur upload dan jalur retry mustahil menyimpang satu sama lain.

export interface LineItemValue {
  reportId: string
  rawName: string
  /** kolom numeric → dikirim sebagai string. */
  amount: string
  isSubtotal: boolean
  confidence: number
  suggestedCoaId: string | null
  masterCoaId: string | null
  status: 'matched' | 'unmatched'
  lineOrder: number
}

export function buildLineItemValues(
  lines: ExtractedLine[],
  reportId: string,
  accounts: CoaCandidate[],
  historyByRawName: Map<string, string>
): { values: LineItemValue[]; autoMapped: number; suggested: number } {
  let autoMapped = 0
  let suggested = 0

  const values = lines.map((l, i) => {
    // Baris subtotal (TOTAL AKTIVA, LABA KOTOR, dst) tidak pernah dipetakan.
    const s = l.isSubtotal ? null : suggestCoa(l.rawName, accounts, historyByRawName)
    const auto = s !== null && isAutoMappable(s)
    if (auto) autoMapped++
    else if (s) suggested++
    return {
      reportId,
      rawName: l.rawName,
      amount: String(l.amount),
      isSubtotal: l.isSubtotal,
      confidence: l.confidence,
      suggestedCoaId: s ? s.masterCoaId : null,
      masterCoaId: auto ? s.masterCoaId : null,
      status: auto ? ('matched' as const) : ('unmatched' as const),
      lineOrder: i,
    }
  })

  return { values, autoMapped, suggested }
}
