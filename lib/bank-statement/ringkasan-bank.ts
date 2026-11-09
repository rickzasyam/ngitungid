import { toMinorUnits } from '@/lib/journal'
import { bacaSaldoSel, type HasilBacaBlok } from '@/lib/mutasi-draf'
import { barisRantaiDariSel, tentukanArah } from '@/lib/saldo-berantai'

// BLOK RINGKASAN yang dicetak bank sesudah transaksi terakhir — BCA:
//     SALDO AWAL    :    5,000,000.00
//     MUTASI CR     :   12,000,000.00     10
//     MUTASI DB     :   14,030,000.00     39
//     SALDO AKHIR   :    2,970,000.00
// Dua pemakai, SATU pengenal label:
//  - penjaga cakupan X3 (`susun-tabel.ts`) mengecualikan baris berlabel ringkasan
//    dari aturan (b) — tanpa ini halaman terakhir e-statement BCA selalu ditolak
//    (uji X6, 2026-11-09); transaksi yang dibuang AI tetap tertangkap karena
//    barisnya tidak berlabel ringkasan;
//  - panel PDF (X5) membaca ANGKANYA dengan kode (bukan AI) lalu membandingkannya
//    dengan hasil ekstraksi: pemeriksa kedua di samping rantai saldo.
// Label dicocokkan tanpa peduli huruf besar/kecil dan spasi ("SALD O AWAL" =
// "saldo awal"), dan harus SAMA PERSIS dengan daftar — baris transaksi
// ("01/01 SALDO AWAL 5,000,000.00") tidak pernah dianggap ringkasan.
// Tanpa ekspresi reguler (D22).

export type JenisRingkasan = 'saldoAwal' | 'saldoAkhir' | 'masuk' | 'keluar' | 'totalMutasi'

const LABEL: Readonly<Record<string, JenisRingkasan>> = {
  SALDOAWAL: 'saldoAwal',
  OPENINGBALANCE: 'saldoAwal',
  SALDOAKHIR: 'saldoAkhir',
  CLOSINGBALANCE: 'saldoAkhir',
  // Sudut pandang BANK: CR/Kredit = uang MASUK ke rekening, DB/Debet = KELUAR.
  MUTASICR: 'masuk',
  MUTASIKREDIT: 'masuk',
  MUTASICREDIT: 'masuk',
  TOTALMUTASICR: 'masuk',
  TOTALMUTASIKREDIT: 'masuk',
  MUTASIDB: 'keluar',
  MUTASIDEBET: 'keluar',
  MUTASIDEBIT: 'keluar',
  TOTALMUTASIDB: 'keluar',
  TOTALMUTASIDEBET: 'keluar',
  TOTALMUTASI: 'totalMutasi',
}

const token = (s: string) => s.split(' ').filter(t => t !== '')
const berangka = (t: string) => [...t].some(c => c >= '0' && c <= '9')

/** Label baris (sebelum ':' — atau token awal tanpa angka) + sisanya, atau null. */
function belah(baris: string): { kunci: string; sisa: string[] } | null {
  const titikDua = baris.indexOf(':')
  if (titikDua >= 0) return { kunci: token(baris.slice(0, titikDua)).join('').toUpperCase(), sisa: token(baris.slice(titikDua + 1)) }
  const t = token(baris)
  const n = t.findIndex(berangka)
  if (n <= 0) return null
  return { kunci: t.slice(0, n).join('').toUpperCase(), sisa: t.slice(n) }
}

/** Jenis baris ringkasan bank, atau null bila baris ini bukan ringkasan. */
export function labelRingkasan(baris: string): JenisRingkasan | null {
  const b = belah(baris)
  return b ? (LABEL[b.kunci] ?? null) : null
}

export type MutasiRingkasan = { total: number; jumlah: number | null }
export type RingkasanBank = {
  saldoAwal: number | null
  saldoAkhir: number | null
  masuk: MutasiRingkasan | null
  keluar: MutasiRingkasan | null
  /** Teks saldo awal apa adanya — untuk mengisi "Saldo awal rekening koran". */
  saldoAwalTeks: string | null
}

const bilanganBulat = (t: string) => t !== '' && [...t].every(c => c >= '0' && c <= '9')

/**
 * Angka blok ringkasan dari baris tercetak satu halaman (biasanya halaman
 * terakhir), dibaca KODE. Nominal = token pertama yang terbaca sebagai uang
 * dan berpemisah ('.' atau ','); jumlah transaksi = bilangan bulat sesudahnya.
 * null bila halaman ini tidak memuat ringkasan.
 */
