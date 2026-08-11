// Katalog JENIS USAHA klien. Murni (tanpa I/O, tanpa React).
//
// ══ KATALOGNYA DITURUNKAN, BUKAN DIDAFTARKAN ═══════════════════════════════
// `clients.type` adalah kolom `text` biasa: tanpa enum, tanpa FK, tanpa tabel
// katalog. Itu keputusan yang dipertahankan — tidak ada satu pun kode yang
// bercabang atas nilainya (semua pemakaian hanya merender teksnya), jadi tidak
// ada yang perlu dijamin oleh sebuah daftar tertutup.
//
// Konsekuensinya katalog picker diturunkan dari DATA: nilai distinct yang
// benar-benar dipakai klien. Efek sampingnya justru bagus — salah ketik
// SEMBUH SENDIRI. "Ritel" yang terlanjur tersimpan akan hilang dari daftar
// begitu klien itu diperbaiki, dan lenyap sama sekali saat tidak ada klien yang
// memakainya. Tidak ada baris yatim yang perlu dibersihkan, dan karena itu
// TIDAK ADA peringatan "tidak bisa dihapus" di UI-nya — beda dengan Layanan,
// yang memang tidak pernah bisa dihapus (FK RESTRICT + tanpa endpoint DELETE).
// Menyalin peringatan Layanan ke sini akan mengatakan sesuatu yang tidak benar.
//
// Daftar di bawah HANYA cadangan saat data belum bisa bicara (fetch gagal, atau
// belum ada klien sama sekali). Ia bukan sumber kebenaran, dan sengaja hidup di
// SATU tempat — sebelumnya array yang sama disalin di new-client-modal.tsx dan
// client-manage.tsx, dua salinan yang bisa menyimpang tanpa ada yang tahu.

/** Cadangan saat data kosong. BUKAN daftar yang mengikat. */
export const FALLBACK_CLIENT_TYPES: readonly string[] = [
  'E-commerce',
  'Jasa Kreatif',
  'Manufaktur',
  'Retail',
  'F&B',
  'Jasa',
]

/**
 * Isi dropdown Jenis Usaha.
 *
 * Nilai distinct dari data, di-trim, dibuang yang kosong, diurutkan menurut
 * kaidah bahasa Indonesia. Kalau hasilnya KOSONG — dan hanya kalau kosong —
 * dipakai FALLBACK_CLIENT_TYPES.
 *
 * Cadangan sengaja TIDAK digabung dengan data. Begitu ada satu klien pun,
 * daftar ini menjadi cerminan murni dari apa yang benar-benar dipakai; nilai
 * lain tetap bisa dimasukkan lewat baris aksi "+ Jenis Usaha Baru". Kalau
 * digabung, enam nilai bawaan akan ikut selamanya di setiap instalasi walau
 * tidak satu klien pun memakainya, dan daftar itu berhenti berarti apa-apa.
 */
export function clientTypeOptions(
  fromData: readonly (string | null | undefined)[]
): string[] {
  const set = new Set<string>()
  for (const v of fromData) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t !== '') set.add(t)
  }
  if (set.size === 0) return [...FALLBACK_CLIENT_TYPES]
  return [...set].sort((a, b) => a.localeCompare(b, 'id'))
}
