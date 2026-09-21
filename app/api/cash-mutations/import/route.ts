import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { cashMutationImports, cashMutations, clients } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { fingerprintMutasi } from '@/lib/cash-mutation'
import {
  detectHeader,
  mapRows,
  parseCsv,
  MUTASI_FIELDS,
  type ColumnMapping,
  type MutasiField,
  type Pemisah,
} from '@/lib/csv/mutasi-kas'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { resolveUserId } from '@/lib/api/journal-queries'
import { loadCashAccount } from '@/lib/api/cash-mutation-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024
const PEMISAH_SAH = [',', ';', '\t', '|']

// POST /api/cash-mutations/import — multipart { file, clientId, akunKasId,
//                                               mapping?, pemisah?, dryRun? }
//
// ══ `dryRun=1` ADALAH JALUR YANG SAMA, BUKAN ENDPOINT LAIN ═══════════════
// Pratinjau dan commit memakai parser, pemetaan, dan aturan duplikat yang
// persis sama — pola yang sudah dipakai impor COA dan supplier. Dua endpoint
// berarti dua jawaban yang bisa berbeda, dan yang dilihat akunting di pratinjau
// bukan yang akhirnya tersimpan.
//
// ══ DUPLIKAT = PERINGATAN, BUKAN PENOLAKAN (D38) ═════════════════════════
// Fingerprint yang sudah ada di DB ditandai `duplikat: true` dan tetap ikut
// tersimpan saat di-commit. Dua pembayaran identik pada hari yang sama adalah
// hal yang nyata; menolaknya berarti memaksa akunting mengakali importer.
export async function POST(req: Request) {
  const g = await requireAkunting()
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
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })

  const akunKasId = String(form.get('akunKasId') ?? '')
  if (!UUID_RE.test(akunKasId)) {
    return NextResponse.json({ error: 'Akun kas belum dipilih.' }, { status: 400 })
  }
  const akunKas = await loadCashAccount(clientId, akunKasId)
  if (!akunKas) {
    return NextResponse.json(
      {
        error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.',
        details: ['Tandai akunnya sebagai akun kas/bank di Settings › Master COA.'],
      },
      { status: 400 }
    )
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File tidak ditemukan di field "file".' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Ukuran file melebihi 10MB.' }, { status: 400 })
  }

  const dryRun = form.get('dryRun') === '1'

  // Pemisah boleh ditentukan akunting — deteksinya tebakan, dan pada berkas
  // satu pasang kolom berkoma desimal ia bisa meleset tanpa terlihat.
  const pemisahRaw = form.get('pemisah')
  let pemisah: Pemisah | undefined
  if (typeof pemisahRaw === 'string' && pemisahRaw !== '') {
    if (!PEMISAH_SAH.includes(pemisahRaw)) {
      return NextResponse.json({ error: 'Pemisah kolom tidak dikenali.' }, { status: 400 })
    }
    pemisah = pemisahRaw as Pemisah
  }

  const teks = await file.text()
  const parsed = parseCsv(teks, pemisah)
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: 'Berkas kosong atau tidak bisa dibaca sebagai CSV.' }, { status: 400 })
  }

  // ── Pemetaan kolom: manual kalau dikirim, tebakan kalau tidak ──
  const deteksi = detectHeader(parsed.rows)
  let mapping: ColumnMapping = deteksi.mapping
  let mulaiDariIndex = (deteksi.headerRowIndex ?? -1) + 1
  let pemetaanManual = false

  const mappingRaw = form.get('mapping')
  if (typeof mappingRaw === 'string' && mappingRaw.trim() !== '') {
    let dikirim: unknown
    try {
      dikirim = JSON.parse(mappingRaw)
    } catch {
      return NextResponse.json({ error: 'Pemetaan kolom bukan JSON yang valid.' }, { status: 400 })
    }
    const obj = (dikirim ?? {}) as Record<string, unknown>
    const manual: ColumnMapping = {}
    for (const f of MUTASI_FIELDS) {
      const v = obj[f]
      if (v === null || v === undefined || v === '') continue
      const idx = Number(v)
      if (!Number.isInteger(idx) || idx < 0) {
        return NextResponse.json(
          { error: `Indeks kolom untuk "${f}" tidak valid.` },
          { status: 400 }
        )
      }
      manual[f as MutasiField] = idx
    }
    if (manual.tanggal === undefined) {
      return NextResponse.json(
        { error: 'Kolom Tanggal wajib dipetakan.' },
        { status: 400 }
      )
    }
    if (manual.debit === undefined && manual.kredit === undefined) {
      return NextResponse.json(
        { error: 'Setidaknya satu kolom nominal (masuk atau keluar) wajib dipetakan.' },
        { status: 400 }
      )
    }
    mapping = manual
    pemetaanManual = true

    // Baris awal mengikuti angka yang dikirim; bawaannya 0 supaya berkas tanpa
    // header terbaca seluruhnya.
    const mulaiRaw = form.get('mulaiDariIndex')
    const mulai = Number(mulaiRaw ?? 0)
    mulaiDariIndex = Number.isInteger(mulai) && mulai >= 0 ? mulai : 0
  } else if (deteksi.headerRowIndex === null) {
    // Tidak ada header yang dikenali DAN tidak ada pemetaan manual: layar
    // pemetaan yang harus muncul, bukan galat buntu. Baris mentah ikut dikirim
    // supaya akunting bisa melihat kolomnya sebelum memutuskan.
    return NextResponse.json({
      butuhPemetaan: true,
      pemisah: parsed.pemisah,
      contoh: parsed.rows.slice(0, 10),
      fields: MUTASI_FIELDS,
      note: 'Header tidak dikenali — petakan kolomnya secara manual.',
    })
  }

  const { rows, bermasalah } = mapRows({ rows: parsed.rows, mapping, mulaiDariIndex })
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: 'Tidak ada baris transaksi yang bisa dibaca dari berkas ini.',
        details: bermasalah.slice(0, 10).map(b => `Baris ${b.nomor}: ${b.alasan}`),
      },
      { status: 400 }
    )
  }

  // ── Dugaan duplikat: fingerprint yang SUDAH ADA di akun kas ini ──
  const fingerprints = rows.map(r => fingerprintMutasi(r))
  const adaDb = await db
    .select({ fingerprint: cashMutations.fingerprint })
    .from(cashMutations)
    .where(
      and(
        eq(cashMutations.clientId, clientId),
        eq(cashMutations.akunKasId, akunKasId),
        inArray(cashMutations.fingerprint, [...new Set(fingerprints)])
      )
    )
  const sudahAda = new Set(adaDb.map(r => r.fingerprint))

  // Duplikat DI DALAM berkas yang sama juga ditandai — berkas yang diunggah dua
  // kali berturut-turut adalah kesalahan yang paling sering terjadi.
  const terlihat = new Map<string, number>()
  const baris = rows.map((r, i) => {
    const fp = fingerprints[i]
    const sebelumnya = terlihat.get(fp)
    terlihat.set(fp, (sebelumnya ?? 0) + 1)
    return {
      ...r,
      fingerprint: fp,
      duplikatDiDatabase: sudahAda.has(fp),
      duplikatDiBerkas: sebelumnya !== undefined,
    }
  })

  const ringkasan = {
    pemisah: parsed.pemisah,
    pemetaanManual,
    mapping,
    terbaca: baris.length,
    dugaanDuplikat: baris.filter(b => b.duplikatDiDatabase || b.duplikatDiBerkas).length,
    bermasalah: bermasalah.length,
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      ...ringkasan,
      rows: baris,
      barisBermasalah: bermasalah,
      note: 'Baris yang ditandai duplikat TETAP akan tersimpan bila dilanjutkan — duplikat adalah peringatan, bukan penolakan.',
    })
  }

  const userId = await resolveUserId(g.user.email)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const importId = randomUUID()

  // Impor TIDAK membuat jurnal: baris rekening koran belum punya lawan sampai
  // akunting mengalokasikannya ke invoice atau memilih COA lawan. Semuanya
  // masuk berstatus "belum dijurnal", dan itu memang yang harus terlihat.
  const statements: BatchItem<'pg'>[] = [
    db.insert(cashMutationImports).values({
      id: importId,
      clientId,
      akunKasId,
      namaBerkas: file.name,
      jumlahBaris: baris.length,
      diimporOleh: userId,
    }),
    db.insert(cashMutations).values(
      baris.map(b => ({
        clientId,
        akunKasId,
        tanggal: b.tanggal,
        keterangan: b.keterangan,
        debit: b.debit,
        kredit: b.kredit,
        saldo: b.saldo,
        fingerprint: b.fingerprint,
        importId,
        createdBy: userId,
      }))
    ),
    // ══ TIDAK ADA audit_events UNTUK IMPOR, DAN ITU DISENGAJA ══════════
    // `cash_mutation_imports` SUDAH catatan impornya: nama berkas, jumlah
    // baris, siapa yang mengunggah, kapan. Event tambahan hanya bisa mengulang
    // isi baris itu — dan ia harus memilih antara menunjuk id impor (dengan
    // entity_type 'cash_mutation' yang jadi bohong) atau menulis seribu event
    // untuk satu tindakan akunting.
  ]

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan hasil impor. Coba lagi.')
  }

  return NextResponse.json(
    { ...ringkasan, importId, tersimpan: baris.length, barisBermasalah: bermasalah },
    { status: 201 }
  )
}
