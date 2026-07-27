import { isMappable, isPlaceholderName, type MappableLine } from './mapping-status'

// Pengelompokan daftar "Akun Belum Dipetakan" per jenis laporan untuk
// /coa-mapping. Diletakkan di lib (bukan di dalam komponen) supaya bisa diuji
// tanpa merender halaman — logikanya kecil tapi gampang salah: satu periode
// berisi 3 laporan, dan `flatMap` di halaman dulu membuang asosiasi baris→laporan.

export interface GroupableLine extends MappableLine {
  id: string
  reportType: string
}

export interface UnmappedGroup<T> {
  reportType: string
  items: T[]
}

/**
 * Baris yang masih perlu dipetakan, dikelompokkan per jenis laporan.
 *
 * Penyaringannya memakai isMappable() — sumber kebenaran yang sama dengan badge
 * sidebar dan statusAfterExtract — jadi baris kosong (placeholder + nominal 0)
 * tidak pernah muncul di sini tanpa perlu kriteria kedua.
 *
 * Urutan grup mengikuti urutan kemunculan pertama, sehingga halaman bisa
 * menyerahkan urutan ke API (`order by report_type`) alih-alih mengurutkan ulang.
 */
export function groupUnmappedByReportType<T extends GroupableLine>(
  lines: readonly T[]
): UnmappedGroup<T>[] {
  const byType = new Map<string, T[]>()
  for (const l of lines) {
    if (l.masterCoaId !== null || !isMappable(l)) continue
    const arr = byType.get(l.reportType) ?? []
    arr.push(l)
    byType.set(l.reportType, arr)
  }
  return [...byType.entries()].map(([reportType, items]) => ({ reportType, items }))
}

/** Baris yang lolos filter TAPI namanya placeholder → nominalnya pasti ≠ 0. */
export function isUnreadableName(line: Pick<MappableLine, 'rawName'>): boolean {
  return isPlaceholderName(line.rawName)
}
