import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cashMutations } from '@/lib/db/schema'
import { kunciMutasi, type KunciBaris } from '@/lib/cash-mutation'
import { latestLock } from '@/lib/period-lock'
import { loadPeriodLocks } from '@/lib/api/period-lock'
import { listCashMutations } from '@/lib/api/cash-mutation-queries'
import { muatInfoJurnal } from '@/lib/api/cash-mutation-journal'

// Muatan grid `/mutasi-kas` (MP §5.G S8): satu akun kas, satu rentang, URUTAN
// BAKU naik — beserta semua yang dibutuhkan grid untuk menyunting tanpa
// menghitung sendiri.
//
// ══ GRID TIDAK MEMUTUSKAN KUNCI, STATUS, ATAU SISA ═══════════════════════
// Kunci per baris datang dari `kunciMutasi` — fungsi yang SAMA dengan yang
// dipakai perencana Simpan (S7), jadi sel yang tampil terbuka tidak mungkin
// ditolak server karena aturan lain. Status & sisa diturunkan
// `listCashMutations` (P3). Halaman hanya menampilkan.
//
// ══ JANGKAR SALDO DIHITUNG SELURUHNYA DI SQL (D61) ═══════════════════════
// Jangkar = saldo tercetak baris bersaldo TERAKHIR sebelum rentang + Σ(masuk −
// keluar) baris tersimpan sesudahnya yang masih sebelum rentang — persis
// rumus rantai S3. Seluruhnya satu kueri: membandingkan posisi baris lewat JS
// akan memotong `created_at` (mikrodetik di Postgres, milidetik di Date) dan
// salah menempatkan baris sehari yang disisipkan bersamaan. Penjumlahan dalam
// `numeric`, tidak pernah float (P1).

export type SaldoJangkar = {
  /** Saldo pembuka rentang menurut dokumen (teks numeric, mis. "1250000.00"). */
  saldo: string
  /** Tanggal baris bersaldo terakhir yang menjadi pangkal. */
  dariTanggal: string
  /** Saldo tercetak baris pangkal itu. */
  saldoTercetak: string
  /** Jumlah baris tanpa saldo sesudah pangkal yang ikut dijumlahkan. */
  barisSesudah: number
}

/** `null` = tidak ada baris bersaldo sebelum rentang — grid memakai isian manual. */
export async function muatSaldoJangkar(opts: {
  clientId: string
  akunKasId: string
  sebelum: string
}): Promise<SaldoJangkar | null> {
  const { clientId, akunKasId, sebelum } = opts
  const hasil = await db.execute(sql`
    with pangkal as (
      select id, tanggal, created_at, coalesce(urutan, 2147483647) as u, saldo
      from ${cashMutations}
      where client_id = ${clientId} and akun_kas_id = ${akunKasId}
        and tanggal < ${sebelum} and saldo is not null
      order by tanggal desc, created_at desc, coalesce(urutan, 2147483647) desc, id desc
      limit 1
    )
    select p.tanggal::text as "dariTanggal",
           p.saldo::numeric(18,2)::text as "saldoTercetak",
           (p.saldo + coalesce(sum(m.debit - m.kredit), 0))::numeric(18,2)::text as "saldo",
           count(m.id)::int as "barisSesudah"
    from pangkal p
    left join ${cashMutations} m
      on m.client_id = ${clientId} and m.akun_kas_id = ${akunKasId} and m.tanggal < ${sebelum}
     and (m.tanggal, m.created_at, coalesce(m.urutan, 2147483647), m.id) > (p.tanggal, p.created_at, p.u, p.id)
    group by p.tanggal, p.saldo
  `)
  const r = (hasil.rows as Record<string, unknown>[])[0]
  if (!r) return null
  return {
    saldo: String(r.saldo),
    dariTanggal: String(r.dariTanggal),
    saldoTercetak: String(r.saldoTercetak),
    barisSesudah: Number(r.barisSesudah),
  }
}

/**
 * Seluruh baris satu akun kas di rentang, urutan baku, plus konteks grid.
 * Tidak dipaginasi: satu Simpan = satu akun-bulan (D52), dan rantai saldo
 * hanya bisa diperiksa atas deret yang utuh.
 */
export async function muatGridMutasi(opts: {
  clientId: string
  akunKasId: string
  periodStart: string
  periodEnd: string
}) {
  const [baris, locks, saldoJangkar] = await Promise.all([
    listCashMutations({ ...opts, urut: 'buku' }),
    loadPeriodLocks(opts.clientId),
    muatSaldoJangkar({ clientId: opts.clientId, akunKasId: opts.akunKasId, sebelum: opts.periodStart }),
  ])
  const terkunciSampai = latestLock(locks)?.terkunciSampai ?? null
  const info = await muatInfoJurnal(baris.map(b => b.journalId).filter((x): x is string => x !== null))

  const mutations = baris.map(b => {
    const j = b.journalId ? info.get(b.journalId) : undefined
    const jurnalStatus = j?.status ?? null
    const jurnalDibalik = j?.dibalik ?? false
    const kunci: KunciBaris = kunciMutasi({
      jurnalStatus,
      jurnalDibalik,
      jumlahAlokasi: b.alokasiCount,
      tanggal: b.tanggal,
      terkunciSampai,
    })
    // Bentuk RAMPING: hanya yang dibaca grid. Akun kas sama untuk semua baris
    // (grid tahu), nama akun lawan ada di daftar COA grid, fingerprint/impor/
    // pembuat tidak ditampilkan — 10.000 baris × ±300 byte yang dibuang.
    return {
      id: b.id,
      tanggal: b.tanggal,
      keterangan: b.keterangan,
      catatan: b.catatan,
      ref: b.ref,
      urutan: b.urutan,
      debit: b.debit,
      kredit: b.kredit,
      saldo: b.saldo,
      akunLawanId: b.akunLawanId,
      akunLawanKode: b.akunLawanKode,
      journalId: b.journalId,
      updatedAt: b.updatedAt.toISOString(),
      teralokasi: b.teralokasi,
      sisa: b.sisa,
      status: b.status,
      jurnalStatus,
      jurnalDibalik,
      jumlahAlokasi: b.alokasiCount,
      kunci,
    }
  })
  return { mutations, saldoJangkar, terkunciSampai }
}

export type BarisGridMutasi = Awaited<ReturnType<typeof muatGridMutasi>>['mutations'][number]
