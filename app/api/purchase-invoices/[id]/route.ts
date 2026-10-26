import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import {
  journalEntries,
  purchaseInvoiceLines,
  purchaseInvoices,
} from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import {
  buildPurchaseJournalLines,
  invoiceAkunLawan,
  invoiceKomponen,
  validatePurchaseInvoice,
} from '@/lib/purchase'
import { dbWriteErrorResponse, isFkViolation, isUniqueViolation } from '@/lib/api/db-errors'
import { loadNasibJurnalModul, resolveUserId } from '@/lib/api/journal-queries'
import {
  assertInvoiceAccountsBelongToClient,
  loadInvoiceDetail,
  loadInvoiceHeaderForWrite,
  loadSupplierForInvoice,
  snapshotInvoice,
  syncInvoiceJournal,
} from '@/lib/api/purchase-queries'
import { loadAccountingSettings } from '@/lib/api/accounting-settings'
import { purgeAuditEvents, recordAuditEvent } from '@/lib/api/audit'
import { tolakBilaPeriodeTerkunci } from '@/lib/api/period-lock'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ambil BARIS DULU, baru periksa kliennya — `clientId` tidak ada di URL, jadi
 * satu-satunya cara tahu invoice ini milik siapa adalah membacanya. Pola yang
 * sama dipakai route detail jurnal dan kontrak.
 *
 * `tulis` membedakan gerbangnya: baca = requireInternal (finance boleh lihat),
 * tulis = requireAkunting (D45).
 */
async function guard(params: Promise<{ id: string }>, tulis: boolean) {
  const g = tulis ? await requireAkunting() : await requireInternal()
  if ('error' in g) return { error: g.error }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return { error: NextResponse.json({ error: 'ID invoice tidak valid.' }, { status: 400 }) }
  }

  const row = await loadInvoiceHeaderForWrite(id)
  if (!row) {
    return { error: NextResponse.json({ error: 'Invoice tidak ditemukan.' }, { status: 404 }) }
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, row.clientId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { row, user: g.user }
}

// GET /api/purchase-invoices/[id] — detail + baris + jadwal termin turunan.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params, false)
  if ('error' in g) return g.error

  const detail = await loadInvoiceDetail(g.row.id)
  if (!detail) return NextResponse.json({ error: 'Invoice tidak ditemukan.' }, { status: 404 })
  return NextResponse.json(detail)
}

