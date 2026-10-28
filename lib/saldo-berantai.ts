// Kesinambungan saldo rekening koran (MP §5.G S3, D50, D61). MURNI, tanpa
// RegExp, tanpa float — seluruh hitungan dalam SEN BULAT (P1).
//
// ══ PEMBANDING, BUKAN SALDO BUKU ═════════════════════════════════════════
// Saldo di sini adalah angka yang DICETAK BANK (`cash_mutations.saldo`, fakta
// dokumen). Modul ini hanya memeriksa bahwa angka-angka itu berantai:
//   saldo baris bersaldo = saldo bersaldo sebelumnya + Σ(masuk − keluar) di antaranya.
// Tidak ada yang disimpan dari sini (P3/P4), dan saldo buku tetap datang dari
// buku besar.
//
// ══ PUTUS MENAHAN SIMPAN (D50) ═══════════════════════════════════════════
// Rantai yang putus adalah pengaman utama terhadap salah baca AI dan arah yang
// terbalik — di 10.000 baris, peringatan yang bisa diabaikan tidak menjaga apa
// pun. Jalan keluar yang jujur bila rekening korannya sendiri tidak konsisten:
// kosongkan sel Saldo baris itu (terlihat & tercatat, D50) — rantainya lalu
// diperiksa antar baris yang masih bersaldo.
//
// ══ JANGKAR (D61) ════════════════════════════════════════════════════════
// Urutan sumber jangkar diputuskan PEMANGGIL: baris SALDO AWAL di blok → saldo
// baris tersimpan sebelum rentang (S8) → isian "saldo awal rekening koran" di
// bilah grid. Tanpa jangkar, baris bersaldo pertama TIDAK terverifikasi — dan
// itu dilaporkan (`pertamaTanpaJangkar`), bukan disembunyikan.

import { bacaSaldoSel, bacaUangSel, type Arah, type SelDraf } from '@/lib/mutasi-draf'

/** Satu baris rantai dalam SEN. `null` pada masuk/keluar = nominal tak terbaca. */
export type BarisRantai = {
  masuk: number | null
  keluar: number | null
  /** Saldo tercetak; null = baris tanpa saldo (atau saldonya dikosongkan). */
  saldo: number | null
}

/** Saldo dari baris kelas `saldo` di tengah blok (SALDO AWAL halaman berikut). */
export type TitikSaldoRantai = {
  /** Jumlah baris SEBELUM titik ini. 0 = jangkar awal. */
  setelah: number
  saldo: number
}

export type Putus = {
  /** Indeks baris yang saldonya tidak cocok; untuk titik: posisi `setelah`. */
  indeks: number
  jenis: 'baris' | 'titik'
  /** Saldo menurut rantai (SEN). */
  diharapkan: number
  /** Saldo tercetak (SEN). */
  tercetak: number
  /** tercetak − diharapkan (SEN). */
  selisih: number
}

export type HasilRantai = {
  utuh: boolean
  /** Putus PERTAMA — yang ditampilkan di banner. null bila utuh. */
  putus: Putus | null
  /** Semua putus; rantai disinkronkan ulang ke saldo tercetak sesudah tiap putus. */
  semuaPutus: Putus[]
  /** Jumlah titik saldo yang benar-benar terverifikasi (punya pembanding sebelumnya). */
  terverifikasi: number
  /** Baris bersaldo pertama tidak bisa diverifikasi karena tidak ada jangkar. */
  pertamaTanpaJangkar: boolean
}

/**
 * Periksa rantai saldo sederet baris (urutan baku grid: tanggal, created_at,
 * urutan, id — urutan yang SAMA dengan tampilan).
 *
 * Baris yang nominalnya tak terbaca memutus pengetahuan kita tentang saldo
 * berjalan: rantai berhenti di situ dan bersambung lagi dari baris bersaldo
 * berikutnya — supaya satu sel merah tidak sekaligus dilaporkan sebagai putus
 * di setiap baris sesudahnya.
 */
