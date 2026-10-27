import { describe, expect, it, vi } from 'vitest'
import type { AiProvider } from '@/lib/ai/penyedia'
import type { HalamanMentah } from '@/lib/mutasi-kas/kontrak-baris-mentah'
import { bukaPdf } from './baca-pdf'
import { kolomTerakhir, rangkumDokumen } from './dokumen'
import { dokumenAcak, dokumenDuaKolom, dokumenSatuKolom, dokumenTanpaSaldo } from './fikstur/koleksi'
import type { DokumenSintetis } from './fikstur/dokumen-sintetis'
import { jawabanSempurna, penyediaTiruan } from './fikstur/jawaban-ai'
import { GalatSusun, PROMPT_SISTEM, SKEMA_SUSUN, periksaJawaban, susunHalaman, type JawabanSusun, type MasukanSusun } from './susun-tabel'

// X3 — penyusun tabel. AI ditiru dengan jawaban yang dibentuk dari kebenaran
// fikstur, jadi yang diuji: (1) jawaban yang benar menghasilkan HalamanMentah
// PERSIS kebenarannya, (2) penjaga bentuk menolak setiap jenis kerusakan
// jawaban dengan galat yang terlihat, tanpa membocorkan isi baris.

async function barisTeks(d: DokumenSintetis): Promise<string[][]> {
  const doc = await bukaPdf(d.pdf)
  try {
    const out: string[][] = []
    for (let i = 1; i <= doc.jumlahHalaman; i++) out.push((await doc.bacaHalaman(i)).baris.map(b => b.teks))
    return out
  } finally {
    await doc.tutup()
  }
}

async function susunDokumen(d: DokumenSintetis, ai: (hal: number, baris: string[]) => AiProvider): Promise<HalamanMentah[]> {
  const semua = await barisTeks(d)
  const hasil: HalamanMentah[] = []
  for (const [i, baris] of semua.entries()) {
    const halaman = i + 1
    const r = await susunHalaman(ai(halaman, baris), { halaman, sumber: { jenis: 'teks', baris }, kolomSebelumnya: kolomTerakhir(hasil, halaman) })
    hasil.push(r.halaman)
  }
  return hasil
}

const sempurna = (d: DokumenSintetis) => (hal: number, baris: string[]) => penyediaTiruan(() => JSON.stringify(jawabanSempurna(d, hal, baris)))

describe('jawaban benar → HalamanMentah PERSIS kebenaran', () => {
  for (const buat of [dokumenSatuKolom, dokumenDuaKolom, dokumenTanpaSaldo, () => dokumenAcak(7), () => dokumenAcak(8, 60)]) {
    const d = buat()
    it(d.nama, async () => {
      expect(await susunDokumen(d, sempurna(d))).toEqual(d.kebenaran)
    })
  }

  it('isi kontrak: DB/CR tetap teks penanda, SALDO AWAL hal. 3 dan judul berulang tetap baris', async () => {
    const satu = await susunDokumen(dokumenSatuKolom(), sempurna(dokumenSatuKolom()))
    expect(satu[0].baris[1].nominal).toEqual({ bentuk: 'satu-kolom', judul: 'MUTASI', teks: '1,500,000.00', penanda: 'DB' })
    const d = dokumenDuaKolom()
    const dua = await susunDokumen(d, sempurna(d))
    expect(dua[1].kolom).toEqual([]) // hal. 2 tidak mencetak judul
    expect(dua[1].baris[0].nominal).toMatchObject({ bentuk: 'dua-kolom', pertama: { judul: 'Debet' }, kedua: { judul: 'Kredit' } })
    expect(dua[2].baris.map(b => b.uraian).slice(0, 2)).toEqual(['Keterangan', 'SALDO AWAL'])
    expect(dua.flatMap(h => h.baris).every((b, _i, all) => all.length > 0 && b.halaman >= 1)).toBe(true)
  })
})

describe('permintaan ke penyedia', () => {
  it('teks halaman bernomor + konteks judul sebelumnya; skema & instruksi sistem tetap', async () => {
    const d = dokumenDuaKolom()
    const [, baris2] = await barisTeks(d)
    const mintaJson = vi.fn(async () => ({ teks: JSON.stringify(jawabanSempurna(d, 2, baris2)), model: 'm', pemakaian: { tokenMasuk: 1, tokenKeluar: 2 } }))
    const r = await susunHalaman({ nama: 'gemini', model: 'm', mintaJson }, { halaman: 2, sumber: { jenis: 'teks', baris: baris2 }, kolomSebelumnya: d.kebenaran[0].kolom, timeoutMs: 1234 })
    const [arg] = mintaJson.mock.calls[0] as unknown as [Parameters<AiProvider['mintaJson']>[0]]
    expect(arg.sistem).toBe(PROMPT_SISTEM)
    expect(arg.skema).toBe(SKEMA_SUSUN)
    expect(arg.timeoutMs).toBe(1234)
    expect(arg.isi).toHaveLength(1)
    const teks = (arg.isi[0] as { teks: string }).teks
    expect(teks).toContain('HALAMAN: 2')
    expect(teks).toContain('JUDUL HALAMAN SEBELUMNYA: ["Tanggal","Keterangan","Debet","Kredit","Saldo","Reff"]')
    expect(teks).toContain(`[004] ${baris2[3]}`)
    expect(r.pemakaian).toEqual({ tokenMasuk: 1, tokenKeluar: 2 })
  })

  it('halaman gambar: PNG ikut dikirim, tanpa teks halaman', async () => {
    const mintaJson = vi.fn(async () => ({ teks: JSON.stringify(jawabanKosong()), model: 'm', pemakaian: { tokenMasuk: 0, tokenKeluar: 0 } }))
    await susunHalaman({ nama: 'gemini', model: 'm', mintaJson }, { halaman: 1, sumber: { jenis: 'gambar', base64: 'iVBOR' }, kolomSebelumnya: [] })
    const [arg] = mintaJson.mock.calls[0] as unknown as [Parameters<AiProvider['mintaJson']>[0]]
    expect(arg.isi[1]).toEqual({ jenis: 'gambarPng', base64: 'iVBOR' })
    expect((arg.isi[0] as { teks: string }).teks).toContain('GAMBAR')
  })
})

