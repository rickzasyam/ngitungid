import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { cashMutationAllocations } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
import { allocationRemaining } from '@/lib/cash-mutation'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  loadInvoiceForAllocation,
  loadMutationAllocations,
  loadMutationDetail,
  loadMutationForWrite,
  recordMutationEvent,
  syncMutationJournal,
} from '@/lib/api/cash-mutation-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/cash-mutations/[id]/allocations
//
// ══ TIGA BATAS YANG TIDAK BISA JADI CHECK, DITEGAKKAN DI SINI (P15) ══════
// Ketiganya lintas-baris atau lintas-tabel, jadi Postgres tidak bisa
// menjaganya sendiri:
//   1. Σ alokasi ≤ nominal MUTASI  — kalau lewat, uang yang dialokasikan lebih
//      besar dari yang benar-benar bergerak di rekening.
//   2. Σ alokasi ≤ sisa INVOICE    — kalau lewat, invoice terbayar lebih dari
//      nilainya dan monitoring hutang menampilkan sisa negatif.
//   3. terminUrutan ≤ jumlah_termin invoice — paku ke cicilan yang tidak ada
//      akan jatuh kembali ke FIFO nanti (D40) dan diam-diam bukan lagi yang
//      diminta akunting.
// Ketiganya dikunci test baca-sumber; tidak satu pun boleh pindah ke layar.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID mutasi tidak valid.' }, { status: 400 })
  }

  const mutation = await loadMutationForWrite(id)
  if (!mutation) return NextResponse.json({ error: 'Mutasi tidak ditemukan.' }, { status: 404 })
  if (!canAccessClientData(g.user.role, g.user.clientId, mutation.clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const invoiceId = typeof raw.invoiceId === 'string' ? raw.invoiceId.trim() : ''
  if (!UUID_RE.test(invoiceId)) {
    return NextResponse.json({ error: 'Invoice belum dipilih.' }, { status: 400 })
  }

  const nominalMinor = toMinorUnits(raw.nominal)
  if (nominalMinor === null || nominalMinor <= 0) {
    return NextResponse.json(
      { error: 'Nominal alokasi harus lebih besar dari nol.' },
      { status: 400 }
    )
  }

  // terminUrutan: KOSONG = ikut FIFO (bawaan, nol input). Terisi = dipaku ke
  // cicilan ke-N oleh akunting (D40) — pengecualian yang tercatat, bukan bentuk
  // baku.
  let terminUrutan: number | null = null
  if (raw.terminUrutan !== null && raw.terminUrutan !== undefined && raw.terminUrutan !== '') {
    const n = Number(raw.terminUrutan)
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json(
        { error: 'Nomor cicilan harus bilangan bulat mulai dari 1.' },
        { status: 400 }
      )
    }
    terminUrutan = n
  }

  // Invoice HARUS milik klien yang sama — tanpa ini, id invoice klien lain bisa
  // diselundupkan lewat body dan hutangnya berkurang tanpa pembayaran.
  const invoice = await loadInvoiceForAllocation(invoiceId, mutation.clientId)
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice tidak ditemukan pada klien ini.' }, { status: 404 })
  }
  if (!invoice.akunHutangId) {
    return NextResponse.json(
      {
        error: 'Invoice ini tidak punya akun hutang — kemungkinan invoice tunai.',
        details: ['Invoice tunai sudah lunas saat dibuat dan tidak menimbulkan hutang.'],
      },
      { status: 400 }
    )
  }

  if (terminUrutan !== null && terminUrutan > invoice.jumlahTermin) {
    return NextResponse.json(
      {
        error: `Invoice ini hanya punya ${invoice.jumlahTermin} cicilan — cicilan ke-${terminUrutan} tidak ada.`,
        details: ['Kosongkan nomor cicilan kalau pembayarannya mengikuti urutan (FIFO).'],
      },
      { status: 400 }
    )
  }

  const alokasiLama = await loadMutationAllocations(id)

  // Batas 1: Σ alokasi ≤ nominal mutasi.
  const sisaMutasiMinor = allocationRemaining(mutation, alokasiLama)
  if (nominalMinor > sisaMutasiMinor) {
    return NextResponse.json(
      {
        error: `Sisa mutasi yang belum dialokasikan tinggal ${fromMinorUnits(sisaMutasiMinor)}.`,
        details: ['Kurangi nominalnya, atau hapus alokasi lain di mutasi ini lebih dulu.'],
      },
      { status: 409 }
    )
  }

  // Batas 2: Σ alokasi ≤ sisa invoice.
  if (nominalMinor > invoice.sisaMinor) {
    return NextResponse.json(
      {
        error: `Sisa hutang invoice ${invoice.noInvoice ?? '(tanpa nomor)'} tinggal ${fromMinorUnits(invoice.sisaMinor)}.`,
        details: ['Invoice tidak boleh terbayar lebih dari nilainya.'],
      },
      { status: 409 }
    )
  }

  const userId = await resolveUserId(g.user.email)
  const allocId = randomUUID()
  const nominal = fromMinorUnits(nominalMinor)

  // Jurnal dibangun ULANG dari seluruh alokasi — yang lama ditambah yang baru.
  // Menambal jurnal lama dengan satu baris akan menyimpang begitu ada alokasi
  // yang dihapus di antaranya.
  const jurnal = await syncMutationJournal({
    mutation,
    alokasi: [
      ...alokasiLama,
      { akunHutangId: invoice.akunHutangId, nominal, noInvoice: invoice.noInvoice },
    ],
    userId,
  })
  if ('error' in jurnal) return jurnal.error

  const statements: BatchItem<'pg'>[] = [
    db.insert(cashMutationAllocations).values({
      id: allocId,
      mutationId: id,
      invoiceId,
      nominal,
      terminUrutan,
      createdBy: userId as string,
    }),
    ...jurnal.statements,
    recordMutationEvent({
      clientId: mutation.clientId,
      mutationId: id,
      event: 'allocated',
      userId,
      nilaiSesudah: { invoiceId, noInvoice: invoice.noInvoice, nominal, terminUrutan },
    }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        {
          error: 'Mutasi ini sudah punya alokasi ke invoice tersebut.',
          details: ['Hapus alokasi yang lama kalau nominalnya perlu diubah.'],
        },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan alokasi. Coba lagi.')
  }

  const detail = await loadMutationDetail(id)
  return NextResponse.json(detail, { status: 201 })
}