// PATCH /api/purchase-invoices/[id] — ubah header + GANTI SELURUH barisnya,
// dan PERBARUI jurnalnya di batch yang sama (D31).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params, true)
  if ('error' in g) return g.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  // clientId TIDAK diambil dari body — ia melekat pada invoicenya dan tidak
  // boleh berpindah. Supplier BOLEH diganti, jadi akun hutangnya dibaca ulang
  // dari supplier yang dipilih SEKARANG (snapshot baru, D30).
  const clientId = g.row.clientId
  const supplierId = typeof raw.supplierId === 'string' ? raw.supplierId.trim() : ''
  if (!UUID_RE.test(supplierId)) {
    return NextResponse.json({ error: 'Supplier belum dipilih.' }, { status: 400 })
  }
  const supplier = await loadSupplierForInvoice(supplierId, clientId)
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier tidak ditemukan pada klien ini.' }, { status: 404 })
  }

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
  const terkunci = await tolakBilaPeriodeTerkunci(g.row.clientId, [g.row.tanggal, check.value.tanggal])
  if (terkunci) return terkunci

  const accountGuard = await assertInvoiceAccountsBelongToClient(
    [check.value.akunTujuanId, check.value.akunKasId, check.value.akunHutangId, check.value.akunPpnMasukanId],
    clientId
  )
  if (accountGuard) return accountGuard

  const akunLawanId = invoiceAkunLawan(check.value)
  if (!akunLawanId) {
    return NextResponse.json({ error: 'Akun lawan invoice tidak bisa ditentukan.' }, { status: 400 })
  }
  const jurnalLines = buildPurchaseJournalLines({
    komponen: invoiceKomponen(check.value),
    akunLawanId,
  })

  const userId = await resolveUserId(g.user.email)
  const sebelum = await snapshotInvoice(g.row.id)
  const now = new Date()

  const keteranganJurnal = `Pembelian — ${supplier.nama}${
    check.value.noInvoice ? ` · ${check.value.noInvoice}` : ''
  }`
  const jurnal = await syncInvoiceJournal({
    invoice: g.row,
    tanggal: check.value.tanggal,
    keterangan: keteranganJurnal,
    lines: jurnalLines,
    userId,
  })
  if ('error' in jurnal) return jurnal.error
  const { journalId } = jurnal

  const statements: BatchItem<'pg'>[] = [
    ...jurnal.statements,
    db
      .update(purchaseInvoices)
      .set({
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
        updatedAt: now,
      })
      .where(eq(purchaseInvoices.id, g.row.id)),
    db.delete(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, g.row.id)),
    db.insert(purchaseInvoiceLines).values(
      check.value.lines.map(l => ({
        invoiceId: g.row.id,
        namaBarang: l.namaBarang,
        qty: l.qty,
        satuan: l.satuan,
        hargaSatuan: l.hargaSatuan,
        subtotal: l.subtotal,
        lineOrder: l.lineOrder,
      }))
    ),
    // `nilai_sebelum`/`nilai_sesudah` diisi di SETIAP perubahan invoice, bukan
    // hanya saat jurnalnya sudah terposting: invoice adalah dokumen sumber, dan
    // riwayat yang cuma mencatat "pernah diubah" tanpa menyebut apanya tidak
    // bisa menjawab pertanyaan yang akan ditanyakan.
    recordAuditEvent({
      clientId,
      entityType: 'purchase_invoice',
      entityId: g.row.id,
      event: 'updated',
      userId,
      nilaiSebelum: sebelum,
      nilaiSesudah: { ...check.value, supplierNama: supplier.nama },
    }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    if (isUniqueViolation(e) && check.value.noInvoice !== null) {
      return NextResponse.json(
        { error: `Nomor invoice "${check.value.noInvoice}" sudah dipakai untuk supplier ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan invoice. Coba lagi.')
  }

  const detail = await loadInvoiceDetail(g.row.id)
  return NextResponse.json(detail)
}

// DELETE /api/purchase-invoices/[id] — hapus invoice BESERTA jurnalnya.
//
// ══ RIWAYAT PENGHAPUSAN HIDUP LEBIH LAMA DARI INVOICENYA ══════════════════
// Berbeda dari jurnal — yang event-nya DIPURGE bersama barisnya — event
// `deleted` sebuah invoice sengaja DIPERTAHANKAN, lengkap dengan snapshot
// isinya di `nilai_sebelum`. Brief Ricko memintanya tersurat: "penghapusan
// tercatat di audit_events (siapa, kapan, isi invoice sebelum dihapus)".
//
// Konsekuensinya `entity_id` menunjuk baris yang sudah tidak ada. Itu disengaja
// dan sah: CHECK `audit_events_entity_id_check` hanya mewajibkan `entity_id`
// untuk `entity_type='journal'`, dan tidak ada FK yang bisa dilanggar karena
// kolomnya memang polimorfik (R2).
//
// Riwayat JURNALNYA tetap dipurge — aturan C2 berlaku penuh di sana.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params, true)
  if ('error' in g) return g.error
  const terkunci = await tolakBilaPeriodeTerkunci(g.row.clientId, [g.row.tanggal])
  if (terkunci) return terkunci

  // Aturan yang SAMA dengan mutasi kas (nasibJurnalModul): jurnal terposting
  // yang belum dibalik menahan penghapusan, dan setelan "posting bisa diedit"
  // (D42) hanya membuka perubahan — bukan penghapusan angka yang sudah dilaporkan.
  const { nasib } = await loadNasibJurnalModul(g.row.journalId, g.row.clientId)
  if (nasib === 'terkunci' || nasib === 'ubah-terposting') {
    return NextResponse.json(
      {
        error: 'Jurnal invoice ini sudah diposting — invoicenya tidak bisa dihapus.',
        details: ['Buat jurnal balik untuk jurnalnya dan posting pembaliknya lebih dulu.'],
      },
      { status: 409 }
    )
  }

  const userId = await resolveUserId(g.user.email)
  const sebelum = await snapshotInvoice(g.row.id)

  const statements: BatchItem<'pg'>[] = [
    // Event penghapusan ditulis DI DALAM batch yang sama: kalau ia ditulis
    // sesudahnya dan penghapusannya gagal, riwayat akan mencatat peristiwa
    // yang tidak pernah terjadi.
    recordAuditEvent({
      clientId: g.row.clientId,
      entityType: 'purchase_invoice',
      entityId: g.row.id,
      event: 'deleted',
      userId,
      nilaiSebelum: sebelum,
    }),
    db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, g.row.id)),
  ]

  // Jurnal yang SUDAH dibalik tinggal: pasangan asli + pembalik adalah riwayat
  // buku besar yang sudah saling menihilkan.
  if (g.row.journalId && nasib !== 'sudah-dibalik') {
    statements.push(
      purgeAuditEvents('journal', g.row.journalId),
      db.delete(journalEntries).where(eq(journalEntries.id, g.row.journalId))
    )
  }

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    // Jurnal yang sudah dibalik ditahan reversal_of_id RESTRICT; alokasi
    // pembayaran (§5.E) akan menahan invoicenya dengan cara yang sama.
    if (isFkViolation(e)) {
      return NextResponse.json(
        {
          error: 'Invoice ini masih dirujuk catatan lain dan tidak bisa dihapus.',
          details: ['Hapus dulu pembayaran atau jurnal balik yang menunjuk ke sini.'],
        },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menghapus invoice. Coba lagi.')
  }

  return NextResponse.json({ deleted: g.row.id, noInvoice: g.row.noInvoice })
}
