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
//  - judul yang dipakai tidak tercetak (di halaman ini atau sebelumnya).
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
        },
        required: ['nomorBaris', 'tanggal', 'uraian', 'nominalPertama', 'nominalKedua', 'penanda', 'saldo', 'lain'],
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
}
export type JawabanSusun = { periodeTeks: string; nomorBarisJudul: number; kolom: string[]; peranKolom: PeranKolom; baris: BarisAi[] }

export const PROMPT_SISTEM = `Kamu penyusun tabel rekening koran. Tugasmu HANYA menyusun struktur: memetakan teks yang tercetak di SATU halaman ke baris dan kolom. Jangan menafsirkan, menghitung, membetulkan, melengkapi, atau menerjemahkan apa pun.

Aturan:
1. Salin setiap sel PERSIS seperti tercetak, karakter demi karakter: titik, koma, tanda minus, kurung, huruf besar/kecil. Jangan mengubah format angka atau tanggal, jangan menambah tahun, jangan membuang pemisah ribuan.
2. Satu baris tercetak di dalam tabel = satu entri "baris", termasuk baris SALDO AWAL, SALDO AKHIR, TOTAL, dan baris lanjutan uraian yang hanya berisi teks. Jangan menggabungkan dua baris tercetak, jangan memecah satu baris tercetak, dan jangan melewatkan baris apa pun di antara baris tabel pertama dan terakhir.
3. Kop surat, nama bank, alamat, nomor rekening, keterangan periode, dan nomor halaman di luar tabel BUKAN entri "baris".
4. "nomorBarisJudul": nomor baris judul kolom tabel di halaman ini; 0 bila halaman ini tidak mencetak judul kolom. Baris judul BUKAN entri "baris". "kolom": judul kolom persis seperti tercetak, kiri ke kanan; [] bila tidak tercetak.
5. "peranKolom": judul kolom (persis seperti di "kolom", atau dari JUDUL HALAMAN SEBELUMNYA bila halaman ini tidak mencetak judul) untuk tanggal, uraian/keterangan, nominal pertama (kolom nominal paling KIRI), nominal kedua (kolom nominal di sebelah kanannya; "" bila hanya ada satu kolom nominal), dan saldo ("" bila tidak ada). Jangan menilai arti "Debet", "Kredit", "Masuk", atau "Keluar" — yang menentukan hanya posisinya, kiri atau kanan.
6. Satu kolom nominal yang diikuti penanda seperti "DB"/"CR": angkanya ke "nominalPertama", penandanya ke "penanda" persis seperti tercetak ("" bila tidak ada). Dua kolom nominal: angka masuk ke kolom yang SEJAJAR TEGAK di bawah judulnya; sel yang kosong diisi "".
7. Kolom lain (No. Ref, Cabang, Teller, dst.) masuk "lain" sebagai {judul, teks}, judulnya persis seperti tercetak; sel kosong tidak perlu dimasukkan.
8. "periodeTeks": teks periode persis seperti tercetak (mis. "PERIODE : OKTOBER 2026"); "" bila tidak ada di halaman ini.
9. Setiap teks yang tercetak di sebuah baris tabel harus masuk ke salah satu sel baris itu.

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
        b.lain.every(l => objek(l) && teks(l.judul) && teks(l.teks))
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

  let sebelumnya = 0
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
    // Urutan: nomor baris naik ketat — baris ganda atau tertukar tidak lolos.
    if (b.nomorBaris <= sebelumnya) masalah.push(`${ke}: nomor baris tidak urut/ganda`)
    sebelumnya = Math.max(sebelumnya, b.nomorBaris)
    if (!berteks) return

    const g = garis[b.nomorBaris - 1]
    if (g === undefined) return void masalah.push(`${ke}: baris [${b.nomorBaris}] tidak ada`)
    if (b.nomorBaris === j.nomorBarisJudul) return void masalah.push(`${ke}: baris judul dikirim sebagai baris`)
    const ruang = rapat(g)
    if (!sel.every(s => s === '' || ruang.includes(rapat(s)))) masalah.push(`${ke}: sel tidak tersalin persis dari baris [${b.nomorBaris}]`)
    // Semua token tercetak harus masuk sel, dan sel tidak boleh berisi token lain.
    const sisa = new Map<string, number>()
    for (const t of token(g)) sisa.set(t, (sisa.get(t) ?? 0) + 1)
    for (const t of sel.flatMap(token)) sisa.set(t, (sisa.get(t) ?? 0) - 1)
    if ([...sisa.values()].some(n => n !== 0)) masalah.push(`${ke}: teks tercetak di baris [${b.nomorBaris}] tidak cocok dengan selnya`)
  })

  // Cakupan: setiap baris tercetak di antara baris tabel pertama dan terakhir
  // harus menjadi baris (atau baris judul). Baris yang terlewat = mutasi hilang.
  if (berteks && j.baris.length > 0) {
    const dipakai = new Set(j.baris.map(b => b.nomorBaris))
    const awal = j.baris[0].nomorBaris
    const akhir = j.baris[j.baris.length - 1].nomorBaris
    for (let n = awal; n <= akhir; n++) {
      if (!dipakai.has(n) && n !== j.nomorBarisJudul && garis[n - 1] !== undefined && rapat(garis[n - 1]) !== '') {
        masalah.push(`baris tercetak [${n}] terlewat`)
      }
    }
  }
  if (masalah.length > 0) throw new GalatSusun(masalah)

  return bentukHalaman(j, m.halaman, kolom, judulSah)
}

function bentukHalaman(j: JawabanSusun, halaman: number, kolom: string[], judulSah: string[]): HalamanMentah {
  const p = j.peranKolom
  const nominal = (b: Pick<BarisAi, 'nominalPertama' | 'nominalKedua' | 'penanda'>): NominalMentah =>
    p.nominalKedua !== ''
      ? { bentuk: 'dua-kolom', pertama: { judul: p.nominalPertama, teks: b.nominalPertama }, kedua: { judul: p.nominalKedua, teks: b.nominalKedua } }
      : { bentuk: 'satu-kolom', judul: p.nominalPertama, teks: b.nominalPertama, penanda: b.penanda }
  // `lain` kiri→kanan mengikuti urutan judul, sel kosong tidak dikirim.
  const urutLain = (lain: BarisAi['lain']) =>
    lain.filter(l => l.teks !== '').sort((a, b) => judulSah.indexOf(a.judul) - judulSah.indexOf(b.judul))

  const baris: BarisMentah[] = j.baris.map(b => ({
    halaman,
    tanggal: b.tanggal,
    uraian: b.uraian,
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
