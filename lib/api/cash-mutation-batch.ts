import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '@/lib/db'
import {
  auditEvents,
  cashMutationAllocations,
  cashMutationImports,
  cashMutations,
  masterCoa,
  purchaseInvoices,
} from '@/lib/db/schema'
import { fingerprintMutasi, kunciMutasi, validateCashMutation, type CashMutationValue } from '@/lib/cash-mutation'
import { isValidYmd } from '@/lib/contracts'
import { toMinorUnits, fromMinorUnits } from '@/lib/journal'
import { isDateLocked, latestLock } from '@/lib/period-lock'
import { fmtTanggal } from '@/lib/ymd'
import { purgeAuditEventsMany } from '@/lib/api/audit'
import { loadCashAccount } from '@/lib/api/cash-mutation-queries'
import { loadPeriodLocks } from '@/lib/api/period-lock'
import { muatInfoJurnal, rencanakanJurnalMutasi, type MutasiAkhir, type MutasiAwal } from '@/lib/api/cash-mutation-journal'

// PERENCANA SIMPAN MUTASI KAS — satu jalur tulis (D48). `POST /api/cash-mutations/batch`
// memakainya langsung; POST/PATCH/DELETE satu-satu (form HP) adalah pembungkus
// tipis di atasnya — aturan identik, tidak ada jalur simpan kedua.
//
// ══ SEMUA ATAU TIDAK SAMA SEKALI ═════════════════════════════════════════
// Satu baris galat → NOL statement, dan galatnya dikembalikan PER BARIS & PER
// KOLOM supaya grid bisa memerahkan sel yang tepat. Tidak ada simpan sebagian
// (D47): baris bermasalah tidak dilewati diam-diam seperti impor CSV lama.
//
// ══ `dryRun` ADALAH JALUR YANG SAMA ══════════════════════════════════════
// Validasi, kunci, konkurensi, duplikat, dan rencana jurnal dijalankan
// persis sama; bedanya hanya statement tidak dikirim. Angka di layar
// konfirmasi karena itu mustahil berbeda dari yang benar-benar terjadi.
//
// ══ BATAS PER SIMPAN (D52) ═══════════════════════════════════════════════
// Satu Simpan = satu akun-bulan. INSERT dipecah ≤ 4.000 baris per statement
// (batas 65.535 parameter Postgres) — tetap di dalam SATU db.batch, atomik.
// Melewati batas = ditolak dengan pesan, TIDAK PERNAH dipecah diam-diam.

export const BATAS_BARU = 10_000
export const BATAS_UBAH = 2_000
export const BATAS_HAPUS = 2_000
const BARIS_PER_INSERT = 4_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ASAL = ['ketik', 'tempel', 'berkas', 'pdf'] as const
type Asal = (typeof ASAL)[number]

export type Periode = { mulai: string; akhir: string }

export type MasukanBaru = {
  kunci: string
  tanggal: unknown
  debit: unknown
  kredit: unknown
  saldo: unknown
  keterangan: unknown
  catatan: unknown
  /** Ref / nomor bukti (0022, D64) — opsional: pemanggil lama tanpa ref = NULL. */
  ref?: unknown
  akunLawanId: unknown
  urutan: unknown
  asal: unknown
  blok: unknown
  saldoDikosongkan: unknown
}

export type MasukanUbah = {
  id: string
  updatedAt: unknown
  tanggal: unknown
  debit: unknown
  kredit: unknown
  saldo: unknown
  keterangan: unknown
  catatan: unknown
  ref?: unknown
  akunLawanId: unknown
  saldoDikosongkan: unknown
  /** Hanya form satu-satu: memindah mutasi ke akun kas lain. Grid selalu satu akun. */
  akunKasId?: unknown
}

export type MasukanHapus = { id: string; updatedAt: unknown }
export type MasukanBerkas = { blok: string; namaBerkas: string; sumber: 'berkas' | 'pdf' }

