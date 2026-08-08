import { NextResponse } from 'next/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { clients, contracts, contractLayanan, layanan } from '@/lib/db/schema'
import { requireUser, requireCommercial } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { dbWriteErrorResponse, isUniqueViolation } from '@/lib/api/db-errors'
import { validateContract, MAX_DOKUMEN_BYTES } from '@/lib/contracts'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// KOLOM DAFTAR — `dokumen` SENGAJA TIDAK ADA DI SINI, dan tidak boleh
// ditambahkan. Satu daftar kontrak yang ikut menarik blob akan menyeret puluhan
// MB lewat serverless function untuk halaman yang cuma menampilkan nama &
// tanggal. Byte-nya hanya dialirkan lewat GET /api/contracts/[id]/dokumen.
// Preseden: financial_reports.source_pdf, yang juga tidak pernah masuk daftar.
const listCols = {
  id: contracts.id,
  clientId: contracts.clientId,
  noKontrak: contracts.noKontrak,
  jenis: contracts.jenis,
  tanggalMulai: contracts.tanggalMulai,
  tanggalAkhir: contracts.tanggalAkhir,
  tanggalPenagihan: contracts.tanggalPenagihan,
  nominal: contracts.nominal,
  namaDokumen: contracts.namaDokumen,
  ukuranDokumen: contracts.ukuranDokumen,
  createdAt: contracts.createdAt,
  updatedAt: contracts.updatedAt,
}

// GET /api/contracts?clientId=… — daftar kontrak satu klien.
//
// requireUser + canAccessClientData — ASIMETRIS, pola yang sama dengan
// GET /api/clients/[id]/coa dan GET /api/reports/list: staf & finance boleh
// klien mana pun, role 'user' (klien) HANYA kliennya sendiri.
//
// Dulu requireInternal. Gerbang itu menutup DAFTAR untuk klien sementara
// GET /api/contracts/[id]/dokumen — byte PDF kontraknya seutuhnya — sudah
// terbuka bagi klien lewat requireUser. Jadi ia tidak menjaga apa pun yang
// belum terbuka di sebelahnya; ia cuma membuat klien bisa membaca dokumennya
// tanpa bisa menemukan id-nya. Response ini pun ketat LEBIH SEDIKIT daripada
// route dokumen: metadata saja, tanpa byte.
//
// requireUser di sini hanya aman BERPASANGAN dengan canAccessClientData di
// bawah — tanpa itu setiap klien bisa membaca kontrak klien lain dengan
// menukar ?clientId=.
export async function GET(req: Request) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const clientId = new URL(req.url).searchParams.get('clientId') ?? ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select(listCols)
    .from(contracts)
    .where(eq(contracts.clientId, clientId))
    .orderBy(asc(contracts.tanggalMulai))

  // Layanan per kontrak — query terpisah, bukan join yang menggandakan baris.
  const ids = rows.map(r => r.id)
  const links = ids.length
    ? await db
        .select({ contractId: contractLayanan.contractId, layananId: contractLayanan.layananId })
        .from(contractLayanan)
        .where(inArray(contractLayanan.contractId, ids))
    : []
  const byContract = new Map<string, string[]>()
  for (const l of links) {
    const arr = byContract.get(l.contractId) ?? []
    arr.push(l.layananId)
    byContract.set(l.contractId, arr)
  }

  return NextResponse.json({
    contracts: rows.map(r => ({ ...r, layananIds: byContract.get(r.id) ?? [] })),
  })
}

// POST /api/contracts — buat kontrak + dokumennya. owner + finance SAJA.
// multipart/form-data: field `dokumen` (PDF) + field JSON lainnya.
export async function POST(req: Request) {
  const g = await requireCommercial()
  if ('error' in g) return g.error

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body harus multipart/form-data.' }, { status: 400 })
  }

  const clientId = String(form.get('clientId') ?? '')
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }

  const tp = form.get('tanggalPenagihan')
  const raw = {
    noKontrak: form.get('noKontrak'),
    jenis: form.get('jenis'),
    tanggalMulai: form.get('tanggalMulai'),
    tanggalAkhir: form.get('tanggalAkhir'),
    tanggalPenagihan: tp === null || tp === '' ? undefined : Number(tp),
    nominal: form.get('nominal'),
    layananIds: form.getAll('layananIds').map(String),
  }
  const check = validateContract(raw)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const file = form.get('dokumen')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Dokumen kontrak (PDF) wajib diunggah.' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: `"${file.name}" bukan PDF.` }, { status: 400 })
  }
  if (file.size > MAX_DOKUMEN_BYTES) {
    return NextResponse.json({ error: `"${file.name}" melebihi 25MB.` }, { status: 400 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  // Layanan divalidasi EXIST di DB, bukan percaya id dari client. Layanan
  // nonaktif TETAP boleh dipilih di sini kalau pemanggil mengirimnya — penyaring
  // "hanya yang aktif" ada di picker UI (selectableLayanan), sementara API
  // hanya memastikan id-nya nyata.
  if (check.layananIds.length > 0) {
    const found = await db
      .select({ id: layanan.id })
      .from(layanan)
      .where(inArray(layanan.id, check.layananIds))
    if (found.length !== check.layananIds.length) {
      return NextResponse.json({ error: 'Ada layanan yang tidak ditemukan.' }, { status: 400 })
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  // id dibuat di JS supaya insert kontrak + barisan penghubungnya bisa masuk
  // SATU db.batch() yang atomik (pola sama dgn import Master COA).
  const contractId = randomUUID()

  const statements: BatchItem<'pg'>[] = [
    db.insert(contracts).values({
      id: contractId,
      clientId,
      noKontrak: check.noKontrak,
      jenis: check.jenis,
      tanggalMulai: check.tanggalMulai,
      tanggalAkhir: check.tanggalAkhir,
      tanggalPenagihan: check.tanggalPenagihan,
      nominal: check.nominal,
      dokumen: bytes,
      namaDokumen: file.name,
      ukuranDokumen: bytes.length,
    }),
    ...check.layananIds.map(layananId =>
      db.insert(contractLayanan).values({ contractId, layananId })
    ),
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: `Nomor kontrak "${check.noKontrak}" sudah ada untuk klien ini.` },
        { status: 409 }
      )
    }
    return dbWriteErrorResponse(e, 'Gagal menyimpan kontrak. Coba lagi.')
  }

  // Byte dokumen TIDAK pernah ikut di response.
  const [created] = await db
    .select(listCols)
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.clientId, clientId)))
    .limit(1)

  return NextResponse.json({ contract: { ...created, layananIds: check.layananIds } }, { status: 201 })
}
