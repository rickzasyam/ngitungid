import { toMinorUnits } from '@/lib/journal'
import type { BarisMentah, HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// ══ PENGGANTI SEMENTARA S3 — HANYA UNTUK HARNESS UJI BANDING (X4) ═══════════
// Pemeriksa kesinambungan saldo yang dipakai harness selama `tentukanArah`
// milik Stream A (S3) belum ada di main. BUKAN jalur aplikasi: tidak dipakai
// route, komponen, atau grid (dikunci test pemindai sumber), dan tidak
// memutuskan arah untuk disimpan — ia hanya menjawab "apakah rantai saldo
// dokumen ini utuh dengan salah satu orientasi". Begitu S3 masuk main, harness
// memakai S3 lewat port `PemeriksaKesinambungan` dan berkas ini dihapus.
//
// Mengikuti kotak Arah §5.G: rantai diuji dengan KEDUA orientasi, judul kolom
// tidak pernah dipakai. Nominal dibaca dengan pembaca bersama (`toMinorUnits`
// → `bacaNominal`), bukan pembaca baru. Tanggal tidak dibaca sama sekali.

export type HasilKesinambungan = 'lolos' | 'putus' | 'tanpa-saldo'
export type PemeriksaKesinambungan = (halaman: HalamanMentah[]) => HasilKesinambungan

type Sen = number | null // null = sel kosong
const BUKAN_ANGKA = Symbol('bukan-angka')

function sen(teks: string): Sen | typeof BUKAN_ANGKA {
  if (teks.trim() === '') return null
  const v = toMinorUnits(teks)
  return v === null ? BUKAN_ANGKA : v
}

type BarisAngka = { pertama: number; kedua: number; penanda: boolean; saldo: Sen }

/**
 * Baris tanpa satu sel angka pun (judul berulang, lanjutan uraian) dilewati;
 * baris yang sebagian selnya angka dan sebagian tidak terbaca = rusak.
 */
function angka(r: BarisMentah): BarisAngka | 'lewati' | 'rusak' {
  const n = r.nominal
  const [a, b] = n.bentuk === 'satu-kolom' ? [sen(n.teks), null] : [sen(n.pertama.teks), sen(n.kedua.teks)]
  const saldo = sen(r.saldo)
  const semua = [a, b, saldo]
  if (!semua.some(x => typeof x === 'number')) return 'lewati'
  if (semua.some(x => x === BUKAN_ANGKA)) return 'rusak'
  return { pertama: (a as Sen) ?? 0, kedua: (b as Sen) ?? 0, penanda: n.bentuk === 'satu-kolom' && n.penanda.trim() !== '', saldo: saldo as Sen }
}

type Arah = (x: BarisAngka) => number

// Dua kolom: kolom mana yang uang masuk. Satu kolom: penanda berarti keluar atau masuk.
const ORIENTASI_DUA_KOLOM: Arah[] = [x => x.kedua - x.pertama, x => x.pertama - x.kedua]
const ORIENTASI_SATU_KOLOM: Arah[] = [x => (x.penanda ? -x.pertama : x.pertama), x => (x.penanda ? x.pertama : -x.pertama)]

function utuh(baris: BarisAngka[], arah: Arah): boolean {
  let saldo: number | null = null
  let tertunda = 0
  let dibandingkan = 0
  for (const x of baris) {
    tertunda += arah(x)
    if (x.saldo === null) continue
    if (saldo !== null) {
      if (saldo + tertunda !== x.saldo) return false
      dibandingkan++
    }
    saldo = x.saldo
    tertunda = 0
  }
  return dibandingkan > 0
}

export const kesinambunganSementara: PemeriksaKesinambungan = halaman => {
  const semua = halaman.flatMap(h => h.baris)
  const baris: BarisAngka[] = []
  for (const r of semua) {
    const x = angka(r)
    if (x === 'rusak') return 'putus'
    if (x !== 'lewati') baris.push(x)
  }
  if (!baris.some(x => x.saldo !== null)) return 'tanpa-saldo'
  const duaKolom = semua.some(r => r.nominal.bentuk === 'dua-kolom')
  return (duaKolom ? ORIENTASI_DUA_KOLOM : ORIENTASI_SATU_KOLOM).some(o => utuh(baris, o)) ? 'lolos' : 'putus'
}
