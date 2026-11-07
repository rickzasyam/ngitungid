// Pindah Buku — transfer internal antar akun kas klien (MP §5.G S5, D59).
// MURNI (tanpa I/O, tanpa React), uang dalam SEN BULAT (P1).
//
// ══ AKUN PINDAH BUKU = PERANTARA, SALDONYA HARUS NOL ══════════════════════
// Transfer dari rekening A ke rekening B dicatat DUA mutasi: keluar di A dan
// masuk di B, keduanya berakun lawan "Pindah Buku" (setelan per klien,
// `client_accounting_settings.akun_pindah_buku_id`). Kalau keduanya tercatat,
// Σ(masuk − keluar) mutasi berakun-lawan Pindah Buku = 0. Saldo ≠ 0 di akhir
// periode berarti ada sisi transfer yang belum dicatat — atau transfernya
// memang melintasi akhir periode, yang wajar: karena itu PERINGATAN, bukan
// galat.
//
// ══ TURUNAN, TIDAK DISIMPAN (P3/P4) ══════════════════════════════════════
// Saldo dan pasangan dihitung dari mutasi saat diminta, termasuk yang belum
// diposting. Pasangan TIDAK disimpan: hasilnya hanya USULAN akun lawan Pindah
// Buku di kedua baris, yang masuk sel lewat "Terapkan usulan" (D57).
//
// ══ HANYA PASANGAN TUNGGAL YANG DIUSULKAN ════════════════════════════════
// Keluar di A ↔ masuk di B (akun kas BERBEDA), nominal SAMA PERSIS, selisih
// tanggal ≤ 3 hari. Satu keluar dengan dua kandidat masuk (atau sebaliknya)
// tidak dipasangkan otomatis — menebak salah satunya memindahkan uang di buku
// ke pasangan yang keliru. Keduanya tampil sebagai kandidat.

import { hariAntara } from '@/lib/contracts'

export const TOLERANSI_HARI_PINDAH_BUKU = 3

export type MutasiPindahBuku = {
  id: string
  akunKasId: string
  /** 'YYYY-MM-DD'. */
  tanggal: string
  /** SEN. Tepat satu dari masuk/keluar > 0 (D36). */
  masuk: number
  keluar: number
}

/**
 * Saldo akun Pindah Buku s.d. `sampai` (inklusif), dalam SEN: Σ(masuk − keluar)
 * mutasi berakun-lawan Pindah Buku di SELURUH akun kas klien.
 */
export function saldoPindahBuku(
  mutasi: readonly (MutasiPindahBuku & { akunLawanId: string | null })[],
  akunPindahBukuId: string,
  sampai: string
): number {
  let saldo = 0
  for (const m of mutasi) {
    if (m.akunLawanId !== akunPindahBukuId) continue
    if (m.tanggal > sampai) continue
    saldo += m.masuk - m.keluar
  }
  return saldo
}

export type Pasangan = {
  keluarId: string
  masukId: string
  /** |selisih hari| antara keduanya. */
  selisihHari: number
}

export type KandidatGanda = {
  id: string
  arah: 'keluar' | 'masuk'
  /** Id mutasi seberang yang sama-sama cocok. */
  kandidat: string[]
}

export type HasilPasangan = {
  /** Pasangan TUNGGAL — keduanya hanya cocok satu sama lain. */
  pasangan: Pasangan[]
  /** Punya lebih dari satu kemungkinan (atau seberangnya punya) — tidak diusulkan. */
  ganda: KandidatGanda[]
  /** Tidak punya seberang sama sekali. */
  tanpaPasangan: { id: string; arah: 'keluar' | 'masuk' }[]
}

/** Pisahkan mutasi ke daftar keluar & masuk. */
export function pisahArah<T extends MutasiPindahBuku>(mutasi: readonly T[]): { keluar: T[]; masuk: T[] } {
  const keluar: T[] = []
  const masuk: T[] = []
  for (const m of mutasi) {
    if (m.keluar > 0) keluar.push(m)
    else if (m.masuk > 0) masuk.push(m)
  }
  return { keluar, masuk }
}

/**
 * Cari pasangan transfer keluar(A) ↔ masuk(B).
 *
 * Masuk dikelompokkan per nominal lebih dulu, jadi pencocokan tidak memindai
 * seluruh daftar untuk setiap baris keluar.
 */
export function cariPasangan(
  keluar: readonly MutasiPindahBuku[],
  masuk: readonly MutasiPindahBuku[],
  toleransiHari: number = TOLERANSI_HARI_PINDAH_BUKU
): HasilPasangan {
  const masukPerNominal = new Map<number, MutasiPindahBuku[]>()
  for (const m of masuk) {
    if (m.masuk <= 0) continue
    masukPerNominal.set(m.masuk, [...(masukPerNominal.get(m.masuk) ?? []), m])
  }

  const kandidatKeluar = new Map<string, string[]>()
  const kandidatMasuk = new Map<string, string[]>()
  const selisih = new Map<string, number>()

  for (const k of keluar) {
    if (k.keluar <= 0) continue
    const cocok: string[] = []
    for (const m of masukPerNominal.get(k.keluar) ?? []) {
      if (m.akunKasId === k.akunKasId) continue
      const hari = Math.abs(hariAntara(k.tanggal, m.tanggal))
      if (hari > toleransiHari) continue
      cocok.push(m.id)
      kandidatMasuk.set(m.id, [...(kandidatMasuk.get(m.id) ?? []), k.id])
      selisih.set(`${k.id} ${m.id}`, hari)
    }
    kandidatKeluar.set(k.id, cocok)
  }

  const pasangan: Pasangan[] = []
  const ganda: KandidatGanda[] = []
  const tanpaPasangan: HasilPasangan['tanpaPasangan'] = []

  for (const k of keluar) {
    if (k.keluar <= 0) continue
    const c = kandidatKeluar.get(k.id) ?? []
    if (c.length === 0) {
      tanpaPasangan.push({ id: k.id, arah: 'keluar' })
      continue
    }
    const balik = kandidatMasuk.get(c[0]) ?? []
    if (c.length === 1 && balik.length === 1) {
      pasangan.push({ keluarId: k.id, masukId: c[0], selisihHari: selisih.get(`${k.id} ${c[0]}`) ?? 0 })
    } else {
      ganda.push({ id: k.id, arah: 'keluar', kandidat: c })
    }
  }
  for (const m of masuk) {
    if (m.masuk <= 0) continue
    const c = kandidatMasuk.get(m.id) ?? []
    if (c.length === 0) {
      tanpaPasangan.push({ id: m.id, arah: 'masuk' })
      continue
    }
    const balik = kandidatKeluar.get(c[0]) ?? []
    if (!(c.length === 1 && balik.length === 1)) ganda.push({ id: m.id, arah: 'masuk', kandidat: c })
  }

  return { pasangan, ganda, tanpaPasangan }
}
