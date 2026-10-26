// Aturan mutasi kas/bank. MURNI (tanpa I/O, tanpa React) — pola sama dengan
// lib/journal.ts dan lib/purchase.ts.
//
// ══ UANG DALAM SEN BULAT (P1) ═════════════════════════════════════════════
// Nominal mutasi, alokasi, dan sisanya dijumlahkan sebagai INTEGER SEN. Sisa
// alokasi yang meleset satu sen membuat mutasi yang sudah lunas terlihat
// "sebagian" selamanya — dan akunting akan mencari pembayaran yang tidak ada.
//
// ══ SISA & STATUS DITURUNKAN, TIDAK DISIMPAN (D37, P3) ═══════════════════
// Tidak ada kolom `sisa` maupun `status` di `cash_mutations`, dan modul ini
// satu-satunya yang tahu cara menghitung keduanya. Menyimpannya berarti punya
// dua jawaban yang harus dijaga tetap sama — dan yang tampil di layar itulah
// yang akan dipercaya.
//
// ══ ARAH JURNAL DATANG DARI SISI MUTASINYA, BUKAN DARI TEBAKAN ═══════════
// Untuk akun kas: **debit = uang MASUK** (D36). Uang keluar (kredit kas) →
// debit akun lawan; uang masuk → kredit akun lawan. Membalik ini menghasilkan
// jurnal yang tetap seimbang dan tetap terposting — salahnya baru ketahuan saat
// saldo kas di buku besar berlawanan arah dengan rekening korannya.

import { fromMinorUnits, toMinorUnits, type JournalLineValue } from '@/lib/journal'
import { isValidYmd } from '@/lib/contracts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const KETERANGAN_MAX = 500

// ── Validasi ─────────────────────────────────────────────────

export type CashMutationInput = {
  tanggal?: unknown
  akunKasId?: unknown
  debit?: unknown
  kredit?: unknown
  keterangan?: unknown
  saldo?: unknown
  akunLawanId?: unknown
}

export type CashMutationValue = {
  tanggal: string
  akunKasId: string
  /** String 2 desimal. Tepat satu dari keduanya bukan '0.00'. */
  debit: string
  kredit: string
  keterangan: string | null
  saldo: string | null
  akunLawanId: string | null
}

export type CashMutationCheck =
  | { ok: true; value: CashMutationValue }
  | { ok: false; errors: string[] }

/**
 * Validasi satu mutasi. Mengumpulkan SELURUH galat, tidak berhenti di yang
 * pertama — impor rekening koran menghasilkan banyak baris sekaligus, dan
 * memperbaikinya satu per satu adalah pekerjaan yang tidak perlu ada.
 *
 * Aturan sisinya CERMIN CHECK di DB (D36): keduanya tidak negatif, dan TEPAT
 * SATU yang terisi. Dua tempat memang memeriksa hal yang sama — dan itu
 * disengaja: yang di DB adalah jaring terakhir, yang di sini yang bisa
 * menyebut barisnya.
 */
