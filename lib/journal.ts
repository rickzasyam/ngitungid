// Aturan jurnal umum. MURNI (tanpa I/O, tanpa React) — pola sama dengan
// lib/contracts.ts & lib/layanan.ts.
//
// ══ UANG DIJUMLAHKAN DALAM SEN BULAT, TIDAK PERNAH DALAM FLOAT ═════════════
// debit/kredit bertipe numeric(18,2) dan sampai ke sini sebagai STRING (driver
// Postgres tidak pernah melewatkannya lewat float JS). Modul ini menjaga sifat
// itu: setiap nominal diubah ke INTEGER SEN lebih dulu, penjumlahan dilakukan
// di sana, dan hasilnya baru dikembalikan ke string 2 desimal.
//
// Kenapa bukan Number(a) + Number(b): 0.1 + 0.2 = 0.30000000000000004. Di
// aplikasi lain itu kosmetik; di buku besar, selisih satu sen berarti jurnal
// yang seharusnya seimbang ditolak — atau lebih buruk, jurnal yang TIDAK
// seimbang lolos karena selisihnya lebih kecil dari epsilon yang dipakai untuk
// membandingkan. Dua-duanya berakhir sebagai neraca yang tidak bisa dijelaskan
// ke klien. Dengan sen bulat, "seimbang" adalah === antar integer — tidak ada
// toleransi yang perlu dipilih, jadi tidak ada toleransi yang bisa salah pilih.
//
// ══ TANGGAL ADALAH STRING ═════════════════════════════════════════════════
// tanggal bertipe `date` di Postgres dan diperlakukan sebagai 'YYYY-MM-DD' dari
// ujung ke ujung — tidak ada new Date(), Intl, maupun toISOString(). Validasinya
// memakai isValidYmd yang sudah ada (lib/contracts.ts), yang juga menolak
// tanggal yang formatnya benar tapi tidak ada (31 Februari).
//
// ══ APA YANG *TIDAK* ADA DI SINI ══════════════════════════════════════════
// Modul ini tidak tahu apa pun tentang database, sesi, maupun peran. Ia tidak
// memeriksa apakah sebuah akun milik klien yang benar (itu query, ada di route)
// dan tidak memeriksa apakah nomor bukti sudah dipakai (itu unique constraint).
// Yang ada di sini hanya aturan yang benar tanpa melihat isi database.

import { normalizeNominal, isValidYmd } from '@/lib/contracts'

// Konvensi basis kode: UUID_RE dideklarasikan per modul, bukan diimpor dari
// satu tempat (lihat lib/api/account.ts, lib/contracts.ts, dan route COA).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Status & sumber ──────────────────────────────────────────

/**
 * Status jurnal. BERBEDA dari contractStatus yang diturunkan dari tanggal: ini
 * keputusan manusia dan karena itu memang disimpan. Tidak ada tanggal atau data
 * apa pun yang bisa memberitahu apakah seorang akunting sudah menganggap jurnal
 * ini final.
 */
export const JOURNAL_STATUS = ['draft', 'posted'] as const
export type JournalStatus = (typeof JOURNAL_STATUS)[number]

export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = {
  draft: 'Draf',
  posted: 'Terposting',
}

/**
 * Dari mana jurnal lahir. Fase 1 hanya 'manual'; nilai berikutnya
 * ('import_bank', 'marketplace', 'kas_kecil', 'opening_balance') ditambahkan
 * per fase bersama migrasi enum-nya.
 */
export const JOURNAL_SOURCE = ['manual'] as const
export type JournalSource = (typeof JOURNAL_SOURCE)[number]

export const JOURNAL_SOURCE_LABEL: Record<JournalSource, string> = {
  manual: 'Manual',
}

// ── Batas ────────────────────────────────────────────────────

/** Jurnal berpasangan: satu sisi saja bukan jurnal, itu catatan. */
export const MIN_LINES = 2

/** Sama dengan batas no_kontrak — kolomnya text, batasnya aturan, bukan tipe. */
export const NO_BUKTI_MAX = 80