export function bacaRingkasanBank(baris: readonly string[]): RingkasanBank | null {
  const r: RingkasanBank = { saldoAwal: null, saldoAkhir: null, masuk: null, keluar: null, saldoAwalTeks: null }
  let ada = false
  for (const g of baris) {
    const b = belah(g)
    const jenis = b ? LABEL[b.kunci] : undefined
    if (!b || !jenis || jenis === 'totalMutasi') continue
    const i = b.sisa.findIndex(t => (t.includes('.') || t.includes(',')) && toMinorUnits(t) !== null)
    if (i < 0) continue
    const sen = toMinorUnits(b.sisa[i]) as number
    ada = true
    if (jenis === 'saldoAwal') {
      r.saldoAwal = sen
      r.saldoAwalTeks = b.sisa[i]
    } else if (jenis === 'saldoAkhir') r.saldoAkhir = sen
    else {
      const jumlah = b.sisa[i + 1] !== undefined && bilanganBulat(b.sisa[i + 1]) ? Number(b.sisa[i + 1]) : null
      r[jenis] = { total: sen, jumlah }
    }
  }
  return ada ? r : null
}

export type BarisBanding = {
  label: string
  jenis: 'jumlah' | 'uang'
  bank: number
  /** null = tidak bisa dihitung dari hasil ekstraksi (mis. tanpa baris SALDO AWAL). */
  ekstraksi: number | null
  cocok: boolean
}

/**
 * Bandingkan ringkasan bank dengan blok hasil ekstraksi — arah blok diputuskan
 * PERSIS seperti saat masuk grid (`tentukanArah`, S3), lalu dihitung jumlah &
 * total uang masuk/keluar, saldo awal (baris SALDO AWAL blok) dan saldo akhir
 * (saldo tercetak terakhir).
 */
export function bandingkanRingkasan(r: RingkasanBank, hasil: Extract<HasilBacaBlok, { ok: true }>): BarisBanding[] {
  const titik = hasil.titikSaldo.flatMap(t => {
    const s = bacaSaldoSel(t.saldo)
    return s.status === 'ok' ? [{ setelah: t.setelah, saldo: s.minor }] : []
  })
  const rantai = hasil.baris.map(b => ({ ...barisRantaiDariSel(b.sel), penanda: b.penanda }))
  const arah = tentukanArah({ baris: rantai, titik })
  const tukar = (arah.arah ?? arah.usulan) === 'tukar'
  let jMasuk = 0
  let jKeluar = 0
  let tMasuk = 0
  let tKeluar = 0
  let saldoAkhir: number | null = null
  // Tanpa baris SALDO AWAL: saldo awal diturunkan dari saldo tercetak PERTAMA
  // dikurangi mutasi sampai baris itu — tetap bisa dibandingkan dengan bank.
  let bersih = 0
  let awalTurunan: number | null = null
  for (const b of rantai) {
    const masuk = (tukar ? b.keluar : b.masuk) ?? 0
    const keluar = (tukar ? b.masuk : b.keluar) ?? 0
    if (masuk > 0) {
      jMasuk++
      tMasuk += masuk
    }
    if (keluar > 0) {
      jKeluar++
      tKeluar += keluar
    }
    bersih += masuk - keluar
    if (b.saldo !== null) {
      saldoAkhir = b.saldo
      if (awalTurunan === null) awalTurunan = b.saldo - bersih
    }
  }
  const saldoAwal = titik.find(t => t.setelah === 0)?.saldo ?? awalTurunan
  const out: BarisBanding[] = []
  const tambah = (label: string, jenis: BarisBanding['jenis'], bank: number | null | undefined, ekstraksi: number | null) => {
    if (bank === null || bank === undefined) return
    out.push({ label, jenis, bank, ekstraksi, cocok: ekstraksi === bank })
  }
  tambah('Jumlah transaksi masuk', 'jumlah', r.masuk?.jumlah, jMasuk)
  tambah('Jumlah transaksi keluar', 'jumlah', r.keluar?.jumlah, jKeluar)
  tambah('Total masuk', 'uang', r.masuk?.total, tMasuk)
  tambah('Total keluar', 'uang', r.keluar?.total, tKeluar)
  tambah('Saldo awal', 'uang', r.saldoAwal, saldoAwal)
  tambah('Saldo akhir', 'uang', r.saldoAkhir, saldoAkhir)
  return out
}
