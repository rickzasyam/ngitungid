// Visibilitas metrik Analytics per-klien. MURNI (tanpa I/O, tanpa React) supaya
// dipakai bareng oleh tab Settings (yang menulis) dan halaman Analytics (yang
// membaca), dan bisa diuji tanpa DB — pola sama dengan lib/settings-tabs.ts.
//
// Rantai lengkapnya: toggle di Settings → PUT /api/clients/[id]/metrics →
// tabel client_metric_visibility → GET yang sama dibaca /analytics saat render.
// Sampai 2026-08-05 mata rantai TERAKHIR tidak ada: tabelnya ditulis rajin tapi
// tidak pernah dibaca siapa pun, jadi mematikan metrik tidak berefek apa-apa.

import { isStaff, type Role } from '@/lib/roles'
import type { RatioValues } from '@/lib/financial-health'

/**
 * Id metrik sebagaimana DISIMPAN di client_metric_visibility.metric_id.
 * Ini id yang paling "publik" dari ketiganya — sudah ada barisnya di DB
 * produksi, jadi ejaannya TIDAK boleh diubah tanpa migrasi data.
 *
 * `dar` (Debt-to-Assets) sengaja TIDAK ada: DAR = DER / (1 + DER), jadi
 * secara aljabar sudah terkandung di Debt-to-Equity yang tampil di section
 * Leverage yang sama. Permenkop UKM No.06/2006 juga hanya menetapkan ambang
 * untuk DER, bukan DAR — kartu DAR terpaksa memakai ambang karangan atau tone
 * netral permanen. Sejalan dengan DIMENSIONS.leverage di lib/financial-health.ts
 * yang memang hanya berisi ['der'].
 */
export type MetricId =
  | 'cr' | 'qr' | 'cashr' | 'wc' | 'ccc'
  | 'roe' | 'roa' | 'gpm' | 'npm' | 'opm'
  | 'der'
  | 'dso' | 'dio' | 'dpo' | 'invturn' | 'assetturn'

/** Urutan mengikuti tampilan di Settings (Likuiditas → Profitabilitas →
 *  Leverage → Efisiensi). Panjangnya = penyebut counter "x/16". */
export const METRIC_IDS: MetricId[] = [
  'cr', 'qr', 'cashr', 'wc', 'ccc',
  'roe', 'roa', 'gpm', 'npm', 'opm',
  'der',
  'dso', 'dio', 'dpo', 'invturn', 'assetturn',
]

/**
 * SATU tempat untuk menerjemahkan id metrik ke dua namespace lain yang ejaannya
 * berbeda. Peta ini eksplisit dan ditulis tangan DENGAN SENGAJA — tidak boleh
 * diganti pencocokan string longgar (lowercase, strip, fuzzy). Tiga id di bawah
 * ini berbeda bukan karena gaya penulisan melainkan karena memang tiga sistem
 * penamaan yang tumbuh terpisah, dan pencocokan otomatis akan diam-diam gagal
 * tepat di ketiganya:
 *
 *   id tersimpan  →  key payload ratios  →  key MetricDrawer
 *   cashr             cashR                  cash        ← ketiganya beda
 *   invturn           invTurn                invturn
 *   assetturn         assetTurn              assetturn
 *
 * `ratioKey` diketik `keyof RatioValues` supaya salah ketik ketahuan tsc, bukan
 * baru ketahuan sebagai kartu kosong di halaman.
 */
export const METRIC_KEYS: Record<MetricId, { ratioKey: keyof RatioValues; drawerKey: string }> = {
  cr:        { ratioKey: 'cr',        drawerKey: 'cr' },
  qr:        { ratioKey: 'qr',        drawerKey: 'qr' },
  cashr:     { ratioKey: 'cashR',     drawerKey: 'cash' },
  wc:        { ratioKey: 'wc',        drawerKey: 'wc' },
  ccc:       { ratioKey: 'ccc',       drawerKey: 'ccc' },
  roe:       { ratioKey: 'roe',       drawerKey: 'roe' },
  roa:       { ratioKey: 'roa',       drawerKey: 'roa' },
  gpm:       { ratioKey: 'gpm',       drawerKey: 'gpm' },
  npm:       { ratioKey: 'npm',       drawerKey: 'npm' },
  opm:       { ratioKey: 'opm',       drawerKey: 'opm' },
  der:       { ratioKey: 'der',       drawerKey: 'der' },
  dso:       { ratioKey: 'dso',       drawerKey: 'dso' },
  dio:       { ratioKey: 'dio',       drawerKey: 'dio' },
  dpo:       { ratioKey: 'dpo',       drawerKey: 'dpo' },
  invturn:   { ratioKey: 'invTurn',   drawerKey: 'invturn' },
  assetturn: { ratioKey: 'assetTurn', drawerKey: 'assetturn' },
}

/** Peta visibilitas seperti yang dikirim/diterima API. Sengaja Partial: backend
 *  hanya menyimpan metrik yang PERNAH di-toggle, sisanya jatuh ke default. */
export type VisibilityMap = Partial<Record<MetricId, boolean>>

/**
 * Default untuk klien yang belum punya baris tersimpan: SEMUA tampil.
 *
 * Sebelumnya `dpo` dan `dar` default mati "sebagai contoh mixed state" —
 * peninggalan era mock. Efek nyatanya: setiap klien baru kehilangan dua metrik
 * tanpa ada yang pernah memutuskan begitu. Klien baru sekarang melihat analitik
 * lengkap sampai staf sengaja mematikan sesuatu.
 */
export function defaultMetricVisibility(): Record<MetricId, boolean> {
  return Object.fromEntries(METRIC_IDS.map(id => [id, true])) as Record<MetricId, boolean>
}

/**
 * Boleh-kah metrik ini TAMPIL untuk `role`?
 *
 * Staf (owner/akunting) SELALU melihat semuanya, apa pun isi tabel: setelan ini
 * mengatur apa yang dilihat KLIEN, bukan alat untuk menyembunyikan angka dari
 * akuntan yang mengerjakannya. Hanya role 'user' yang tunduk pada peta.
 * Metrik yang belum pernah di-toggle default TAMPIL.
 */
export function isMetricVisible(
  role: Role | null | undefined,
  visibility: VisibilityMap,
  id: MetricId
): boolean {
  if (isStaff(role)) return true
  return visibility[id] ?? true
}

/** Daftar metrik yang tampil untuk `role`, urut sesuai METRIC_IDS. */
export function visibleMetricIds(role: Role | null | undefined, visibility: VisibilityMap): MetricId[] {
  return METRIC_IDS.filter(id => isMetricVisible(role, visibility, id))
}

/**
 * Apakah metrik ini DISEMBUNYIKAN dari klien? Dipakai staf untuk menandai kartu
 * yang tidak dilihat klien. Berbeda dari !isMetricVisible: ini menjawab
 * "bagaimana tampaknya bagi klien", terlepas dari siapa yang sedang melihat.
 */
export function isHiddenFromClient(visibility: VisibilityMap, id: MetricId): boolean {
  return (visibility[id] ?? true) === false
}