export function validateCashMutation(input: CashMutationInput): CashMutationCheck {
  const errors: string[] = []

  if (!isValidYmd(input.tanggal)) {
    errors.push('Tanggal mutasi tidak valid (format YYYY-MM-DD).')
  }

  const akunKasId = typeof input.akunKasId === 'string' ? input.akunKasId.trim() : ''
  if (!UUID_RE.test(akunKasId)) errors.push('Akun kas belum dipilih.')

  const kosong = (v: unknown) => v === '' || v === null || v === undefined
  const debitMinor = kosong(input.debit) ? 0 : toMinorUnits(input.debit)
  const kreditMinor = kosong(input.kredit) ? 0 : toMinorUnits(input.kredit)

  if (debitMinor === null) errors.push('Nominal debit tidak valid.')
  if (kreditMinor === null) errors.push('Nominal kredit tidak valid.')

  // Nominal NEGATIF sudah ditolak di atas: toMinorUnits menolak tanda minus,
  // jadi '-100' jatuh ke "tidak valid" dan tidak pernah sampai ke sini. Tidak
  // ada cabang `< 0` di bawah dengan sengaja — cabang yang tak terjangkau
  // terbaca seperti penjaga, padahal tidak pernah menjaga apa pun.
  if (debitMinor !== null && kreditMinor !== null) {
    if (debitMinor === 0 && kreditMinor === 0) {
      errors.push('Mutasi harus terisi di salah satu sisi: debit (masuk) atau kredit (keluar).')
    } else if (debitMinor > 0 && kreditMinor > 0) {
      errors.push('Mutasi hanya boleh terisi di SATU sisi — debit atau kredit, bukan keduanya.')
    }
  }

  let keterangan: string | null = null
  if (typeof input.keterangan === 'string' && input.keterangan.trim() !== '') {
    keterangan = input.keterangan.trim()
    if (keterangan.length > KETERANGAN_MAX) {
      errors.push(`Keterangan maksimal ${KETERANGAN_MAX} karakter.`)
    }
  }

  // Saldo berjalan dari rekening koran — INFORMATIF. Boleh kosong (mutasi
  // manual tidak punya kolom ini) dan boleh NEGATIF: rekening bisa minus, dan
  // saldo minus yang ditolak membuat seluruh berkas impor gagal karena satu
  // baris yang justru paling perlu dilihat.
  //
  // Tandanya diurus di sini karena toMinorUnits menolak tanda minus — itu
  // aturan yang benar untuk nominal debit/kredit (arah uang ditentukan SISINYA,
  // bukan tandanya) dan salah untuk saldo.
  let saldo: string | null = null
  if (!kosong(input.saldo)) {
    const mentah = String(input.saldo).trim()
    const negatif = mentah.startsWith('-')
    const saldoMinor = toMinorUnits(negatif ? mentah.slice(1) : mentah)
    if (saldoMinor === null) errors.push('Saldo berjalan tidak valid.')
    else saldo = fromMinorUnits(negatif ? -saldoMinor : saldoMinor)
  }

  const akunLawanId =
    typeof input.akunLawanId === 'string' && UUID_RE.test(input.akunLawanId.trim())
      ? input.akunLawanId.trim()
      : null

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      tanggal: input.tanggal as string,
      akunKasId,
      debit: fromMinorUnits(debitMinor as number),
      kredit: fromMinorUnits(kreditMinor as number),
      keterangan,
      saldo,
      akunLawanId,
    },
  }
}

// ── Fingerprint duplikat ─────────────────────────────────────

/**
 * Normalisasi keterangan untuk pencocokan duplikat: huruf kecil, tanda baca
 * dibuang, spasi dirapatkan jadi satu.
 *
 * ══ TANPA RegExp YANG DIBANGUN DARI INPUT (D22) ═════════════════════════
 * Seluruh pemeriksaan di bawah berupa perbandingan kode karakter, bukan pola
 * yang disusun dari teks pengguna. Keterangan rekening koran bisa berisi apa
 * saja, termasuk teks yang dirancang membuat mesin regex bekerja eksponensial.
 */
export function normalizeKeterangan(v: unknown): string {
  const teks = typeof v === 'string' ? v : ''
  const out: string[] = []
  let spasiTertunda = false

  for (const ch of teks.toLowerCase()) {
    const kode = ch.codePointAt(0) ?? 0
    const hurufAscii = kode >= 97 && kode <= 122
    const angka = kode >= 48 && kode <= 57
    // Huruf non-ASCII (mis. é) ikut dipertahankan: membuangnya akan menyatukan
    // dua keterangan berbeda jadi satu fingerprint.
    const hurufLain = kode > 127 && ch.toLowerCase() !== ch.toUpperCase()

    if (hurufAscii || angka || hurufLain) {
      if (spasiTertunda && out.length > 0) out.push(' ')
      spasiTertunda = false
      out.push(ch)
    } else {
      // Tanda baca DAN spasi sama-sama jadi pemisah. "BRI-TRF" dan "BRI TRF"
      // adalah keterangan yang sama bagi manusia yang membaca rekening koran.
      if (out.length > 0) spasiTertunda = true
    }
  }
  return out.join('')
}

/**
 * Sidik jari satu mutasi — dipakai untuk MENANDAI dugaan duplikat saat impor,
 * bukan untuk menolaknya (D38).
 *
 * Kolomnya sengaja tidak unik di DB: dua pembayaran identik pada hari yang sama
 * adalah hal yang nyata terjadi. Yang dibutuhkan akunting adalah peringatan
 * yang bisa ia abaikan, bukan penolakan yang harus ia akali.
 */
export function fingerprintMutasi(m: {
  tanggal?: unknown
  debit?: unknown
  kredit?: unknown
  keterangan?: unknown
}): string {
  const tanggal = isValidYmd(m.tanggal) ? (m.tanggal as string) : ''
  const debit = fromMinorUnits(toMinorUnits(m.debit) ?? 0)
  const kredit = fromMinorUnits(toMinorUnits(m.kredit) ?? 0)
  return [tanggal, debit, kredit, normalizeKeterangan(m.keterangan)].join('|')
}

