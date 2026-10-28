import type { AiProvider, JawabanJson, SkemaJson } from '@/lib/ai/penyedia'
import type { BarisMentah, HalamanMentah, NominalMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'

// Penyusun tabel rekening koran (X3). AI HANYA menyusun struktur satu halaman:
// baris tercetak mana, sel mana masuk kolom mana, judul kolom apa adanya.
// Arah, tanggal, tahun, dan nominal TIDAK diputuskan di sini — semuanya teks
// apa adanya untuk parser grid Stream A (S2/S3). Keluarannya PERSIS kontrak
// `HalamanMentah` (lib/mutasi-kas/kontrak-baris-mentah.ts).
//
// Penjaga bentuk (`periksaJawaban`) adalah pengaman utama di sisi kita: jawaban
// AI ditolak SELURUHNYA — halaman gagal terlihat, bukan diam-diam kosong atau
// setengah benar — bila
//  - JSON rusak atau kolom wajib hilang;
//  - (halaman berteks) sebuah baris merujuk nomor baris yang tidak ada, urutan
//    mundur/ganda, ada baris tercetak yang terlewat di tengah tabel, sel tidak
//    tersalin persis, atau ada teks tercetak di baris itu yang tidak masuk sel
//    mana pun (nominal/saldo yang hilang tidak pernah lolos diam-diam);
//  - lanjutan uraian yang terlipat dikirim sebagai entri sendiri (bukan
//    dicatat di `barisLanjutan` transaksinya), atau `uraian` bukan bagian baris
//    pertama saja maupun gabungan persis dengan baris-baris lanjutannya;
//  - judul yang dipakai tidak tercetak (di halaman ini atau sebelumnya);
//  - (halaman yang mencetak judul) angka Debet/Kredit/Saldo tidak sejajar
//    dengan judul kolomnya — mis. saldo SALDO AWAL ditaruh di kolom Kredit,
//    kesalahan yang lolos kesinambungan saldo (uji banding 2026-10-28).
// Halaman dari GAMBAR tidak punya teks pembanding: hanya bentuknya yang
// diperiksa; pemanggil (X5) menandainya "dibaca dari gambar".
//
// Tanpa ekspresi reguler (D22).

export type SumberHalaman =
  /** Baris tata dari X2 (`BarisTata.teks`), urut dari atas; nomornya = indeks + 1. */
  | { jenis: 'teks'; baris: string[] }
  | { jenis: 'gambar'; base64: string }

export type MasukanSusun = {
  halaman: number
  sumber: SumberHalaman
  /** `kolom` halaman sebelumnya — untuk halaman lanjutan yang tidak mencetak judul. */
  kolomSebelumnya: string[]
  timeoutMs?: number
}

export type HasilSusun = { halaman: HalamanMentah; model: string; pemakaian: JawabanJson['pemakaian'] }

/** Jawaban AI ditolak penjaga bentuk. `masalah` tanpa isi baris (aman untuk log). */
export class GalatSusun extends Error {
  constructor(readonly masalah: string[]) {
    super(`Susunan tabel halaman ditolak: ${masalah.slice(0, 5).join('; ')}${masalah.length > 5 ? ` (+${masalah.length - 5} lagi)` : ''}`)
    this.name = 'GalatSusun'
  }
}

// ── Bentuk jawaban AI ───────────────────────────────────────────────────────

const STR: SkemaJson = { type: 'string' }

export const SKEMA_SUSUN: SkemaJson = {
  type: 'object',
  properties: {
    periodeTeks: STR,
    nomorBarisJudul: { type: 'integer' },
    kolom: { type: 'array', items: STR },
    peranKolom: {
      type: 'object',
      properties: { tanggal: STR, uraian: STR, nominalPertama: STR, nominalKedua: STR, saldo: STR },
      required: ['tanggal', 'uraian', 'nominalPertama', 'nominalKedua', 'saldo'],
    },
    baris: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nomorBaris: { type: 'integer' },
          tanggal: STR,
          uraian: STR,
          nominalPertama: STR,
          nominalKedua: STR,
          penanda: STR,
          saldo: STR,
          lain: { type: 'array', items: { type: 'object', properties: { judul: STR, teks: STR }, required: ['judul', 'teks'] } },
          barisLanjutan: { type: 'array', items: { type: 'integer' } },
        },
        required: ['nomorBaris', 'tanggal', 'uraian', 'nominalPertama', 'nominalKedua', 'penanda', 'saldo', 'lain', 'barisLanjutan'],
      },
    },
  },
  required: ['periodeTeks', 'nomorBarisJudul', 'kolom', 'peranKolom', 'baris'],
}