function jawabanKosong(): JawabanSusun {
  return { periodeTeks: '', nomorBarisJudul: 0, kolom: [], peranKolom: { tanggal: '', uraian: '', nominalPertama: '', nominalKedua: '', saldo: '' }, baris: [] }
}

describe('penjaga bentuk menolak jawaban rusak — halaman gagal terlihat', async () => {
  const d = dokumenSatuKolom()
  const [baris1] = await barisTeks(d)
  const dd = dokumenDuaKolom()
  const [bd1] = await barisTeks(dd)
  const m: MasukanSusun = { halaman: 1, sumber: { jenis: 'teks', baris: baris1 }, kolomSebelumnya: [] }
  const md: MasukanSusun = { halaman: 1, sumber: { jenis: 'teks', baris: bd1 }, kolomSebelumnya: [] }
  const baik = () => jawabanSempurna(d, 1, baris1)
  const tolak = (j: unknown, masukan = m) => {
    try {
      periksaJawaban(typeof j === 'string' ? j : JSON.stringify(j), masukan)
    } catch (e) {
      expect(e).toBeInstanceOf(GalatSusun)
      return (e as GalatSusun).masalah.join(' | ')
    }
    throw new Error('jawaban rusak LOLOS penjaga')
  }

  it('jawaban sempurna lolos (garis dasar untuk kasus di bawah)', () => {
    expect(periksaJawaban(JSON.stringify(baik()), m)).toEqual(d.kebenaran[0])
  })

  const kasus: [string, (j: JawabanSusun) => unknown, string, MasukanSusun?][] = [
    ['bukan JSON', () => '{"baris": [', 'bukan JSON'],
    ['peranKolom hilang', j => ({ ...j, peranKolom: undefined }), 'peranKolom hilang'],
    ['baris tanpa saldo (bentuk tidak lengkap)', j => ({ ...j, baris: j.baris.map(({ saldo: _s, ...b }) => b) }), 'bentuk tidak lengkap'],
    ['nomor baris tidak ada', j => ({ ...j, baris: [...j.baris, { ...j.baris[0], nomorBaris: 99 }] }), 'tidak ada'],
    ['baris ganda', j => ({ ...j, baris: [j.baris[0], j.baris[0], ...j.baris.slice(1)] }), 'tidak urut/ganda'],
    ['urutan tertukar', j => ({ ...j, baris: [j.baris[1], j.baris[0], ...j.baris.slice(2)] }), 'tidak urut/ganda'],
    ['baris terlewat di tengah', j => ({ ...j, baris: j.baris.filter((_, i) => i !== 3) }), 'terlewat'],
    ['nominal diformat ulang', j => ({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, nominalPertama: '1500000.00' } : b)) }), 'tidak tersalin persis'],
    ['saldo tercetak dibuang', j => ({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, saldo: '' } : b)) }), 'tidak cocok dengan selnya'],
    ['penanda DB dibuang', j => ({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, penanda: '' } : b)) }), 'tidak cocok dengan selnya'],
    ['tahun ditambahkan ke tanggal', j => ({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, tanggal: '05/10/2026' } : b)) }), 'tidak tersalin persis'],
    ['nominal kedua di tabel satu kolom', j => ({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, nominalKedua: b.nominalPertama, nominalPertama: '' } : b)) }), 'nominal kedua'],
    ['judul kolom lain karangan', j => ({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, lain: [{ judul: 'TELLER', teks: '0000' }] } : b)) }), 'judul kolom lain'],
    ['judul peran karangan', j => ({ ...j, peranKolom: { ...j.peranKolom, saldo: 'SALDO AKHIR' } }), 'judul peran saldo'],
    ['baris judul dikirim sebagai baris', j => ({ ...j, baris: [{ ...j.baris[0], nomorBaris: j.nomorBarisJudul, tanggal: 'TANGGAL', uraian: 'KETERANGAN', nominalPertama: 'MUTASI', saldo: 'SALDO', lain: [{ judul: 'CBG', teks: 'CBG' }] }, ...j.baris] }), 'baris judul'],
    ['kolom diisi tanpa baris judul', j => ({ ...j, nomorBarisJudul: 0 }), 'tidak mencetak judul'],
    ['periode karangan', j => ({ ...j, periodeTeks: 'PERIODE : NOVEMBER 2026' }), 'periodeTeks'],
    ['baris semua sel kosong', j => ({ ...j, baris: [...j.baris, { nomorBaris: 13, tanggal: '', uraian: '', nominalPertama: '', nominalKedua: '', penanda: '', saldo: '', lain: [] }] }), 'semua sel kosong'],
  ]
  for (const [nama, rusak, pesan] of kasus) {
    it(nama, () => expect(tolak(rusak(baik()))).toContain(pesan))
  }

  it('dua kolom: penanda DB/CR pada tabel Debet/Kredit ditolak', () => {
    const j = jawabanSempurna(dd, 1, bd1)
    expect(tolak({ ...j, baris: j.baris.map((b, i) => (i === 1 ? { ...b, penanda: 'CR' } : b)) }, md)).toContain('penanda pada tabel dua kolom')
  })

  it('pesan galat tidak memuat isi baris (aman untuk log/Sentry)', () => {
    const j = baik()
    const pesan = tolak({ ...j, baris: j.baris.map(b => ({ ...b, nominalPertama: b.nominalPertama === '' ? '' : '9.999.999,99', uraian: `${b.uraian} X` })) })
    for (const b of d.kebenaran[0].baris) {
      for (const s of [b.uraian, b.saldo, b.tanggal]) if (s !== '') expect(pesan).not.toContain(s)
    }
    expect(pesan).not.toContain('9.999.999,99')
  })

  it('jawaban kosong dari AI → galat, bukan halaman kosong', async () => {
    await expect(susunHalaman(penyediaTiruan(() => ''), m)).rejects.toBeInstanceOf(GalatSusun)
  })

  it('halaman gambar: tanpa pembanding teks, tapi bentuk & urutan tetap diperiksa', () => {
    const g: MasukanSusun = { halaman: 2, sumber: { jenis: 'gambar', base64: 'x' }, kolomSebelumnya: ['TANGGAL', 'KETERANGAN', 'CBG', 'MUTASI', 'SALDO'] }
    const j: JawabanSusun = {
      ...jawabanKosong(),
      peranKolom: { tanggal: 'TANGGAL', uraian: 'KETERANGAN', nominalPertama: 'MUTASI', nominalKedua: '', saldo: 'SALDO' },
      baris: [{ nomorBaris: 1, tanggal: '20/10', uraian: 'UJI-B', nominalPertama: '1.00', nominalKedua: '', penanda: 'DB', saldo: '2.00', lain: [{ judul: 'CBG', teks: '0000' }] }],
    }
    const h = periksaJawaban(JSON.stringify(j), g)
    expect(h).toEqual({ halaman: 2, kolom: [], periodeTeks: null, baris: [{ halaman: 2, tanggal: '20/10', uraian: 'UJI-B', nominal: { bentuk: 'satu-kolom', judul: 'MUTASI', teks: '1.00', penanda: 'DB' }, saldo: '2.00', lain: [{ judul: 'CBG', teks: '0000' }] }] })
    expect(tolak({ ...j, baris: [j.baris[0], j.baris[0]] }, g)).toContain('tidak urut/ganda')
  })
})

