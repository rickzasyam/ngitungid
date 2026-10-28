import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, notExists, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import { auditEvents, cashMutationAllocations, cashMutations, journalEntries, journalLines, masterCoa } from '@/lib/db/schema'
import { purgeAuditEventsMany } from '@/lib/api/audit'
import {
  buildAllocationJournalLines,
  buildDailySummaryJournalLines,
  kunciRingkasan,
  modeJurnalMutasi,
  pecahKunciRingkasan,
} from '@/lib/cash-mutation'
import { toMinorUnits, type JournalLineValue } from '@/lib/journal'
import { fmtTanggal } from '@/lib/ymd'

// PERENCANA JURNAL MUTASI KAS — satu-satunya tempat yang memutuskan jurnal
// mutasi sejak S7 (D48, D58). Dipakai route batch, pembungkus form satu-satu,
// dan route alokasi. Tidak menulis sendiri: hasilnya statement untuk db.batch
// milik pemanggil (P10).
//
// ══ DUA BENTUK JURNAL (D58) ══════════════════════════════════════════════
//   - RINGKASAN per (akun kas, akun lawan, tanggal) untuk mutasi berakun-lawan
//     TANPA alokasi: satu jurnal DRAF per kunci, baris bruto (≤ 4).
//   - PER MUTASI untuk mutasi beralokasi ke invoice (D hutang snapshot / K kas),
//     tidak berubah dari sebelum S7.
//
// ══ YANG TERPOSTING TIDAK PERNAH DISENTUH ════════════════════════════════
// Anggota jurnal terposting yang belum dibalik terkunci (`kunciMutasi`); route
// sudah menolak perubahannya sebelum sampai sini, dan perencana ini menolak
// lagi (409) sebagai jaring terakhir. Anggota BARU untuk kunci yang jurnalnya
// sudah terposting masuk DRAF KEDUA. Jurnal terposting yang SUDAH dibalik
// adalah riwayat buku besar: anggotanya dilepas dan dijurnal ulang sebagai draf.
//
// ══ JURNAL PER BARIS WARISAN TIDAK DIMIGRASI ═════════════════════════════
// Mutasi lama punya jurnal draf per baris. Begitu kuncinya tersentuh, draf-draf
// itu DIGABUNG ke satu jurnal ringkasan (satu dipakai ulang, sisanya dihapus);
// yang tidak tersentuh dibiarkan — jumlahnya di buku besar tetap sama.

export type AlokasiJurnalMutasi = { akunHutangId: string | null; nominal: string; noInvoice: string | null }

/** Keadaan AKHIR satu mutasi yang baru/berubah. */
export type MutasiAkhir = {
  id: string
  akunKasId: string
  akunLawanId: string | null
  tanggal: string
  debit: string
  kredit: string
  keterangan: string | null
  alokasi: readonly AlokasiJurnalMutasi[]
}

/** Keadaan TERSIMPAN (sebelum) satu mutasi yang berubah atau dihapus. */
export type MutasiAwal = {
  id: string
  akunKasId: string
  akunLawanId: string | null
  tanggal: string
  journalId: string | null
  jumlahAlokasi: number
}

export type InfoJurnal = { id: string; status: 'draft' | 'posted'; dibalik: boolean }

/**
 * Status + "sudah dibalik" sejumlah jurnal, dalam kueri MASSAL (tanpa N+1).
 * Dibalik = rantai pembalik TERPOSTING berpanjang ganjil (`nasibJurnalModul`).
 */