export type PeranKolom = { tanggal: string; uraian: string; nominalPertama: string; nominalKedua: string; saldo: string }
export type BarisAi = {
  nomorBaris: number
  tanggal: string
  uraian: string
  nominalPertama: string
  nominalKedua: string
  penanda: string
  saldo: string
  lain: { judul: string; teks: string }[]
  /** Nomor baris tercetak lanjutan uraian transaksi ini, urut naik. Kode yang menggabungkannya ke `uraian`. */
  barisLanjutan: number[]
}
export type JawabanSusun = { periodeTeks: string; nomorBarisJudul: number; kolom: string[]; peranKolom: PeranKolom; baris: BarisAi[] }

export const PROMPT_SISTEM = `Kamu penyusun tabel rekening koran. Tugasmu HANYA menyusun struktur: memetakan teks yang tercetak di SATU halaman ke baris dan kolom. Jangan menafsirkan, menghitung, membetulkan, melengkapi, atau menerjemahkan apa pun.

Aturan:
1. Salin setiap sel PERSIS seperti tercetak, karakter demi karakter: titik, koma, tanda minus, kurung, huruf besar/kecil. Jangan mengubah format angka atau tanggal, jangan menambah tahun, jangan membuang pemisah ribuan.
2. Satu TRANSAKSI tercetak = satu entri "baris", termasuk baris SALDO AWAL, SALDO AKHIR, dan TOTAL. Uraian yang terlipat ke baris tercetak berikutnya (baris yang SELURUH isinya lanjutan uraian) BUKAN entri sendiri: catat nomor baris-baris lanjutan itu di "barisLanjutan" transaksinya, urut dari atas ([] bila tidak ada). "uraian" cukup berisi bagian uraian yang tercetak di baris PERTAMA transaksi itu — teks baris lanjutan digabung oleh kode, jangan disalin. Bila baris tabel PERTAMA di halaman ini adalah lanjutan uraian transaksi dari halaman sebelumnya, kirim sebagai entri sendiri yang hanya berisi "uraian". Jangan memecah satu baris tercetak, dan jangan melewatkan baris apa pun di antara baris tabel pertama dan terakhir.
3. Kop surat, nama bank, alamat, nomor rekening, keterangan periode, dan nomor halaman di luar tabel BUKAN entri "baris".
4. "nomorBarisJudul": nomor baris judul kolom tabel di halaman ini; 0 bila halaman ini tidak mencetak judul kolom. Baris judul BUKAN entri "baris". "kolom": judul kolom persis seperti tercetak, kiri ke kanan; [] bila tidak tercetak.
5. "peranKolom": judul kolom (persis seperti di "kolom", atau dari JUDUL HALAMAN SEBELUMNYA bila halaman ini tidak mencetak judul) untuk tanggal, uraian/keterangan, nominal pertama (kolom nominal paling KIRI), nominal kedua (kolom nominal di sebelah kanannya; "" bila hanya ada satu kolom nominal), dan saldo ("" bila tidak ada). Jangan menilai arti "Debet", "Kredit", "Masuk", atau "Keluar" — yang menentukan hanya posisinya, kiri atau kanan.
6. Satu kolom nominal yang diikuti penanda seperti "DB"/"CR": angkanya ke "nominalPertama", penandanya ke "penanda" persis seperti tercetak ("" bila tidak ada). Dua kolom nominal: angka masuk ke kolom yang SEJAJAR TEGAK di bawah judulnya; sel yang kosong diisi "".
   Kolom setiap angka ditentukan POSISI mendatarnya (bandingkan kolom karakternya dengan posisi judul), bukan urutan angka di baris itu: baris yang hanya mencetak SATU angka (mis. SALDO AWAL) tetap menaruh angka itu di kolom yang sejajar dengannya — angka di bawah judul saldo masuk "saldo" walau kolom nominal kosong.
7. Kolom lain (No. Ref, Cabang, Teller, dst.) masuk "lain" sebagai {judul, teks}, judulnya persis seperti tercetak; sel kosong tidak perlu dimasukkan.
8. "periodeTeks": teks periode persis seperti tercetak (mis. "PERIODE : OKTOBER 2026"); "" bila tidak ada di halaman ini.
9. Setiap teks yang tercetak di sebuah baris tabel harus masuk ke salah satu sel baris itu, atau nomor baris itu tercatat di "barisLanjutan" bila baris itu lanjutan uraian.

Kembalikan HANYA objek JSON sesuai skema.`

