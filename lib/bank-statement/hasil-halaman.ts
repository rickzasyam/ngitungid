import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// Jawaban `POST /api/cash-mutations/ekstrak-halaman` (X4) → keadaan SATU halaman
// di panel "Unggah PDF rekening koran" (X5). Murni, supaya aturan status →
// tampilan teruji tanpa browser.
//
// - 200 → halaman tersusun; model penyusunnya dari header (keputusan Ricko
//   2026-10-30 #1: disimpan per halaman).
// - 422 `inputManual` → "isi manual", BUKAN tombol ulangi: halaman itu sudah
//   diulang dengan model pengulang dan tetap ditolak (keputusan #1).
// - 429 (kuota) / 503 (fitur mati, penyedia belum dikonfigurasi) / 401 / 403 →
//   halaman berikutnya pasti gagal juga, jadi seluruh dokumen BERHENTI; halaman
//   ini tetap bisa diulang nanti.

export type HasilHalaman =
  | { halaman: number; status: 'ok'; data: HalamanMentah; model: string | null; diulang: boolean; dariGambar: boolean }
  | { halaman: number; status: 'manual'; pesan: string }
  | { halaman: number; status: 'gagal'; pesan: string; bisaUlang: boolean }

export type TafsiranJawaban = { hasil: HasilHalaman; henti: string | null }

const pesanDari = (body: unknown, cadangan: string): string =>
  typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : cadangan

/** Bentuk minimum `HalamanMentah` untuk halaman yang diminta — selebihnya dibaca S2 sebagai teks. */
function bentukHalaman(body: unknown, halaman: number): body is HalamanMentah {
  if (typeof body !== 'object' || body === null) return false
  const h = body as Partial<HalamanMentah>
  return h.halaman === halaman && Array.isArray(h.kolom) && Array.isArray(h.baris) && h.baris.every(b => b?.halaman === halaman)
}

export function tafsirJawaban(
  halaman: number,
  http: number,
  body: unknown,
  header: (nama: string) => string | null,
  dariGambar: boolean
): TafsiranJawaban {
  const gagal = (pesan: string, bisaUlang: boolean, henti: string | null = null): TafsiranJawaban => ({
    hasil: { halaman, status: 'gagal', pesan, bisaUlang },
    henti,
  })
  if (http === 200) {
    if (!bentukHalaman(body, halaman)) return gagal(`Jawaban server untuk halaman ${halaman} tidak terbaca — ulangi halaman ini.`, true)
    return {
      hasil: { halaman, status: 'ok', data: body, model: header('X-Model-Ekstraksi'), diulang: header('X-Ekstraksi-Diulang') === '1', dariGambar },
      henti: null,
    }
  }
  if (http === 422) {
    const manual = typeof body === 'object' && body !== null && (body as { inputManual?: unknown }).inputManual === true
    if (manual) return { hasil: { halaman, status: 'manual', pesan: pesanDari(body, `Halaman ${halaman} perlu diisi manual.`) }, henti: null }
    return gagal(pesanDari(body, `Halaman ${halaman} tidak bisa disusun dengan yakin — ulangi halaman ini.`), true)
  }
  if (http === 429 || http === 503 || http === 401 || http === 403) {
    const pesan = pesanDari(body, http === 429 ? 'Kuota penyedia AI habis.' : 'Ekstraksi tidak tersedia.')
    return gagal(pesan, true, pesan)
  }
  if (http === 400 || http === 413) return gagal(pesanDari(body, `Halaman ${halaman} tidak bisa dikirim.`), false)
  return gagal(pesanDari(body, `Halaman ${halaman} gagal diproses (HTTP ${http}) — ulangi halaman ini.`), true)
}

/** Halaman yang sudah tersusun, urut nomor halaman — masukan `rencanaPdf`. */
export function halamanTersusun(hasil: readonly HasilHalaman[]): HalamanMentah[] {
  return hasil
    .flatMap(h => (h.status === 'ok' ? [h.data] : []))
    .sort((a, b) => a.halaman - b.halaman)
}