export async function muatInfoJurnal(ids: readonly string[]): Promise<Map<string, InfoJurnal>> {
  const out = new Map<string, InfoJurnal>()
  const unik = [...new Set(ids)]
  if (unik.length === 0) return out
  const rows = await db
    .select({ id: journalEntries.id, status: journalEntries.status })
    .from(journalEntries)
    .where(inArray(journalEntries.id, unik))
  const lapis = new Map<string, number>()
  let frontier = new Map<string, string>() // id jurnal di rantai → id akar
  for (const r of rows) {
    out.set(r.id, { id: r.id, status: r.status, dibalik: false })
    if (r.status === 'posted') {
      lapis.set(r.id, 0)
      frontier.set(r.id, r.id)
    }
  }
  while (frontier.size > 0) {
    const anak = await db
      .select({ id: journalEntries.id, asal: journalEntries.reversalOfId })
      .from(journalEntries)
      .where(and(inArray(journalEntries.reversalOfId, [...frontier.keys()]), eq(journalEntries.status, 'posted')))
    const berikut = new Map<string, string>()
    for (const a of anak) {
      const akar = frontier.get(a.asal as string)
      if (!akar) continue
      lapis.set(akar, (lapis.get(akar) ?? 0) + 1)
      berikut.set(a.id, akar)
    }
    frontier = berikut
  }
  for (const [id, n] of lapis) {
    const info = out.get(id)
    if (info) info.dibalik = n % 2 === 1
  }
  return out
}

const hidup = (j: InfoJurnal | undefined) => j !== undefined && j.status === 'posted' && !j.dibalik

type HasilJurnal =
  | {
      statements: BatchItem<'pg'>[]
      /** Jurnal akhir tiap mutasi yang disentuh — untuk respons & uji beban. */
      jurnalPerMutasi: Map<string, string | null>
      jurnalRingkasanDisusun: number
      jurnalDihapus: number
    }
  | { error: NextResponse }

const tolak = (error: string, details: string[], status = 409): { error: NextResponse } => ({
  error: NextResponse.json({ error, details }, { status }),
})

/**
 * Susun statement jurnal untuk sekumpulan perubahan mutasi. Lihat kepala berkas.
 *
 * `akhir` = mutasi baru + berubah (keadaan sesudah); `awal` = keadaan tersimpan
 * dari mutasi yang berubah ATAU dihapus; `dihapus` = id yang dihapus.
 * Statement yang dikembalikan mengandaikan baris mutasi baru SUDAH di-insert
 * dan yang dihapus SUDAH dihapus lebih dulu di batch yang sama.
 */
