import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import {
  clients,
  coaMappingHistory,
  financialReports,
  journalEntries,
  journalLines,
  masterCoa,
  reportLineItems,
} from '@/lib/db/schema'
import { requireAkunting, requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { parseCoaWorkbook } from '@/lib/coa-import'
import { dbWriteErrorResponse } from '@/lib/api/db-errors'
import { buildReplacePlan, historyToReinsert } from '@/lib/coa/replace-plan'
import { TANPA_NO_BUKTI } from '@/lib/journal'
import {
  carryAccountTypes,
  isAccountType,
  resolveAccountType,
  resolveIsKas,
} from '@/lib/coa/account-type'

// xlsx parsing + neon-http butuh Node runtime (bukan edge).
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB — Master COA selalu file kecil

const coaColumns = {
  // id ikut dikirim: /coa-mapping butuh masterCoaId untuk menyimpan mapping.
  id: masterCoa.id,
  kode: masterCoa.kode,
  nama: masterCoa.nama,
  posisi: masterCoa.posisi,
  kelompok: masterCoa.kelompok,
  subKelompok: masterCoa.subKelompok,
  classCf: masterCoa.classCf,
  tipeAkun: masterCoa.tipeAkun,
  isKas: masterCoa.isKas,
}

// GET /api/clients/[id]/coa — READ Master COA. Dipakai Settings (tab Master COA,
// read-only untuk user) & dropdown COA di /coa-mapping (staf). requireUser: role
// 'user' (klien) boleh melihat COA KLIEN-NYA SENDIRI (scoping canAccessClientData
// di bawah); staf boleh klien mana pun. IMPORT/tulis = POST di bawah, tetap
// requireAkunting — jangan ikut kebuka.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  // Scoping ANTAR-klien: user hanya COA klien-nya sendiri; staf tak dibatasi.
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({ ...coaColumns, updatedAt: masterCoa.updatedAt })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, id))
    .orderBy(asc(masterCoa.kode))

  // `updatedAt` dihitung dari SELURUH baris, sebelum penyaringan apa pun:
  // ia menjawab "kapan Master COA klien ini terakhir berubah", bukan "kapan
  // baris yang kebetulan lolos filter berubah".
  const updatedAt = rows.reduce<Date | null>(
    (latest, r) => (!latest || r.updatedAt > latest ? r.updatedAt : latest),
    null
  )

  // ── Penyaring opsional (R8) ─────────────────────────────────────────
  // `?tipe=liability` untuk pemilih akun hutang, `?kas=1` untuk pemilih akun
  // kas (§5.E). Disaring di JS, bukan SQL, karena keduanya bekerja atas nilai
  // yang DITURUNKAN (`resolvedType`/`resolvedIsKas`) — akun yang tipenya belum
  // diisi manusia tetap harus ikut kalau turunannya cocok, dan turunan itu
  // hidup di lib/coa/account-type.ts, bukan di database.
  const url = new URL(req.url)
  const tipeFilter = url.searchParams.get('tipe')
  if (tipeFilter !== null && !isAccountType(tipeFilter)) {
    return NextResponse.json({ error: 'Parameter tipe tidak dikenali.' }, { status: 400 })
  }
  const kasParam = url.searchParams.get('kas')
  const kasFilter = kasParam === '1' || kasParam === 'true'

  const accounts = rows
    .map(({ updatedAt: _omit, ...rest }) => ({
      ...rest,
      resolvedType: resolveAccountType(rest),
      resolvedIsKas: resolveIsKas(rest),
    }))
    .filter(a => (tipeFilter === null || a.resolvedType === tipeFilter) && (!kasFilter || a.resolvedIsKas))

  return NextResponse.json({ count: accounts.length, updatedAt, accounts })
}