export function periksaKesinambungan(
  baris: readonly BarisRantai[],
  saldoJangkar: number | null = null,
  titik: readonly TitikSaldoRantai[] = []
): HasilRantai {
  const semuaPutus: Putus[] = []
  let terverifikasi = 0
  let pertamaTanpaJangkar = false
  let adaSaldo = false
  let jalan: number | null = saldoJangkar

  const titikPer = new Map<number, number[]>()
  for (const t of titik) titikPer.set(t.setelah, [...(titikPer.get(t.setelah) ?? []), t.saldo])

  const periksaTitik = (posisi: number) => {
    for (const s of titikPer.get(posisi) ?? []) {
      adaSaldo = true
      if (jalan !== null) {
        terverifikasi++
        if (jalan !== s) {
          semuaPutus.push({ indeks: posisi, jenis: 'titik', diharapkan: jalan, tercetak: s, selisih: s - jalan })
        }
      }
      jalan = s
    }
  }

  for (let i = 0; i < baris.length; i++) {
    periksaTitik(i)
    const b = baris[i]
    if (jalan !== null) {
      if (b.masuk === null || b.keluar === null) jalan = null
      else {
        const berikut: number = jalan + b.masuk - b.keluar
        jalan = Number.isSafeInteger(berikut) ? berikut : null
      }
    }
    if (b.saldo === null) continue
    if (jalan === null) {
      if (!adaSaldo) pertamaTanpaJangkar = true
    } else {
      terverifikasi++
      if (jalan !== b.saldo) {
        semuaPutus.push({ indeks: i, jenis: 'baris', diharapkan: jalan, tercetak: b.saldo, selisih: b.saldo - jalan })
      }
    }
    adaSaldo = true
    jalan = b.saldo
  }
  periksaTitik(baris.length)

  return { utuh: semuaPutus.length === 0, putus: semuaPutus[0] ?? null, semuaPutus, terverifikasi, pertamaTanpaJangkar }
}

/** Sel draf (S2) → baris rantai. Nominal tak terbaca → null; saldo tak terbaca → tanpa saldo. */
export function barisRantaiDariSel(sel: Pick<SelDraf, 'masuk' | 'keluar' | 'saldo'>): BarisRantai {
  const masuk = bacaUangSel(sel.masuk)
  const keluar = bacaUangSel(sel.keluar)
  const saldo = bacaSaldoSel(sel.saldo)
  return {
    masuk: masuk.status === 'galat' ? null : masuk.status === 'ok' ? masuk.minor : 0,
    keluar: keluar.status === 'galat' ? null : keluar.status === 'ok' ? keluar.minor : 0,
    saldo: saldo.status === 'ok' ? saldo.minor : null,
  }
}

// ── Arah blok ────────────────────────────────────────────────

/**
 * Orientasi blok RELATIF terhadap orientasi sementara S2:
 * 'normal' = Masuk/Keluar sebagaimana dibaca; 'tukar' = Masuk ↔ Keluar.
 */
export type OrientasiBlok = 'normal' | 'tukar'

export type BarisArah = BarisRantai & {
  /** Penanda DB/CR baris (S2) — PETUNJUK, tidak pernah memutuskan sendirian. */
  penanda: Arah | null
}

export type HasilArah = {
  /** null = WAJIB DIPILIH pengguna; Simpan tertahan sampai dipilih. */
  arah: OrientasiBlok | null
  alasan: string
  /** Pengisi awal pemilih arah (dari petunjuk/rantai) — tetap harus dikonfirmasi. */
  usulan: OrientasiBlok
  /** Penanda DB/CR bertentangan dengan rantai: rantai menang, ini yang tampil. */
  peringatan: string | null
}

const tukar = (b: BarisArah): BarisArah => ({ ...b, masuk: b.keluar, keluar: b.masuk })

