// Setelan pembukuan per klien. MURNI (tanpa I/O, tanpa React).
//
// ══ SATU FUNGSI, DAN IA MENJAGA SEBUAH KEPUTUSAN ══════════════════════════
// Modul ini kecil dengan sengaja. Isinya predikat yang menjawab satu
// pertanyaan — "boleh kah jurnal terposting diubah untuk klien ini?" — dan
// jawaban bawaannya adalah TIDAK (D42, keputusan Ricko 2026-09-20: angka yang
// sudah diserahkan ke klien tidak boleh berubah diam-diam).
//
// ══ KETIADAAN BARIS = FALSE, DAN ITU KEADAAN YANG PALING SERING ═══════════
// `client_accounting_settings` diisi LAZILY: barisnya baru lahir saat seseorang
// menyetel sesuatu. Jadi `null` bukan kasus pinggiran — ia jawaban untuk
// mayoritas klien.
//
// Bentuk yang SALAH dan gampang tertulis:
//
//     settings?.postingBisaDiedit ?? true     // ❌ "belum disetel" = "boleh"
//
// Itu membalik keputusan Ricko untuk hampir semua klien sekaligus, dan tidak
// ada yang akan menyadarinya sampai ada jurnal terposting yang berubah. Karena
// itu predikatnya berbentuk perbandingan eksplisit terhadap `true`, dan testnya
// menguji TIGA keadaan: baris tidak ada · `false` · `true`.

export type AccountingSettingsLike = {
  postingBisaDiedit?: boolean | null
  akunPpnMasukanId?: string | null
} | null | undefined

/**
 * Boleh-kah jurnal TERPOSTING diubah untuk klien ini?
 *
 * Bawaan `false`. Hanya `true` yang tersimpan eksplisit yang membukanya —
 * `null`, `undefined`, dan baris yang belum pernah ada semuanya berarti TIDAK.
 */
export function bolehEditPosting(settings: AccountingSettingsLike): boolean {
  return settings?.postingBisaDiedit === true
}

/**
 * Akun PPN Masukan yang berlaku, atau `null` bila belum disetel.
 *
 * `null` di sini BUKAN nilai bawaan yang aman untuk dipakai — ia berarti route
 * pembelian harus MENOLAK invoice ber-PPN dengan pesan yang mengarahkan ke
 * Settings (D33). Menebak akun PPN adalah kesalahan yang baru ketahuan saat
 * SPT, dan saat itu jurnalnya sudah berbulan-bulan.
 */
export function akunPpnMasukan(settings: AccountingSettingsLike): string | null {
  return settings?.akunPpnMasukanId ?? null
}

/**
 * Jurnal terposting ini pernah diubah SESUDAH diposting?
 *
 * Diturunkan dari riwayat: ada event `updated` yang waktunya SESUDAH event
 * `posted` terakhir. Tidak disimpan sebagai kolom (P3) — ia pertanyaan yang
 * dijawab `audit_events` sendiri.
 *
 * Ini mitigasi (c) dari D42: pembaca buku besar berhak tahu bahwa sebuah angka
 * pernah berbeda, tanpa harus membuka panel riwayat lebih dulu.
 */
export function diubahSetelahPosting(
  events: readonly { event: string; at: string | Date }[] | null | undefined
): boolean {
  let posted: number | null = null
  for (const e of events ?? []) {
    if (e.event !== 'posted') continue
    const t = new Date(e.at).getTime()
    if (Number.isNaN(t)) continue
    if (posted === null || t > posted) posted = t
  }
  if (posted === null) return false

  for (const e of events ?? []) {
    if (e.event !== 'updated') continue
    const t = new Date(e.at).getTime()
    if (!Number.isNaN(t) && t > posted) return true
  }
  return false
}