// ── Sen ──────────────────────────────────────────────────────

/**
 * Nominal → INTEGER SEN. null kalau bukan nominal yang sah.
 *
 * Memakai normalizeNominal lebih dulu supaya aturan bentuk (tanpa tanda minus,
 * maksimal 2 desimal, tanpa pemisah ribuan) hanya hidup di SATU tempat.
 *
 * Batas aman sengaja ikut dijaga: hasil di atas Number.MAX_SAFE_INTEGER
 * (± Rp 90 triliun) dikembalikan sebagai null, bukan dibulatkan diam-diam.
 * numeric(18,2) memang muat lebih besar dari itu, tapi angka sebesar itu pada
 * pembukuan UMKM jauh lebih mungkin salah ketik daripada nyata — dan kalau
 * memang nyata, ditolak dengan jelas lebih baik daripada kehilangan presisi
 * tanpa ada yang tahu.
 */
export function toMinorUnits(v: unknown): number | null {
  const norm = normalizeNominal(v)
  if (norm === null) return null
  const [int, frac] = norm.split('.')
  const minor = Number(int) * 100 + Number(frac)
  return Number.isSafeInteger(minor) ? minor : null
}

/** INTEGER SEN → string 2 desimal, bentuk yang sama dengan normalizeNominal. */
export function fromMinorUnits(minor: number): string {
  const neg = minor < 0
  const abs = Math.abs(Math.trunc(minor))
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  return neg ? `-${body}` : body
}

// ── Total & keseimbangan ─────────────────────────────────────

export type JournalTotals = {
  /** Total debit dalam SEN. */
  debit: number
  /** Total kredit dalam SEN. */
  kredit: number
  /** Selisih MUTLAK dalam SEN. 0 berarti seimbang. */
  selisih: number
  /** Sisi mana yang lebih besar; null kalau seimbang. */
  sisiLebih: 'debit' | 'kredit' | null
}

/**
 * Menjumlahkan baris dalam sen. SENGAJA PERMISIF: nominal yang belum terisi atau
 * belum sah dihitung 0, tidak melempar. Fungsi ini dipanggil setiap ketukan
 * tombol oleh panel selisih di form (A7) — di tengah pengetikan, "belum sah"
 * adalah keadaan normal, bukan kesalahan. Yang menolak input tidak sah adalah
 * validateJournalInput, sekali, di ujung.
 */
// Generik atas bentuk barisnya, bukan satu tipe baris tetap: pemanggilnya
// memberi baris LENGKAP (punya masterCoaId, keterangan, dsb) dan hanya dua field
// itu yang dibaca. Tanpa generik, TypeScript menolak properti berlebih pada
// object literal — dan form di A7 memang menyusun barisnya secara literal.
export function computeTotals<T extends { debit?: unknown; kredit?: unknown }>(
  lines: readonly T[] | null | undefined
): JournalTotals {
  let debit = 0
  let kredit = 0
  for (const l of lines ?? []) {
    debit += toMinorUnits(l?.debit) ?? 0
    kredit += toMinorUnits(l?.kredit) ?? 0
  }
  return {
    debit,
    kredit,
    selisih: Math.abs(debit - kredit),
    sisiLebih: debit === kredit ? null : debit > kredit ? 'debit' : 'kredit',
  }
}

/**
 * Σ debit === Σ kredit.
 *
 * HANYA soal kesamaan. Jurnal yang seluruh barisnya nol lolos di sini — dan itu
 * disengaja: "tiap baris wajib terisi di salah satu sisi" adalah aturan yang
 * berbeda, dan tempatnya di validateJournalInput supaya pesan galatnya bisa
 * menunjuk baris yang mana.
 */
export function isBalanced<T extends { debit?: unknown; kredit?: unknown }>(
  lines: readonly T[] | null | undefined
): boolean {
  return computeTotals(lines).selisih === 0
}

// ── Validasi ─────────────────────────────────────────────────

export type JournalLineInput = {
  masterCoaId?: unknown
  debit?: unknown
  kredit?: unknown
  keterangan?: unknown
}