function isiPengguna(m: MasukanSusun): string {
  const atas = `HALAMAN: ${m.halaman}\nJUDUL HALAMAN SEBELUMNYA: ${JSON.stringify(m.kolomSebelumnya)}\n`
  if (m.sumber.jenis === 'gambar') {
    return `${atas}\nMasukan berupa GAMBAR halaman hasil scan. "nomorBaris" dan "nomorBarisJudul" = urutan baris tercetak dari atas, mulai 1.`
  }
  const teks = m.sumber.baris.map((b, i) => `[${String(i + 1).padStart(3, '0')}] ${b}`).join('\n')
  return `${atas}\nTEKS HALAMAN (setiap baris diawali nomornya; spasi mempertahankan posisi mendatar, jadi teks yang sejajar tegak berada di kolom yang sama):\n${teks}`
}

// ── Penjaga bentuk ──────────────────────────────────────────────────────────

const objek = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const teks = (v: unknown): v is string => typeof v === 'string'
const bulat = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/** Token = potongan dipisah spasi; sebaris tata letak bisa punya banyak spasi antarsel. */
function token(s: string): string[] {
  return s.split(' ').filter(t => t !== '')
}
const rapat = (s: string) => token(s).join(' ')

type Rentang = [number, number]

/** Rentang karakter [awal, akhir) setiap kemunculan `cari` sebagai potongan utuh (dibatasi spasi/tepi) di baris tata. */
function rentangDi(baris: string, cari: string): Rentang[] {
  const out: Rentang[] = []
  if (cari === '') return out
  for (let i = baris.indexOf(cari); i >= 0; i = baris.indexOf(cari, i + 1)) {
    const akhir = i + cari.length
    if ((i === 0 || baris[i - 1] === ' ') && (akhir === baris.length || baris[akhir] === ' ')) out.push([i, akhir])
  }
  return out
}

const jarak = (a: Rentang, b: Rentang) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[1], b[1]))

/** Posisi tiap judul di baris judul, dicari kiri→kanan; null bila ada yang tidak ketemu persis (pemeriksaan posisi dilewati). */
function posisiJudul(barisJudul: string, kolom: string[]): { judul: string; rentang: Rentang }[] | null {
  const out: { judul: string; rentang: Rentang }[] = []
  let dari = 0
  for (const k of kolom) {
    const r = rentangDi(barisJudul, k).find(x => x[0] >= dari)
    if (!r) return null
    out.push({ judul: k, rentang: r })
    dari = r[1]
  }
  return out
}

function bentukJawaban(j: unknown, masalah: string[]): JawabanSusun | null {
  if (!objek(j)) return masalah.push('jawaban bukan objek JSON'), null
  const p = j.peranKolom
  if (!teks(j.periodeTeks)) masalah.push('periodeTeks hilang')
  if (!bulat(j.nomorBarisJudul) || j.nomorBarisJudul < 0) masalah.push('nomorBarisJudul hilang')
  if (!Array.isArray(j.kolom) || !j.kolom.every(teks)) masalah.push('kolom hilang')
  if (!objek(p) || !['tanggal', 'uraian', 'nominalPertama', 'nominalKedua', 'saldo'].every(k => teks(p[k]))) masalah.push('peranKolom hilang')
  if (!Array.isArray(j.baris)) masalah.push('baris hilang')
  else
    j.baris.forEach((b, i) => {
      const ok =
        objek(b) &&
        bulat(b.nomorBaris) &&
        ['tanggal', 'uraian', 'nominalPertama', 'nominalKedua', 'penanda', 'saldo'].every(k => teks(b[k])) &&
        Array.isArray(b.lain) &&
        b.lain.every(l => objek(l) && teks(l.judul) && teks(l.teks)) &&
        Array.isArray(b.barisLanjutan) &&
        b.barisLanjutan.every(bulat)
      if (!ok) masalah.push(`baris ke-${i + 1}: bentuk tidak lengkap`)
    })
  return masalah.length > 0 ? null : (j as unknown as JawabanSusun)
}

/**
 * Periksa jawaban AI terhadap masukan halamannya, lalu bentuk `HalamanMentah`.
 * Melempar `GalatSusun` dengan SEMUA masalah yang ditemukan.
 */
