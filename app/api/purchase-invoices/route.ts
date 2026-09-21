import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import {
  clients,
  journalEntries,
  journalLines,
  purchaseInvoiceLines,
  purchaseInvoices,
} from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import {
  buildPurchaseJournalLines,
  invoiceAkunLawan,
  invoiceKomponen,
  validatePurchaseInvoice,
} from '@/lib/purchase'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  assertInvoiceAccountsBelongToClient,
  listInvoices,
  loadInvoiceDetail,
  loadSupplierForInvoice,
} from '@/lib/api/purchase-queries'
import { loadAccountingSettings } from '@/lib/api/accounting-settings'
import { recordAuditEvent, recordJournalEvent } from '@/lib/api/audit'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/purchase-invoices?clientId&periodStart&periodEnd[&supplierId]
//
// ══ requireInternal UNTUK BACA, requireAkunting UNTUK TULIS (D45) ═════════
// Berbeda dari /api/journals yang baca-nya requireAkunting: `/pembelian` masuk
// INTERNAL_ONLY_PREFIXES, bukan ACCOUNTING_ONLY — finance boleh MELIHAT
// kewajiban klien dan mengunduhnya, tapi tidak boleh menulis. Klien tetap tidak
// melihat modul ini sama sekali (requireInternal menutupnya, bukan requireUser).
export async function GET(req: Request) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''
  const supplierId = url.searchParams.get('supplierId') ?? ''

  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!isValidYmd(periodStart) || !isValidYmd(periodEnd)) {
    return NextResponse.json({ error: 'Periode tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }
  // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis (lib/contracts.ts).
  if (periodEnd < periodStart) {
    return NextResponse.json(
      { error: 'Periode akhir tidak boleh sebelum periode mulai.' },
      { status: 400 }
    )
  }
  if (supplierId !== '' && !UUID_RE.test(supplierId)) {
    return NextResponse.json({ error: 'supplierId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const invoices = await listInvoices({
    clientId,
    periodStart,
    periodEnd,
    supplierId: supplierId || undefined,
  })
  return NextResponse.json({ count: invoices.length, invoices })
}

// POST /api/purchase-invoices — buat invoice + jurnal drafnya.
//
// ══ SATU db.batch UNTUK INVOICE, BARIS, JURNAL, DAN RIWAYATNYA (D31) ══════
// Invoice tanpa jurnal dan jurnal tanpa invoice dua-duanya adalah pembukuan
// yang salah, dan tidak ada foreign key yang bisa menangkap keduanya sendiri
// (journal_id-nya nullable — ia memang boleh kosong untuk invoice lama). Satu
// transaksi: semuanya jadi, atau tidak satu pun.
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const clientId = typeof raw.clientId === 'string' ? raw.clientId : ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const supplierId = typeof raw.supplierId === 'string' ? raw.supplierId.trim() : ''
  if (!UUID_RE.test(supplierId)) {
    return NextResponse.json({ error: 'Supplier belum dipilih.' }, { status: 400 })
  }
  const supplier = await loadSupplierForInvoice(supplierId, clientId)
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier tidak ditemukan pada klien ini.' }, { status: 404 })
  }

  // Akun hutang & akun PPN di-SNAPSHOT dari sumbernya SEKARANG (D30) — tidak
  // pernah dibaca ulang saat pembayaran. Mengganti default supplier setelah ini
  // tidak boleh memindahkan hutang yang sudah tercatat.
  const settings = await loadAccountingSettings(clientId)

  const check = validatePurchaseInvoice({
    tanggal: raw.tanggal,
    supplierId,
    noInvoice: raw.noInvoice,
    caraBayar: raw.caraBayar,
    akunTujuanId: raw.akunTujuanId,
    akunKasId: raw.akunKasId,
    akunHutangId: supplier.akunHutangDefaultId ?? undefined,
    akunPpnMasukanId: settings?.akunPpnMasukanId ?? undefined,
    ppn: raw.ppn,
    jumlahTermin: raw.jumlahTermin,
    jatuhTempoAkhir: raw.jatuhTempoAkhir,
    keterangan: raw.keterangan,
    lines: raw.lines,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }

  const guard = await assertInvoiceAccountsBelongToClient(
    [check.value.akunTujuanId, check.value.akunKasId, check.value.akunHutangId, check.value.akunPpnMasukanId],
    clientId
  )
  if (guard) return guard

  const createdBy = await resolveUserId(g.user.email)
  if (!createdBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const akunLawanId = invoiceAkunLawan(check.value)
  if (!akunLawanId) {
    // Tidak seharusnya tercapai — validator sudah menolaknya. Dipasang sebagai
    // jaring supaya jurnal tanpa lawan tidak pernah lolos ke db.batch.
    return NextResponse.json({ error: 'Akun lawan invoice tidak bisa ditentukan.' }, { status: 400 })
  }
  const jurnalLines = buildPurchaseJournalLines({
    komponen: invoiceKomponen(check.value),
    akunLawanId,
  })

  const invoiceId = randomUUID()
  const journalId = randomUUID()

  // ══ JURNALNYA TIDAK MEMAKAI NOMOR INVOICE SEBAGAI no_bukti ══════════════
  // `journal_entries.no_bukti` unik PER KLIEN, sementara nomor invoice hanya
  // unik per (klien, supplier): dua supplier yang sama-sama memakai "INV-001"
  // akan membuat jurnal kedua ditolak unique constraint — galat yang tidak
  // punya hubungan apa pun dengan yang dilakukan akunting. Keterkaitannya
  // dijaga `purchase_invoices.journal_id`, bukan konvensi penamaan (pola yang
  // sama dengan jurnal balik, keputusan Ricko 2026-09-18).
  const keteranganJurnal = `Pembelian — ${supplier.nama}${
    check.value.noInvoice ? ` · ${check.value.noInvoice}` : ''
  }`

  const statements: BatchItem<'pg'>[] = [
    db.insert(journalEntries).values({
      id: journalId,
      clientId,
      tanggal: check.value.tanggal,
      noBukti: null,
      keterangan: keteranganJurnal,
      sumber: 'pembelian',
      createdBy,
    }),
    db.insert(journalLines).values(
      jurnalLines.map(l => ({
        journalId,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
      }))
    ),
    db.insert(purchaseInvoices).values({
      id: invoiceId,
      clientId,
      supplierId,
      tanggal: check.value.tanggal,
      noInvoice: check.value.noInvoice,
      caraBayar: check.value.caraBayar,
      akunTujuanId: check.value.akunTujuanId,
      akunKasId: check.value.akunKasId,
      akunHutangId: check.value.akunHutangId,
      akunPpnMasukanId: check.value.akunPpnMasukanId,
      ppn: check.value.ppn,
      jumlahTermin: check.value.jumlahTermin,
      jatuhTempoAkhir: check.value.jatuhTempoAkhir,
      keterangan: check.value.keterangan,
      journalId,
      createdBy,
    }),
    db.insert(purchaseInvoiceLines).values(
      check.value.lines.map(l => ({
        invoiceId,
        namaBarang: l.namaBarang,
        qty: l.qty,
        satuan: l.satuan,
        hargaSatuan: l.hargaSatuan,
        subtotal: l.subtotal,
        lineOrder: l.lineOrder,
      }))
    ),
    recordAuditEvent({
      clientId,
      entityType: 'purchase_invoice',
      entityId: invoiceId,
      event: 'created',
      userId: createdBy,
    }),
    recordJournalEvent({ clientId, journalId, event: 'created', userId: createdBy }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    // Hanya masuk akal kalau nomor invoicenya MEMANG terisi — invoice tanpa
    // nomor tidak bisa bentrok (NULL tidak pernah sama dengan NULL).
    if (isUniqueViolation(e) && check.value.noInvoice !== null) {
      return NextResponse.json(
        {
          error: `Nomor invoice "${check.value.noInvoice}" sudah dipakai untuk supplier ini.`,
        },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan invoice pembelian. Coba lagi.')
  }

  const detail = await loadInvoiceDetail(invoiceId)
  return NextResponse.json(detail, { status: 201 })
}
