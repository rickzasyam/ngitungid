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
import { fmtTanggal } from '@/lib/ymd'

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
 * Dari mana jurnal lahir. 'manual' sejak Fase 1; 'pembelian' & 'mutasi_kas'
 * menyusul di migrasi 0016. Nilai berikutnya ('marketplace', 'kas_kecil',
 * 'opening_balance') ditambahkan per fase bersama ADD VALUE enum-nya.
 *
 * Urutannya mengikuti urutan fisik enum di Postgres — lihat catatan
 * journalSourceEnum di schema.ts.
 */
export const JOURNAL_SOURCE = ['manual', 'pembelian', 'mutasi_kas'] as const
export type JournalSource = (typeof JOURNAL_SOURCE)[number]

export const JOURNAL_SOURCE_LABEL: Record<JournalSource, string> = {
  manual: 'Manual',
  pembelian: 'Pembelian',
  mutasi_kas: 'Mutasi Kas',
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
 * maksimal 2 desimal, pemisah ribuan/desimal format Indonesia — lib/nominal.ts)
 * hanya hidup di SATU tempat. Form dan server memanggil fungsi ini juga, jadi
 * "1.500.000,25" yang terbaca di panel total adalah angka yang disimpan server.
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
  /**
   * Supplier yang dirujuk baris ini (F1, D41). HANYA sah pada baris yang
   * akunnya bertipe `liability`.
   *
   * Sesudah Modul 1, sebagian besar baris hutang lahir dari invoice yang sudah
   * membawa suppliernya sendiri. Kolom ini untuk jurnal MANUAL yang menyentuh
   * akun hutang di luar modul pembelian — dan gunanya bukan menghitung hutang,
   * melainkan MENJELASKAN SELISIH saat rekonsiliasi menemukan angka neraca
   * berbeda dari total per supplier.
   */
  supplierId?: unknown
}

export type JournalInput = {
  tanggal?: unknown
  noBukti?: unknown
  keterangan?: unknown
  lines?: unknown
  /**
   * Tipe akun per `master_coa_id`, dibaca pemanggil dari Master COA klien.
   *
   * ══ KENAPA DIOPER, BUKAN DIBACA DI SINI ═══════════════════════════════
   * Modul ini MURNI: ia tidak boleh menyentuh database. Aturan "supplier hanya
   * pada baris liability" butuh tahu tipe akunnya, dan satu-satunya yang tahu
   * adalah pemanggil yang memang sudah membaca COA untuk memeriksa kepemilikan
   * klien. Dioper sebagai peta, bukan dibaca ulang — dua pembacaan berarti dua
   * jawaban yang bisa berbeda di antara keduanya.
   *
   * Dihilangkan = aturan supplier tidak ditegakkan dan `supplierId` diabaikan.
   * Itu bentuk yang sengaja: pemanggil lama dan test lama tidak berubah sama
   * sekali, dan tidak ada jalur yang diam-diam mulai menerima supplier tanpa
   * pemeriksaan.
   */
  tipeAkunById?: Record<string, string | null | undefined>
}

/** Bentuk yang siap ditulis: nominal sudah string 2 desimal, keterangan sudah
 *  null kalau kosong, lineOrder sudah pasti berurutan dari 0. */
