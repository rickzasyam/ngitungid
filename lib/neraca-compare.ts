// Komparasi Neraca 2-checkpoint per akun (fitur "Compare Neraca" di Analytics).
// Murni tanpa I/O — route yang query, fungsi ini yang menghitung (pola sama
// dgn financial-agg). Nilai BERTANDA (signed): akun kontra (Akumulasi
// Penyusutan, Prive, dsb) tersimpan negatif dari ekstraksi → subtotal section
// = penjumlahan bertanda biasa, dan identitas TOTAL AKTIVA = TOTAL PASIVA
// (HUTANG + MODAL) harus terpenuhi. BUKAN Math.abs seperti
// aggregateBalanceSheet (yang memang khusus input rasio).

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

export interface CompareAccount { kode: string; name: string; a: number; b: number }
export interface CompareSection {
  key: 'aktivaLancar' | 'aktivaTetap' | 'aktivaLainnya' | 'hutang' | 'modal' | 'other'
  label: string
  accounts: CompareAccount[]
  totalA: number
  totalB: number
}
export interface NeracaCompareResult {
  sections: CompareSection[]
  totalAktiva: { a: number; b: number }
  totalPasiva: { a: number; b: number }
}

const SECTION_DEF: { key: CompareSection['key']; label: string }[] = [
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

export const AKTIVA_KEYS: CompareSection['key'][] = ['aktivaLancar', 'aktivaTetap', 'aktivaLainnya']
export const PASIVA_KEYS: CompareSection['key'][] = ['hutang', 'modal']

export function buildNeracaCompare(linesA: CompareLine[], linesB: CompareLine[]): NeracaCompareResult {
  const acc = new Map<string, { kode: string; name: string; cat: CompareSection['key']; a: number; b: number }>()

  const add = (lines: CompareLine[], side: 'a' | 'b') => {
    for (const l of lines) {
      if (l.isSubtotal || (l.status !== 'matched' && l.status !== 'edited')) continue
      if (!l.kelompok.toLowerCase().includes('neraca')) continue
      const cat = classifyBs(l.subKelompok) as CompareSection['key']
      const cur = acc.get(l.kode) ?? { kode: l.kode, name: l.nama, cat, a: 0, b: 0 }
      cur[side] += l.amount
      acc.set(l.kode, cur)
    }
  }
  add(linesA, 'a')
  add(linesB, 'b')

  const sections = SECTION_DEF.map(def => {
    const accounts = [...acc.values()]
      .filter(x => x.cat === def.key)
      .filter(x => x.a !== 0 || x.b !== 0) // nol di KEDUA sisi = tidak informatif
      .sort((x, y) => x.kode.localeCompare(y.kode)) // urutan kode COA (seperti laporan manual)
      .map(({ kode, name, a, b }) => ({ kode, name, a, b }))
    const totalA = accounts.reduce((s, x) => s + x.a, 0)
    const totalB = accounts.reduce((s, x) => s + x.b, 0)
    return { key: def.key, label: def.label, accounts, totalA, totalB }
  }).filter(s => s.accounts.length > 0)

  const sum = (keys: CompareSection['key'][], side: 'totalA' | 'totalB') =>
    sections.filter(s => keys.includes(s.key)).reduce((t, s) => t + s[side], 0)

  return {
    sections,
    totalAktiva: { a: sum(AKTIVA_KEYS, 'totalA'), b: sum(AKTIVA_KEYS, 'totalB') },
    totalPasiva: { a: sum(PASIVA_KEYS, 'totalA'), b: sum(PASIVA_KEYS, 'totalB') },
  }
}
