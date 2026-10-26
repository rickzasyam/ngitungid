import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { cashMutations, journalEntries } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData, type Role } from '@/lib/roles'
import { fingerprintMutasi, validateCashMutation } from '@/lib/cash-mutation'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { loadNasibJurnalModul, resolveUserId } from '@/lib/api/journal-queries'
import { purgeAuditEvents } from '@/lib/api/audit'
import {
  assertAccountBelongsToClient,
  loadCashAccount,
  loadMutationAllocations,
  loadMutationDetail,
  loadMutationForWrite,
  recordMutationEvent,
  snapshotMutation,
  syncMutationJournal,
} from '@/lib/api/cash-mutation-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Mutasi + pemeriksaan akses. Barisnya dibaca DULU, baru kliennya diperiksa —
 * tanpa barisnya kita tidak tahu klien mana yang harus diperiksa (pola yang
 * sama dengan route detail jurnal).
 */
async function guardMutation(id: string, role: Role, userClientId: string | null) {
  if (!UUID_RE.test(id)) {
    return { error: NextResponse.json({ error: 'ID mutasi tidak valid.' }, { status: 400 }) }
  }
  const row = await loadMutationForWrite(id)
  if (!row) {
    return { error: NextResponse.json({ error: 'Mutasi tidak ditemukan.' }, { status: 404 }) }
  }
  if (!canAccessClientData(role, userClientId, row.clientId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { row }
}

// GET /api/cash-mutations/[id] — detail beserta alokasi, sisa, dan status.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  const guard = await guardMutation(id, g.user.role, g.user.clientId)
  if ('error' in guard) return guard.error

  const detail = await loadMutationDetail(id)
  if (!detail) return NextResponse.json({ error: 'Mutasi tidak ditemukan.' }, { status: 404 })
  return NextResponse.json(detail)
}

// PATCH /api/cash-mutations/[id]
//
// ══ JURNALNYA IKUT, DI BATCH YANG SAMA ═══════════════════════════════════
// Mengubah tanggal, nominal, atau akun lawan mengubah jurnalnya. Dua tulisan
// terpisah berarti ada saat di mana mutasi dan jurnalnya bercerita berbeda —
// dan kalau tulisan kedua gagal, keadaan itu permanen.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  const guard = await guardMutation(id, g.user.role, g.user.clientId)
  if ('error' in guard) return guard.error
  const { row } = guard

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const check = validateCashMutation({
    tanggal: raw.tanggal,
    akunKasId: raw.akunKasId,
    debit: raw.debit,
    kredit: raw.kredit,
    keterangan: raw.keterangan,
    saldo: raw.saldo,
    akunLawanId: raw.akunLawanId,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }

  const akunKas = await loadCashAccount(row.clientId, check.value.akunKasId)
  if (!akunKas) {
    return NextResponse.json(
      { error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.' },
      { status: 400 }
    )
  }
  if (check.value.akunLawanId) {
    const salah = await assertAccountBelongsToClient(check.value.akunLawanId, row.clientId)
    if (salah) return salah
  }

  const alokasi = await loadMutationAllocations(id)

  // Mutasi yang sudah dialokasikan ke invoice TIDAK boleh berubah nominalnya
  // lewat jalur ini: alokasinya akan melebihi mutasinya tanpa ada yang
  // menolaknya, dan sisa yang negatif baru terlihat di layar daftar.
  if (alokasi.length > 0) {
    const berubah =
      check.value.debit !== row.debit ||
      check.value.kredit !== row.kredit ||
      check.value.akunKasId !== row.akunKasId
    if (berubah) {
      return NextResponse.json(
        {
          error: 'Mutasi ini sudah punya alokasi pembayaran — nominal dan akun kasnya tidak bisa diubah.',
          details: ['Hapus alokasinya lebih dulu, baru ubah nominalnya.'],
        },
        { status: 409 }
      )
    }
  }

  const userId = await resolveUserId(g.user.email)
  const sebelum = await snapshotMutation(id)

  const jurnal = await syncMutationJournal({
    mutation: row,
    alokasi,
    userId,
    patch: {
      tanggal: check.value.tanggal,
      keterangan: check.value.keterangan,
      debit: check.value.debit,
      kredit: check.value.kredit,
      akunLawanId: check.value.akunLawanId,
    },
  })
  if ('error' in jurnal) return jurnal.error

  const statements: BatchItem<'pg'>[] = [
    db
      .update(cashMutations)
      .set({
        tanggal: check.value.tanggal,
        akunKasId: check.value.akunKasId,
        keterangan: check.value.keterangan,
        debit: check.value.debit,
        kredit: check.value.kredit,
        saldo: check.value.saldo,
        akunLawanId: check.value.akunLawanId,
        fingerprint: fingerprintMutasi(check.value),
        updatedAt: new Date(),
      })
      .where(eq(cashMutations.id, id)),
    ...jurnal.statements,
    recordMutationEvent({
      clientId: row.clientId,
      mutationId: id,
      event: 'updated',
      userId,
      nilaiSebelum: sebelum,
      nilaiSesudah: {
        tanggal: check.value.tanggal,
        keterangan: check.value.keterangan,
        debit: check.value.debit,
        kredit: check.value.kredit,
        akunKasId: check.value.akunKasId,
        akunLawanId: check.value.akunLawanId,
      },
    }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan perubahan mutasi. Coba lagi.')
  }

  const detail = await loadMutationDetail(id)
  return NextResponse.json(detail)
}

// DELETE /api/cash-mutations/[id]
//
// ══ ALOKASI IKUT (cascade DB), JURNAL & RIWAYATNYA TIDAK ═════════════════
// `cash_mutation_allocations.mutation_id` ON DELETE cascade mengurus alokasinya.
// Jurnal dan audit_events TIDAK punya cascade ke sini (journal_id set null,
// entity_id polimorfik tanpa FK), jadi keduanya dihapus TANGAN di batch yang
// sama — tanpa itu, buku besar menyimpan jurnal untuk mutasi yang tidak ada.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  const guard = await guardMutation(id, g.user.role, g.user.clientId)
  if ('error' in guard) return guard.error
  const { row } = guard

  // Jurnal TERPOSTING menahan penghapusan: angkanya sudah masuk buku besar, dan
  // menghapus mutasinya akan meninggalkan buku besar yang tidak bisa dijelaskan
  // dari dokumen mana pun.
  //
  // Jurnal terposting yang SUDAH DIBALIK tidak menahan, tapi juga tidak ikut
  // dihapus: pasangan asli + pembalik adalah riwayat buku besar yang sudah
  // saling menihilkan (dan reversal_of_id RESTRICT menolak penghapusannya).
  // Setelan "posting bisa diedit" (D42) TIDAK membuka penghapusan — aturan yang
  // sama dengan invoice pembelian (nasibJurnalModul).
  const { nasib } = await loadNasibJurnalModul(row.journalId, row.clientId)
  if (nasib === 'terkunci' || nasib === 'ubah-terposting') {
    return NextResponse.json(
      {
        error: 'Jurnal mutasi ini sudah diposting — mutasinya tidak bisa dihapus.',
        details: ['Buat jurnal balik untuk jurnalnya dan posting pembaliknya lebih dulu.'],
      },
      { status: 409 }
    )
  }
  const jurnalRiwayat = nasib === 'sudah-dibalik'

  // Tidak ada snapshot yang dibaca di sini: riwayatnya ikut terhapus (lihat
  // bawah), jadi menyimpan keadaan sebelum penghapusan tidak ada yang membaca.
  // `userId` pun tidak dipakai — tidak ada event yang tersisa untuk memuatnya.

  // ══ RIWAYATNYA IKUT MATI, BEDA DARI INVOICE ════════════════════════
  // `riwayatBertahanSetelahDihapus()` hanya menyebut 'purchase_invoice', dan
  // mutasi kas SENGAJA tidak ditambahkan ke sana: invoice adalah dokumen yang
  // diterima klien dan tidak bisa dibuat ulang, sementara mutasi adalah salinan
  // catatan BANK — buktinya ada di rekening korannya, dan barisnya bisa
  // diimpor ulang. Menambahkan pengecualian kedua tanpa menuliskannya di
  // lib/audit.ts akan membuat aturan umumnya berhenti benar.
  const statements: BatchItem<'pg'>[] = [
    purgeAuditEvents('cash_mutation', id),
    db.delete(cashMutations).where(eq(cashMutations.id, id)),
  ]
  if (row.journalId && !jurnalRiwayat) {
    statements.push(
      db.delete(journalEntries).where(eq(journalEntries.id, row.journalId)),
      purgeAuditEvents('journal', row.journalId)
    )
  }

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menghapus mutasi. Coba lagi.')
  }

  return NextResponse.json({ ok: true })
}
