import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { HasilDokumen } from './harness'

// Status uji banding yang bisa DILANJUTKAN — untuk kuota free tier yang habis di
// tengah putaran (keputusan Ricko 2026-10-28: jalankan sebanyak yang bisa hari
// ini, lanjutkan sesudah kuota direset). Per spek penyedia ("gemini:<model>")
// disimpan hasil per dokumen yang SELESAI; dokumen yang terpotong kuota diulang
// utuh.
//
// Isinya hanya agregat `HasilDokumen` (nama dokumen sintetis, angka, jenis
// galat) — tidak ada isi baris. Pembacanya menolak kunci atau tipe lain, jadi
// berkas status tidak bisa dipakai menyelundupkan apa pun ke harness.

export type StatusUji = { versi: 1; hasil: Record<string, HasilDokumen[]> }

const ANGKA = ['jumlahHalaman', 'barisHilang', 'barisLebih', 'msPerHalaman', 'tokenMasuk', 'tokenKeluar'] as const
/** Hanya ada pada uji dengan model pengulang; status lama tanpa kunci ini tetap sah. */
const ANGKA_ULANG = ['tokenUlangMasuk', 'tokenUlangKeluar'] as const
const KUNCI = new Set(['nama', 'halamanGagal', 'kesinambungan', 'lolosTanpaKoreksi', 'identik', 'halamanDiulang', ...ANGKA, ...ANGKA_ULANG])
const angka = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

function hasilSah(x: unknown): x is HasilDokumen {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  return (
    Object.keys(o).every(k => KUNCI.has(k)) &&
    typeof o.nama === 'string' &&
    o.nama.startsWith('UJI-B-') &&
    ANGKA.every(k => angka(o[k])) &&
    ANGKA_ULANG.every(k => o[k] === undefined || angka(o[k])) &&
    (o.halamanDiulang === undefined || (Array.isArray(o.halamanDiulang) && o.halamanDiulang.every(angka))) &&
    typeof o.lolosTanpaKoreksi === 'boolean' &&
    typeof o.identik === 'boolean' &&
    (o.kesinambungan === 'lolos' || o.kesinambungan === 'putus' || o.kesinambungan === 'tanpa-saldo') &&
    Array.isArray(o.halamanGagal) &&
    o.halamanGagal.every(
      g =>
        typeof g === 'object' &&
        g !== null &&
        Object.keys(g).every(k => k === 'halaman' || k === 'jenis') &&
        typeof (g as { halaman: unknown }).halaman === 'number' &&
        typeof (g as { jenis: unknown }).jenis === 'string'
    )
  )
}

/** Membaca teks status; melempar bila bentuknya bukan status uji banding. */
export function uraiStatus(teks: string): StatusUji {
  const o = JSON.parse(teks) as { versi?: unknown; hasil?: unknown }
  if (o.versi !== 1 || typeof o.hasil !== 'object' || o.hasil === null || Array.isArray(o.hasil)) throw new Error('Berkas status uji banding tidak dikenal.')
  for (const [spek, daftar] of Object.entries(o.hasil)) {
    if (!Array.isArray(daftar) || !daftar.every(hasilSah)) throw new Error(`Status untuk "${spek}" tidak sah.`)
  }
  return o as StatusUji
}

export function bacaStatus(berkas: string): StatusUji {
  return existsSync(berkas) ? uraiStatus(readFileSync(berkas, 'utf8')) : { versi: 1, hasil: {} }
}

export function tulisStatus(berkas: string, s: StatusUji): void {
  writeFileSync(berkas, JSON.stringify(s, null, 1))
}
