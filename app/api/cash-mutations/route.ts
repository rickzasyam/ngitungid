import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { clients } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd } from '@/lib/contracts'
import { validateCashMutation } from '@/lib/cash-mutation'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import {
  assertAccountBelongsToClient,
  listCashMutations,
  loadCashAccount,
  loadMutationDetail,
} from '@/lib/api/cash-mutation-queries'
import { tolakBilaPeriodeTerkunci } from '@/lib/api/period-lock'
import { jawabanTunggal, rencanakanSimpanMutasi } from '@/lib/api/cash-mutation-batch'
import { muatGridMutasi } from '@/lib/api/cash-mutation-grid'
import { jsonGzip } from '@/lib/api/json-gzip'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/cash-mutations?clientId&periodStart&periodEnd[&akunKasId][&urut=buku]
//
// `urut=buku` = MODE GRID (S8): wajib `akunKasId` (satu grid = satu akun kas),
// urutan baku naik, per baris `updatedAt`/`catatan`/`urutan`/status jurnal/
// jumlah alokasi/`kunci` (dari `kunciMutasi`, aturan yang sama dengan Simpan),
// plus `saldoJangkar` (D61) dan `terkunciSampai`. Tanpa paginasi — satu
// akun-bulan dikirim utuh, dikompres gzip DI FUNGSI (`jsonGzip`).
//
// ══ requireInternal UNTUK BACA, requireAkunting UNTUK TULIS (D45) ═════════
// Sama dengan /api/purchase-invoices: `/mutasi-kas` masuk INTERNAL_ONLY_PREFIXES,
// jadi finance boleh MELIHAT arus kas klien dan mengunduhnya, tapi tidak
// menulis. Klien tidak melihat modul ini sama sekali.
export async function GET(req: Request) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''
  const akunKasId = url.searchParams.get('akunKasId') ?? ''

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
  if (akunKasId !== '' && !UUID_RE.test(akunKasId)) {
    return NextResponse.json({ error: 'akunKasId tidak valid.' }, { status: 400 })
  }
  const urut = url.searchParams.get('urut') ?? ''
  if (urut !== '' && urut !== 'buku') {
    return NextResponse.json({ error: 'urut tidak dikenal (hanya "buku").' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (urut === 'buku') {
    if (akunKasId === '') {
      return NextResponse.json({ error: 'Mode grid butuh akunKasId — satu grid = satu akun kas.' }, { status: 400 })
    }
    if (!(await loadCashAccount(clientId, akunKasId))) {
      return NextResponse.json(
        { error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.' },
        { status: 400 }
      )
    }
    const grid = await muatGridMutasi({ clientId, akunKasId, periodStart, periodEnd })
    // Dikompres di fungsi: 10.000 baris ±8 MB JSON melewati batas respons
    // Vercel 4,5 MB yang berlaku SEBELUM kompresi CDN (lib/api/json-gzip.ts).
    return jsonGzip(req, { count: grid.mutations.length, ...grid })
  }

  const mutations = await listCashMutations({
    clientId,
    periodStart,
    periodEnd,
    akunKasId: akunKasId || undefined,
  })
  return NextResponse.json({ count: mutations.length, mutations })
}

// POST /api/cash-mutations — SATU mutasi dari form (HP, D48).
//
// ══ PEMBUNGKUS TIPIS ATAS PERENCANA BATCH ════════════════════════════════
// Pemeriksaan di bawah hanya menjaga BENTUK jawaban lama yang dibaca form
// (400 `{ error, details }`, 409 `{ lockedUntil }`). Yang memutuskan dan
// menyusun tulisan — validasi, kunci, duplikat, jurnal ringkasan (D58) —
// adalah `rencanakanSimpanMutasi`, sama persis dengan grid. Tidak ada jalur
// simpan kedua.
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

  const check = validateCashMutation({
    tanggal: raw.tanggal,
    akunKasId: raw.akunKasId,
    debit: raw.debit,
    kredit: raw.kredit,
    keterangan: raw.keterangan,
    saldo: raw.saldo,
    akunLawanId: raw.akunLawanId,
    catatan: raw.catatan,
  })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors[0], details: check.errors }, { status: 400 })
  }
  const terkunci = await tolakBilaPeriodeTerkunci(clientId, [check.value.tanggal])
  if (terkunci) return terkunci

  // Akun kas HARUS bertanda is_kas (E1–E3), bukan akun sembarang: daftar di
  // layar disaring dengan aturan yang sama, jadi apa pun yang lolos ke sini
  // tanpa penanda itu datang dari luar layar.
  const akunKas = await loadCashAccount(clientId, check.value.akunKasId)
  if (!akunKas) {
    return NextResponse.json(
      {
        error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.',
        details: ['Tandai akunnya sebagai akun kas/bank di Settings › Master COA.'],
      },
      { status: 400 }
    )
  }
  if (check.value.akunLawanId) {
    const salah = await assertAccountBelongsToClient(check.value.akunLawanId, clientId)
    if (salah) return salah
  }

  const createdBy = await resolveUserId(g.user.email)
  if (!createdBy) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rencana = await rencanakanSimpanMutasi(
    {
      clientId,
      akunKasId: check.value.akunKasId,
      periode: null,
      baru: [
        {
          kunci: 'form',
          tanggal: check.value.tanggal,
          debit: check.value.debit,
          kredit: check.value.kredit,
          saldo: check.value.saldo,
          keterangan: check.value.keterangan,
          catatan: check.value.catatan,
          akunLawanId: check.value.akunLawanId,
          urutan: null,
          asal: 'ketik',
          blok: null,
          saldoDikosongkan: null,
        },
      ],
      ubah: [],
      hapus: [],
      berkas: [],
      dryRun: false,
    },
    createdBy
  )
  if (rencana.jenis === 'tolak') {
    const j = jawabanTunggal(rencana)
    return NextResponse.json(j.body, { status: j.status })
  }
  if (rencana.jenis !== 'siap') return NextResponse.json({ error: 'Rencana tidak lengkap.' }, { status: 500 })

  try {
    await db.batch(rencana.statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan mutasi kas. Coba lagi.')
  }

  const detail = await loadMutationDetail(rencana.idBaru.get('form') as string)
  return NextResponse.json(detail, { status: 201 })
}
