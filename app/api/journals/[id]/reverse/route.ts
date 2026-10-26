import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { journalEntries, journalLines } from '@/lib/db/schema'
import type { BatchItem } from 'drizzle-orm/batch'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { buildReversalLines, canReverse, validateJournalInput } from '@/lib/journal'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import {
  findPostedReversal,
  loadJournalDetail,
  loadJournalHeaderForWrite,
  loadJournalLineValues,
  resolveUserId,
} from '@/lib/api/journal-queries'
import { recordJournalEvent } from '@/lib/api/audit'
import { tolakBilaPeriodeTerkunci } from '@/lib/api/period-lock'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/journals/[id]/reverse — buat jurnal PEMBALIK dari jurnal terposting.
//
// ══ PEMBALIK ADALAH ENTRI BARU, ASLINYA TIDAK DISENTUH (D13) ══════════════
// Jurnal terposting tidak pernah berubah — itu yang membuatnya bisa dipercaya.
// Koreksinya adalah entri kedua yang menukar D dan K, terhubung ke aslinya lewat
// `reversal_of_id`. Dua-duanya tetap terbaca di buku besar, dan jumlahnya nol.
//
// ══ LAHIR SEBAGAI DRAF, BUKAN LANGSUNG TERPOSTING ═════════════════════════
// Sesuai MP: pembalik melewati pintu posting yang sama dengan jurnal lain,
// termasuk pemeriksaan kunci periode. Konsekuensinya "sudah dibalik" baru
// berlaku setelah pembalikNYA diposting — dan itu memang definisi yang dipakai
// canReverse.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID jurnal tidak valid.' }, { status: 400 })
  }

  const asli = await loadJournalHeaderForWrite(id)
  if (!asli) return NextResponse.json({ error: 'Jurnal tidak ditemukan.' }, { status: 404 })
  if (!canAccessClientData(g.user.role, g.user.clientId, asli.clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const verdict = canReverse({ status: asli.status }, await findPostedReversal(id))
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 409 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const lines = buildReversalLines(await loadJournalLineValues(id))

  // Divalidasi lewat pintu yang SAMA dengan jurnal manual — bukan jalur khusus.
  // Barisnya berasal dari jurnal yang sudah terposting, jadi seharusnya selalu
  // lolos; yang benar-benar diperiksa di sini adalah tanggal dan nomor bukti
  // yang datang dari body. Kalau suatu hari baris warisan ternyata tidak
  // seimbang, yang muncul adalah 400 yang menjelaskan — bukan pembalik timpang
  // yang diam-diam masuk buku.
  //
  // `noBukti` TIDAK diisi otomatis di sini. Usulannya (`REV-<asli>`, dan NULL
  // kalau aslinya NULL) disodorkan UI lewat defaultReversalNoBukti supaya
  // pengguna bisa menggantinya — server tidak mengarang penanda dokumen.
  const check = validateJournalInput({
    tanggal: raw.tanggal,
    noBukti: raw.noBukti,
    keterangan: raw.keterangan,
    lines,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }
  const terkunci = await tolakBilaPeriodeTerkunci(asli.clientId, [check.value.tanggal])
  if (terkunci) return terkunci

  // ══ SUPPLIER DICERMINKAN, BUKAN DIPUTUSKAN ULANG (F1) ════════════════
  // validateJournalInput di atas dipanggil TANPA peta tipe akun, jadi ia
  // membuang supplierId — perilaku aman untuk pemanggil sembarang. Pembalik
  // bukan pemanggil sembarang: ia cermin persis dari baris yang sudah
  // terposting, dan suppliernya sudah diperiksa saat baris aslinya ditulis.
  //
  // Memeriksanya ulang di sini akan MEMBLOKIR pembalikan hanya karena tipe
  // akunnya diubah sesudah posting — kebuntuan yang tidak ada hubungannya
  // dengan benar-tidaknya pembalik. Karena itu supplierId dipasang kembali
  // dari baris asli, menurut urutan (validator mempertahankan urutan & jumlah).
  const barisPembalik = check.value.lines.map((l, i) => ({
    ...l,
    supplierId: lines[i]?.supplierId ?? null,
  }))

  const createdBy = await resolveUserId(g.user.email)
  if (!createdBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pembalikId = randomUUID()
  const statements: BatchItem<'pg'>[] = [
    db.insert(journalEntries).values({
      id: pembalikId,
      clientId: asli.clientId,
      tanggal: check.value.tanggal,
      noBukti: check.value.noBukti,
      keterangan: check.value.keterangan,
      reversalOfId: id,
      createdBy,
    }),
    db.insert(journalLines).values(
      barisPembalik.map(l => ({
        journalId: pembalikId,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
        supplierId: l.supplierId,
      }))
    ),
    // DUA baris riwayat, di dua entitas berbeda: yang baru lahir, dan yang lama
    // sekarang punya pembalik. Tanpa yang kedua, riwayat jurnal asli tidak
    // menyebut apa pun tentang koreksi yang membatalkannya.
    recordJournalEvent({
      clientId: asli.clientId,
      journalId: pembalikId,
      event: 'created',
      userId: createdBy,
    }),
    recordJournalEvent({
      clientId: asli.clientId,
      journalId: id,
      event: 'reversal_created',
      userId: createdBy,
    }),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    if (isUniqueViolation(e) && check.value.noBukti !== null) {
      return NextResponse.json(
        { error: `Nomor bukti "${check.value.noBukti}" sudah dipakai jurnal lain di klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal membuat jurnal balik. Coba lagi.')
  }

  const detail = await loadJournalDetail(pembalikId)
  return NextResponse.json(detail, { status: 201 })
}
