import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { bacaSaldoSel, bacaUangSel, type Periode } from '@/lib/mutasi-draf'
import { rencanaPdf } from '@/lib/mutasi-grid-turunan'
import { barisRantaiDariSel, periksaKesinambungan, type BarisRantai, type TitikSaldoRantai } from '@/lib/saldo-berantai'

// Pemeriksa kesinambungan saldo HARNESS uji banding (X4/X6) — memakai jalur
// yang SAMA dengan grid: `rencanaPdf` (S2: gabung lintas halaman, kelas baris,
// SALDO AWAL tiap halaman jadi titik) lalu `periksaKesinambungan` (S3) dengan
// KEDUA orientasi, seperti `tentukanArah`. Menggantikan pemeriksa sementara
// Stream B (keputusan Ricko 2026-10-27 #2), yang dihapus.
//
// Ukurannya "lolos TANPA KOREKSI": sel angka yang tak terbaca (di grid: sel
// merah yang menahan Simpan) dihitung putus, walau S3 sendiri melewatinya.

export type HasilKesinambungan = 'lolos' | 'putus' | 'tanpa-saldo'
export type PemeriksaKesinambungan = (halaman: HalamanMentah[]) => HasilKesinambungan

// Tanggal tidak ikut rantai saldo; periode hanya syarat `bacaBlok` untuk menormalkan tanggal.
const PERIODE_NETRAL: Periode = { mulai: '2026-01-01', akhir: '2026-01-31' }

const tukar = (b: BarisRantai): BarisRantai => ({ ...b, masuk: b.keluar, keluar: b.masuk })

export const kesinambunganS3: PemeriksaKesinambungan = halaman => {
  const r = rencanaPdf(halaman, PERIODE_NETRAL)
  if (r.jenis !== 'blok') return 'putus'
  const sel = r.hasil.baris.map(b => b.sel)
  const takTerbaca = sel.some(
    s => bacaUangSel(s.masuk).status === 'galat' || bacaUangSel(s.keluar).status === 'galat' || (s.saldo.trim() !== '' && bacaSaldoSel(s.saldo).status === 'galat')
  )
  if (takTerbaca) return 'putus'
  const titik: TitikSaldoRantai[] = []
  for (const t of r.hasil.titikSaldo) {
    const s = bacaSaldoSel(t.saldo)
    if (s.status !== 'ok') return 'putus'
    titik.push({ setelah: t.setelah, saldo: s.minor })
  }
  const baris = sel.map(barisRantaiDariSel)
  if (!baris.some(b => b.saldo !== null) && titik.length === 0) return 'tanpa-saldo'
  const utuh = (rantai: BarisRantai[]) => {
    const h = periksaKesinambungan(rantai, null, titik)
    return h.utuh && h.terverifikasi > 0
  }
  return utuh(baris) || utuh(baris.map(tukar)) ? 'lolos' : 'putus'
}