export type JournalLineValue = {
  masterCoaId: string
  debit: string
  kredit: string
  keterangan: string | null
  lineOrder: number
  /** null = baris ini tidak menunjuk supplier mana pun. */
  supplierId?: string | null
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

    // `undefined` = pemanggil tidak mengoper peta tipe akun sama sekali; aturan
    // supplier tidak ditegakkan. `null` = akunnya ADA tapi tipenya belum
    // disetel — itu BUKAN liability, jadi supplier di sana ditolak.
    const tipeAkun = input.tipeAkunById === undefined ? undefined : (input.tipeAkunById[masterCoaId] ?? null)

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

    // ══ SUPPLIER HANYA PADA BARIS LIABILITY (F1) ════════════════════════
    // Baris beban atau kas yang ditandai supplier akan muncul di daftar
    // penjelas rekonsiliasi sebagai "jurnal manual ke akun hutang" — padahal
    // ia tidak menyentuh hutang sama sekali. Selisih yang dijelaskan oleh
    // baris yang tidak relevan lebih buruk daripada selisih yang tidak
    // dijelaskan: yang pertama membuat orang berhenti mencari.
    //
    // Tanpa peta tipe akun (`tipeAkun === undefined`), supplierId DIABAIKAN —
    // bukan diterima tanpa pemeriksaan. Bentuk sebaliknya membuat pemanggil yang
    // lupa mengoper peta diam-diam menerima supplier di baris apa pun.
    let supplierId: string | null = null
    const supplierRaw = typeof l.supplierId === 'string' ? l.supplierId.trim() : ''
    if (supplierRaw !== '' && tipeAkun !== undefined) {
      if (!UUID_RE.test(supplierRaw)) {
        errors.push(`Baris ${n}: supplier tidak valid.`)
      } else if (tipeAkun !== 'liability') {
        errors.push(
          `Baris ${n}: supplier hanya bisa ditandai pada baris berakun hutang (liability).`
        )
      } else {
        supplierId = supplierRaw
      }
    }

    const ketRaw = typeof l.keterangan === 'string' ? l.keterangan.trim() : ''
    lines.push({
      masterCoaId,
      debit: fromMinorUnits(debit ?? 0),
      kredit: fromMinorUnits(kredit ?? 0),
      keterangan: ketRaw === '' ? null : ketRaw,
      lineOrder: i,
      supplierId,
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
 * Nama peristiwa jurnal yang ditulis ke `audit_events` (entity_type `journal`).
 *
 * Kolom `event` bertipe `text`, BUKAN enum (D12): daftarnya tumbuh tiap fase,
 * dan enum Postgres menuntut migrasi tiap kali bertambah — pola yang sama dengan
 * `users.currency_format`. Konstanta di sini yang menjadi daftar resminya.
 *
 * R2 DIAMBIL (Ricko, 2026-09-18): tabelnya `audit_events` generik, bukan
 * `journal_events`. Yang berubah cuma tempat menulisnya; daftar nama di bawah
 * tetap milik modul ini — lihat lib/audit.ts.
 *
 * ══ `deleted` TIDAK PERNAH BERTAHAN, DAN ITU BUKAN CACAT BARU ═════════════
 * Menghapus jurnal juga menghapus seluruh event-nya (kewajiban yang menggantikan
 * FK cascade, lihat purgeAuditEvents). Jadi event `deleted` untuk sebuah jurnal
 * akan ikut terhapus oleh penghapusan yang melahirkannya — karena itu DELETE
 * tidak menulisnya sama sekali, alih-alih menulis lalu membuangnya dalam batch
 * yang sama. Rancangan `journal_events` di §8.5 pun sudah begitu: `journal_id`
 * di sana ON DELETE CASCADE, jadi event `deleted` di sana juga tidak akan
 * pernah punya pembaca. Namanya dipertahankan di daftar ini untuk saat riwayat
 * penghapusan dibutuhkan — bentuknya nanti perlu tempat yang tidak ikut hilang
 * bersama barisnya (mis. entity_id NULL, yang CHECK hari ini justru melarang).
 */
export const JOURNAL_EVENTS = [
  'created',
  'updated',
  'deleted',
  'posted',
  'reversal_created',
] as const
export type JournalEvent = (typeof JOURNAL_EVENTS)[number]

/**
 * Label panel Riwayat.
 *
 * Record ber-key JournalEvent, jadi tsc yang menagih label untuk setiap nama
 * baru — bukan layar yang menampilkan 'reversal_created' mentah ke akunting.
 * Kolomnya di DB tetap text bebas, jadi pembacanya tetap harus punya jalan
 * keluar untuk nilai di luar daftar (lihat labelEvent).
 */
export const JOURNAL_EVENT_LABEL: Record<JournalEvent, string> = {
  created: 'Dibuat',
  updated: 'Diubah',
  deleted: 'Dihapus',
  posted: 'Diposting',
  reversal_created: 'Dibuatkan jurnal balik',
}

/** Label yang tidak pernah kosong — nilai tak dikenal ditampilkan apa adanya. */
export function labelEvent(event: string): string {
  return JOURNAL_EVENT_LABEL[event as JournalEvent] ?? event
}

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
    return { ok: false, reason: `Periode ${fmtTanggal(entry.tanggal)} sudah dikunci.` }
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
    // Supplier IKUT dicerminkan (F1). Pembalik tanpa supplier atas baris asli
    // yang bersupplier akan membelah pasangan itu ke dua kelompok penjelas
    // rekonsiliasi — padahal keduanya saling meniadakan.
    supplierId: l.supplierId ?? null,
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
 * Jurnal yang lahir dari MODUL, bukan diketik tangan di /jurnal.
 *
 * Daftarnya sengaja di sini, bukan di route: predikat canEditJournal yang
 * memakainya harus bisa diuji tanpa database, dan setiap sumber baru wajib
 * lewat satu tempat ini.
 */
export const SUMBER_MODUL: readonly string[] = ['pembelian', 'mutasi_kas']

/** Label dokumen asal, untuk tombol "Koreksi di …" di /jurnal (D32). */
export const SUMBER_MODUL_LABEL: Record<string, string> = {
  pembelian: 'Pembelian',
  mutasi_kas: 'Mutasi Kas',
}

export function isSumberModul(sumber: string | null | undefined): boolean {
  return typeof sumber === 'string' && SUMBER_MODUL.includes(sumber)
}

/**
 * Halaman dokumen asal per sumber — dipakai tombol "Koreksi di …" (D32).
 *
 * Hidup di sini, bukan di halaman /jurnal, karena alasan yang sama dengan
 * SUMBER_MODUL_LABEL: sumber baru wajib lewat SATU tempat. Bentuk lamanya
 * menulis `/pembelian?invoice=` langsung di JSX, dan tombol untuk sumber kedua
 * akan diam-diam menunjuk halaman pembelian dengan id mutasi.
 */
const SUMBER_MODUL_PATH: Record<string, (id: string) => string> = {
  pembelian: id => `/pembelian?invoice=${id}`,
  mutasi_kas: id => `/mutasi-kas?mutasi=${id}`,
}

/**
 * Tautan ke SATU jurnal di /jurnal (CP-20, Ricko 2026-10-29) — dipakai grid
 * mutasi kas untuk menautkan baris ke jurnal ringkasannya. /jurnal membaca
 * parameter yang sama (`PARAM_TAUTAN_JURNAL`), jadi bentuk tautannya satu tempat.
 */
export const PARAM_TAUTAN_JURNAL = 'jurnal'

export function hrefJurnal(id: string): string {
  return `/jurnal?${PARAM_TAUTAN_JURNAL}=${encodeURIComponent(id)}`
}

/** null = sumbernya bukan modul, atau dokumennya tidak ditemukan. */
export function sumberDokumenHref(
  sumber: string | null | undefined,
  dokumenId: string | null | undefined
): string | null {
  if (!isSumberModul(sumber) || !dokumenId) return null
  const bangun = SUMBER_MODUL_PATH[sumber as string]
  return bangun ? bangun(dokumenId) : null
}

/**
 * Boleh diubah / dihapus DARI /jurnal?
 *
 * Dua syarat, dan keduanya menutup jalan yang berbeda:
 *
 * 1. **Hanya draf.** Jurnal terposting adalah catatan yang sudah masuk buku
 *    besar: koreksinya lewat JURNAL BALIK, bukan mengubah yang lama.
 *    Ditegakkan sejak Fase 1 meski posting belum ada, supaya tidak ada satu
 *    pun jalur tulis yang lahir tanpa memanggilnya.
 *
 * 2. **Bukan jurnal bersumber modul** (D32). Jurnal pembelian & mutasi kas
 *    dimiliki dokumen asalnya; mengubahnya dari /jurnal berarti dua penulis
 *    untuk satu jurnal, dan yang kedua tidak pernah tahu dokumen asalnya
 *    berubah. Alternatifnya — sinkronisasi dua arah — adalah kelas bug yang
 *    tidak selesai-selesai.
 *
 * 3. **Sakelar "posting bisa diedit" per klien** (D42, bawaan FALSE). Bila
 *    menyala, jurnal terposting boleh diubah — TAPI kunci periode tetap
 *    mengalahkannya, dan jurnal yang sudah punya pembalik terposting tetap
 *    tidak boleh diubah (ia sudah dikoreksi lewat jalur lain; mengubahnya
 *    membuat pasangan asli↔pembalik tidak lagi berjumlah nol).
 *
 * URUTAN KEWENANGANNYA, dari yang paling mengikat:
 *   D32 (bersumber modul) → kunci periode → sudah dibalik → sakelar klien.
 *
 * Seluruh argumen sesudah `status` OPSIONAL supaya pemanggil lama tetap sah apa
 * adanya: tanpa mereka, fungsi ini berperilaku persis seperti sebelum D42 —
 * hanya draf yang boleh diubah.
 */
export function canEditJournal(
  status: JournalStatus,
  sumber?: string | null,
  opts?: {
    /** Setelan klien (D42). Bawaannya false — lihat lib/accounting-settings.ts. */
    bolehEditPosting?: boolean
    /** Kunci periode (§7.B). MENGALAHKAN sakelar di atas. */
    isLocked?: boolean
    /** Sudah punya pembalik TERPOSTING? */
    sudahDibalik?: boolean
  }
): boolean {
  if (isSumberModul(sumber)) return false
  if (status === 'draft') return true

  // Sejak sini: jurnal TERPOSTING. Tanpa D42 jawabannya selalu tidak.
  if (opts?.isLocked) return false
  if (opts?.sudahDibalik) return false
  return opts?.bolehEditPosting === true
}

/**
 * Apa yang boleh terjadi pada jurnal OTOMATIS milik dokumen modul (invoice
 * pembelian, mutasi kas) saat dokumennya diubah atau dihapus? Satu aturan untuk
 * kedua modul — keputusan Ricko 2026-10-26.
 *
 *   - `bebas`           — tanpa jurnal, atau masih draf: dibangun ulang/dihapus biasa.
 *   - `sudah-dibalik`   — terposting DAN dibalik: pasangan asli + pembalik adalah
 *                         riwayat buku besar, TIDAK disentuh; dokumennya dijurnal
 *                         ulang sebagai draf baru (hapus dokumen: jurnalnya tinggal).
 *   - `ubah-terposting` — terposting, efeknya hidup, setelan "posting bisa diedit"
 *                         menyala (D42): dibangun ulang DI TEMPAT, tetap terposting,
 *                         riwayatnya wajib `nilai_sebelum`/`nilai_sesudah` — sama
 *                         dengan jurnal manual (M8). Hanya MENGUBAH; menghapus tetap
 *                         ditolak, karena setelannya membuka perubahan, bukan
 *                         penghapusan angka yang sudah dilaporkan.
 *   - `terkunci`        — terposting, efeknya hidup, setelan mati: 409, arahkan ke
 *                         jurnal balik.
 *
 * "Dibalik" = rantai pembalik TERPOSTING (definisi `canReverse`) berpanjang
 * GANJIL. Genap = pembaliknya ikut dibalik, angka aslinya hidup lagi di buku
 * besar — membuka dokumennya di situ akan menghitung angka itu dua kali.
 */
export type NasibJurnalModul = 'bebas' | 'sudah-dibalik' | 'ubah-terposting' | 'terkunci'

export function nasibJurnalModul(
  jurnal: { status: string } | null,
  opts: { lapisPembalik: number; bolehEditPosting: boolean }
): NasibJurnalModul {
  if (jurnal === null || jurnal.status !== 'posted') return 'bebas'
  if (opts.lapisPembalik % 2 === 1) return 'sudah-dibalik'
  return opts.bolehEditPosting ? 'ubah-terposting' : 'terkunci'
}
