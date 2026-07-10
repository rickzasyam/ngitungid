import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, reportLineItems } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/api/guards'
import { extractReport, type ReportType } from '@/lib/gemini/extract'

// Gemini + neon-http + Buffer butuh Node runtime. maxDuration dinaikkan karena
// ekstraksi PDF (paralel) bisa ~25s — default Vercel Hobby 10s terlalu pendek.
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_FILE_BYTES = 25 * 1024 * 1024

// Field form → tipe laporan di DB (sesuai kartu upload pnl/neraca/cashflow).
const FIELD_TO_TYPE: Record<string, ReportType> = {
  pnl: 'laba_rugi',
  neraca: 'neraca',
  cashflow: 'arus_kas',
}

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

// POST /api/upload — admin only. multipart: clientId, periodStart, periodEnd,
// + file per tipe (pnl/neraca/cashflow, PDF). Simpan PDF, ekstrak via Gemini
// (paralel), simpan line item, set status 'review'.
export async function POST(req: Request) {
  const g = await requireAdmin()
  if ('error' in g) return g.error

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return bad('Body harus multipart/form-data.')
  }

  const clientId = String(form.get('clientId') ?? '')
  const periodStart = String(form.get('periodStart') ?? '')
  const periodEnd = String(form.get('periodEnd') ?? '')

  if (!UUID_RE.test(clientId)) return bad('clientId tidak valid.')
  if (!YMD_RE.test(periodStart) || !YMD_RE.test(periodEnd)) {
    return bad('Periode tidak valid (format YYYY-MM-DD).')
  }

  const jobs: { type: ReportType; file: File }[] = []
  for (const [field, type] of Object.entries(FIELD_TO_TYPE)) {
    const f = form.get(field)
    if (f instanceof File && f.size > 0) {
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        return bad(`Fase ini hanya mendukung PDF — "${f.name}" bukan PDF.`)
      }
      if (f.size > MAX_FILE_BYTES) return bad(`"${f.name}" melebihi 25MB.`)
      jobs.push({ type, file: f })
    }
  }
  if (jobs.length === 0) return bad('Tidak ada file laporan yang diunggah.')

  const reports = await Promise.all(
    jobs.map(async ({ type, file }) => {
      const bytes = Buffer.from(await file.arrayBuffer())

      // Re-upload menggantikan laporan periode+tipe yang sama (cascade hapus
      // line item lama) — sejalan unique(client, type, period).
      await db
        .delete(financialReports)
        .where(
          and(
            eq(financialReports.clientId, clientId),
            eq(financialReports.reportType, type),
            eq(financialReports.periodStart, periodStart),
            eq(financialReports.periodEnd, periodEnd)
          )
        )

      const [report] = await db
        .insert(financialReports)
        .values({
          clientId,
          reportType: type,
          periodStart,
          periodEnd,
          sourceFileName: file.name,
          sourcePdf: bytes,
          status: 'extracting',
        })
        .returning({ id: financialReports.id })

      try {
        const lines = await extractReport(bytes, type)
        if (lines.length > 0) {
          await db.insert(reportLineItems).values(
            lines.map((l, i) => ({
              reportId: report.id,
              rawName: l.rawName,
              amount: String(l.amount), // numeric column → string
              isSubtotal: l.isSubtotal,
              confidence: l.confidence,
              status: 'unmatched' as const,
              lineOrder: i,
            }))
          )
        }
        await db
          .update(financialReports)
          .set({ status: 'review', extractedAt: new Date() })
          .where(eq(financialReports.id, report.id))
        return { id: report.id, reportType: type, lineCount: lines.length }
      } catch (err) {
        // Ekstraksi gagal — biarkan report (PDF tersimpan) di status 'uploaded'
        // supaya bisa di-retry; laporkan errornya.
        await db
          .update(financialReports)
          .set({ status: 'uploaded' })
          .where(eq(financialReports.id, report.id))
        return {
          id: report.id,
          reportType: type,
          lineCount: 0,
          error: err instanceof Error ? err.message : 'Ekstraksi gagal.',
        }
      }
    })
  )

  return NextResponse.json({ clientId, periodStart, periodEnd, reports }, { status: 200 })
}
