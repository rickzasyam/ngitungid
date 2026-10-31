// Menyusun item teks satu halaman PDF menjadi BARIS bertata letak (X2, murni).
//
// Masukannya posisi item dari lapisan teks PDF; keluarannya baris dari atas ke
// bawah, masing-masing diberi nomor dan teks yang MEMPERTAHANKAN posisi
// mendatar (gaya `pdftotext -layout`): setiap item ditaruh di kolom karakter
// sebanding dengan x-nya. Ini yang dikirim ke penyusun tabel AI (X3).
//
// Kenapa bukan "celah kolom → tab" seperti di MP: rekening koran Debet/Kredit
// selalu punya SATU sel nominal kosong per baris. Tab hanya menandai celah, jadi
// "1.500.000,00" di bawah Debet dan di bawah Kredit menjadi teks yang sama —
// padahal kolom itulah yang kelak menentukan arah. Spasi sebanding posisi
// menjaga angka tetap berada di bawah judulnya.
//
// Tidak ada tafsiran di sini (tanggal, nominal, arah): hanya geometri. Tanpa
// ekspresi reguler (D22).

export type ItemTeks = {
  teks: string
  /** Kiri item, satuan PDF (titik). */
  x: number
  /** Garis dasar item, satuan PDF; makin besar makin ke atas halaman. */
  y: number
  lebar: number
  /** Tinggi/ukuran huruf, satuan PDF. */
  tinggi: number
}

export type BarisTata = {
  /** Nomor baris di halaman, mulai 1, dari atas. Dirujuk balik oleh AI (X3). */
  nomor: number
  y: number
  item: ItemTeks[]
  /** Teks satu baris dengan posisi mendatar dipertahankan lewat spasi. */
  teks: string
}

/**
 * Skala satu halaman: kolom karakter = round((x − xMin) / satuan). Dihitung PER
 * HALAMAN, jadi kolom karakter dua halaman tidak bisa dibandingkan langsung —
 * `pindahGrid` memindahkannya lewat posisi x PDF.
 */
export type GridHalaman = { xMin: number; satuan: number }

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

function bersih(s: string): boolean {
  return s.trim() !== ''
}

/** Skala halaman yang dipakai `susunBaris` untuk item-item ini. */
export function gridHalaman(itemMentah: ItemTeks[]): GridHalaman {
  const items = itemMentah.filter(i => bersih(i.teks))
  if (items.length === 0) return { xMin: 0, satuan: 4 }
  // Lebar satu kolom karakter = median lebar per huruf di halaman ini.
  const satuan = median(items.filter(i => i.lebar > 0).map(i => i.lebar / i.teks.length)) || 4
  return { xMin: Math.min(...items.map(i => i.x)), satuan }
}

/**
 * Rentang kolom karakter [awal, akhir) dari grid `dari` ke grid `ke`, lewat
 * posisi x PDF — mis. posisi judul kolom halaman 1 di baris halaman 2 yang
 * tidak mencetak judul. Pembulatannya sama dengan `susunBaris`.
 */
export function pindahGrid(r: [number, number], dari: GridHalaman, ke: GridHalaman): [number, number] {
  const kolom = (c: number) => Math.round((dari.xMin + c * dari.satuan - ke.xMin) / ke.satuan)
  return [kolom(r[0]), kolom(r[1])]
}

export function susunBaris(itemMentah: ItemTeks[]): BarisTata[] {
  const items = itemMentah.filter(i => bersih(i.teks))
  if (items.length === 0) return []

  // Satu baris = item yang garis dasarnya berdekatan. Toleransinya separuh
  // tinggi huruf: cukup untuk huruf yang sedikit turun-naik, terlalu kecil untuk
  // menggabungkan dua baris rapat (jarak baris rekening koran ≥ 1× tinggi huruf).
  const toleransi = Math.max(1.5, median(items.map(i => i.tinggi)) * 0.5)
  const urut = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const kelompok: { y: number; item: ItemTeks[] }[] = []
  for (const it of urut) {
    const akhir = kelompok[kelompok.length - 1]
    if (akhir && akhir.y - it.y <= toleransi) akhir.item.push(it)
    else kelompok.push({ y: it.y, item: [it] })
  }

  const { xMin, satuan } = gridHalaman(items)

  return kelompok.map((k, idx) => {
    const item = k.item.sort((a, b) => a.x - b.x)
    let teks = ''
    for (const it of item) {
      let kolom = Math.round((it.x - xMin) / satuan)
      // Item yang menempel/bertumpuk tetap dipisah satu spasi supaya dua sel
      // tidak pernah melebur jadi satu kata.
      if (teks !== '' && kolom < teks.length + 1) kolom = teks.length + 1
      teks = teks.padEnd(kolom, ' ') + it.teks.trim()
    }
    return { nomor: idx + 1, y: k.y, item, teks }
  })
}

/** Teks halaman untuk AI: satu baris per baris tata, berawalan nomor tiga digit. */
export function teksBernomor(baris: BarisTata[]): string {
  return baris.map(b => `[${String(b.nomor).padStart(3, '0')}] ${b.teks}`).join('\n')
}

/** Jumlah karakter bukan spasi — ukuran "halaman ini punya lapisan teks". */
export function jumlahKarakter(baris: BarisTata[]): number {
  let n = 0
  for (const b of baris) for (const c of b.teks) if (c !== ' ') n++
  return n
}
