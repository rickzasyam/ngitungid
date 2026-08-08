// Aturan kontrak. MURNI (tanpa I/O, tanpa React) — pola sama dengan
// lib/layanan.ts & lib/api/preferences.ts.
//
// ══ TANGGAL ADALAH STRING, DARI UJUNG KE UJUNG ═════════════════════════════
// tanggal_mulai / tanggal_akhir bertipe `date` di Postgres dan sampai ke sini
// sebagai 'YYYY-MM-DD'. SELURUH modul ini memperlakukannya sebagai string:
// tidak ada `new Date()`, tidak ada `Intl`, tidak ada `toISOString()`.
//
// Itu bukan kehati-hatian berlebihan. Sesi terdahulu mengirim tanggal periode
// lewat toISOString() di WIB dan melempar Januari ke Desember — satu laporan
// pindah tahun. Aturannya sekarang sama persis untuk kontrak.
//
// Yang membuat ini mudah: 'YYYY-MM-DD' URUT SECARA LEKSIKOGRAFIS. '2026-01-31'
// < '2026-02-01' sebagai perbandingan string biasa, tanpa objek Date sama
// sekali. Jadi seluruh logika rentang di bawah cuma `<=` antar string.

export const CONTRACT_JENIS = ['reguler', 'project'] as const
export type ContractJenis = (typeof CONTRACT_JENIS)[number]

/** Status TIDAK disimpan di DB — selalu diturunkan dari rentang tanggal. */
export type ContractStatus = 'akan_datang' | 'aktif' | 'berakhir'

export const STATUS_LABEL: Record<ContractStatus, string> = {
  akan_datang: 'Akan Datang',
  aktif: 'Aktif',
  berakhir: 'Berakhir',
}

/** 25MB, sama dengan POST /api/upload. */
export const MAX_DOKUMEN_BYTES = 25 * 1024 * 1024

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** Format 'YYYY-MM-DD' DAN tanggalnya benar-benar ada (menolak 2026-02-31). */
export function isValidYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  // Hari terakhir tiap bulan, kabisat dihitung manual — TANPA objek Date.
  const kabisat = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const hariMax = [31, kabisat ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
  return d <= hariMax
}

/**
 * Status kontrak pada tanggal `hariIni` (juga 'YYYY-MM-DD').
 * Rentangnya INKLUSIF di kedua ujung: kontrak yang berakhir hari ini masih
 * aktif hari ini.
 */
export function contractStatus(
  tanggalMulai: string,
  tanggalAkhir: string,
  hariIni: string
): ContractStatus {
  if (hariIni < tanggalMulai) return 'akan_datang'
  if (hariIni > tanggalAkhir) return 'berakhir'
  return 'aktif'
}

/** Hari tersisa sampai berakhir (0 kalau sudah lewat). Dihitung dari komponen
 *  tanggal, bukan selisih objek Date — lihat catatan di kepala file. */
export function sisaHari(tanggalAkhir: string, hariIni: string): number {
  if (hariIni > tanggalAkhir) return 0
  return hariAntara(hariIni, tanggalAkhir)
}

/** Jumlah hari antara dua tanggal 'YYYY-MM-DD' (b - a). Memakai hitungan hari
 *  Julian sederhana supaya tidak perlu objek Date maupun zona waktu. */
export function hariAntara(a: string, b: string): number {
  return julian(b) - julian(a)
}

function julian(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  // Algoritma hari-berurut Fliegel–Van Flandern; murni aritmetika integer.
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
    - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
}

// ── Validasi input tulis ─────────────────────────────────────
export const NO_KONTRAK_MIN = 1
export const NO_KONTRAK_MAX = 80
export const TANGGAL_PENAGIHAN_MIN = 1
export const TANGGAL_PENAGIHAN_MAX = 31