export type PermintaanSimpan = {
  clientId: string
  akunKasId: string
  /** null = tanpa batas rentang (pembungkus form satu-satu). */
  periode: Periode | null
  baru: readonly MasukanBaru[]
  ubah: readonly MasukanUbah[]
  hapus: readonly MasukanHapus[]
  berkas: readonly MasukanBerkas[]
  dryRun: boolean
}

export type GalatSimpan = {
  /** Kunci baris baru di grid, atau id mutasi tersimpan. */
  kunci: string
  kolom?: string
  pesan: string
  jenis: 'validasi' | 'kunci' | 'tidak-ada'
}

export type Ringkasan = {
  baru: number
  ubah: number
  hapus: number
  jurnalRingkasan: number
  jurnalDihapus: number
  statement: number
}

export type HasilSimpan =
  | { jenis: 'tolak'; status: number; body: Record<string, unknown> }
  | { jenis: 'dryRun'; body: { dryRun: true; ringkasan: Ringkasan; duplikat: Duplikat[] } }
  | {
      jenis: 'siap'
      statements: BatchItem<'pg'>[]
      idBaru: Map<string, string>
      body: { ringkasan: Ringkasan; duplikat: Duplikat[] }
    }

export type Duplikat = { kunci: string; sumber: 'db' | 'batch' }

const tolak = (status: number, error: string, extra: Record<string, unknown> = {}): HasilSimpan => ({
  jenis: 'tolak',
  status,
  body: { error, ...extra },
})

// Kolom grid untuk galat validator yang menyebut field-nya.
function kolomDariGalat(pesan: string): string | undefined {
  const p = pesan.toLowerCase()
  if (p.startsWith('tanggal')) return 'tanggal'
  if (p.startsWith('nominal debit')) return 'masuk'
  if (p.startsWith('nominal kredit')) return 'keluar'
  if (p.startsWith('saldo')) return 'saldo'
  if (p.startsWith('keterangan')) return 'uraian'
  if (p.startsWith('catatan')) return 'catatan'
  if (p.startsWith('ref')) return 'ref'
  if (p.startsWith('mutasi')) return 'masuk'
  return undefined
}

const kanonikSaldo = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  const neg = s.startsWith('-')
  const m = toMinorUnits(neg ? s.slice(1) : s)
  return m === null ? null : fromMinorUnits(neg ? -m : m)
}

const samaWaktu = (a: unknown, b: Date) => {
  if (typeof a !== 'string') return false
  const t = Date.parse(a)
  return Number.isFinite(t) && t === b.getTime()
}

/**
 * Rencanakan satu Simpan. Lihat kepala berkas. Tidak menulis apa pun.
 */
