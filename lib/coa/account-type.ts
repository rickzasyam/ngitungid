// Tipe akun Master COA. MURNI (tanpa I/O, tanpa React).
//
// ══ SATU KOLOM BARU, DUA YANG SUDAH ADA ═══════════════════════════════════
// PRD "Master COA Bertipe" meminta tiga hal: tipe akun, normal balance, dan
// klasifikasi arus kas. Dua di antaranya sudah tersimpan sejak migrasi pertama:
// `posisi` = normal balance, `class_cf` = klasifikasi arus kas. Modul ini
// menambahkan yang KETIGA (`tipe_akun`) dan MEMBACAKAN dua sisanya lewat
// normalBalanceOf/cashflowClassOf — supaya pemanggil punya satu pintu, tanpa
// ada satu pun fakta yang tersimpan dua kali (D14).
//
// ══ EKSPLISIT ?? TURUNAN ══════════════════════════════════════════════════
// `tipe_akun` boleh NULL, dan NULL berarti "belum dipilih manusia" — bukan
// "tidak punya tipe". Tipe yang berlaku selalu: yang eksplisit kalau ada, kalau
// tidak yang diturunkan dari kelompok/sub kelompok. Perbedaan antara keduanya
// dipertahankan dan ditampilkan (E4: eksplisit tebal, turunan redup), karena
// "dipilih akunting" dan "ditebak sistem" adalah dua hal yang berbeda kekuatan.
//
// ══ TURUNANNYA MEMAKAI ULANG classifyBs/classifyPnl ═══════════════════════
// Bukan aturan baru. Kedua fungsi itu sudah menentukan sebuah akun masuk sisi
// mana di Neraca dan kategori mana di Laba Rugi, dan seluruh Dashboard serta
// Analytics sudah berdiri di atasnya. Menulis klasifikasi kedua di sini berarti
// dua jawaban untuk pertanyaan yang sama — dan yang satu akan menyimpang tanpa
// ada yang tahu (P5, dengan alasan yang sama seperti larangan agregator kedua).

import { classifyBs, classifyPnl } from '@/lib/financial-agg'

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Aset',
  liability: 'Liabilitas',
  equity: 'Ekuitas',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

export function isAccountType(v: unknown): v is AccountType {
  return typeof v === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(v)
}