export async function rencanakanJurnalMutasi(opts: {
  clientId: string
  userId: string
  akhir: readonly MutasiAkhir[]
  awal: readonly MutasiAwal[]
  dihapus: readonly string[]
}): Promise<HasilJurnal> {
  const { clientId, userId } = opts
  const awalById = new Map(opts.awal.map(a => [a.id, a]))
  const disentuh = new Set([...opts.akhir.map(a => a.id), ...opts.dihapus])

  // ── 1. Kunci ringkasan yang tersentuh: kunci LAMA dan BARU ──
  const kunci = new Set<string>()
  for (const a of opts.akhir) {
    if (modeJurnalMutasi({ akunLawanId: a.akunLawanId, jumlahAlokasi: a.alokasi.length }) === 'ringkasan') {
      kunci.add(kunciRingkasan({ ...a, akunLawanId: a.akunLawanId as string }))
    }
  }
  for (const a of opts.awal) {
    if (modeJurnalMutasi(a) === 'ringkasan') kunci.add(kunciRingkasan({ ...a, akunLawanId: a.akunLawanId as string }))
  }

  // ── 2. Anggota TERSIMPAN yang tidak disentuh dari kunci-kunci itu (kueri massal) ──
  const kunciArr = [...kunci].map(pecahKunciRingkasan)
  const dbAnggota =
    kunciArr.length === 0
      ? []
      : (
          await db
            .select({
              id: cashMutations.id,
              akunKasId: cashMutations.akunKasId,
              akunLawanId: cashMutations.akunLawanId,
              tanggal: cashMutations.tanggal,
              debit: cashMutations.debit,
              kredit: cashMutations.kredit,
              journalId: cashMutations.journalId,
            })
            .from(cashMutations)
            .where(
              and(
                eq(cashMutations.clientId, clientId),
                inArray(cashMutations.akunKasId, [...new Set(kunciArr.map(k => k.akunKasId))]),
                inArray(cashMutations.akunLawanId, [...new Set(kunciArr.map(k => k.akunLawanId))]),
                inArray(cashMutations.tanggal, [...new Set(kunciArr.map(k => k.tanggal))]),
                notExists(
                  db
                    .select({ x: sql`1` })
                    .from(cashMutationAllocations)
                    .where(eq(cashMutationAllocations.mutationId, cashMutations.id))
                )
              )
            )
        ).filter(r => !disentuh.has(r.id) && kunci.has(kunciRingkasan({ ...r, akunLawanId: r.akunLawanId as string })))

  // ── 3. Info jurnal (status + dibalik) untuk semua jurnal yang terlibat ──
  const jurnalTerlibat = [
    ...opts.awal.map(a => a.journalId),
    ...dbAnggota.map(a => a.journalId),
  ].filter((x): x is string => x !== null)
  const info = await muatInfoJurnal(jurnalTerlibat)

  // Jaring terakhir: perubahan pada anggota jurnal terposting yang hidup.
  for (const a of opts.awal) {
    if (a.journalId && hidup(info.get(a.journalId))) {
      return tolak('Jurnal mutasi ini sudah diposting dan tidak bisa dibangun ulang.', [
        'Buat jurnal balik untuk jurnal itu dan posting pembaliknya, baru ubah mutasinya.',
      ])
    }
  }

  // Kunci LAMA setiap jurnal draf (kunci ringkasan, atau null = jurnal per mutasi).
  const kunciLamaJurnal = new Map<string, string | null>()
  for (const a of opts.awal) {
    if (!a.journalId) continue
    const mode = modeJurnalMutasi(a)
    kunciLamaJurnal.set(a.journalId, mode === 'ringkasan' ? kunciRingkasan({ ...a, akunLawanId: a.akunLawanId as string }) : null)
  }
  for (const a of dbAnggota) {
    if (a.journalId) kunciLamaJurnal.set(a.journalId, kunciRingkasan({ ...a, akunLawanId: a.akunLawanId as string }))
  }

  // ── 4. Nama akun untuk keterangan jurnal ringkasan ──
  const akunIds = [...new Set(kunciArr.flatMap(k => [k.akunKasId, k.akunLawanId]))]
  const akun = new Map(
    (akunIds.length === 0
      ? []
      : await db.select({ id: masterCoa.id, kode: masterCoa.kode, nama: masterCoa.nama }).from(masterCoa).where(inArray(masterCoa.id, akunIds))
    ).map(a => [a.id, a])
  )
  const labelAkun = (id: string) => akun.get(id)?.nama ?? 'akun'

  // ── 5. Susun ──
  const jurnalPerMutasi = new Map<string, string | null>()
  const dipakai = new Set<string>()
  const hapusJurnal = new Set<string>()
  const headerBaru: (typeof journalEntries.$inferInsert)[] = []
  const headerUbah: { id: string; tanggal: string; keterangan: string }[] = []
  const bangunUlang = new Set<string>()
  const barisJurnal: (typeof journalLines.$inferInsert)[] = []
  const eventJurnal: { journalId: string; event: 'created' | 'updated' }[] = []
  let jurnalRingkasanDisusun = 0

  const pasangBaris = (journalId: string, lines: readonly JournalLineValue[]) => {
    for (const l of lines) {
      barisJurnal.push({
        journalId,
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        lineOrder: l.lineOrder,
      })
    }
  }

  // 5a. Kunci ringkasan.
  for (const k of kunci) {
    const { akunKasId, akunLawanId, tanggal } = pecahKunciRingkasan(k)
    const anggotaAkhir = opts.akhir.filter(
      a =>
        modeJurnalMutasi({ akunLawanId: a.akunLawanId, jumlahAlokasi: a.alokasi.length }) === 'ringkasan' &&
        kunciRingkasan({ ...a, akunLawanId: a.akunLawanId as string }) === k
    )
    const anggotaDb = dbAnggota.filter(a => kunciRingkasan({ ...a, akunLawanId: a.akunLawanId as string }) === k)
    // Anggota tersimpan di jurnal terposting yang hidup tetap di sana.
    const bebasDb = anggotaDb.filter(a => !(a.journalId && hidup(info.get(a.journalId))))
    const bebas = [
      ...bebasDb.map(a => ({ id: a.id, debit: a.debit, kredit: a.kredit, journalId: a.journalId, berubah: false })),
      ...anggotaAkhir.map(a => ({ id: a.id, debit: a.debit, kredit: a.kredit, journalId: awalById.get(a.id)?.journalId ?? null, berubah: true })),
    ]
    const draf = [...kunciLamaJurnal]
      .filter(([j, kl]) => kl === k && info.get(j)?.status === 'draft')
      .map(([j]) => j)

    if (bebas.length === 0) {
      for (const j of draf) hapusJurnal.add(j)
      continue
    }

    // Draf yang paling banyak anggotanya dipakai ulang — draf lain digabung ke sana.
    const hitung = new Map<string, number>()
    for (const b of bebas) if (b.journalId && draf.includes(b.journalId)) hitung.set(b.journalId, (hitung.get(b.journalId) ?? 0) + 1)
    const penjaga = [...hitung].sort((x, y) => y[1] - x[1])[0]?.[0] ?? draf[0] ?? null
    const journalId = penjaga ?? randomUUID()
    for (const j of draf) if (j !== journalId) hapusJurnal.add(j)
    dipakai.add(journalId)

    const lines = buildDailySummaryJournalLines({ akunKasId, akunLawanId, mutasi: bebas })
    const keterangan = `Ringkasan mutasi ${labelAkun(akunKasId)} ${fmtTanggal(tanggal)} — ${labelAkun(akunLawanId)} (${bebas.length} baris)`
    if (penjaga) {
      headerUbah.push({ id: journalId, tanggal, keterangan })
      bangunUlang.add(journalId)
      eventJurnal.push({ journalId, event: 'updated' })
    } else {
      headerBaru.push({ id: journalId, clientId, tanggal, noBukti: null, keterangan, sumber: 'mutasi_kas', createdBy: userId })
      eventJurnal.push({ journalId, event: 'created' })
    }
    pasangBaris(journalId, lines)
    jurnalRingkasanDisusun++
    for (const b of bebas) if (b.berubah || b.journalId !== journalId) jurnalPerMutasi.set(b.id, journalId)
  }

  // 5b. Mutasi beralokasi → jurnal PER MUTASI (aturan lama, dipindah dari syncMutationJournal).
  for (const a of opts.akhir) {
    const mode = modeJurnalMutasi({ akunLawanId: a.akunLawanId, jumlahAlokasi: a.alokasi.length })
    const lama = awalById.get(a.id)?.journalId ?? null
    const infoLama = lama ? info.get(lama) : undefined
    const lamaEksklusif = lama !== null && infoLama?.status === 'draft' && (kunciLamaJurnal.get(lama) ?? null) === null

    if (mode === 'alokasi') {
      if (a.alokasi.some(x => x.akunHutangId === null)) {
        return tolak(
          'Ada alokasi ke invoice yang tidak punya akun hutang.',
          ['Invoice tunai tidak menimbulkan hutang, jadi ia tidak bisa dibayar lewat mutasi kas.'],
          400
        )
      }
      const lines = buildAllocationJournalLines({
        alokasi: a.alokasi.map(x => ({
          akunHutangId: x.akunHutangId as string,
          minor: toMinorUnits(x.nominal) ?? 0,
          keterangan: x.noInvoice ? `Pembayaran ${x.noInvoice}` : null,
        })),
        akunKasId: a.akunKasId,
      })
      const keterangan = a.keterangan ? `Mutasi kas — ${a.keterangan}` : 'Mutasi kas'
      if (lamaEksklusif) {
        headerUbah.push({ id: lama as string, tanggal: a.tanggal, keterangan })
        bangunUlang.add(lama as string)
        dipakai.add(lama as string)
        pasangBaris(lama as string, lines)
        eventJurnal.push({ journalId: lama as string, event: 'updated' })
        jurnalPerMutasi.set(a.id, lama)
      } else {
        const journalId = randomUUID()
        headerBaru.push({ id: journalId, clientId, tanggal: a.tanggal, noBukti: null, keterangan, sumber: 'mutasi_kas', createdBy: userId })
        pasangBaris(journalId, lines)
        eventJurnal.push({ journalId, event: 'created' })
        jurnalPerMutasi.set(a.id, journalId)
      }
      continue
    }
    if (mode === 'tanpa' && lama !== null) {
      // Tidak ada yang dijurnalkan: lepas tautannya; draf eksklusifnya dihapus di 5c.
      jurnalPerMutasi.set(a.id, null)
    }
  }

  // 5c. Draf milik mutasi yang berubah/dihapus yang tidak dipakai lagi oleh siapa pun.
  for (const a of opts.awal) {
    const j = a.journalId
    if (!j || dipakai.has(j) || info.get(j)?.status !== 'draft') continue
    const masihDipakaiDb = dbAnggota.some(d => d.journalId === j)
    if (!masihDipakaiDb) hapusJurnal.add(j)
  }
  for (const j of dipakai) hapusJurnal.delete(j)

  // ── 6. Statement, urutannya penting ──
  const statements: BatchItem<'pg'>[] = []
  const hapus = [...hapusJurnal]
  if (hapus.length > 0) {
    // FK cash_mutations.journal_id SET NULL melepas anggotanya; lines cascade.
    statements.push(db.delete(journalEntries).where(inArray(journalEntries.id, hapus)))
    const purge = purgeAuditEventsMany('journal', hapus)
    if (purge) statements.push(purge)
  }
  if (headerUbah.length > 0) {
    const tuples = sql.join(
      headerUbah.map(h => sql`(${h.id}::uuid, ${h.tanggal}::date, ${h.keterangan}::text)`),
      sql`, `
    )
    statements.push(
      db.execute(sql`
        update ${journalEntries} as je
        set tanggal = v.tanggal, keterangan = v.keterangan, updated_at = now()
        from (values ${tuples}) as v(id, tanggal, keterangan)
        where je.id = v.id
      `)
    )
  }
  if (bangunUlang.size > 0) statements.push(db.delete(journalLines).where(inArray(journalLines.journalId, [...bangunUlang])))
  if (headerBaru.length > 0) statements.push(db.insert(journalEntries).values(headerBaru))
  for (let i = 0; i < barisJurnal.length; i += 5000) {
    statements.push(db.insert(journalLines).values(barisJurnal.slice(i, i + 5000)))
  }

  // Penautan mutasi ↔ jurnal: satu UPDATE … FROM (VALUES …) per 10.000 baris.
  const taut = [...jurnalPerMutasi]
  for (let i = 0; i < taut.length; i += 10_000) {
    const tuples = sql.join(
      taut.slice(i, i + 10_000).map(([id, j]) => sql`(${id}::uuid, ${j}::uuid)`),
      sql`, `
    )
    statements.push(
      db.execute(sql`
        update ${cashMutations} as cm
        set journal_id = v.journal_id
        from (values ${tuples}) as v(id, journal_id)
        where cm.id = v.id
      `)
    )
  }

  if (eventJurnal.length > 0) {
    statements.push(
      db.insert(auditEvents).values(
        eventJurnal.map(e => ({
          clientId,
          entityType: 'journal' as const,
          entityId: e.journalId,
          event: e.event,
          userId,
        }))
      )
    )
  }

  return { statements, jurnalPerMutasi, jurnalRingkasanDisusun, jurnalDihapus: hapus.length }
}
