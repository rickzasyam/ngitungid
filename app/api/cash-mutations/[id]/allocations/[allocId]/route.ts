import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { cashMutationAllocations } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  loadMutationAllocations,
  loadMutationDetail,
  loadMutationForWrite,
  recordMutationEvent,
} from '@/lib/api/cash-mutation-queries'
import { rencanakanJurnalMutasi } from '@/lib/api/cash-mutation-journal'
import { tolakBilaPeriodeTerkunci } from '@/lib/api/period-lock'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DELETE /api/cash-mutations/[id]/allocations/[allocId]
//
// ══ JURNALNYA IKUT MENGECIL, DI BATCH YANG SAMA ══════════════════════════
// Menghapus alokasi tanpa membangun ulang jurnalnya meninggalkan baris debit
// hutang untuk pembayaran yang sudah tidak ada — hutang klien terlihat lunas
// padahal uangnya tidak pernah pindah.
//
// Kalau alokasi TERAKHIR dihapus dan mutasinya tidak punya akun lawan, jurnalnya
// ikut terhapus dan mutasinya kembali berstatus "belum dijurnal" — itu keadaan
// yang sah dan memang harus terlihat.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; allocId: string }> }
) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id, allocId } = await params
  if (!UUID_RE.test(id) || !UUID_RE.test(allocId)) {
    return NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 })
  }

  const mutation = await loadMutationForWrite(id)
  if (!mutation) return NextResponse.json({ error: 'Mutasi tidak ditemukan.' }, { status: 404 })
  if (!canAccessClientData(g.user.role, g.user.clientId, mutation.clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const terkunci = await tolakBilaPeriodeTerkunci(mutation.clientId, [mutation.tanggal])
  if (terkunci) return terkunci

  const alokasiLama = await loadMutationAllocations(id)
  const target = alokasiLama.find(a => a.id === allocId)
  if (!target) {
    return NextResponse.json(
      { error: 'Alokasi tidak ditemukan pada mutasi ini.' },
      { status: 404 }
    )
  }

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Perencana yang SAMA dengan route batch (S7): alokasi terakhir dihapus dan
  // mutasinya berakun lawan → ia bergabung ke jurnal RINGKASAN kuncinya (D58);
  // tanpa akun lawan → jurnalnya dihapus beserta riwayatnya.
  const jurnal = await rencanakanJurnalMutasi({
    clientId: mutation.clientId,
    userId,
    akhir: [{ ...mutation, alokasi: alokasiLama.filter(a => a.id !== allocId) }],
    awal: [{ ...mutation, jumlahAlokasi: alokasiLama.length }],
    dihapus: [],
  })
  if ('error' in jurnal) return jurnal.error

  const statements: BatchItem<'pg'>[] = [
    db
      .delete(cashMutationAllocations)
      .where(
        and(
          eq(cashMutationAllocations.id, allocId),
          // mutation_id ikut disaring walau id-nya sudah unik: tanpa itu, id
          // alokasi milik mutasi lain yang diselundupkan lewat URL akan
          // terhapus — dan pemeriksaan klien di atas tidak menangkapnya.
          eq(cashMutationAllocations.mutationId, id)
        )
      ),
    ...jurnal.statements,
    recordMutationEvent({
      clientId: mutation.clientId,
      mutationId: id,
      event: 'unallocated',
      userId,
      nilaiSebelum: {
        invoiceId: target.invoiceId,
        noInvoice: target.noInvoice,
        nominal: target.nominal,
        terminUrutan: target.terminUrutan,
      },
    }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menghapus alokasi. Coba lagi.')
  }

  const detail = await loadMutationDetail(id)
  return NextResponse.json(detail)
}
