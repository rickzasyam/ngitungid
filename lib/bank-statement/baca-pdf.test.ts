import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AMBANG_KARAKTER_TEKS, bukaPdf, type HalamanTeks } from './baca-pdf'
import { susunBaris, teksBernomor, type ItemTeks } from './susun-baris'
import { dokumenDuaKolom, dokumenLanjutanLintasHalaman, dokumenSatuKolom, dokumenSebagianScan, dokumenTanpaSaldo } from './fikstur/koleksi'
import type { BarisCetak, BarisData, DokumenSintetis } from './fikstur/dokumen-sintetis'

// X2 — pembacaan PDF dengan PDF SINTETIS: lapisan teks per halaman, satu baris
// tercetak = satu baris tata, posisi mendatar terjaga, halaman scan dikenali.

async function bacaSemua(d: DokumenSintetis): Promise<HalamanTeks[]> {
  const doc = await bukaPdf(d.pdf)
  try {
    const out: HalamanTeks[] = []
    for (let i = 1; i <= doc.jumlahHalaman; i++) out.push(await doc.bacaHalaman(i))
    return out
  } finally {
    await doc.tutup()
  }
}

/** Sel utama kiri→kanan (tanggal, uraian, nominal, saldo) + sel `lain` (posisinya bebas). */
function selBaris(b: BarisData): { utama: string[]; lain: string[] } {
  const n = b.nominal
  const nominal = n.bentuk === 'satu-kolom' ? [n.teks + (n.penanda ? ` ${n.penanda}` : '')] : [n.pertama.teks, n.kedua.teks]
  return { utama: [b.tanggal, b.uraian, ...nominal, b.saldo].filter(s => s !== ''), lain: b.lain.map(l => l.teks) }
}

const item = (teks: string, x: number, y: number, tinggi = 8): ItemTeks => ({ teks, x, y, lebar: teks.length * 4, tinggi })

describe('susunBaris (murni)', () => {
  it('kelompok per garis dasar, urut atas→bawah lalu kiri→kanan, bernomor dari 1', () => {
    const b = susunBaris([item('B', 100, 700.6), item('C', 40, 688), item('A', 40, 700), item('  ', 10, 650)])
    expect(b.map(x => [x.nomor, x.item.map(i => i.teks).join('|')])).toEqual([
      [1, 'A|B'],
      [2, 'C'],
    ])
  })

  it('posisi mendatar dipertahankan: kolom karakter ∝ x', () => {
    const [b] = susunBaris([item('aa', 0, 10), item('bb', 40, 10)])
    // satuan 4 titik per huruf → "bb" di kolom 10.
    expect(b.teks).toBe('aa        bb')
  })

  it('item yang bertumpuk tetap dipisah satu spasi', () => {
    const [b] = susunBaris([item('12345', 0, 10), item('DB', 8, 10)])
    expect(b.teks).toBe('12345 DB')
  })

  it('halaman kosong → tanpa baris; teksBernomor berawalan [nnn]', () => {
    expect(susunBaris([])).toEqual([])
    expect(teksBernomor(susunBaris([item('x', 0, 10)]))).toBe('[001] x')
  })
})

describe('bukaPdf — PDF sintetis', () => {
  for (const buat of [dokumenSatuKolom, dokumenDuaKolom, dokumenTanpaSaldo, dokumenLanjutanLintasHalaman]) {
    const d = buat()
    it(`${d.nama}: setiap baris tercetak = satu baris tata, urut, di halamannya`, async () => {
      const hal = await bacaSemua(d)
      expect(hal.map(h => h.halaman)).toEqual(d.kebenaran.map(h => h.halaman))
      for (const [i, h] of hal.entries()) {
        expect(h.perluGambar, `hal. ${h.halaman}`).toBe(false)
        let terakhir = 0
        // Judul berulang (hal. > 1) lalu baris tercetak; lanjutan uraian = satu baris tata sendiri.
        const judul: BarisCetak[] = i > 0 && d.kebenaranHalaman[i].kolom.length > 0 ? [d.kebenaranHalaman[i].baris[0]] : []
        for (const b of [...judul, ...d.cetak[i]]) {
          if ('lanjutan' in b) {
            const cocok = h.baris.find(l => l.nomor > terakhir && l.teks.trim() === b.lanjutan)
            expect(cocok, `hal. ${h.halaman}: lanjutan ${b.lanjutan}`).toBeDefined()
            terakhir = cocok!.nomor
            continue
          }
          const { utama, lain } = selBaris(b)
          const cocok = h.baris.find(l => l.nomor > terakhir && [...utama, ...lain].every(s => l.teks.includes(s)))
          expect(cocok, `hal. ${h.halaman}: ${utama.join(' | ')}`).toBeDefined()
          // Sel utama muncul kiri→kanan sesuai urutan kolomnya.
          const posisi = utama.map(s => cocok!.teks.indexOf(s))
          expect(posisi).toEqual([...posisi].sort((a, b) => a - b))
          terakhir = cocok!.nomor
        }
      }
    })
  }

  it('Debet/Kredit: angka tetap di bawah judul kolomnya walau sel sebelahnya kosong', async () => {
    const [h1] = await bacaSemua(dokumenDuaKolom())
    const judul = h1.baris.find(l => l.teks.includes('Debet'))!.teks
    const tengah = (teks: string, s: string) => teks.indexOf(s) + s.length / 2
    const [debet, kredit] = [tengah(judul, 'Debet'), tengah(judul, 'Kredit')]
    const dekatDebet = (s: string) => {
      const l = h1.baris.find(b => b.teks.includes(s))!.teks
      return Math.abs(tengah(l, s) - debet) < Math.abs(tengah(l, s) - kredit)
    }
    expect(dekatDebet('3.750.000,00'), 'keluar di bawah Debet').toBe(true)
    expect(dekatDebet('4.000.000,00'), 'masuk di bawah Kredit').toBe(false)
  })

  it('halaman tanpa lapisan teks → perluGambar; halaman lain tetap dibaca dari teks', async () => {
    const hal = await bacaSemua(dokumenSebagianScan())
    expect(hal.map(h => h.perluGambar)).toEqual([false, true])
    expect(hal[1].baris).toEqual([])
    expect(AMBANG_KARAKTER_TEKS).toBeGreaterThan('Halaman 9 / 9'.length)
  })

  it('bytes milik pemanggil tidak dilepas pdf.js — berkas bisa dibuka lagi', async () => {
    const d = dokumenSatuKolom()
    const panjang = d.pdf.byteLength
    const a = await bukaPdf(d.pdf)
    await a.tutup()
    expect(d.pdf.byteLength).toBe(panjang)
    const b = await bukaPdf(d.pdf)
    expect(b.jumlahHalaman).toBe(2)
    await b.tutup()
  })
})

describe('batas modul lib/bank-statement', () => {
  const berkas = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? berkas(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [join(dir, e.name)] : []
    )

  it('tanpa ekspresi reguler (D22)', () => {
    for (const f of berkas('lib/bank-statement')) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toContain('RegExp')
      expect(src, f).not.toContain('.match(')
      expect(src, f).not.toContain('.replace(/')
    }
  })

  // D56: PDF tidak disimpan. Pembaca hanya memegang bytes di memori.
  it('pembaca PDF tidak menyimpan atau mengirim apa pun', () => {
    const src = readFileSync(join(process.cwd(), 'lib/bank-statement/baca-pdf.ts'), 'utf8')
    for (const s of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'writeFile']) expect(src, s).not.toContain(s)
  })
})