export interface ContractInput {
  noKontrak?: unknown
  jenis?: unknown
  tanggalMulai?: unknown
  tanggalAkhir?: unknown
  tanggalPenagihan?: unknown
  nominal?: unknown
  layananIds?: unknown
}

export type ContractCheck =
  | {
      ok: true
      noKontrak: string
      jenis: ContractJenis
      tanggalMulai: string
      tanggalAkhir: string
      tanggalPenagihan: number
      /** STRING, siap dikirim ke kolom numeric — tidak pernah jadi float. */
      nominal: string
      layananIds: string[]
    }
  | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalisasi nominal ke string desimal 2 angka di belakang koma.
 * Menerima number ATAU string; menolak nilai negatif, NaN, dan yang bukan angka.
 * Hasilnya STRING supaya nilainya masuk ke kolom numeric tanpa mampir ke float.
 */
export function normalizeNominal(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null
    return v.toFixed(2)
  }
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '' || !/^\d+(\.\d{1,2})?$/.test(t)) return null
    const [int, frac = ''] = t.split('.')
    return `${int}.${(frac + '00').slice(0, 2)}`
  }
  return null
}

export function validateContract(input: ContractInput): ContractCheck {
  if (typeof input.noKontrak !== 'string' || input.noKontrak.trim().length < NO_KONTRAK_MIN) {
    return { ok: false, error: 'Nomor kontrak wajib diisi.' }
  }
  const noKontrak = input.noKontrak.trim()
  if (noKontrak.length > NO_KONTRAK_MAX) {
    return { ok: false, error: `Nomor kontrak maksimal ${NO_KONTRAK_MAX} karakter.` }
  }

  if (typeof input.jenis !== 'string' || !(CONTRACT_JENIS as readonly string[]).includes(input.jenis)) {
    return { ok: false, error: `Jenis kontrak harus salah satu dari: ${CONTRACT_JENIS.join(', ')}.` }
  }
  const jenis = input.jenis as ContractJenis

  if (!isValidYmd(input.tanggalMulai)) {
    return { ok: false, error: 'Tanggal mulai tidak valid (format YYYY-MM-DD).' }
  }
  if (!isValidYmd(input.tanggalAkhir)) {
    return { ok: false, error: 'Tanggal akhir tidak valid (format YYYY-MM-DD).' }
  }
  // Perbandingan STRING — 'YYYY-MM-DD' urut leksikografis, tidak butuh Date.
  if (input.tanggalAkhir < input.tanggalMulai) {
    return { ok: false, error: 'Tanggal akhir tidak boleh sebelum tanggal mulai.' }
  }

  const tp = input.tanggalPenagihan
  if (typeof tp !== 'number' || !Number.isInteger(tp) || tp < TANGGAL_PENAGIHAN_MIN || tp > TANGGAL_PENAGIHAN_MAX) {
    return {
      ok: false,
      error: `Tanggal penagihan harus bilangan bulat ${TANGGAL_PENAGIHAN_MIN}-${TANGGAL_PENAGIHAN_MAX}.`,
    }
  }

  const nominal = normalizeNominal(input.nominal)
  if (nominal === null) return { ok: false, error: 'Nominal harus angka tidak negatif.' }

  let layananIds: string[] = []
  if (input.layananIds !== undefined) {
    if (!Array.isArray(input.layananIds)) return { ok: false, error: 'Layanan harus berupa array id.' }
    for (const id of input.layananIds) {
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return { ok: false, error: 'Ada id layanan yang tidak valid.' }
      }
    }
    // Duplikat dibuang: primary key (contract_id, layanan_id) akan menolaknya,
    // dan menolak seluruh request hanya karena UI mengirim ganda itu galak.
    layananIds = [...new Set(input.layananIds as string[])]
  }

  return { ok: true, noKontrak, jenis, tanggalMulai: input.tanggalMulai, tanggalAkhir: input.tanggalAkhir, tanggalPenagihan: tp, nominal, layananIds }
}
