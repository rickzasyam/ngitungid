import { NextResponse } from 'next/server'
import { and, eq, lt, or } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { coaMappingHistory, financialReports, masterCoa, reportLineItems } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { extractReport, type ReportType } from '@/lib/gemini/extract'
import { normalizeName } from '@/lib/coa-match'
import { buildLineItemValues } from '@/lib/reports/line-items'
import { retryState, STALE_EXTRACTING_MS } from '@/lib/reports/retry-policy'

// Gemini + Buffer butuh Node runtime; durasi sama dengan route upload.
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/reports/[id]/retry-extract — admin only.
//
// Ekstrak ULANG laporan yang nyangkut, memakai PDF yang SUDAH tersimpan di
// `financial_reports.source_pdf` — jadi tidak perlu upload ulang dari nol.
// Dipakai tombol "Coba lagi" di /laporan. Kebijakan boleh/tidaknya ada di
// `lib/reports/retry-policy.ts` (dipakai bareng route list).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id: reportId } = await params
  if (!UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  const [report] = await db
    .select({
      id: financialReports.id,
      clientId: financialReports.clientId,
      reportType: financialReports.reportType,
      status: financialReports.status,
      updatedAt: financialReports.updatedAt,
      sourcePdf: financialReports.sourcePdf,
    })
    .from(financialReports)
    .where(eq(financialReports.id, reportId))
    .limit(1)

  if (!report) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  }

  const state = retryState({
    status: report.status,
    updatedAt: report.updatedAt,
    hasPdf: report.sourcePdf !== null,
  })

  if (state === 'in-progress') {
    return NextResponse.json(
      { error: 'Laporan ini baru mulai diekstrak — tunggu sampai selesai sebelum mencoba lagi.' },
      { status: 409 }
    )
  }
  if (state === 'no-pdf') {
    return NextResponse.json(
      { error: 'PDF sumber laporan ini tidak tersimpan — pakai tombol "Ganti" untuk unggah ulang filenya.' },
      { status: 400 }
    )
  }
  if (state === 'not-applicable') {
    return NextResponse.json(
      { error: 'Laporan ini sudah selesai diekstrak. Kalau ingin mengekstrak ulang, pakai tombol "Ganti" (unggah PDF-nya lagi).' },
      { status: 409 }
    )
  }

  // Klaim percobaan secara ATOMIK (compare-and-set): hanya satu retry yang boleh
  // lolos walau tombolnya diklik dua kali atau dua admin menekannya bersamaan.
  // Syarat WHERE-nya sengaja mengulang kebijakan retriable di level SQL —
  // pengecekan di atas bisa saja sudah basi saat baris ini dieksekusi.
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - STALE_EXTRACTING_MS)
  const claimed = await db
    .update(financialReports)
    .set({ status: 'extracting', updatedAt: now })
    .where(
      and(
        eq(financialReports.id, reportId),
        or(
          eq(financialReports.status, 'uploaded'),
          and(
            eq(financialReports.status, 'extracting'),
            lt(financialReports.updatedAt, staleCutoff)
          )
        )
      )
    )
    .returning({ id: financialReports.id })

  if (claimed.length === 0) {
    return NextResponse.json(
      { error: 'Ekstraksi ulang laporan ini sedang berjalan. Tunggu sebentar lalu muat ulang.' },
      { status: 409 }
    )
  }

  // Master COA + riwayat konfirmasi klien — bahan auto-map/saran, sama dgn upload.
  const [accounts, history] = await Promise.all([
    db
      .select({ id: masterCoa.id, nama: masterCoa.nama })
      .from(masterCoa)
      .where(eq(masterCoa.clientId, report.clientId)),
    db
      .select({ rawName: coaMappingHistory.rawName, masterCoaId: coaMappingHistory.masterCoaId })
      .from(coaMappingHistory)
      .where(eq(coaMappingHistory.clientId, report.clientId)),
  ])
  const historyByRawName = new Map(history.map(h => [normalizeName(h.rawName), h.masterCoaId]))

  try {
    const lines = await extractReport(report.sourcePdf!, report.reportType as ReportType)
    const { values, autoMapped, suggested } = buildLineItemValues(lines, reportId, accounts, historyByRawName)

    // WAJIB hapus dulu: laporan yang mati di tengah BISA sudah sempat menyimpan
    // sebagian line item sebelum statusnya berpindah. Tanpa delete ini, retry
    // menggandakan datanya. Delete+insert+status dijalankan sebagai SATU batch
    // (neon-http: satu transaksi HTTP) supaya tak pernah ada state separuh jadi.
    const statements: BatchItem<'pg'>[] = [
      db.delete(reportLineItems).where(eq(reportLineItems.reportId, reportId)),
    ]
    if (values.length > 0) {
      statements.push(db.insert(reportLineItems).values(values))
    }
    statements.push(
      db
        .update(financialReports)
        .set({ status: 'review', extractedAt: new Date() })
        .where(eq(financialReports.id, reportId))
    )

    try {
      await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
    } catch (e) {
      // Simpan gagal → jangan tinggalkan laporan terkunci di 'extracting'.
      await db.update(financialReports).set({ status: 'uploaded' }).where(eq(financialReports.id, reportId))
      return dbWriteErrorResponse(e, 'Gagal menyimpan hasil ekstraksi ulang. Coba lagi.')
    }

    return NextResponse.json({
      id: reportId,
      reportType: report.reportType,
      lineCount: lines.length,
      autoMapped,
      suggested,
    })
  } catch (err) {
    // Ekstraksi gagal → kembalikan ke 'uploaded' supaya bisa dicoba lagi
    // (persis perilaku catch di route upload).
    await db.update(financialReports).set({ status: 'uploaded' }).where(eq(financialReports.id, reportId))
    const msg = err instanceof Error ? err.message : 'Ekstraksi gagal.'
    const isQuota = /\b429\b|quota|rate limit|resource[_ ]?exhausted/i.test(msg)
    return NextResponse.json(
      {
        error: isQuota
          ? 'Kuota AI (Gemini free-tier) sedang penuh — tunggu ~1 menit lalu coba lagi.'
          : `Ekstraksi ulang gagal: ${msg}`,
      },
      { status: isQuota ? 429 : 502 }
    )
  }
}