// POST /api/clients/[id]/coa — admin only. multipart/form-data { file, dryRun? }.
//
// Replace-all DENGAN re-link by `kode`. Dulu route ini menolak (409) kalau ada
// laporan yang masih memetakan ke COA lama, sehingga admin harus menghapus
// laporan dulu hanya untuk memperbaiki satu baris COA. Sekarang: mapping yang
// kode-nya masih ada disambung ke id baru, yang kode-nya hilang diputus dan
// dikembalikan ke antrean /coa-mapping.
//
// `dryRun=1` menghitung dampaknya TANPA menulis apa pun — sumber angka untuk
// layar konfirmasi di Settings. Sengaja flag pada route yang sama, bukan
// endpoint terpisah: preview dan eksekusi wajib memakai parser + planner yang
// persis sama, kalau tidak angka yang disetujui admin bisa berbeda dari yang
// benar-benar terjadi. Konsekuensinya file terkirim dua kali (Master COA
// lazimnya puluhan KB, dibatasi 10MB) — itu ditukar dengan hilangnya risiko
// drift antara dua jalur kode.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }

  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) {
    return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body harus multipart/form-data.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File Excel tidak ditemukan di field "file".' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Ukuran file melebihi 10MB.' }, { status: 400 })
  }

  const dryRun = form.get('dryRun') === '1'

  const { rows, errors, warnings, ambiguousKode } = parseCoaWorkbook(await file.arrayBuffer())
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Gagal memproses Excel — perbaiki file lalu upload ulang.', details: errors },
      { status: 400 }
    )
  }

  // ── Baca SEMUA yang dibutuhkan sebelum apa pun ditulis ──────────────
  // Dibaca SEBELUM `values` disusun, karena `tipe_akun` & `is_kas` lama harus
  // ikut dibawa ke baris baru (lihat carryAccountTypes di bawah).
  const oldAccounts = await db
    .select({
      id: masterCoa.id,
      kode: masterCoa.kode,
      tipeAkun: masterCoa.tipeAkun,
      isKas: masterCoa.isKas,
    })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, id))

  const oldIds = oldAccounts.map(a => a.id)

  // ══ TIPE AKUN & PENANDA KAS DIBAWA DARI YANG LAMA, BY KODE ══════════
  // Keputusan Ricko 2026-09-18, dan ia menutup kehilangan data yang senyap:
  // kedua kolom itu diisi MANUAL lewat layar, sementara berkas Excel klien
  // lazimnya tidak memuat kolomnya sama sekali. Tanpa ini, setiap impor ulang
  // COA — yang dilakukan rutin — menghapus seluruh tipe akun yang sudah
  // disetel, tanpa satu pun galat. Sel yang KOSONG tidak menimpa; hanya nilai
  // yang benar-benar diisi berkas yang menang.
  const carried = carryAccountTypes(oldAccounts, rows)

  // Id di-generate DI SINI, bukan oleh defaultRandom() di DB. Itu yang membuat
  // seluruh operasi muat dalam satu db.batch(): peta kode→id baru sudah
  // diketahui sebelum statement pertama dikirim, jadi statement re-link tidak
  // perlu menunggu hasil INSERT. neon-http tidak punya transaksi interaktif —
  // db.batch() adalah SATU transaksi HTTP (sudah diverifikasi: statement yang
  // sukses ikut rollback kalau ada statement lain yang gagal).
  const values = carried.map(r => ({
    id: randomUUID(),
    clientId: id,
    ...r,
    // Kolomnya NOT NULL; carryAccountTypes sudah menjamin non-null, dan ini
    // penjaga terakhir supaya bentuknya cocok dengan skema.
    isKas: r.isKas ?? false,
  }))
  const newKodeToId = new Map(values.map(v => [v.kode, v.id]))

  const [lines, history, reportRows] = await Promise.all([
    oldIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: reportLineItems.id,
            reportId: reportLineItems.reportId,
            masterCoaId: reportLineItems.masterCoaId,
            suggestedCoaId: reportLineItems.suggestedCoaId,
            isSubtotal: reportLineItems.isSubtotal,
            status: reportLineItems.status,
            rawName: reportLineItems.rawName,
            amount: reportLineItems.amount,
          })
          .from(reportLineItems)
          .innerJoin(financialReports, eq(reportLineItems.reportId, financialReports.id))
          .where(eq(financialReports.clientId, id)),
    db
      .select({
        rawName: coaMappingHistory.rawName,
        masterCoaId: coaMappingHistory.masterCoaId,
        confirmedCount: coaMappingHistory.confirmedCount,
      })
      .from(coaMappingHistory)
      .where(eq(coaMappingHistory.clientId, id)),
    db
      .select({
        id: financialReports.id,
        reportType: financialReports.reportType,
        periodStart: financialReports.periodStart,
        periodEnd: financialReports.periodEnd,
        status: financialReports.status,
      })
      .from(financialReports)
      .where(eq(financialReports.clientId, id)),
  ])

  // Baris jurnal klien ini, beserta nomor bukti header-nya. Dibaca SEBELUM
  // apa pun ditulis, sama seperti baris laporan & riwayat di atas.
  // Supplier belum ikut: tabel master_supplier baru lahir di migrasi 0011 —
  // langkah B3 yang menyambungkannya ke sini.
  const journalRows =
    oldIds.length === 0
      ? []
      : await db
          .select({
            id: journalLines.id,
            journalId: journalLines.journalId,
            noBukti: journalEntries.noBukti,
            masterCoaId: journalLines.masterCoaId,
          })
          .from(journalLines)
          .innerJoin(journalEntries, eq(journalLines.journalId, journalEntries.id))
          .where(eq(journalEntries.clientId, id))

  const { plan, relinks, journalRelinks } = buildReplacePlan({
    oldAccounts,
    newKodeToId,
    ambiguousKode: ambiguousKode ?? [],
    lines,
    history,
    reports: reportRows,
    journalLines: journalRows,
  })

  if (dryRun) {
    // TETAP 200 walau ada yang memblokir: layar konfirmasi butuh `impact` untuk
    // menampilkan daftar merahnya dan menonaktifkan tombol simpan. Yang menolak
    // adalah eksekusi di bawah.
    return NextResponse.json({
      dryRun: true,
      newCount: values.length,
      oldCount: oldAccounts.length,
      warnings: warnings ?? [],
      impact: plan,
    })
  }

  // ── Blokir: jurnal menahan akun yang kodenya hilang ─────────────────
  //
  // Baris laporan yang kehilangan akun boleh diputus — ia kembali ke antrean
  // /coa-mapping dan angkanya utuh. Baris JURNAL tidak punya keadaan "belum
  // dipetakan": ia pencatatan yang sudah terjadi, kolomnya NOT NULL, dan
  // memindahkannya ke akun lain berarti menulis ulang pembukuan diam-diam.
  // Ditolak di sini, sebelum satu statement pun dikirim, dengan menyebut nomor
  // buktinya — kalau dibiarkan sampai DB, yang keluar hanya galat FK tanpa
  // petunjuk jurnal mana yang harus diperbaiki.
  if (plan.journalBlocked.length > 0) {
    return NextResponse.json(
      {
        error: 'Master COA tidak bisa diganti: ada akun terpakai jurnal yang hilang di file baru.',
        details: plan.journalBlocked.map(
          b => `Jurnal ${b.noBukti ?? TANPA_NO_BUKTI} memakai akun ${b.kode}, yang tidak ada di file baru.`
        ),
        impact: plan,
      },
      { status: 409 }
    )
  }

  // ── Tulis: satu batch, urutan wajib dijaga ──────────────────────────
  const now = new Date()
  const statements: BatchItem<'pg'>[] = []

  // 1) Lepas SEMUA referensi ke COA lama dulu. Tanpa ini, DELETE di langkah 2
  //    ditolak FK report_line_items.master_coa_id (onDelete: 'restrict').
  if (oldIds.length > 0) {
    statements.push(
      db
        .update(reportLineItems)
        .set({ masterCoaId: null, suggestedCoaId: null, updatedAt: now })
        .where(inArray(reportLineItems.masterCoaId, oldIds))
    )
    statements.push(
      db
        .update(reportLineItems)
        .set({ suggestedCoaId: null, updatedAt: now })
        .where(inArray(reportLineItems.suggestedCoaId, oldIds))
    )
  }

  // 2) Ganti isi Master COA. History ikut terhapus (FK CASCADE) — sengaja
  //    dibiarkan, lalu yang kode-nya selamat di-insert ulang di langkah 5.
  if (journalRows.length === 0) {
    // Jalur lama, tidak berubah sedikit pun: hapus dulu, lalu sisipkan.
    statements.push(db.delete(masterCoa).where(eq(masterCoa.clientId, id)))
    if (values.length > 0) statements.push(db.insert(masterCoa).values(values))
  } else {
    // ── Jalur "ada jurnal": urutannya HARUS dibalik ──────────────────
    //
    // Masalahnya melingkar. journal_lines.master_coa_id itu NOT NULL dengan FK
    // restrict, jadi ia tidak bisa dilepas dulu seperti report_line_items —
    // artinya DELETE master_coa akan ditolak selama baris jurnal masih
    // menunjuk ke sana. Tapi menyisipkan baris baru lebih dulu juga ditolak,
    // kali ini oleh unique(client_id, kode), karena kode yang sama masih
    // dipegang baris lama.
    //
    // Jalan keluarnya: lepaskan dulu kode lama dari batasan unique dengan
    // menamainya sementara, sisipkan yang baru, pindahkan baris jurnal ke id
    // baru, baru hapus yang lama. Nama sementaranya memakai id baris itu
    // sendiri sehingga dijamin tidak bentrok satu sama lain maupun dengan kode
    // asli mana pun. Semuanya di dalam batch yang sama — satu transaksi, jadi
    // keadaan antara ini tidak pernah terlihat siapa pun, dan kalau ada satu
    // statement gagal seluruhnya ikut dibatalkan.
    //
    // Blokir di atas sudah menjamin setiap baris jurnal punya sasaran baru,
    // jadi langkah 2c di bawah tidak mungkin menyisakan baris yatim.
    statements.push(
      db
        .update(masterCoa)
        .set({ kode: sql`'~' || ${masterCoa.id}::text` })
        .where(inArray(masterCoa.id, oldIds))
    )

    if (values.length > 0) statements.push(db.insert(masterCoa).values(values))

    if (journalRelinks.length > 0) {
      const jTuples = sql.join(
        journalRelinks.map(r => sql`(${r.journalLineId}::uuid, ${r.newMasterCoaId}::uuid)`),
        sql`, `
      )
      statements.push(
        db.execute(sql`
          update ${journalLines} as jl
          set master_coa_id = v.master_coa_id
          from (values ${jTuples}) as v(id, master_coa_id)
          where jl.id = v.id
        `)
      )
    }

    // Dibatasi ke id LAMA, bukan ke clientId: baris baru sudah ada di tabel
    // yang sama pada titik ini dan tidak boleh ikut terhapus.
    statements.push(db.delete(masterCoa).where(inArray(masterCoa.id, oldIds)))
  }

  // 3) Sambungkan kembali baris yang kode-nya masih ada. Satu UPDATE ... FROM
  //    (VALUES …) untuk semua baris sekaligus — bukan satu statement per baris,
  //    supaya batch tetap pendek walau laporannya ratusan baris.
  const reconnect = relinks.filter(r => r.newMasterCoaId !== null || r.newSuggestedCoaId !== null)
  if (reconnect.length > 0) {
    const tuples = sql.join(
      reconnect.map(
        r =>
          sql`(${r.lineItemId}::uuid, ${r.newMasterCoaId}::uuid, ${r.newSuggestedCoaId}::uuid)`
      ),
      sql`, `
    )
    statements.push(
      db.execute(sql`
        update ${reportLineItems} as li
        set master_coa_id = v.master_coa_id,
            suggested_coa_id = v.suggested_coa_id,
            updated_at = ${now}
        from (values ${tuples}) as v(id, master_coa_id, suggested_coa_id)
        where li.id = v.id
      `)
    )
  }

  // 4) Baris yang mapping-nya PUTUS: status ikut direset ke 'unmatched'.
  //    Kalau tidak, Extraction Review tetap menampilkannya "matched" padahal
  //    COA-nya sudah tidak ada, dan admin tidak punya petunjuk apa pun.
  const brokenIds = relinks.filter(r => r.lostMapping).map(r => r.lineItemId)
  if (brokenIds.length > 0) {
    statements.push(
      db
        .update(reportLineItems)
        .set({ status: 'unmatched', updatedAt: now })
        .where(inArray(reportLineItems.id, brokenIds))
    )
  }

  // 5) Selamatkan riwayat auto-match untuk kode yang masih ada.
  const savedHistory = historyToReinsert({
    oldAccounts,
    newKodeToId,
    ambiguousKode: ambiguousKode ?? [],
    history,
  })
  if (savedHistory.length > 0) {
    statements.push(
      db.insert(coaMappingHistory).values(savedHistory.map(h => ({ clientId: id, ...h })))
    )
  }

  // 6) Demote laporan yang tidak lagi 100% ter-mapping (hanya mapped→review).
  if (plan.demotedReportIds.length > 0) {
    statements.push(
      db
        .update(financialReports)
        .set({ status: 'review', updatedAt: now })
        .where(inArray(financialReports.id, plan.demotedReportIds))
    )
  }

  try {
    await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (e) {
    return dbWriteErrorResponse(e, 'Gagal menyimpan Master COA. Coba lagi.')
  }

  return NextResponse.json(
    { inserted: values.length, count: values.length, warnings: warnings ?? [], impact: plan },
    { status: 200 }
  )
}