export type JournalInput = {
  tanggal?: unknown
  noBukti?: unknown
  keterangan?: unknown
  lines?: unknown
}

/** Bentuk yang siap ditulis: nominal sudah string 2 desimal, keterangan sudah
 *  null kalau kosong, lineOrder sudah pasti berurutan dari 0. */
export type JournalLineValue = {
  masterCoaId: string
  debit: string
  kredit: string
  keterangan: string | null
  lineOrder: number
}

export type JournalValue = {
  tanggal: string
  /** null = memang tidak ada nomor bukti. Lihat catatan di validateJournalInput. */
  noBukti: string | null
  keterangan: string | null
  lines: JournalLineValue[]
}

/**
 * Label prosa untuk jurnal yang tidak punya nomor bukti.
 *
 * Dipakai di kalimat yang menyebut sebuah jurnal — pesan blokir 409 Master COA,
 * label aksesibilitas tombol. Di dalam SEL TABEL, konvensi repo ini tetap "—".
 * Satu tempat supaya kalimatnya tidak berbunyi "Jurnal null memakai akun 5-100".
 */
export const TANPA_NO_BUKTI = '(tanpa no. bukti)'

export type JournalCheck = { ok: true; value: JournalValue } | { ok: false; errors: string[] }

/**
 * Validasi satu jurnal beserta barisnya.
 *
 * MENGUMPULKAN SEMUA GALAT, tidak berhenti di yang pertama — beda dari
 * validateContract yang return begitu ketemu satu. Alasannya bentuk formulirnya:
 * jurnal punya N baris yang diisi sekaligus, dan memperbaiki satu baris per
 * kirim berarti akunting menekan Simpan lima kali untuk satu transaksi. Kontrak
 * hanya punya satu himpunan field, jadi galat pertama sudah cukup di sana.
 *
 * Urutan galat: header dulu, lalu per baris menurut urutannya, lalu
 * keseimbangan — sama dengan urutan baca formulir dari atas ke bawah.
 */
