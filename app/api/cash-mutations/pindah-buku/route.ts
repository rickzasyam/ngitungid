import { NextResponse } from 'next/server'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cashMutationAllocations, cashMutations, masterCoa } from '@/lib/db/schema'
import { requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { isValidYmd, tambahHari } from '@/lib/contracts'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
import { loadAccountingSettings } from '@/lib/api/accounting-settings'
import { akunPindahBuku } from '@/lib/accounting-settings'
import {
  cariPasangan,
  pisahArah,
  saldoPindahBuku,
  TOLERANSI_HARI_PINDAH_BUKU,
  type MutasiPindahBuku,
} from '@/lib/pindah-buku'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type BarisPB = MutasiPindahBuku & {
  keterangan: string | null
  akunKasKode: string
  akunKasNama: string
  akunLawanId: string | null
}

const keBaris = (r: {
  id: string
  akunKasId: string
  akunKasKode: string
  akunKasNama: string
  tanggal: string
  keterangan: string | null
  debit: string
  kredit: string
  akunLawanId: string | null
}): BarisPB => ({
  id: r.id,
  akunKasId: r.akunKasId,
  akunKasKode: r.akunKasKode,
  akunKasNama: r.akunKasNama,
  tanggal: r.tanggal,
  keterangan: r.keterangan,
  akunLawanId: r.akunLawanId,
  masuk: toMinorUnits(r.debit) ?? 0,
  keluar: toMinorUnits(r.kredit) ?? 0,
})

const tampil = (b: BarisPB) => ({
  id: b.id,
  tanggal: b.tanggal,
  akunKasId: b.akunKasId,
  akunKasKode: b.akunKasKode,
  akunKasNama: b.akunKasNama,
  keterangan: b.keterangan,
  masuk: fromMinorUnits(b.masuk),
  keluar: fromMinorUnits(b.keluar),
})

// GET /api/cash-mutations/pindah-buku?clientId&periodStart&periodEnd (D59, S5)
//
// Semua TURUNAN dari mutasi, dihitung saat diminta (P3/P4) — termasuk yang
// belum diposting:
//   - saldo  : Σ(masuk − keluar) mutasi berakun-lawan Pindah Buku, seluruh
//              akun kas klien, s.d. akhir periode. ≠ 0 → PERINGATAN.
//   - belumBerpasangan : mutasi Pindah Buku yang tidak punya seberang
//              (penjelas saldo ≠ 0). Seberang yang jatuh sesudah akhir periode
//              tetap dihitung berpasangan, ditandai lintas periode — wajar.
//   - usulan : pasangan TUNGGAL di antara mutasi yang BELUM berakun lawan dan
//              belum dialokasi — usulan akun lawan Pindah Buku untuk kedua
//              barisnya, masuk sel lewat "Terapkan usulan". Tidak disimpan.
//
// requireInternal: finance boleh melihat panelnya, seperti seluruh /mutasi-kas.
export async function GET(req: Request) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const url = new URL(req.url)
  const clientId = url.searchParams.get('clientId') ?? ''
  const periodStart = url.searchParams.get('periodStart') ?? ''
  const periodEnd = url.searchParams.get('periodEnd') ?? ''
  if (!UUID_RE.test(clientId)) return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  if (!isValidYmd(periodStart) || !isValidYmd(periodEnd) || periodEnd < periodStart) {
    return NextResponse.json({ error: 'Periode tidak valid (format YYYY-MM-DD).' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const setelan = await loadAccountingSettings(clientId)
  const akunId = akunPindahBuku(setelan)
  if (akunId === null) {
    return NextResponse.json({ akunPindahBuku: null, saldo: '0.00', belumBerpasangan: [], lintasPeriode: [], usulan: [], ganda: [] })
  }

  const [akun] = await db
    .select({ id: masterCoa.id, kode: masterCoa.kode, nama: masterCoa.nama })
    .from(masterCoa)
    .where(and(eq(masterCoa.id, akunId), eq(masterCoa.clientId, clientId)))
    .limit(1)

  const kolom = {
    id: cashMutations.id,
    akunKasId: cashMutations.akunKasId,
    akunKasKode: masterCoa.kode,
    akunKasNama: masterCoa.nama,
    tanggal: cashMutations.tanggal,
    keterangan: cashMutations.keterangan,
    debit: cashMutations.debit,
    kredit: cashMutations.kredit,
    akunLawanId: cashMutations.akunLawanId,
  }
  const batasAkhir = tambahHari(periodEnd, TOLERANSI_HARI_PINDAH_BUKU)
  const batasAwal = tambahHari(periodStart, -TOLERANSI_HARI_PINDAH_BUKU)

  // 1) Mutasi berakun-lawan Pindah Buku sampai akhir periode + toleransi —
  //    sesudah akhir periode hanya untuk mengenali seberang yang lintas periode.
  const pb = (
    await db
      .select(kolom)
      .from(cashMutations)
      .innerJoin(masterCoa, eq(cashMutations.akunKasId, masterCoa.id))
      .where(
        and(
          eq(cashMutations.clientId, clientId),
          eq(cashMutations.akunLawanId, akunId),
          sql`${cashMutations.tanggal} <= ${batasAkhir}`
        )
      )
  ).map(keBaris)

  const saldo = saldoPindahBuku(pb, akunId, periodEnd)
  const pbArah = pisahArah(pb)
  const pbPasangan = cariPasangan(pbArah.keluar, pbArah.masuk)
  const byId = new Map(pb.map(b => [b.id, b]))
  const belumBerpasangan = pbPasangan.tanpaPasangan
    .map(t => byId.get(t.id)!)
    .filter(b => b.tanggal <= periodEnd)
    .map(tampil)
  const lintasPeriode = pbPasangan.pasangan
    .filter(p => {
      const k = byId.get(p.keluarId)!
      const m = byId.get(p.masukId)!
      return (k.tanggal <= periodEnd) !== (m.tanggal <= periodEnd)
    })
    .map(p => ({ keluar: tampil(byId.get(p.keluarId)!), masuk: tampil(byId.get(p.masukId)!), selisihHari: p.selisihHari }))

  // 2) Usulan: mutasi TANPA akun lawan dan TANPA alokasi di sekitar periode.
  const calon = (
    await db
      .select(kolom)
      .from(cashMutations)
      .innerJoin(masterCoa, eq(cashMutations.akunKasId, masterCoa.id))
      .leftJoin(cashMutationAllocations, eq(cashMutationAllocations.mutationId, cashMutations.id))
      .where(
        and(
          eq(cashMutations.clientId, clientId),
          isNull(cashMutations.akunLawanId),
          isNull(cashMutationAllocations.id),
          sql`${cashMutations.tanggal} >= ${batasAwal}`,
          sql`${cashMutations.tanggal} <= ${batasAkhir}`
        )
      )
  ).map(keBaris)

  const calonArah = pisahArah(calon)
  const calonPasangan = cariPasangan(calonArah.keluar, calonArah.masuk)
  const calonById = new Map(calon.map(b => [b.id, b]))
  const dalam = (b: BarisPB) => b.tanggal >= periodStart && b.tanggal <= periodEnd
  const usulan = calonPasangan.pasangan
    .filter(p => dalam(calonById.get(p.keluarId)!) || dalam(calonById.get(p.masukId)!))
    .map(p => ({
      keluar: tampil(calonById.get(p.keluarId)!),
      masuk: tampil(calonById.get(p.masukId)!),
      selisihHari: p.selisihHari,
    }))
  const ganda = calonPasangan.ganda.filter(x => dalam(calonById.get(x.id)!))

  return NextResponse.json({
    akunPindahBuku: akun ?? null,
    saldo: fromMinorUnits(saldo),
    belumBerpasangan,
    lintasPeriode,
    usulan,
    ganda,
  })
}