/** Petunjuk DB/CR: mayoritas baris berpenanda tidak setuju dengan orientasi sementara → 'tukar'. */
function usulanPenanda(baris: readonly BarisArah[]): { usulan: OrientasiBlok; setuju: number; tidak: number } {
  let setuju = 0
  let tidak = 0
  for (const b of baris) {
    if (b.penanda === null) continue
    const sementara: Arah | null = (b.masuk ?? 0) > 0 ? 'masuk' : (b.keluar ?? 0) > 0 ? 'keluar' : null
    if (sementara === null) continue
    if (sementara === b.penanda) setuju++
    else tidak++
  }
  return { usulan: tidak > setuju ? 'tukar' : 'normal', setuju, tidak }
}

/**
 * Arah satu BLOK (satu tempelan, satu berkas, satu PDF) — kotak Arah MP §5.G:
 *
 *   1. Rantai saldo diuji dengan KEDUA orientasi. Tepat satu yang utuh (dan
 *      ada sedikitnya satu titik terverifikasi) → itulah arahnya, tanpa bertanya.
 *   2. Tanpa kolom saldo, saldo tidak cukup, kedua orientasi putus, atau
 *      keduanya utuh → `null`: WAJIB dipilih eksplisit; `usulan` mengisi awal
 *      pemilihnya.
 *
 * Penanda DB/CR hanya petunjuk: kalau ia bertentangan dengan rantai, rantai
 * menang dan `peringatan` diisi.
 */
export function tentukanArah(blok: {
  baris: readonly BarisArah[]
  jangkar?: number | null
  titik?: readonly TitikSaldoRantai[]
}): HasilArah {
  const { baris } = blok
  const jangkar = blok.jangkar ?? null
  const titik = blok.titik ?? []
  const petunjuk = usulanPenanda(baris)

  const adaSaldo = baris.some(b => b.saldo !== null) || titik.length > 0
  if (!adaSaldo) {
    return {
      arah: null,
      alasan: 'Blok ini tanpa kolom saldo — arah kolom nominal wajib dipilih.',
      usulan: petunjuk.usulan,
      peringatan: null,
    }
  }

  const normal = periksaKesinambungan(baris, jangkar, titik)
  const ditukar = periksaKesinambungan(baris.map(tukar), jangkar, titik)

  if (normal.terverifikasi === 0) {
    return {
      arah: null,
      alasan: 'Saldo tidak cukup untuk memastikan arah (butuh saldo awal atau ≥ 2 baris bersaldo) — pilih arahnya.',
      usulan: petunjuk.usulan,
      peringatan: null,
    }
  }

  if (normal.utuh !== ditukar.utuh) {
    const arah: OrientasiBlok = normal.utuh ? 'normal' : 'tukar'
    const bertentangan = arah === 'normal' ? petunjuk.tidak > petunjuk.setuju : petunjuk.setuju > petunjuk.tidak
    return {
      arah,
      alasan: 'Arah ditentukan dari kesinambungan saldo.',
      usulan: arah,
      peringatan: bertentangan
        ? 'Penanda DB/CR di blok ini bertentangan dengan rantai saldo — arah mengikuti rantai saldo. Periksa beberapa baris.'
        : null,
    }
  }

  if (normal.utuh && ditukar.utuh) {
    return {
      arah: null,
      alasan: 'Rantai saldo cocok di kedua arah (mutasi di antara saldo saling meniadakan) — pilih arahnya.',
      usulan: petunjuk.usulan,
      peringatan: null,
    }
  }

  // Keduanya putus: usulan = orientasi yang putusnya lebih sedikit; seri → petunjuk.
  const lebihSedikit =
    normal.semuaPutus.length === ditukar.semuaPutus.length
      ? petunjuk.usulan
      : normal.semuaPutus.length < ditukar.semuaPutus.length
        ? 'normal'
        : 'tukar'
  return {
    arah: null,
    alasan: 'Rantai saldo putus di kedua arah — pilih arahnya, lalu periksa baris yang putus.',
    usulan: lebihSedikit,
    peringatan: null,
  }
}