// ── Sisa alokasi & status (TURUNAN) ──────────────────────────

export type AlokasiLike = { nominal?: unknown }

export type MutasiLike = { debit?: unknown; kredit?: unknown }

/** Nominal satu mutasi dalam SEN — sisi mana pun yang terisi. */
export function mutationAmountMinor(m: MutasiLike): number {
  const debit = toMinorUnits(m?.debit) ?? 0
  const kredit = toMinorUnits(m?.kredit) ?? 0
  return debit > 0 ? debit : kredit
}

/** Σ alokasi dalam SEN. Alokasi tak sah dihitung 0, tidak melempar. */
export function allocatedMinor(alokasi: readonly AlokasiLike[] | null | undefined): number {
  let total = 0
  for (const a of alokasi ?? []) total += toMinorUnits(a?.nominal) ?? 0
  return total
}

/**
 * Sisa mutasi yang belum dialokasikan, dalam SEN.
 *
 * Bisa NEGATIF, dan itu sengaja tidak dikepit ke nol: alokasi yang melebihi
 * nominal mutasinya adalah keadaan yang HARUS terlihat, bukan disembunyikan
 * dengan Math.max. Route yang mencegahnya terjadi (N4); fungsi ini yang
 * membuatnya kelihatan kalau ia terlanjur terjadi.
 */
export function allocationRemaining(
  mutasi: MutasiLike,
  alokasi: readonly AlokasiLike[] | null | undefined
): number {
  return mutationAmountMinor(mutasi) - allocatedMinor(alokasi)
}

export const MUTATION_STATUS = ['belum dijurnal', 'sebagian', 'selesai'] as const
export type MutationStatus = (typeof MUTATION_STATUS)[number]

/**
 * Status satu mutasi — DITURUNKAN, tidak pernah disimpan (D37, P3).
 *
 * Tiga keadaan, dan urutan pemeriksaannya penting:
 *   - **selesai**  — seluruh nominalnya sudah berlabuh: entah teralokasi penuh
 *                    ke invoice, atau punya akun lawan (kasus COA lawan bebas).
 *   - **sebagian** — sudah ada alokasi, tapi belum menutup seluruh nominalnya.
 *   - **belum dijurnal** — belum ada alokasi dan belum ada akun lawan.
 *
 * "belum dijurnal" bukan sekadar label netral: permintaan eksplisit Ricko
 * adalah baris seperti ini TIDAK boleh terlihat sama dengan yang sudah selesai.
 */
export function mutationStatus(
  mutasi: MutasiLike & { akunLawanId?: string | null },
  alokasi: readonly AlokasiLike[] | null | undefined
): MutationStatus {
  const nominal = mutationAmountMinor(mutasi)
  const teralokasi = allocatedMinor(alokasi)

  // Akun lawan bebas menutup mutasi SEPENUHNYA — ia bukan pembayaran sebagian,
  // melainkan pernyataan "seluruh mutasi ini lawannya akun itu".
  if (mutasi.akunLawanId) return 'selesai'
  if (teralokasi <= 0) return 'belum dijurnal'
  if (nominal > 0 && teralokasi >= nominal) return 'selesai'
  return 'sebagian'
}

/**
 * Apakah jurnal sebuah mutasi MENGUNCI mutasinya?
 *
 * Terposting = angkanya sudah di buku besar, jadi jurnal itu tidak boleh
 * dibangun ulang. Tapi jurnal yang sudah DIBALIK — pembalik TERPOSTING, definisi
 * `canReverse` — sudah dinihilkan di buku besar: pasangan asli + pembalik tinggal
 * riwayat, dan mutasinya boleh diubah lagi dengan jurnal draf yang baru.
 *
 * `lapisPembalik` = panjang rantai pembalik terposting di atasnya. Ganjil =
 * efeknya nihil; genap = efeknya hidup lagi (pembaliknya ikut dibalik). Tanpa
 * pembeda ini, membalik pembalik akan membuka mutasi yang angkanya justru sudah
 * kembali ke buku besar — dan jurnal barunya menghitungnya dua kali.
 */
export function jurnalMengunciMutasi(jurnal: { status: string } | null, lapisPembalik: number): boolean {
  return jurnal !== null && jurnal.status === 'posted' && lapisPembalik % 2 === 0
}

// ── Pembangun baris jurnal ───────────────────────────────────