/** Bentuk minimum baris COA yang dibaca modul ini — bukan baris DB lengkap. */
export interface CoaTypeInput {
  nama: string
  posisi: string
  kelompok: string
  subKelompok: string
  classCf?: string | null
  tipeAkun?: AccountType | null
  isKas?: boolean | null
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim()

/**
 * Tipe akun yang DITURUNKAN dari kelompok & sub kelompok. `null` bila tidak
 * bisa ditentukan — dan itu keadaan yang sah, bukan kegagalan: baris judul,
 * baris subtotal, dan akun yang sub kelompoknya belum dirapikan memang tidak
 * punya tipe.
 *
 * ══ KELOMPOK DULU, BUKAN SUB KELOMPOK DULU ══════════════════════════════
 * Kata "tetap" muncul di KEDUA sisi: "Aktiva Tetap" (aset) dan "Fixed Cost /
 * Biaya Tetap" (beban). Yang membedakannya hanya kelompoknya. Kalau sub
 * kelompok diperiksa lebih dulu tanpa melihat kelompok, seluruh Aktiva Tetap
 * sebuah klien bisa terbaca sebagai beban — dan angkanya pindah dari Neraca ke
 * Laba Rugi tanpa satu pun galat.
 */
export function deriveAccountType(row: CoaTypeInput): AccountType | null {
  const kelompok = norm(row.kelompok)

  if (kelompok.includes('neraca') || kelompok.includes('balance')) {
    switch (classifyBs(row.subKelompok)) {
      case 'aktivaLancar':
      case 'aktivaTetap':
      case 'aktivaTidakBerwujud':
      case 'aktivaLainnya':
        return 'asset'
      case 'hutang':
        return 'liability'
      case 'modal':
        return 'equity'
      default:
        return null
    }
  }

  if (kelompok.includes('laba') || kelompok.includes('rugi') || kelompok.includes('profit')) {
    switch (classifyPnl(row.subKelompok)) {
      case 'revenue':
        return 'revenue'
      // 'lainLain' = "Pendapatan dan Biaya Lain-lain" — SATU sub kelompok yang
      // memuat dua arah sekaligus, jadi kelompoknya tidak bisa memutuskan.
      // Di sinilah `posisi` menjadi pemutus yang sah: ia satu-satunya keterangan
      // per-akun yang tersisa, dan untuk pos lain-lain ia memang dapat
      // dipercaya (pendapatan bunga bersaldo kredit, beban administrasi bank
      // bersaldo debit). Ini TIDAK berlaku untuk akun kontra — lihat catatan di
      // bawah — karena di sana posisi justru terbalik dari tipenya.
      case 'lainLain':
        return isKreditPosition(row.posisi) ? 'revenue' : 'expense'
      case 'hpp':
      case 'varCost':
      case 'fixedCost':
      case 'pajak':
        return 'expense'
      default:
        return null
    }
  }

  return null
}

/**
 * Sisi kredit menurut `posisi`. Mengenali awalan **k** (Kredit/K) MAUPUN **c**
 * (Credit/Cr) — alasan yang sama persis dengan normalSign di lib/ledger.ts:
 * importer COA menormalkan keduanya, tapi form baris COA menyimpan apa yang
 * diketik, dan salah baca di sini tidak melempar — ia diam-diam membalik tipe
 * sebuah akun.
 */
function isKreditPosition(posisi: string): boolean {
  const p = norm(posisi)
  return p.startsWith('k') || p.startsWith('c')
}

/**
 * Tipe yang BERLAKU: eksplisit kalau ada, kalau tidak turunannya.
 *
 * ══ AKUN KONTRA MEMBUKTIKAN KENAPA `posisi` BUKAN SUMBER TIPE ════════════
 * "Akumulasi Penyusutan" bersaldo normal KREDIT tapi tipenya tetap **asset**
 * (kontra-aset yang mengurangi aset di neraca). Begitu pula "Prive" — bersaldo
 * DEBIT tapi tipenya **equity**. Kalau tipe diturunkan dari `posisi`, kedua
 * akun itu akan pindah sisi neraca dan identitas Aktiva = Pasiva pecah. Karena
 * itu turunannya memakai kelompok/sub kelompok, dan `posisi` hanya jadi
 * pemutus pada satu kasus yang memang ambigu (pos lain-lain di Laba Rugi).
 */
export function resolveAccountType(row: CoaTypeInput): AccountType | null {
  return row.tipeAkun ?? deriveAccountType(row)
}

/**
 * Tebakan "ini akun kas/bank" — **predikat yang sama persis** dengan yang
 * dipakai `aggregateBalanceSheet` untuk baris "Kas & Setara Kas": aktiva lancar
 * DAN namanya memuat 'kas' atau 'bank'.
 *
 * Disalin sengaja alih-alih diimpor: yang di `financial-agg` bekerja atas
 * `AggLine` (baris LAPORAN), yang di sini atas baris MASTER COA. Menyatukan
 * keduanya berarti satu dari dua pemanggil harus memalsukan bentuk barisnya.
 * Yang wajib dijaga adalah **jawabannya tetap sama** — dikunci test.
 */
export function deriveIsKas(row: CoaTypeInput): boolean {
  if (classifyBs(row.subKelompok) !== 'aktivaLancar') return false
  const n = norm(row.nama)
  return n.includes('kas') || n.includes('bank')
}

/**
 * Nilai `is_kas` yang BERLAKU.
 *
 * Beda dari resolveAccountType: kolomnya NOT NULL default false, jadi `false`
 * yang tersimpan tidak bisa dibedakan dari "belum pernah disetel". Karena itu
 * `false` TIDAK menimpa turunannya — turunan yang positif tetap menang.
 * Konsekuensinya disadari: akunting yang sengaja mematikan `is_kas` pada akun
 * bernama "Kas Bon Karyawan" (piutang, bukan kas) tidak bisa melakukannya lewat
 * kolom ini sampai §5.E memberinya penanda eksplisit. Yang dipilih di sini:
 * akun kas yang TERLEWAT lebih berbahaya daripada akun yang salah ikut, karena
 * yang terlewat membuat mutasi kasnya tidak pernah muncul di mana pun.
 */
export function resolveIsKas(row: CoaTypeInput): boolean {
  return row.isKas === true || deriveIsKas(row)
}

/** Normal balance — MEMBACA `posisi` yang sudah ada, tanpa kolom baru (D14). */
export function normalBalanceOf(row: CoaTypeInput): string {
  return row.posisi
}

/** Klasifikasi arus kas — MEMBACA `class_cf` yang sudah ada (D14). */
export function cashflowClassOf(row: CoaTypeInput): string | null {
  return row.classCf ?? null
}

export interface TypeDiff<T extends CoaTypeInput> {
  row: T
  eksplisit: AccountType
  turunan: AccountType | null
}

/**
 * Akun yang tipe eksplisitnya BERBEDA dari turunannya — bahan pratinjau dampak
 * (E4) dan peringatan klasifikasi.
 *
 * Perbedaan BUKAN galat: akunting berhak menimpa tebakan sistem, dan justru
 * itulah gunanya kolom eksplisit. Yang berbahaya adalah perbedaan yang tidak
 * ada yang melihat — mis. akun yang dulu ditandai `revenue` lalu sub
 * kelompoknya dipindah ke Beban saat impor berikutnya. Baris eksplisitnya tetap
 * menang diam-diam, dan laporan berubah tanpa ada yang menyentuh akun itu.
 *
 * Akun yang turunannya `null` IKUT dilaporkan (sebagai `turunan: null`): "tidak
 * bisa diturunkan" adalah perbedaan yang sama layak dilihatnya — ia menandai
 * sub kelompok yang belum dikenali.
 */
export function explicitVsDerivedDiff<T extends CoaTypeInput>(rows: readonly T[]): TypeDiff<T>[] {
  const out: TypeDiff<T>[] = []
  for (const row of rows) {
    if (!row.tipeAkun) continue
    const turunan = deriveAccountType(row)
    if (turunan !== row.tipeAkun) out.push({ row, eksplisit: row.tipeAkun, turunan })
  }
  return out
}