describe('rangkumDokumen — satu periode untuk seluruh dokumen', () => {
  const h = (halaman: number, periodeTeks: string | null): HalamanMentah => ({ halaman, kolom: [], baris: [], periodeTeks })

  it('periode dari halaman pertama yang mencetaknya; halaman lain null', () => {
    expect(rangkumDokumen([h(1, 'PERIODE : OKTOBER 2026'), h(2, null)], 2)).toEqual({ periodeTeks: 'PERIODE : OKTOBER 2026', jumlahBaris: 0, peringatan: [] })
  })

  it('periode berbeda, halaman hilang/ganda/tak urut → peringatan', () => {
    const r = rangkumDokumen([h(1, 'PERIODE : OKTOBER 2026'), h(3, 'PERIODE : NOVEMBER 2026'), h(3, null), h(2, null)], 4)
    expect(r.peringatan).toEqual([
      'Halaman 3 terbaca 2 kali.',
      'Halaman 4 belum terbaca.',
      'Urutan halaman tidak naik.',
      'Teks periode berbeda antar halaman — pastikan semua halaman dari rekening koran yang sama.',
    ])
  })

  it('tanpa periode → peringatan; kolomTerakhir melompati halaman tanpa judul', () => {
    expect(rangkumDokumen([h(1, null)], 1).peringatan).toContain('Teks periode tidak ditemukan — tahun tanggal mengikuti periode yang dipilih di grid.')
    const hal = [{ ...h(1, null), kolom: ['A', 'B'] }, h(2, null)]
    expect(kolomTerakhir(hal, 3)).toEqual(['A', 'B'])
    expect(kolomTerakhir(hal, 1)).toEqual([])
  })
})