export function periksaJawaban(teksJson: string, m: MasukanSusun): HalamanMentah {
  const masalah: string[] = []
  let mentah: unknown
  try {
    mentah = JSON.parse(teksJson)
  } catch {
    throw new GalatSusun(['jawaban AI bukan JSON yang valid'])
  }
  const j = bentukJawaban(mentah, masalah)
  if (!j) throw new GalatSusun(masalah)

  const berteks = m.sumber.jenis === 'teks'
  const garis = m.sumber.jenis === 'teks' ? m.sumber.baris : []
  const adaJudul = j.nomorBarisJudul > 0
  const kolom = adaJudul ? j.kolom : []
  if (!adaJudul && j.kolom.length > 0) masalah.push('kolom diisi padahal halaman tidak mencetak judul')
  if (adaJudul && j.kolom.length === 0) masalah.push('judul tercetak tapi kolom kosong')

  // Judul yang boleh dipakai: tercetak di halaman ini, atau — halaman lanjutan
  // tanpa judul — di halaman sebelumnya.
  const judulSah = adaJudul ? kolom : m.kolomSebelumnya
  const p = j.peranKolom
  for (const [peran, judul] of Object.entries(p)) {
    if (judul !== '' && !judulSah.includes(judul)) masalah.push(`judul peran ${peran} tidak tercetak`)
  }
  const dipakaiPeran = new Set(Object.values(p).filter(v => v !== ''))
  const duaKolom = p.nominalKedua !== ''

  if (berteks && adaJudul) {
    const g = garis[j.nomorBarisJudul - 1]
    if (g === undefined) masalah.push(`baris judul [${j.nomorBarisJudul}] tidak ada`)
    else if (!kolom.every(k => rapat(g).includes(rapat(k)))) masalah.push(`judul kolom tidak tersalin persis dari baris [${j.nomorBarisJudul}]`)
  }
  if (berteks && j.periodeTeks !== '' && !garis.some(g => rapat(g).includes(rapat(j.periodeTeks)))) masalah.push('periodeTeks tidak tercetak di halaman')

  // Posisi judul untuk pemeriksaan "angka sejajar dengan judulnya". Hanya di
  // halaman yang MENCETAK judul: posisi judul halaman sebelumnya tidak ikut
  // masuk route, jadi halaman lanjutan tanpa judul tidak diperiksa di sini.
  const gJudul = berteks && adaJudul ? garis[j.nomorBarisJudul - 1] : undefined
  const posisi = gJudul === undefined ? null : posisiJudul(gJudul, kolom)

  let sebelumnya = 0
  // Uraian keluaran per baris; untuk halaman berteks yang berlanjutan, disusun
  // ulang kode dari baris tercetaknya (satu spasi antarbagian).
  const uraianKeluar = j.baris.map(b => b.uraian)
  j.baris.forEach((b, i) => {
    const ke = `baris ke-${i + 1}`
    const sel = [b.tanggal, b.uraian, b.nominalPertama, b.nominalKedua, b.penanda, b.saldo, ...b.lain.map(l => l.teks)]
    if (sel.every(s => s === '')) masalah.push(`${ke}: semua sel kosong`)
    if (p.tanggal === '' && b.tanggal !== '') masalah.push(`${ke}: tanggal tanpa kolom tanggal`)
    if (p.uraian === '' && b.uraian !== '') masalah.push(`${ke}: uraian tanpa kolom uraian`)
    if (p.saldo === '' && b.saldo !== '') masalah.push(`${ke}: saldo tanpa kolom saldo`)
    if (p.nominalPertama === '' && (b.nominalPertama !== '' || b.penanda !== '')) masalah.push(`${ke}: nominal tanpa kolom nominal`)
    if (!duaKolom && b.nominalKedua !== '') masalah.push(`${ke}: nominal kedua pada tabel satu kolom nominal`)
    if (duaKolom && b.penanda !== '') masalah.push(`${ke}: penanda pada tabel dua kolom nominal`)
    for (const l of b.lain) {
      if (!judulSah.includes(l.judul) || dipakaiPeran.has(l.judul)) masalah.push(`${ke}: judul kolom lain tidak tercetak`)
    }
    // Lanjutan uraian WAJIB digabung ke transaksinya (keputusan Ricko 2026-10-27).
    // Hanya baris PERTAMA halaman yang boleh berisi uraian saja: lanjutan
    // transaksi di halaman sebelumnya, digabung `gabungLintasHalaman` (dokumen.ts).
    if (i > 0 && hanyaUraian(b)) masalah.push(`${ke}: lanjutan uraian tidak digabung ke baris transaksinya`)
    // Urutan: nomor baris, lalu nomor baris lanjutannya, naik ketat — baris
    // ganda, tertukar, atau lanjutan yang menunjuk baris lain tidak lolos.
    const nomor = [b.nomorBaris, ...b.barisLanjutan]
    if (nomor.some((n, k) => n <= (k === 0 ? sebelumnya : nomor[k - 1]))) masalah.push(`${ke}: nomor baris tidak urut/ganda`)
    sebelumnya = Math.max(sebelumnya, ...nomor)
    if (!berteks) return

    const g = garis[b.nomorBaris - 1]
    if (g === undefined) return void masalah.push(`${ke}: baris [${b.nomorBaris}] tidak ada`)
    if (b.nomorBaris === j.nomorBarisJudul) return void masalah.push(`${ke}: baris judul dikirim sebagai baris`)

    // Uraian keluaran = bagian di baris pertama + teks utuh tiap baris
    // lanjutan, disambung satu spasi — disusun KODE. `uraian` dari AI diterima
    // dalam dua bentuk: bagian baris pertama SAJA (yang diminta prompt; uji
    // banding 2026-10-28: Flash-Lite mencatat `barisLanjutan` dengan benar tapi
    // tidak menyalin teksnya), atau sudah digabung persis. Bentuk lain ditolak.
    // Bagian baris pertama diperiksa token demi token terhadap baris pertama di
    // bawah, dan baris lanjutan habis masuk uraian.
    const lanjut: string[] = []
    for (const n of b.barisLanjutan) {
      const gl = garis[n - 1]
      if (gl === undefined || n === j.nomorBarisJudul || rapat(gl) === '') return void masalah.push(`${ke}: baris lanjutan [${n}] tidak sah`)
      lanjut.push(rapat(gl))
    }
    let bagianPertama = b.uraian
    if (lanjut.length > 0) {
      const u = rapat(b.uraian)
      const ekor = lanjut.join(' ')
      if (u === ekor) bagianPertama = ''
      else if (u.endsWith(` ${ekor}`)) bagianPertama = u.slice(0, u.length - ekor.length - 1)
      else if (rapat(g).includes(u)) bagianPertama = u
      else return void masalah.push(`${ke}: uraian gabungan tidak sama persis dengan baris lanjutannya`)
      uraianKeluar[i] = [bagianPertama, ...lanjut].filter(x => x !== '').join(' ')
    }
    const selPertama = [b.tanggal, bagianPertama, ...sel.slice(2)]

    const ruang = rapat(g)
    if (!selPertama.every(s => s === '' || ruang.includes(rapat(s)))) masalah.push(`${ke}: sel tidak tersalin persis dari baris [${b.nomorBaris}]`)

    // Angka harus berada paling dekat dengan judul kolom yang dipilih AI. Sel
    // yang tidak bisa ditemukan utuh di baris tata (spasi di dalam angka)
    // dilewati — keberadaannya sudah dijamin pemeriksaan token di bawah.
    if (posisi) {
      const cek: [string, string, string][] = [
        [b.nominalPertama, p.nominalPertama, 'nominal pertama'],
        [b.nominalKedua, p.nominalKedua, 'nominal kedua'],
        [b.saldo, p.saldo, 'saldo'],
      ]
      for (const [isi, judul, nama] of cek) {
        const letak = rentangDi(g, isi.trim())
        if (isi.trim() === '' || judul === '' || letak.length === 0) continue
        const sejajar = letak.some(r => {
          const d = posisi.map(h => jarak(r, h.rentang))
          const min = Math.min(...d)
          return posisi.some((h, k) => h.judul === judul && d[k] === min)
        })
        if (!sejajar) masalah.push(`${ke}: sel ${nama} tidak sejajar dengan judul kolomnya`)
      }
    }
    // Semua token tercetak harus masuk sel, dan sel tidak boleh berisi token lain.
    const sisa = new Map<string, number>()
    for (const t of token(g)) sisa.set(t, (sisa.get(t) ?? 0) + 1)
    for (const t of selPertama.flatMap(token)) sisa.set(t, (sisa.get(t) ?? 0) - 1)
    if ([...sisa.values()].some(n => n !== 0)) masalah.push(`${ke}: teks tercetak di baris [${b.nomorBaris}] tidak cocok dengan selnya`)
  })

  // Cakupan: setiap baris tercetak di antara baris tabel pertama dan terakhir
  // harus menjadi baris (atau baris judul). Baris yang terlewat = mutasi hilang.
  if (berteks && j.baris.length > 0) {
    const dipakai = new Set(j.baris.flatMap(b => [b.nomorBaris, ...b.barisLanjutan]))
    const awal = j.baris[0].nomorBaris
    const akhir = Math.max(...dipakai)
    for (let n = awal; n <= akhir; n++) {
      if (!dipakai.has(n) && n !== j.nomorBarisJudul && garis[n - 1] !== undefined && rapat(garis[n - 1]) !== '') {
        masalah.push(`baris tercetak [${n}] terlewat`)
      }
    }
  }
  if (masalah.length > 0) throw new GalatSusun(masalah)

  return bentukHalaman(j, m.halaman, kolom, judulSah, uraianKeluar)
}

