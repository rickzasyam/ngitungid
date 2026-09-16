import * as XLSX from 'xlsx'

// Export Master Supplier ke .xlsx. Pasangan langsung dari lib/supplier-import.ts,
// dan SENGAJA dibentuk mengikuti apa yang parser itu terima — bukan format yang
// "lebih rapi".
//
// ══ KONTRAK ROUND-TRIP ═══════════════════════════════════════════════════
// File hasil export WAJIB bisa di-import balik lewat parseSupplierWorkbook()
// tanpa satu pun suntingan, dan menghasilkan daftar supplier yang identik.
// Konsekuensinya bentuk file ini TIDAK boleh "dirapikan" sendiri:
//
//   1. Header memakai label kanonik yang ada di HEADER_ALIASES
//      (lib/supplier-import.ts): Nama Supplier / Kontak / NPWP /
//      Termin (Hari) / Kode Akun Hutang.
//   2. SEMUA sel ditulis sebagai STRING — alasan yang sama dengan export COA:
//      NPWP dan kode akun sering berbentuk angka berawalan nol, dan menulisnya
//      sebagai angka menghapus nol depan itu PERMANEN di file cadangan.
//      Termin ikut string; importer mengembalikannya ke integer.
//   3. Nilai null ditulis sebagai sel KOSONG, karena importer memetakan string
//      kosong → null. Menulis "-" atau "N/A" akan kembali sebagai teks literal.
//   4. Kolom akun menyimpan KODE akun, bukan id-nya. Id berubah setiap Master
//      COA diganti (DELETE-all + INSERT-all), jadi file cadangan yang menyimpan
//      id akan menunjuk akun yang sudah tidak ada. Kode bertahan lintas impor —
//      identitas yang sama yang dipakai buildReplacePlan.
//
// Kontraknya dikunci test round-trip di lib/supplier-export.test.ts.

/** Bentuk baris seperti tersimpan, dengan akun sudah di-resolve ke KODE. */
export interface SupplierExportRow {
  nama: string
  kontak: string | null
  npwp: string | null
  terminPembayaran: number | null
  /** KODE akun hutang default, bukan id. null = tidak dipasang. */
  akunHutangKode: string | null
}

/** Urutan & ejaan kolom. Setiap label di sini HARUS ada di HEADER_ALIASES. */
export const SUPPLIER_EXPORT_HEADERS = [
  'Nama Supplier',
  'Kontak',
  'NPWP',
  'Termin (Hari)',
  'Kode Akun Hutang',
] as const

export const SUPPLIER_EXPORT_SHEET_NAME = 'Master Supplier'

function toCells(r: SupplierExportRow): string[] {
  return [
    String(r.nama),
    r.kontak ?? '',
    r.npwp ?? '',
    r.terminPembayaran === null ? '' : String(r.terminPembayaran),
    r.akunHutangKode ?? '',
  ]
}

export function buildSupplierWorkbook(rows: SupplierExportRow[]): ArrayBuffer {
  const aoa: string[][] = [[...SUPPLIER_EXPORT_HEADERS], ...rows.map(toCells)]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [{ wch: 34 }, { wch: 26 }, { wch: 22 }, { wch: 12 }, { wch: 18 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, SUPPLIER_EXPORT_SHEET_NAME)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/**
 * Nama file: nama klien + tanggal, supaya cadangan dari klien berbeda tidak
 * tertukar di folder Download.
 *
 * Tanggalnya dirakit dari komponen tanggal LOKAL, bukan toISOString() — di WIB
 * ekspor sore hari akan berlabel tanggal kemarin kalau memakai UTC. Sama persis
 * dengan coaExportFilename.
 */
export function supplierExportFilename(clientName: string, date: Date = new Date()): string {
  const slug =
    clientName
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'Klien'
  const p = (n: number) => String(n).padStart(2, '0')
  const ymd = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
  return `Master-Supplier-${slug}-${ymd}.xlsx`
}
