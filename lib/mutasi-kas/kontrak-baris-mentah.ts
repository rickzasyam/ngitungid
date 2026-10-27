// KONTRAK data PDF rekening koran → grid mutasi kas (MP §5.G, X3/X4 → S2/S3).
// Dibuat 2026-10-27 untuk dua stream paralel (docs/HANDOFF.md).
//
// ══ HANYA DIUBAH ATAS PERSETUJUAN RICKO ════════════════════════════════════
// Stream B (PDF) MENGHASILKAN bentuk ini; Stream A (grid) MEMBACANYA. Mengubah
// satu sisi tanpa sisi lain = dua branch yang lolos test masing-masing tapi
// tidak bisa disatukan. Usulan perubahan lewat Ricko, bukan lewat commit.
//
// ══ TANPA INTERPRETASI ═════════════════════════════════════════════════════
// Semua sel adalah TEKS sebagaimana tercetak di PDF. Penyusun tabel (AI, X3)
// hanya memutuskan sel mana milik baris dan kolom mana. Yang TIDAK diputuskan
// di sini, dan tidak boleh diputuskan oleh Stream B:
//   - arah uang (masuk/keluar)  → S3 `tentukanArah` (kotak Arah, §5.G)
//   - tanggal & tahunnya        → S2 `parseTanggalCell` + `tetapkanTahun`
//   - nominal                   → S2 lewat `bacaNominal` (`lib/nominal.ts`)
//   - kelas baris (judul berulang, SALDO AWAL, TOTAL, lanjutan) → S2 `kelasBaris`
// Satu aturan untuk tempelan, CSV, dan PDF — tanpa parser khusus per bank.
// Karena itu tidak ada `number`, tidak ada `masuk`/`keluar`, dan tidak ada
// baris yang dibuang di kontrak ini: baris "SALDO AWAL" atau judul kolom yang
// tercetak ulang di halaman berikut tetap dikirim sebagai baris biasa.

/**
 * Nominal sebagaimana tercetak. Dua bentuk yang ditemui di rekening koran:
 * - `dua-kolom`: dua kolom nominal (mis. "Debet" & "Kredit", "Mutasi Debet" &
 *   "Mutasi Kredit"). Judulnya ikut dikirim apa adanya — TIDAK menentukan arah
 *   (template akuntan: Debet = masuk; rekening koran bank: Debet = keluar).
 *   Urutan `pertama`/`kedua` = urutan kiri-ke-kanan di halaman.
 * - `satu-kolom`: satu kolom nominal + penanda per baris (BCA: "DB"/"CR"),
 *   teks penandanya apa adanya, '' bila tidak tercetak di baris itu.
 */
export type NominalMentah =
  | {
      bentuk: 'dua-kolom'
      pertama: { judul: string; teks: string }
      kedua: { judul: string; teks: string }
    }
  | {
      bentuk: 'satu-kolom'
      judul: string
      teks: string
      penanda: string
    }

/** Satu baris tercetak. Sel kosong = '' (bukan null), supaya pembaca tidak bercabang. */
export type BarisMentah = {
  /** Nomor halaman PDF, mulai 1 — ditampilkan di kolom "Hal." (X5). */
  halaman: number
  tanggal: string
  uraian: string
  nominal: NominalMentah
  saldo: string
  /** Kolom tercetak lain (No. Ref, Cabang, Teller, …), urut kiri-ke-kanan. Dipetakan S2 lewat alias judul (mis. Reff → catatan). */
  lain: { judul: string; teks: string }[]
}

/** Jawaban `POST /api/cash-mutations/ekstrak-halaman` (X4) untuk SATU halaman. */
export type HalamanMentah = {
  halaman: number
  /** Judul kolom sebagaimana tercetak di halaman itu, kiri-ke-kanan. */
  kolom: string[]
  baris: BarisMentah[]
  /** Teks periode apa adanya (mis. "PERIODE : OKTOBER 2026"); biasanya hanya ada di halaman pertama. */
  periodeTeks: string | null
}