export async function rencanakanSimpanMutasi(p: PermintaanSimpan, userId: string): Promise<HasilSimpan> {
  // ── 0. Batas (D52) & bentuk ──
  if (p.baru.length > BATAS_BARU || p.ubah.length > BATAS_UBAH || p.hapus.length > BATAS_HAPUS) {
    return tolak(413, `Satu Simpan paling banyak ${BATAS_BARU.toLocaleString('id-ID')} baris baru, ${BATAS_UBAH.toLocaleString('id-ID')} ubah, dan ${BATAS_HAPUS.toLocaleString('id-ID')} hapus.`, {
      details: ['Simpan per rentang tanggal yang lebih pendek.'],
    })
  }
  if (p.periode && (!isValidYmd(p.periode.mulai) || !isValidYmd(p.periode.akhir) || p.periode.akhir < p.periode.mulai)) {
    return tolak(400, 'Periode tidak valid (format YYYY-MM-DD).')
  }
  const idUbahHapus = [...p.ubah.map(u => u.id), ...p.hapus.map(h => h.id)]
  if (idUbahHapus.some(id => typeof id !== 'string' || !UUID_RE.test(id))) return tolak(400, 'Id mutasi tidak valid.')
  if (new Set(idUbahHapus).size !== idUbahHapus.length) return tolak(400, 'Satu mutasi muncul lebih dari sekali di Simpan ini.')
  const kunciBaru = p.baru.map(b => b.kunci)
  if (kunciBaru.some(k => typeof k !== 'string' || k === '') || new Set(kunciBaru).size !== kunciBaru.length) {
    return tolak(400, 'Kunci baris baru tidak valid atau ganda.')
  }

  const akunKas = await loadCashAccount(p.clientId, p.akunKasId)
  if (!akunKas) {
    return tolak(400, 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.', {
      details: ['Tandai akunnya sebagai akun kas/bank di Settings › Master COA.'],
    })
  }

  const galat: GalatSimpan[] = []
  const tambahGalat = (kunci: string, errors: readonly string[]) => {
    for (const pesan of errors) galat.push({ kunci, kolom: kolomDariGalat(pesan), pesan, jenis: 'validasi' })
  }
  const diPeriode = (kunci: string, tanggal: string) => {
    if (p.periode && (tanggal < p.periode.mulai || tanggal > p.periode.akhir)) {
      galat.push({
        kunci,
        kolom: 'tanggal',
        pesan: `Tanggal di luar periode ${fmtTanggal(p.periode.mulai)} – ${fmtTanggal(p.periode.akhir)}.`,
        jenis: 'validasi',
      })
    }
  }

  // ── 1. Validasi per baris — aturan yang sama dengan grid (validateCashMutation) ──
  type Baru = { kunci: string; v: CashMutationValue; urutan: number | null; asal: Asal; blok: string | null; saldoDikosongkan: string | null }
  const baru: Baru[] = []
  for (const b of p.baru) {
    const c = validateCashMutation({ ...b, akunKasId: p.akunKasId })
    if (!c.ok) {
      tambahGalat(b.kunci, c.errors)
      continue
    }
    diPeriode(b.kunci, c.value.tanggal)
    if (c.value.akunLawanId === p.akunKasId) {
      galat.push({ kunci: b.kunci, kolom: 'akunLawan', pesan: 'Nama Akun tidak boleh akun kas ini sendiri.', jenis: 'validasi' })
    }
    const urutan = b.urutan === null || b.urutan === undefined ? null : Number(b.urutan)
    if (urutan !== null && (!Number.isInteger(urutan) || urutan < 1)) {
      galat.push({ kunci: b.kunci, pesan: 'Urutan baris tidak valid.', jenis: 'validasi' })
    }
    const asal = ASAL.includes(b.asal as Asal) ? (b.asal as Asal) : 'ketik'
    const saldoDikosongkan = kanonikSaldo(b.saldoDikosongkan)
    if (saldoDikosongkan !== null && c.value.saldo !== null) {
      galat.push({ kunci: b.kunci, kolom: 'saldo', pesan: 'Saldo yang dikosongkan harus kosong.', jenis: 'validasi' })
    }
    baru.push({ kunci: b.kunci, v: c.value, urutan, asal, blok: typeof b.blok === 'string' ? b.blok : null, saldoDikosongkan })
  }

  type Ubah = { id: string; updatedAt: unknown; v: CashMutationValue; saldoDikosongkan: string | null }
  const ubah: Ubah[] = []
  const akunKasLain = new Set<string>()
  for (const u of p.ubah) {
    const akunKasId = typeof u.akunKasId === 'string' && u.akunKasId !== '' ? u.akunKasId : p.akunKasId
    if (akunKasId !== p.akunKasId) akunKasLain.add(akunKasId)
    const c = validateCashMutation({ ...u, akunKasId })
    if (!c.ok) {
      tambahGalat(u.id, c.errors)
      continue
    }
    diPeriode(u.id, c.value.tanggal)
    if (c.value.akunLawanId === akunKasId) {
      galat.push({ kunci: u.id, kolom: 'akunLawan', pesan: 'Nama Akun tidak boleh akun kasnya sendiri.', jenis: 'validasi' })
    }
    const saldoDikosongkan = kanonikSaldo(u.saldoDikosongkan)
    ubah.push({ id: u.id, updatedAt: u.updatedAt, v: c.value, saldoDikosongkan })
  }
  for (const id of akunKasLain) {
    if (!(await loadCashAccount(p.clientId, id))) {
      return tolak(400, 'Akun kas tujuan tidak ditemukan pada klien ini, atau bukan akun kas/bank.')
    }
  }

  // ── 2. Akun lawan milik klien — satu kueri ──
  const akunLawan = [...new Set([...baru, ...ubah].map(x => x.v.akunLawanId).filter((x): x is string => x !== null))]
  if (akunLawan.length > 0) {
    const ada = new Set(
      (
        await db
          .select({ id: masterCoa.id })
          .from(masterCoa)
          .where(and(eq(masterCoa.clientId, p.clientId), inArray(masterCoa.id, akunLawan)))
      ).map(r => r.id)
    )
    for (const x of [...baru.map(b => ({ k: b.kunci, v: b.v })), ...ubah.map(u => ({ k: u.id, v: u.v }))]) {
      if (x.v.akunLawanId && !ada.has(x.v.akunLawanId)) {
        galat.push({ kunci: x.k, kolom: 'akunLawan', pesan: 'Nama Akun tidak ada di Master COA klien ini.', jenis: 'validasi' })
      }
    }
  }

  // ── 3. Baris tersimpan yang diubah/dihapus + alokasinya — kueri massal ──
  const lama =
    idUbahHapus.length === 0
      ? []
      : await db
          .select({
            id: cashMutations.id,
            clientId: cashMutations.clientId,
            akunKasId: cashMutations.akunKasId,
            akunLawanId: cashMutations.akunLawanId,
            tanggal: cashMutations.tanggal,
            keterangan: cashMutations.keterangan,
            debit: cashMutations.debit,
            kredit: cashMutations.kredit,
            saldo: cashMutations.saldo,
            catatan: cashMutations.catatan,
            ref: cashMutations.ref,
            journalId: cashMutations.journalId,
            updatedAt: cashMutations.updatedAt,
          })
          .from(cashMutations)
          .where(inArray(cashMutations.id, idUbahHapus))
  const lamaById = new Map(lama.filter(r => r.clientId === p.clientId).map(r => [r.id, r]))
  const alokasi =
    idUbahHapus.length === 0
      ? []
      : await db
          .select({
            mutationId: cashMutationAllocations.mutationId,
            nominal: cashMutationAllocations.nominal,
            akunHutangId: purchaseInvoices.akunHutangId,
            noInvoice: purchaseInvoices.noInvoice,
          })
          .from(cashMutationAllocations)
          .innerJoin(purchaseInvoices, eq(cashMutationAllocations.invoiceId, purchaseInvoices.id))
          .where(inArray(cashMutationAllocations.mutationId, idUbahHapus))
  const alokasiPer = new Map<string, typeof alokasi>()
  for (const a of alokasi) alokasiPer.set(a.mutationId, [...(alokasiPer.get(a.mutationId) ?? []), a])

  for (const id of idUbahHapus) {
    const r = lamaById.get(id)
    if (!r) galat.push({ kunci: id, pesan: 'Mutasi tidak ditemukan pada klien ini — mungkin sudah dihapus.', jenis: 'tidak-ada' })
    else if (p.periode && r.akunKasId !== p.akunKasId && !p.ubah.some(u => u.id === id && u.akunKasId)) {
      galat.push({ kunci: id, pesan: 'Mutasi ini milik akun kas lain.', jenis: 'validasi' })
    }
  }

  // ── 4. Konkurensi: updatedAt beda → 409 untuk SELURUH batch ──
  const konflik = [...p.ubah, ...p.hapus]
    .filter(x => {
      const r = lamaById.get(x.id)
      return r !== undefined && !samaWaktu(x.updatedAt, r.updatedAt)
    })
    .map(x => x.id)
  if (konflik.length > 0) {
    return tolak(409, `${konflik.length} mutasi sudah diubah orang lain sejak grid ini dimuat.`, {
      konflik,
      details: ['Muat ulang grid — perubahan Anda yang belum tersimpan tetap ada di cadangan draf.'],
    })
  }

  // ── 5. Kunci: jurnal terposting, alokasi, kunci periode (S7 kunciMutasi) ──
  const locks = await loadPeriodLocks(p.clientId)
  const terkunciSampai = latestLock(locks)?.terkunciSampai ?? null
  const infoJurnal = await muatInfoJurnal(lama.map(r => r.journalId).filter((x): x is string => x !== null))
  const kunciLama = (id: string) => {
    const r = lamaById.get(id)!
    const j = r.journalId ? infoJurnal.get(r.journalId) : undefined
    return kunciMutasi({
      jurnalStatus: j?.status ?? null,
      jurnalDibalik: j?.dibalik ?? false,
      jumlahAlokasi: alokasiPer.get(id)?.length ?? 0,
      tanggal: r.tanggal,
      terkunciSampai,
    })
  }
  const tanggalTerkunci = (kunci: string, tanggal: string) => {
    if (isDateLocked(tanggal, locks)) {
      galat.push({ kunci, kolom: 'tanggal', pesan: `Periode terkunci s.d. ${fmtTanggal(terkunciSampai as string)}.`, jenis: 'kunci' })
    }
  }
  for (const b of baru) tanggalTerkunci(b.kunci, b.v.tanggal)
  for (const u of ubah) {
    const r = lamaById.get(u.id)
    if (!r) continue
    const k = kunciLama(u.id)
    if (k.baris) {
      galat.push({ kunci: u.id, pesan: k.baris, jenis: 'kunci' })
      continue
    }
    tanggalTerkunci(u.id, u.v.tanggal)
    const nominalBerubah = u.v.debit !== r.debit || u.v.kredit !== r.kredit || u.v.akunKasId !== r.akunKasId
    if (k.kolom.masuk && nominalBerubah) galat.push({ kunci: u.id, kolom: 'masuk', pesan: k.kolom.masuk, jenis: 'kunci' })
  }
  for (const h of p.hapus) {
    if (!lamaById.has(h.id)) continue
    const k = kunciLama(h.id)
    if (k.baris) galat.push({ kunci: h.id, pesan: k.baris, jenis: 'kunci' })
  }

  if (galat.length > 0) {
    const status = galat.some(g => g.jenis === 'kunci') ? 409 : galat.every(g => g.jenis === 'tidak-ada') ? 404 : 400
    return tolak(status, `${new Set(galat.map(g => g.kunci)).size} baris tidak bisa disimpan.`, { galat })
  }

  // ── 6. Dugaan duplikat (D38: PERINGATAN, bukan penolakan) ──
  const fpBaru = baru.map(b => fingerprintMutasi(b.v))
  const fpUbah = ubah.map(u => fingerprintMutasi(u.v))
  const semuaFp = [...new Set([...fpBaru, ...fpUbah])]
  const fpDb = new Set(
    semuaFp.length === 0
      ? []
      : (
          await db
            .select({ id: cashMutations.id, fingerprint: cashMutations.fingerprint })
            .from(cashMutations)
            .where(and(eq(cashMutations.clientId, p.clientId), eq(cashMutations.akunKasId, p.akunKasId), inArray(cashMutations.fingerprint, semuaFp)))
        )
          .filter(r => !idUbahHapus.includes(r.id))
          .map(r => r.fingerprint)
  )
  const duplikat: Duplikat[] = []
  const terlihat = new Set<string>()
  ;[...baru.map((b, i) => ({ k: b.kunci, fp: fpBaru[i] })), ...ubah.map((u, i) => ({ k: u.id, fp: fpUbah[i] }))].forEach(x => {
    if (fpDb.has(x.fp)) duplikat.push({ kunci: x.k, sumber: 'db' })
    else if (terlihat.has(x.fp)) duplikat.push({ kunci: x.k, sumber: 'batch' })
    terlihat.add(x.fp)
  })

  // ── 7. Rencana jurnal (ringkasan D58 + per mutasi beralokasi) ──
  const idBaru = new Map(baru.map(b => [b.kunci, randomUUID()]))
  const akhir: MutasiAkhir[] = [
    ...baru.map(b => ({ id: idBaru.get(b.kunci) as string, akunKasId: b.v.akunKasId, akunLawanId: b.v.akunLawanId, tanggal: b.v.tanggal, debit: b.v.debit, kredit: b.v.kredit, keterangan: b.v.keterangan, alokasi: [] })),
    ...ubah.map(u => ({
      id: u.id,
      akunKasId: u.v.akunKasId,
      akunLawanId: u.v.akunLawanId,
      tanggal: u.v.tanggal,
      debit: u.v.debit,
      kredit: u.v.kredit,
      keterangan: u.v.keterangan,
      alokasi: (alokasiPer.get(u.id) ?? []).map(a => ({ akunHutangId: a.akunHutangId, nominal: a.nominal, noInvoice: a.noInvoice })),
    })),
  ]
  const awal: MutasiAwal[] = idUbahHapus.map(id => {
    const r = lamaById.get(id)!
    return { id, akunKasId: r.akunKasId, akunLawanId: r.akunLawanId, tanggal: r.tanggal, journalId: r.journalId, jumlahAlokasi: alokasiPer.get(id)?.length ?? 0 }
  })
  const jurnal = await rencanakanJurnalMutasi({ clientId: p.clientId, userId, akhir, awal, dihapus: p.hapus.map(h => h.id) })
  if ('error' in jurnal) {
    const body = (await jurnal.error.json()) as Record<string, unknown>
    return { jenis: 'tolak', status: jurnal.error.status, body }
  }

  // ── 8. Statement — urutannya: impor → hapus → insert → update → jurnal → riwayat ──
  const statements: BatchItem<'pg'>[] = []
  const importPerBlok = new Map<string, string>()
  for (const f of p.berkas) {
    const jumlah = baru.filter(b => b.blok === f.blok && (b.asal === 'berkas' || b.asal === 'pdf')).length
    if (jumlah === 0) continue
    const id = randomUUID()
    importPerBlok.set(f.blok, id)
    statements.push(
      db.insert(cashMutationImports).values({
        id,
        clientId: p.clientId,
        akunKasId: p.akunKasId,
        namaBerkas: String(f.namaBerkas).slice(0, 255) || 'berkas',
        jumlahBaris: jumlah,
        diimporOleh: userId,
      })
    )
  }

  const idHapus = p.hapus.map(h => h.id)
  if (idHapus.length > 0) {
    // Riwayat mutasi ikut mati bersama barisnya (aturan DELETE lama; mutasi
    // bukan pengecualian riwayat abadi). Alokasi ikut lewat FK cascade.
    const purge = purgeAuditEventsMany('cash_mutation', idHapus)
    if (purge) statements.push(purge)
    statements.push(db.delete(cashMutations).where(inArray(cashMutations.id, idHapus)))
  }

  for (let i = 0; i < baru.length; i += BARIS_PER_INSERT) {
    statements.push(
      db.insert(cashMutations).values(
        baru.slice(i, i + BARIS_PER_INSERT).map((b, j) => ({
          id: idBaru.get(b.kunci) as string,
          clientId: p.clientId,
          akunKasId: p.akunKasId,
          tanggal: b.v.tanggal,
          keterangan: b.v.keterangan,
          debit: b.v.debit,
          kredit: b.v.kredit,
          saldo: b.v.saldo,
          catatan: b.v.catatan,
          ref: b.v.ref,
          fingerprint: fpBaru[i + j],
          importId: b.blok ? (importPerBlok.get(b.blok) ?? null) : null,
          akunLawanId: b.v.akunLawanId,
          urutan: b.urutan,
          createdBy: userId,
        }))
      )
    )
  }

  for (let i = 0; i < ubah.length; i += 1_000) {
    const tuples = sql.join(
      ubah.slice(i, i + 1_000).map(
        (u, j) =>
          sql`(${u.id}::uuid, ${u.v.tanggal}::date, ${u.v.akunKasId}::uuid, ${u.v.keterangan}::text, ${u.v.debit}::numeric, ${u.v.kredit}::numeric, ${u.v.saldo}::numeric, ${u.v.akunLawanId}::uuid, ${u.v.catatan}::text, ${u.v.ref}::text, ${fpUbah[i + j]}::text)`
      ),
      sql`, `
    )
    statements.push(
      db.execute(sql`
        update ${cashMutations} as cm
        set tanggal = v.tanggal, akun_kas_id = v.akun_kas_id, keterangan = v.keterangan,
            debit = v.debit, kredit = v.kredit, saldo = v.saldo, akun_lawan_id = v.akun_lawan_id,
            catatan = v.catatan, ref = v.ref, fingerprint = v.fingerprint, updated_at = now()
        from (values ${tuples}) as v(id, tanggal, akun_kas_id, keterangan, debit, kredit, saldo, akun_lawan_id, catatan, ref, fingerprint)
        where cm.id = v.id
      `)
    )
  }

  statements.push(...jurnal.statements)

  // Riwayat (D48): baris ketik/tempel → 'created' per baris; baris dari berkas
  // → TANPA event per baris (cukup cash_mutation_imports, N4); ubah → 'updated'
  // dengan nilai sebelum/sesudah; saldo yang dikosongkan → 'saldo_dikosongkan'
  // per baris, JUGA untuk baris dari berkas (D50).
  type Ev = typeof auditEvents.$inferInsert
  const ev: Ev[] = []
  const base = { clientId: p.clientId, entityType: 'cash_mutation' as const, userId }
  for (const b of baru) {
    const id = idBaru.get(b.kunci) as string
    if (b.asal !== 'berkas' && b.asal !== 'pdf') ev.push({ ...base, entityId: id, event: 'created' })
    if (b.saldoDikosongkan !== null) ev.push({ ...base, entityId: id, event: 'saldo_dikosongkan', nilaiSebelum: { saldo: b.saldoDikosongkan } })
  }
  for (const u of ubah) {
    const r = lamaById.get(u.id)!
    ev.push({
      ...base,
      entityId: u.id,
      event: 'updated',
      nilaiSebelum: { tanggal: r.tanggal, keterangan: r.keterangan, debit: r.debit, kredit: r.kredit, saldo: r.saldo, catatan: r.catatan, ref: r.ref, akunKasId: r.akunKasId, akunLawanId: r.akunLawanId },
      nilaiSesudah: { tanggal: u.v.tanggal, keterangan: u.v.keterangan, debit: u.v.debit, kredit: u.v.kredit, saldo: u.v.saldo, catatan: u.v.catatan, ref: u.v.ref, akunKasId: u.v.akunKasId, akunLawanId: u.v.akunLawanId },
    })
    if (u.saldoDikosongkan !== null && u.v.saldo === null && r.saldo !== null) {
      ev.push({ ...base, entityId: u.id, event: 'saldo_dikosongkan', nilaiSebelum: { saldo: r.saldo } })
    }
  }
  for (let i = 0; i < ev.length; i += 5_000) statements.push(db.insert(auditEvents).values(ev.slice(i, i + 5_000)))

  const ringkasan: Ringkasan = {
    baru: baru.length,
    ubah: ubah.length,
    hapus: idHapus.length,
    jurnalRingkasan: jurnal.jurnalRingkasanDisusun,
    jurnalDihapus: jurnal.jurnalDihapus,
    statement: statements.length,
  }
  if (p.dryRun) return { jenis: 'dryRun', body: { dryRun: true, ringkasan, duplikat } }
  return { jenis: 'siap', statements, idBaru, body: { ringkasan, duplikat } }
}

/**
 * Jawaban untuk pembungkus SATU baris (form HP): galat per baris diratakan jadi
 * bentuk lama `{ error, details }` yang dibaca formulirnya — status tetap dari
 * perencana (400 validasi, 404 tidak ada, 409 kunci/konflik).
 */
export function jawabanTunggal(h: Extract<HasilSimpan, { jenis: 'tolak' }>): { status: number; body: Record<string, unknown> } {
  const galat = (h.body.galat as GalatSimpan[] | undefined) ?? []
  if (galat.length === 0) return { status: h.status, body: h.body }
  return { status: h.status, body: { error: galat[0].pesan, details: galat.map(g => g.pesan) } }
}