export type AlokasiJurnal = {
  /** Akun hutang MILIK INVOICE (snapshot D30), bukan dibaca ulang dari supplier. */
  akunHutangId: string
  /** INTEGER SEN. */
  minor: number
  keterangan?: string | null
}

/**
 * Kasus (a) — mutasi yang dialokasikan ke satu atau beberapa invoice hutang.
 *
 * **D `akun_hutang` per alokasi · K `akun_kas` sebesar total alokasi.**
 *
 * ══ AKUN HUTANGNYA MILIK INVOICE, BUKAN MILIK SUPPLIER ══════════════════
 * Dibaca dari snapshot di invoice (D30). Kalau supplier mengganti akun hutang
 * defaultnya setelah invoicenya terbit, membaca ulang dari supplier akan
 * men-DEBIT akun yang berbeda dari yang di-KREDIT invoicenya — selisihnya
 * mengendap permanen di dua akun dan tidak pernah melempar galat.
 *
 * Beberapa alokasi ke akun hutang yang SAMA tetap jadi beberapa baris: yang
 * dibaca akunting di panel rincian adalah "invoice mana dibayar berapa", dan
 * menggabungkannya membuang persis informasi itu.
 */
export function buildAllocationJournalLines({
  alokasi,
  akunKasId,
}: {
  alokasi: readonly AlokasiJurnal[]
  akunKasId: string
}): JournalLineValue[] {
  const debitLines: JournalLineValue[] = []
  let totalMinor = 0
  let order = 0

  for (const a of alokasi) {
    // Baris bernominal nol melanggar CHECK journal_lines (tepat satu sisi
    // terisi) dan akan menggagalkan seluruh batch.
    if (!Number.isSafeInteger(a.minor) || a.minor <= 0) continue
    totalMinor += a.minor
    debitLines.push({
      masterCoaId: a.akunHutangId,
      debit: fromMinorUnits(a.minor),
      kredit: '0.00',
      keterangan: a.keterangan ?? null,
      lineOrder: order++,
    })
  }

  if (debitLines.length === 0) return []

  return [
    ...debitLines,
    {
      masterCoaId: akunKasId,
      debit: '0.00',
      kredit: fromMinorUnits(totalMinor),
      keterangan: null,
      lineOrder: order,
    },
  ]
}

/**
 * Kasus (b) — mutasi dengan COA lawan bebas.
 *
 * Arahnya MENGIKUTI SISI MUTASINYA, tidak ditebak:
 *   - uang keluar (kredit kas) → **D akun lawan / K akun kas**
 *   - uang masuk  (debit kas)  → **D akun kas / K akun lawan**
 *
 * Membaliknya menghasilkan jurnal yang tetap seimbang dan tetap bisa diposting;
 * yang salah baru terlihat saat saldo kas di buku besar bergerak berlawanan
 * arah dengan rekening korannya — berbulan-bulan kemudian.
 */
export function buildCounterAccountJournalLines({
  mutasi,
  akunKasId,
  akunLawanId,
  keterangan = null,
}: {
  mutasi: MutasiLike
  akunKasId: string
  akunLawanId: string
  keterangan?: string | null
}): JournalLineValue[] {
  const debitMinor = toMinorUnits(mutasi?.debit) ?? 0
  const kreditMinor = toMinorUnits(mutasi?.kredit) ?? 0
  const uangMasuk = debitMinor > 0
  const nominal = uangMasuk ? debitMinor : kreditMinor
  if (!Number.isSafeInteger(nominal) || nominal <= 0) return []

  const kas = {
    masterCoaId: akunKasId,
    debit: uangMasuk ? fromMinorUnits(nominal) : '0.00',
    kredit: uangMasuk ? '0.00' : fromMinorUnits(nominal),
    keterangan,
  }
  const lawan = {
    masterCoaId: akunLawanId,
    debit: uangMasuk ? '0.00' : fromMinorUnits(nominal),
    kredit: uangMasuk ? fromMinorUnits(nominal) : '0.00',
    keterangan,
  }

  // Kas lebih dulu saat uang masuk (ia sisi debit), akun lawan lebih dulu saat
  // uang keluar — supaya baris debit selalu di atas, sama dengan jurnal manual.
  //
  // lineOrder diberikan SESUDAH urutannya ditentukan, bukan dipasang di tiap
  // objek: nomor yang ditulis sebelum urutannya diputuskan akan benar di satu
  // arah dan terbalik di arah yang lain.
  const urut = uangMasuk ? [kas, lawan] : [lawan, kas]
  return urut.map((l, i): JournalLineValue => ({ ...l, lineOrder: i }))
}
