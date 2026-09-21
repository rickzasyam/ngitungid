// Buku besar & saldo berjalan. MURNI (tanpa I/O, tanpa React).
//
// ══ TIDAK ADA TABEL SALDO (D11) ═══════════════════════════════════════════
// Saldo berjalan, saldo awal, dan neraca saldo SELALU dihitung saat diminta
// dari baris jurnal yang sudah terposting. Tidak ada kolom atau tabel yang
// menyimpan saldo, dan itu disengaja: saldo tersimpan adalah dua sumber
// kebenaran yang harus dijaga tetap sama, dan yang kedua selalu kalah begitu
// ada satu jalur tulis yang lupa memperbaruinya. Kalau kelak lambat, jawabannya
// index — bukan snapshot.
//
// ══ SEN BULAT, SAMA SEPERTI lib/journal.ts ════════════════════════════════
// Seluruh saldo di modul ini INTEGER SEN. Konversi ke rupiah dilakukan di titik
// tampil. Alasannya sama persis dengan yang ditulis di kepala lib/journal.ts:
// saldo yang meleset satu sen di buku besar adalah selisih hantu yang tidak
// bisa dijelaskan ke klien.

import { toMinorUnits } from '@/lib/journal'

/** Baris jurnal terposting, sebagaimana dibaca route buku besar. */
export interface LedgerLine {
  id: string
  journalId: string
  tanggal: string
  noBukti: string | null
  keterangan: string | null
  masterCoaId: string
  debit: string
  kredit: string
  lineOrder: number
}

export interface LedgerRow extends LedgerLine {
  /** Saldo berjalan SESUDAH baris ini, dalam SEN, berarah normal balance. */
  saldo: number
}

export interface RunningBalance<T extends LedgerLine = LedgerLine> {
  /** Saldo sebelum baris pertama — akumulasi seluruh baris periode sebelumnya. */
  opening: number
  rows: (T & { saldo: number })[]
  closing: number
}

export interface AccountRef {
  id: string
  kode: string
  nama: string
  /** 'Debit' | 'Kredit' — normal balance, kolom yang SUDAH ada di master_coa. */
  posisi: string
}

export interface AccountSummary {
  akun: AccountRef
  debit: number
  kredit: number
  /** Berarah normal balance, jadi akun yang wajar selalu positif. */
  saldo: number
}

/**
 * Arah penambah saldo menurut normal balance akun.
 *
 * Akun bersaldo normal DEBIT (aset, beban) bertambah di sisi debit → `D − K`.
 * Akun bersaldo normal KREDIT (hutang, modal, pendapatan) → `K − D`.
 *
 * Sisi kredit dikenali dari awalan **k** (Kredit/K) MAUPUN **c** (Credit/Cr).
 * Importer COA memang menormalkan keduanya jadi 'Kredit', tapi form baris COA
 * menyimpan apa yang diketik — dan tanda yang terbalik di sini tidak melempar,
 * ia diam-diam membalik saldo satu akun. Tidak ada akun bersaldo normal debit
 * yang namanya diawali k atau c, jadi toleransi ini tidak punya sisi rugi.
 *
 * Nilai lain dianggap normal-debit: yang tersisa hanyalah baris non-postable
 * (mis. "-"), yang secara definisi tidak boleh punya baris jurnal. Memilih
 * diam-diam lebih baik daripada melempar di tengah perhitungan buku besar.
 */
export function normalSign(posisi: string): 1 | -1 {
  const p = posisi.trim().toLowerCase()
  return p.startsWith('k') || p.startsWith('c') ? -1 : 1
}

/**
 * Urutan baku buku besar: `tanggal, no_bukti NULLS LAST, line_order, id`.
 *
 * Keputusan Ricko 2026-09-18. MP hanya menyebut tiga kunci pertama, tapi sejak
 * `no_bukti` boleh NULL (Fase 1) urutannya jadi bergantung default DB — dan
 * saldo berjalan yang urutannya berubah antar-query adalah angka yang berbeda
 * untuk data yang sama. `id` di ujung membuatnya deterministik ketika seluruh
 * kunci lain seri.
 *
 * Jurnal tanpa nomor bukti ditaruh SESUDAH yang bernomor pada tanggal yang
 * sama: yang bernomor bisa diadu dengan dokumen fisik, jadi ia yang jadi
 * tulang punggung pembacaan.
 */
