// Detail Neraca N-checkpoint per akun (fitur "Detail Neraca" di Analytics —
// tabel gaya P&L, satu kolom per periode). Murni tanpa I/O — route yang query,
// fungsi ini yang menghitung (pola sama dgn financial-agg). Nilai BERTANDA
// (signed): akun kontra (Akumulasi Penyusutan, Prive, dsb) tersimpan negatif
// dari ekstraksi → subtotal section = penjumlahan bertanda biasa, dan identitas
// TOTAL AKTIVA = TOTAL PASIVA (HUTANG + MODAL) harus terpenuhi. Sama seperti
// aggregateBalanceSheet yang juga signed (sejak fix 2026-07-14 — dulu Math.abs,
// salah utk akun kontra).

import { classifyBs } from './financial-agg'

export interface CompareLine {
  kode: string // join key antar checkpoint (unique per klien di master_coa)
  nama: string // nama kanonik master_coa (bukan rawName — bisa beda antar bulan)
  kelompok: string
  subKelompok: string
  amount: number
  isSubtotal: boolean
  status: string
}

// Union kategori section neraca — dipakai lintas helper detail di bawah.
export type BsSectionKey = 'aktivaLancar' | 'aktivaTetap' | 'aktivaLainnya' | 'hutang' | 'modal' | 'other'

const SECTION_DEF: { key: BsSectionKey; label: string }[] = [
  { key: 'aktivaLancar', label: 'Aktiva Lancar' },
  { key: 'aktivaTetap', label: 'Aktiva Tetap' },
  { key: 'aktivaLainnya', label: 'Aktiva Lainnya' },
  { key: 'hutang', label: 'Hutang' },
  { key: 'modal', label: 'Modal' },
  // subKelompok neraca yang tidak dikenali classifyBs — ditampilkan terpisah
  // (di luar TOTAL AKTIVA/PASIVA) supaya tidak hilang diam-diam; kalau muncul,
  // identitas kemungkinan tidak seimbang dan banner UI menjelaskannya.
  { key: 'other', label: 'Tidak Terklasifikasi' },
]

export const AKTIVA_KEYS: BsSectionKey[] = ['aktivaLancar', 'aktivaTetap', 'aktivaLainnya']
export const PASIVA_KEYS: BsSectionKey[] = ['hutang', 'modal']

// ── Detail Neraca N-checkpoint (fitur "Detail Neraca" — tabel gaya P&L) ──
// Tiap akun punya saldo per checkpoint. Neraca point-in-time → nilai = saldo
// akhir periode (BUKAN akumulasi antar periode; itu keputusan Ricko). Signed
// sums, sama seperti aggregateBalanceSheet.
export interface DetailAccount { kode: string; name: string; values: number[] }
export interface DetailSection {
  key: BsSectionKey
  label: string
  accounts: DetailAccount[]
  totals: number[] // total section per periode
}
export interface NeracaDetailResult {
  sections: DetailSection[]
  totalAktiva: number[] // per periode
  totalPasiva: number[]
}

export function buildNeracaDetail(periodLines: CompareLine[][]): NeracaDetailResult {
  const nP = periodLines.length
  const acc = new Map<string, { kode: string; name: string; cat: BsSectionKey; values: number[] }>()
  periodLines.forEach((lines, idx) => {
    for (const l of lines) {
      if (l.isSubtotal || (l.status !== 'matched' && l.status !== 'edited')) continue
      if (!l.kelompok.toLowerCase().includes('neraca')) continue
      const cat = classifyBs(l.subKelompok) as BsSectionKey
      let cur = acc.get(l.kode)
      if (!cur) { cur = { kode: l.kode, name: l.nama, cat, values: new Array(nP).fill(0) }; acc.set(l.kode, cur) }
      cur.values[idx] += l.amount
    }
  })

  const sections = SECTION_DEF.map(def => {
    const accounts = [...acc.values()]
      .filter(x => x.cat === def.key)
      .filter(x => x.values.some(v => v !== 0)) // nol di SEMUA periode = tak informatif
      .sort((x, y) => x.kode.localeCompare(y.kode))
      .map(({ kode, name, values }) => ({ kode, name, values }))
    const totals = Array.from({ length: nP }, (_, i) => accounts.reduce((s, a) => s + a.values[i], 0))
    return { key: def.key, label: def.label, accounts, totals }
  }).filter(s => s.accounts.length > 0)

  const sumKeys = (keys: BsSectionKey[]) =>
    Array.from({ length: nP }, (_, i) => sections.filter(s => keys.includes(s.key)).reduce((t, s) => t + s.totals[i], 0))

  return { sections, totalAktiva: sumKeys(AKTIVA_KEYS), totalPasiva: sumKeys(PASIVA_KEYS) }
}
