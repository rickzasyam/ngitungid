import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { suggestCoaWithGemini, type CoaChoice, type UnmappedRef } from '@/lib/gemini/suggest-coa'
import type { ReportType } from '@/lib/gemini/extract'
import { AI_NONAKTIF, aiFeaturesEnabled } from '@/lib/ai-features'

export const runtime = 'nodejs'
// Panggilan Gemini bisa ~10–20s (lebih lama saat 429/5xx + retry).
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Ambang terima saran AI. Di bawah ini diabaikan — konsisten dgn filosofi
// matcher deterministik: saran yang salah lebih mahal daripada tidak ada saran.
const AI_MIN_CONFIDENCE = 60

// POST /api/reports/[id]/suggest-ai — admin only (Phase 3.2).
//
// Saran COA berbantuan Gemini untuk baris yang matcher deterministik TIDAK bisa
// bantu (belum ter-map, belum ada saran fuzzy, bukan subtotal/rejected). BUKAN
// auto-run seperti /suggest — dipanggil eksplisit dari tombol di /coa-mapping,
// supaya kuota Gemini free-tier (5 req/menit) tidak terbakar diam-diam.
//
// Hasilnya SELALU saran saja (`suggested_coa_id`, status tetap unmatched) —
// tebakan semantik AI menunggu konfirmasi admin. Setelah dikonfirmasi lewat
// /mapping ia masuk `coa_mapping_history` → matcher deterministik menangkapnya
// instan berikutnya (learning loop).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error
  if (!aiFeaturesEnabled('saranCoa')) return NextResponse.json({ error: AI_NONAKTIF }, { status: 503 })

  const { id: reportId } = await params
  if (!UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  const [report] = await db
    .select({
      id: financialReports.id,
      clientId: financialReports.clientId,
      reportType: financialReports.reportType,
    })
    .from(financialReports)
    .where(eq(financialReports.id, reportId))
    .limit(1)

  if (!report) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  }

  const [accounts, lines] = await Promise.all([
    db
      .select({
        id: masterCoa.id,
        kode: masterCoa.kode,
        nama: masterCoa.nama,
        kelompok: masterCoa.kelompok,
        subKelompok: masterCoa.subKelompok,
      })
      .from(masterCoa)
      .where(eq(masterCoa.clientId, report.clientId)),
    db
      .select({
        id: reportLineItems.id,
        rawName: reportLineItems.rawName,
        isSubtotal: reportLineItems.isSubtotal,
        masterCoaId: reportLineItems.masterCoaId,
        suggestedCoaId: reportLineItems.suggestedCoaId,
        status: reportLineItems.status,
      })
      .from(reportLineItems)
      .where(eq(reportLineItems.reportId, reportId)),
  ])

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: 'Master COA klien ini masih kosong — import dulu di Settings.' },
      { status: 400 }
    )
  }

  // Hanya baris yang deterministik tak bisa bantu: belum ter-map, belum ada
  // saran (fuzzy pun tidak), bukan subtotal, belum ditolak admin.
  const gaps = lines.filter(
    l =>
      !l.isSubtotal &&
      l.masterCoaId === null &&
      l.suggestedCoaId === null &&
      l.status !== 'rejected'
  )
  if (gaps.length === 0) {
    return NextResponse.json({ reportId, suggested: 0, considered: 0 })
  }

  const items: UnmappedRef[] = gaps.map((l, i) => ({ ref: i, rawName: l.rawName }))
  const choices: CoaChoice[] = accounts.map(a => ({
    kode: a.kode,
    nama: a.nama,
    kelompok: a.kelompok,
    subKelompok: a.subKelompok,
  }))

  let aiResults
  try {
    aiResults = await suggestCoaWithGemini(items, choices, report.reportType as ReportType)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Key belum diisi → 400 (actionable oleh admin). Kuota/transient → 429/503.
    if (/GEMINI_API_KEY/.test(msg)) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY belum diset — saran AI butuh key ini (lihat .env.example).' },
        { status: 400 }
      )
    }
    const isQuota = /\b429\b|quota|rate limit|resource[_ ]?exhausted/i.test(msg)
    return NextResponse.json(
      {
        error: isQuota
          ? 'Kuota AI (Gemini free-tier) sedang penuh — tunggu ~1 menit lalu coba lagi.'
          : 'Gagal meminta saran AI. Coba lagi sebentar.',
      },
      { status: isQuota ? 429 : 502 }
    )
  }

  const kodeToId = new Map(accounts.map(a => [a.kode, a.id]))
  const now = new Date()
  const statements: BatchItem<'pg'>[] = []
  let suggested = 0

  for (const r of aiResults) {
    const line = gaps[r.ref]
    if (!line) continue // ref di luar jangkauan (Gemini mengarang) — abaikan
    const coaId = kodeToId.get(r.kode)
    if (!coaId || r.confidence < AI_MIN_CONFIDENCE) continue

    suggested++
    statements.push(
      db
        .update(reportLineItems)
        .set({ suggestedCoaId: coaId, updatedAt: now })
        .where(eq(reportLineItems.id, line.id))
    )
  }

  if (statements.length > 0) {
    try {
      await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
    } catch (e) {
      return dbWriteErrorResponse(e, 'Gagal menyimpan saran AI. Coba lagi.')
    }
  }

  return NextResponse.json({ reportId, suggested, considered: gaps.length })
}
