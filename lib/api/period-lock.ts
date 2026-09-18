// Kunci periode — BELUM ADA di Fase 2, tapi bentuk pemanggilannya sudah final.
//
// Master plan §7.B (Fase 4) membangun tabel `period_locks` dan predikat
// `isDateLocked`. Sampai itu ada, tidak ada satu pun periode yang terkunci.
//
// ══ KENAPA SEBUAH BERKAS UNTUK SATU `return () => false` ══════════════════
// Alternatifnya menulis `() => false` langsung di route posting. Itu terlihat
// lebih jujur hari ini dan menjadi jebakan besok: §7.B harus menemukan SETIAP
// tempat yang menuliskannya, dan yang terlewat akan meloloskan posting ke
// periode yang sudah dikunci — tanpa galat, tanpa jejak, hanya angka yang
// berubah di laporan yang sudah diserahkan ke klien.
//
// Fungsinya `async` dan menerima `clientId` meski keduanya belum dipakai: itu
// bentuk yang dibutuhkan §7.B (satu query per klien, hasilnya dipakai berkali-
// kali untuk beberapa tanggal). Kalau bentuknya baru diubah nanti, setiap
// pemanggil ikut berubah — dan perubahan yang menyentuh banyak berkas adalah
// perubahan yang lebih mungkin ada yang terlewat.
//
// canPost() sendiri sengaja MURNI dan menerima `isLocked` sebagai parameter,
// jadi aturannya tidak perlu tahu semua ini.

/**
 * Pemeriksa "tanggal ini di dalam periode terkunci?" untuk satu klien.
 *
 * Fase 2: selalu false. §7.B menggantinya dengan query `period_locks` —
 * hanya isi fungsi ini yang berubah, bukan pemanggilnya.
 */
export async function periodLockChecker(
  _clientId: string
): Promise<(tanggal: string) => boolean> {
  return () => false
}
