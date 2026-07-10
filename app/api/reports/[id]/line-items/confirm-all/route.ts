import { NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financialReports, reportLineItems } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/api/guards'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/reports/[id]/line-items/confirm-all — admin only.
// Set status='matched' untuk semua baris yang BUKAN 'rejected'.
//
// Sengaja TIDAK menyentuh financialReports.status: transisi review→mapped
// dimiliki route /mapping dan berbasis masterCoaId (butuh COA benar-benar
// dipetakan), bukan sekadar "extraction diterima". Menyetel status di sini
// juga tidak mengganggu route /mapping — perhitungan sisa di sana berbasis
// masterCoaId, bukan status.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAdmin()
  if ('error' in g) return g.error

  const { id: reportId } = await params
  if (!UUID_RE.test(reportId)) {
    return NextResponse.json({ error: 'ID laporan tidak valid.' }, { status: 400 })
  }

  const [report] = await db
    .select({ id: financialReports.id })
    .from(financialReports)
    .where(eq(financialReports.id, reportId))
    .limit(1)
  if (!report) {
    return NextResponse.json({ error: 'Laporan tidak ditemukan.' }, { status: 404 })
  }

  const updated = await db
    .update(reportLineItems)
    .set({ status: 'matched', updatedAt: new Date() })
    .where(and(eq(reportLineItems.reportId, reportId), ne(reportLineItems.status, 'rejected')))
    .returning({ id: reportLineItems.id })

  return NextResponse.json({ reportId, updated: updated.length })
}