export function validateJournalInput(input: JournalInput): JournalCheck {
  const errors: string[] = []

  if (!isValidYmd(input.tanggal)) {
    errors.push('Tanggal tidak valid (format YYYY-MM-DD).')
  }

  // ══ NOMOR BUKTI & KETERANGAN OPSIONAL ═══════════════════════════════════
  // Keputusan Ricko 2026-09-16, sesudah uji klik CP-3. Banyak transaksi kecil
  // memang tidak punya nomor bukti, dan mewajibkannya cuma melahirkan nomor
  // karangan yang tidak menunjuk dokumen apa pun.
  //
  // Kosong dinormalkan jadi NULL, BUKAN ''. Ini bukan selera: `no_bukti` punya
  // batasan unik per klien, dan '' adalah satu nilai konkret — jurnal KEDUA
  // tanpa nomor bukti akan bentrok dengan yang pertama. Di Postgres, NULL tidak
  // pernah dianggap sama dengan NULL, jadi jurnal tanpa nomor bukti boleh
  // sebanyak apa pun sementara yang terisi tetap wajib unik.
  let noBukti: string | null = null
  if (typeof input.noBukti === 'string' && input.noBukti.trim() !== '') {
    noBukti = input.noBukti.trim()
    if (noBukti.length > NO_BUKTI_MAX) {
      errors.push(`Nomor bukti maksimal ${NO_BUKTI_MAX} karakter.`)
    }
  }

  let keterangan: string | null = null
  if (typeof input.keterangan === 'string' && input.keterangan.trim() !== '') {
    keterangan = input.keterangan.trim()
  }

  const rawLines: JournalLineInput[] = Array.isArray(input.lines) ? input.lines : []
  if (rawLines.length < MIN_LINES) {
    errors.push(`Jurnal minimal ${MIN_LINES} baris.`)
  }

  const lines: JournalLineValue[] = []
  rawLines.forEach((raw, i) => {
    const n = i + 1
    const l: JournalLineInput = raw ?? {}

    const masterCoaId = typeof l.masterCoaId === 'string' ? l.masterCoaId.trim() : ''
    if (!UUID_RE.test(masterCoaId)) {
      errors.push(`Baris ${n}: akun belum dipilih.`)
    }

    // Kosong (''/null/undefined) BUKAN galat — itu sisi yang memang tidak
    // dipakai baris ini. Yang galat adalah nilai terisi yang bentuknya salah.
    const debitKosong = l.debit === '' || l.debit === null || l.debit === undefined
    const kreditKosong = l.kredit === '' || l.kredit === null || l.kredit === undefined
    const debit = debitKosong ? 0 : toMinorUnits(l.debit)
    const kredit = kreditKosong ? 0 : toMinorUnits(l.kredit)

    if (debit === null) errors.push(`Baris ${n}: nominal debit tidak valid.`)
    if (kredit === null) errors.push(`Baris ${n}: nominal kredit tidak valid.`)

    if (debit !== null && kredit !== null) {
      if (debit > 0 && kredit > 0) {
        errors.push(`Baris ${n}: isi debit ATAU kredit, tidak keduanya.`)
      } else if (debit === 0 && kredit === 0) {
        errors.push(`Baris ${n}: nominal wajib diisi di salah satu sisi.`)
      }
    }

    const ketRaw = typeof l.keterangan === 'string' ? l.keterangan.trim() : ''
    lines.push({
      masterCoaId,
      debit: fromMinorUnits(debit ?? 0),
      kredit: fromMinorUnits(kredit ?? 0),
      keterangan: ketRaw === '' ? null : ketRaw,
      lineOrder: i,
    })
  })

  // Keseimbangan diperiksa dari nominal yang SUDAH dinormalkan, bukan dari input
  // mentah — supaya '1000' dan '1000.00' tidak pernah terbaca berbeda.
  const totals = computeTotals(lines)
  if (totals.selisih !== 0) {
    const sisi = totals.sisiLebih === 'debit' ? 'debit' : 'kredit'
    errors.push(
      `Total debit dan kredit tidak seimbang — selisih ${fromMinorUnits(totals.selisih)}, sisi ${sisi} lebih besar.`
    )
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { tanggal: input.tanggal as string, noBukti, keterangan, lines } }
}

// ── Riwayat perubahan (Fase 2, D12) ──────────────────────────

/**
 * Nama peristiwa yang ditulis ke `journal_events`.
 *
 * Kolomnya `text`, BUKAN enum (D12): daftarnya tumbuh tiap fase, dan enum
 * Postgres menuntut migrasi tiap kali bertambah — pola yang sama dengan
 * `users.currency_format`. Konstanta di sini yang menjadi daftar resminya.
 *
 * CATATAN R2 (belum diputuskan Ricko): revisi §3.3 mengusulkan tabelnya diganti
 * `audit_events` generik supaya COA dan kunci periode ikut memakainya. Sampai
 * itu diputuskan, Fase 2 memakai `journal_events` sesuai §8.5 — untung-ruginya
 * dibahas di CP-5.
 */
export const JOURNAL_EVENTS = [
  'created',
  'updated',
  'deleted',
  'posted',
  'reversal_created',
] as const
export type JournalEvent = (typeof JOURNAL_EVENTS)[number]

// ── Posting & jurnal balik (Fase 2, D13) ─────────────────────

/** Predikat gagal selalu membawa ALASAN — route mengembalikannya apa adanya. */
export type Verdict = { ok: true } | { ok: false; reason: string }

export interface PostableEntry {
  status: JournalStatus
  tanggal: string
  lines: readonly { debit?: unknown; kredit?: unknown }[]
}

/**
 * Boleh diposting?
 *
 * Tiga syarat, dan ketiganya diperiksa ulang DI SINI meski UI sudah
 * menyaringnya: daftar di layar bisa basi beberapa detik, dan posting adalah
 * pintu satu arah — sesudahnya jurnal hanya bisa dibalik, tidak diubah.
 *
 * `isLocked` dioper pemanggil supaya modul ini tetap murni. Fase 2 mengopernya
 * `() => false`; §7.B menggantinya dengan kunci periode yang sebenarnya, tanpa
 * menyentuh fungsi ini.
 */
