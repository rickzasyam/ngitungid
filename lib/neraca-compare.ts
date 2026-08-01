// Detail Neraca N-checkpoint per akun (fitur "Detail Neraca" di Analytics —
// tabel gaya P&L, satu kolom per periode). Murni tanpa I/O — route yang query,
// fungsi ini yang menghitung (pola sama dgn financial-agg). Nilai BERTANDA
// (signed): akun kontra (Akumulasi Penyusutan, Prive, dsb) tersimpan negatif
// dari ekstraksi → subtotal section = penjumlahan bertanda biasa, dan identitas
// TOTAL AKTIVA = TOTAL PASIVA (HUTANG + MODAL) harus terpenuhi. Sama seperti
// aggregateBalanceSheet yang juga signed (sejak fix 2026-07-14 — dulu Math.abs,
// salah utk akun kontra).

import { classifyBs, AKTIVA_CATS, PASIVA_CATS, BS_CAT_LABEL, BALANCE_TOLERANCE, type BsCat } from './financial-agg'

export interface CompareLine {
  kode: string // join key antar checkpoint (unique per klien di master_coa)
  nama: string // nama kanonik master_coa (bukan rawName — bisa beda antar bulan)
  kelompok: string
  subKelompok: string
  amount: number
  isSubtotal: boolean
  status: string
}

// Union kategori section neraca — sama persis dengan kategori agregasi, jadi
// diturunkan dari sana alih-alih ditulis ulang.
export type BsSectionKey = BsCat

// Urutan & label ikut AKTIVA_CATS/PASIVA_CATS di lib/financial-agg — menambah
// kategori aset di sana otomatis memunculkan section-nya di sini.
// 'other' ditaruh paling akhir: subKelompok neraca yang tidak dikenali
// classifyBs ditampilkan TERPISAH (di luar TOTAL AKTIVA/PASIVA) supaya tidak
// hilang diam-diam; kalau muncul, identitas kemungkinan tidak seimbang dan
// banner balance check menjelaskannya.
const SECTION_DEF: { key: BsSectionKey; label: string }[] = [
  ...AKTIVA_CATS.map(key => ({ key: key as BsSectionKey, label: BS_CAT_LABEL[key] })),
  ...PASIVA_CATS.map(key => ({ key: key as BsSectionKey, label: BS_CAT_LABEL[key] })),
  { key: 'other', label: BS_CAT_LABEL.other },
]

export const AKTIVA_KEYS: BsSectionKey[] = [...AKTIVA_CATS]
export const PASIVA_KEYS: BsSectionKey[] = [...PASIVA_CATS]

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
  balance: NeracaBalance
}

/** Cek identitas Aktiva = Pasiva per periode. INFORMASI, bukan blocker:
 *  laporan yang tidak seimbang tetap boleh disimpan, dipetakan, dan dianalisis —
 *  yang berubah hanya admin jadi tahu ada yang perlu diperiksa. */
export interface NeracaBalance {
  /** totalAktiva − totalPasiva per periode. */
  diff: number[]
  balanced: boolean[]
  tolerance: number
  /** Akun 'Tidak Terklasifikasi' per periode — petunjuk penyebab paling
   *  actionable, karena itu satu-satunya sisi yang bisa admin perbaiki
   *  langsung lewat Master COA. */
  unclassifiedCount: number[]
  unclassifiedTotal: number[]
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

  const totalAktiva = sumKeys(AKTIVA_KEYS)
  const totalPasiva = sumKeys(PASIVA_KEYS)

  const otherSection = sections.find(s => s.key === 'other')
  const balance: NeracaBalance = {
    diff: totalAktiva.map((a, i) => a - totalPasiva[i]),
    balanced: totalAktiva.map((a, i) => Math.abs(a - totalPasiva[i]) <= BALANCE_TOLERANCE),
    tolerance: BALANCE_TOLERANCE,
    unclassifiedCount: Array.from({ length: nP }, (_, i) =>
      otherSection ? otherSection.accounts.filter(a => a.values[i] !== 0).length : 0
    ),
    unclassifiedTotal: Array.from({ length: nP }, (_, i) => otherSection?.totals[i] ?? 0),
  }

  return { sections, totalAktiva, totalPasiva, balance }
}