export function compareLedgerLines(a: LedgerLine, b: LedgerLine): number {
  if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1

  // NULLS LAST, ditulis eksplisit — bukan mengandalkan perbandingan string
  // dengan null yang di JS berperilaku beda dari SQL.
  if (a.noBukti === null && b.noBukti !== null) return 1
  if (a.noBukti !== null && b.noBukti === null) return -1
  if (a.noBukti !== null && b.noBukti !== null && a.noBukti !== b.noBukti) {
    return a.noBukti < b.noBukti ? -1 : 1
  }

  if (a.lineOrder !== b.lineOrder) return a.lineOrder - b.lineOrder
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Mutasi satu baris dalam SEN, berarah normal balance akunnya. */
function mutasi(line: LedgerLine, sign: 1 | -1): number {
  const d = toMinorUnits(line.debit) ?? 0
  const k = toMinorUnits(line.kredit) ?? 0
  return sign * (d - k)
}

/**
 * Saldo berjalan satu akun untuk satu periode.
 *
 * `openingLines` adalah baris SEBELUM periode — route yang memisahkannya, dan
 * modul ini hanya menjumlahkannya. Pemisahan itu disengaja: "sebelum periode"
 * adalah pertanyaan query (dengan index tanggal), bukan pertanyaan aturan.
 */
// Generik atas bentuk barisnya: pemanggil boleh memberi baris yang membawa
// field TAMBAHAN (mis. penanda `diubahSetelahPosting` dari query), dan
// field itu ikut utuh ke keluaran lewat spread di bawah. Tanpa generik,
// TypeScript memangkasnya ke LedgerLine dan penandanya lenyap dalam
// perjalanan — tanpa satu pun galat.
export function computeRunningBalance<T extends LedgerLine>({
  lines,
  posisi,
  openingLines = [],
}: {
  lines: readonly T[]
  posisi: string
  openingLines?: readonly LedgerLine[]
}): RunningBalance<T> {
  const sign = normalSign(posisi)

  let opening = 0
  for (const l of openingLines) opening += mutasi(l, sign)

  const urut = [...lines].sort(compareLedgerLines)
  let saldo = opening
  const rows: (T & { saldo: number })[] = urut.map(l => {
    saldo += mutasi(l, sign)
    return { ...l, saldo }
  })

  return { opening, rows, closing: saldo }
}

/**
 * Neraca saldo ringkas: total D, total K, dan saldo tiap akun.
 *
 * Akun yang tidak punya satu pun baris tetap ikut dengan nol — daftar yang
 * melewatkannya membuat "akun ini memang nol" tidak bisa dibedakan dari "akun
 * ini lupa dihitung". Urut kode, sama dengan Master COA di layar.
 */
export function summarizeByAccount(
  lines: readonly LedgerLine[],
  accounts: readonly AccountRef[]
): AccountSummary[] {
  const perAkun = new Map<string, { debit: number; kredit: number }>()
  for (const a of accounts) perAkun.set(a.id, { debit: 0, kredit: 0 })

  for (const l of lines) {
    const slot = perAkun.get(l.masterCoaId)
    if (!slot) continue // baris menunjuk akun di luar daftar — bukan urusan sini
    slot.debit += toMinorUnits(l.debit) ?? 0
    slot.kredit += toMinorUnits(l.kredit) ?? 0
  }

  return [...accounts]
    .sort((a, b) => a.kode.localeCompare(b.kode))
    .map(akun => {
      const { debit, kredit } = perAkun.get(akun.id)!
      return { akun, debit, kredit, saldo: normalSign(akun.posisi) * (debit - kredit) }
    })
}