/** Baris yang hanya berisi uraian — di rekening koran: lanjutan uraian yang terlipat. */
function hanyaUraian(b: Pick<BarisAi, 'tanggal' | 'uraian' | 'nominalPertama' | 'nominalKedua' | 'penanda' | 'saldo' | 'lain'>): boolean {
  return (
    b.uraian !== '' &&
    [b.tanggal, b.nominalPertama, b.nominalKedua, b.penanda, b.saldo].every(s => s === '') &&
    b.lain.every(l => l.teks === '')
  )
}

function bentukHalaman(j: JawabanSusun, halaman: number, kolom: string[], judulSah: string[], uraian: string[]): HalamanMentah {
  const p = j.peranKolom
  const nominal = (b: Pick<BarisAi, 'nominalPertama' | 'nominalKedua' | 'penanda'>): NominalMentah =>
    p.nominalKedua !== ''
      ? { bentuk: 'dua-kolom', pertama: { judul: p.nominalPertama, teks: b.nominalPertama }, kedua: { judul: p.nominalKedua, teks: b.nominalKedua } }
      : { bentuk: 'satu-kolom', judul: p.nominalPertama, teks: b.nominalPertama, penanda: b.penanda }
  // `lain` kiri→kanan mengikuti urutan judul, sel kosong tidak dikirim.
  const urutLain = (lain: BarisAi['lain']) =>
    lain.filter(l => l.teks !== '').sort((a, b) => judulSah.indexOf(a.judul) - judulSah.indexOf(b.judul))

  const baris: BarisMentah[] = j.baris.map((b, i) => ({
    halaman,
    tanggal: b.tanggal,
    uraian: uraian[i],
    nominal: nominal(b),
    saldo: b.saldo,
    lain: urutLain(b.lain),
  }))

  // Judul yang tercetak ULANG di halaman berikut dikirim juga sebagai baris
  // biasa (kontrak: tidak ada baris yang dibuang; S2 `kelasBaris` yang
  // mengenalinya). Disusun kode dari judul tercetak, bukan dari AI.
  if (halaman > 1 && kolom.length > 0) {
    const peranLain = kolom.filter(k => !Object.values(p).includes(k))
    baris.unshift({
      halaman,
      tanggal: p.tanggal,
      uraian: p.uraian,
      nominal: nominal({ nominalPertama: p.nominalPertama, nominalKedua: p.nominalKedua, penanda: '' }),
      saldo: p.saldo,
      lain: peranLain.map(k => ({ judul: k, teks: k })),
    })
  }
  return { halaman, kolom, baris, periodeTeks: j.periodeTeks === '' ? null : j.periodeTeks }
}

/** Susun satu halaman: minta AI, lalu periksa. Nomor halaman dari masukan, bukan dari AI. */
export async function susunHalaman(ai: AiProvider, m: MasukanSusun): Promise<HasilSusun> {
  const isi: Parameters<AiProvider['mintaJson']>[0]['isi'] = [{ jenis: 'teks', teks: isiPengguna(m) }]
  if (m.sumber.jenis === 'gambar') isi.push({ jenis: 'gambarPng', base64: m.sumber.base64 })
  const j = await ai.mintaJson({ sistem: PROMPT_SISTEM, isi, skema: SKEMA_SUSUN, timeoutMs: m.timeoutMs })
  if (j.teks === '') throw new GalatSusun(['AI tidak mengembalikan apa pun'])
  return { halaman: periksaJawaban(j.teks, m), model: j.model, pemakaian: j.pemakaian }
}