export function canPost(
  entry: PostableEntry,
  { isLocked }: { isLocked: (tanggal: string) => boolean }
): Verdict {
  if (entry.status !== 'draft') {
    return {
      ok: false,
      reason: `Hanya jurnal draf yang bisa diposting; jurnal ini berstatus ${JOURNAL_STATUS_LABEL[entry.status] ?? entry.status}.`,
    }
  }
  if (entry.lines.length < MIN_LINES) {
    return { ok: false, reason: `Jurnal minimal ${MIN_LINES} baris.` }
  }
  const totals = computeTotals(entry.lines)
  if (totals.selisih !== 0) {
    return {
      ok: false,
      reason: `Debit dan kredit tidak seimbang — selisih ${fromMinorUnits(totals.selisih)}.`,
    }
  }
  if (isLocked(entry.tanggal)) {
    return { ok: false, reason: `Periode ${entry.tanggal} sudah dikunci.` }
  }
  return { ok: true }
}

/**
 * Boleh dibalik?
 *
 * Hanya jurnal TERPOSTING, dan hanya sekali. "Sudah dibalik" TIDAK disimpan
 * sebagai kolom (P3) — ia diturunkan dari ada-tidaknya pembalik yang sudah
 * terposting. Pembalik yang masih draf tidak menghitung: ia belum masuk buku
 * besar, jadi jurnalnya secara akuntansi belum terbalik.
 */
export function canReverse(
  entry: { status: JournalStatus },
  existingReversal: { status: JournalStatus } | null
): Verdict {
  if (entry.status !== 'posted') {
    return { ok: false, reason: 'Hanya jurnal terposting yang bisa dibalik.' }
  }
  if (existingReversal && existingReversal.status === 'posted') {
    return { ok: false, reason: 'Jurnal ini sudah pernah dibalik.' }
  }
  return { ok: true }
}

/**
 * Baris pembalik: sisi D dan K DITUKAR, sisanya dipertahankan apa adanya.
 *
 * Akun, keterangan, dan `line_order` sengaja tidak diubah supaya pembalik
 * terbaca berdampingan dengan aslinya baris demi baris. Yang ditukar hanya
 * nominalnya — itulah seluruh isi "membalik" dalam akuntansi.
 */
export function buildReversalLines(
  lines: readonly JournalLineValue[]
): JournalLineValue[] {
  return lines.map(l => ({
    masterCoaId: l.masterCoaId,
    debit: l.kredit,
    kredit: l.debit,
    keterangan: l.keterangan,
    lineOrder: l.lineOrder,
  }))
}

/**
 * Usulan nomor bukti untuk jurnal pembalik.
 *
 * Jurnal tanpa nomor bukti menghasilkan pembalik yang juga TANPA nomor bukti —
 * keputusan Ricko 2026-09-18. MP menyarankan `REV-<asli>`, tapi kalau aslinya
 * kosong, formula itu akan mengarang penanda yang tidak menunjuk dokumen apa
 * pun. Keterkaitan asli ↔ pembalik dijaga kolom `reversal_of_id`, bukan
 * konvensi penamaan; nomor bukti tetap milik dokumen fisik.
 *
 * Hanya USULAN untuk mengisi form — pengguna boleh menggantinya.
 */
export function defaultReversalNoBukti(asli: string | null): string | null {
  return asli === null ? null : `REV-${asli}`
}

// ── Immutabilitas ────────────────────────────────────────────

/**
 * Boleh diubah / dihapus?
 *
 * Hanya draf. Jurnal terposting adalah catatan yang sudah masuk buku besar:
 * koreksinya lewat JURNAL BALIK (Fase 2), bukan lewat mengubah yang lama.
 * Ditegakkan sejak Fase 1 meski posting belum ada, supaya tidak ada satu pun
 * jalur tulis yang lahir tanpa memanggilnya.
 */
export function canEditJournal(status: JournalStatus): boolean {
  return status === 'draft'
}
