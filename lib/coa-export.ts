import * as XLSX from 'xlsx'

// Export Master COA ke .xlsx. Pasangan langsung dari lib/coa-import.ts, dan
// SENGAJA dibentuk mengikuti apa yang parser itu terima — bukan format yang
// "lebih rapi".
//
// KENAPA ADA: mengganti Master COA klien adalah operasi paling destruktif di
// app ini, dan sampai sekarang tidak ada cara mengambil snapshot isi yang
// terpasang SEBELUM menimpanya. Export inilah cadangan yang selama ini hilang
// dari operasi tersebut.
//
// ══ KONTRAK ROUND-TRIP ═══════════════════════════════════════════════════
// File hasil export WAJIB bisa di-import balik lewat parseCoaWorkbook() tanpa
// satu pun suntingan, dan menghasilkan Master COA yang identik. Konsekuensinya
// bentuk file ini TIDAK boleh "dirapikan" sendiri:
//
//   1. Header memakai label kanonik yang ada di HEADER_ALIASES
//      (lib/coa-import.ts): Kode / Nama Akun / Posisi / Kelompok /
//      Sub Kelompok / Class CF. Mengganti salah satunya dengan kata yang
//      terasa lebih enak (mis. "Akun Induk") memutus round-trip diam-diam —
//      importer hanya akan bilang "kolom wajib tidak ditemukan".
//   2. SEMUA sel ditulis sebagai STRING. Ini bukan detail gaya: kode akun
//      seperti "0001" atau "1101" kalau ditulis sebagai angka akan kembali
//      sebagai 1 dan 1101 — angka nol di depan hilang PERMANEN di file
//      cadangan, dan baru ketahuan saat cadangan itu dipakai.
//   3. classCf null ditulis sebagai sel kosong, karena importer memetakan
//      string kosong → null. Menulis "-" atau "N/A" akan kembali sebagai
//      teks literal, bukan null.
//   4. posisi ditulis apa adanya dari DB ('Debit'/'Kredit'). normalizePosisi()
//      di importer memetakan keduanya ke dirinya sendiri, jadi nilainya
//      stabil. Menulis singkatan 'D'/'K' juga akan ter-normalisasi balik
//      dengan benar, tapi menulis nilai tersimpan berarti file cadangan
//      terbaca sama persis dengan yang ada di layar.
//
// Kontraknya dikunci test round-trip di lib/coa-export.test.ts.

/** Bentuk baris seperti tersimpan di master_coa (tanpa id/timestamp). */
export interface CoaExportRow {
  kode: string
  nama: string
  posisi: string
  kelompok: string
  subKelompok: string
  classCf: string | null
}

/** Urutan & ejaan kolom. Setiap label di sini HARUS ada di HEADER_ALIASES. */
export const COA_EXPORT_HEADERS = [
  'Kode',
  'Nama Akun',
  'Posisi',
  'Kelompok',
  'Sub Kelompok',
  'Class CF',
] as const

/** Cocok dengan COA_SHEET_NAME_RE di importer, jadi sheet ini menang telak
 *  kalau suatu saat file-nya digabung ke workbook lain. */
export const COA_EXPORT_SHEET_NAME = 'Master COA'

/** Baris → array sel, semuanya string (lihat butir 2 di header file). */
function toCells(r: CoaExportRow): string[] {
  return [
    String(r.kode),
    String(r.nama),
    String(r.posisi),
    String(r.kelompok),
    String(r.subKelompok),
    r.classCf ?? '', // null → sel kosong → importer mengembalikannya jadi null
  ]
}

/** Workbook .xlsx siap kirim sebagai response body. */
export function buildCoaWorkbook(rows: CoaExportRow[]): ArrayBuffer {
  const aoa: string[][] = [[...COA_EXPORT_HEADERS], ...rows.map(toCells)]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // Lebar kolom sekadar keterbacaan saat dibuka manusia — tidak mempengaruhi
  // parsing sama sekali.
  sheet['!cols'] = [{ wch: 14 }, { wch: 44 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, COA_EXPORT_SHEET_NAME)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/**
 * Nama file: mengandung nama klien + tanggal, supaya beberapa cadangan dari
 * klien berbeda tidak saling tertukar di folder Download.
 *
 * Tanggalnya dirakit dari komponen tanggal LOKAL, bukan toISOString(): di WIB
 * ekspor sore hari akan berlabel tanggal kemarin kalau memakai UTC. Ini "cuma"
 * nama file, tapi kelas bug-nya persis yang pernah melempar periode Januari ke
 * Desember — tidak ada alasan mengulanginya di sini.
 */
export function coaExportFilename(clientName: string, date: Date = new Date()): string {
  const slug =
    clientName
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-') // spasi & tanda baca → strip
      .replace(/^-+|-+$/g, '') || 'Klien'
  const p = (n: number) => String(n).padStart(2, '0')
  const ymd = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
  return `Master-COA-${slug}-${ymd}.xlsx`
}
