import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatTampilan,
  olahKetikan,
  olahTempel,
  rapikan,
  tampilanDari,
  type KeadaanInput,
  type MaxDesimal,
} from './nominal-input'
import { bacaNominal, bacaQty, pesanGalatNominal, pesanGalatQty } from './nominal'
import { toMinorUnits } from './journal'

// ── Peniru browser: menerapkan satu tombol ke field, lalu menyerahkan hasilnya
// ke olahKetikan — persis urutan yang terjadi di onChange komponen.
const awal = (teks = '', caret = teks.length, nilai = ''): KeadaanInput => ({ teks, caret, nilai })

function ketik(s: KeadaanInput, ch: string, max: MaxDesimal = 2): KeadaanInput {
  return olahKetikan({
    sebelum: s.teks,
    nilaiSebelum: s.nilai,
    sesudah: s.teks.slice(0, s.caret) + ch + s.teks.slice(s.caret),
    caret: s.caret + ch.length,
    jenis: 'insertText',
    maxDesimal: max,
  })
}
const ketikSemua = (teks: string, max: MaxDesimal = 2, mulai = awal()) =>
  [...teks].reduce((s, ch) => ketik(s, ch, max), mulai)

function backspace(s: KeadaanInput, max: MaxDesimal = 2): KeadaanInput {
  return olahKetikan({
    sebelum: s.teks,
    nilaiSebelum: s.nilai,
    sesudah: s.teks.slice(0, s.caret - 1) + s.teks.slice(s.caret),
    caret: s.caret - 1,
    jenis: 'deleteContentBackward',
    maxDesimal: max,
  })
}
function hapusMaju(s: KeadaanInput, max: MaxDesimal = 2): KeadaanInput {
  return olahKetikan({
    sebelum: s.teks,
    nilaiSebelum: s.nilai,
    sesudah: s.teks.slice(0, s.caret) + s.teks.slice(s.caret + 1),
    caret: s.caret,
    jenis: 'deleteContentForward',
    maxDesimal: max,
  })
}
/** Field yang sudah berisi angka terformat, kursor di posisi tertentu. */
const field = (teks: string, caret: number, max: MaxDesimal = 2): KeadaanInput => {
  const s = ketikSemua(teks.split('.').join(''), max)
  expect(s.teks, 'penyiapan field').toBe(teks)
  return { ...s, caret }
}

describe('pemformatan saat mengetik', () => {
  it('ketik 1000000 → titik ribuan muncul sendiri, kursor selalu di ujung', () => {
    const langkah: string[] = []
    let s = awal()
    for (const ch of '1000000') {
      s = ketik(s, ch)
      langkah.push(s.teks)
      expect(s.caret).toBe(s.teks.length)
    }
    expect(langkah).toEqual(['1', '10', '100', '1.000', '10.000', '100.000', '1.000.000'])
    expect(s.nilai).toBe('1000000.00')
  })

  it('desimal lewat tombol koma: 1000000,25 → 1.000.000,25', () => {
    const s = ketikSemua('1000000,25')
    expect(s.teks).toBe('1.000.000,25')
    expect(s.nilai).toBe('1000000.25')
  })

  it('TOMBOL TITIK = pemisah desimal (keypad numerik), diganti koma — tidak diabaikan', () => {
    const s = ketikSemua('1000000.25')
    expect(s.teks).toBe('1.000.000,25')
    expect(s.nilai).toBe('1000000.25')
    expect(ketikSemua('5.').teks).toBe('5,')
  })

  it('koma di awal → "0,"; nol di depan dibuang', () => {
    const s = ketikSemua(',5')
    expect(s.teks).toBe('0,5')
    expect(s.nilai).toBe('0.50')
    expect(ketikSemua('0005').teks).toBe('5')
  })

  it('desimal yang diketik dipertahankan selama mengetik (termasuk nol), dirapikan saat blur', () => {
    const s = ketikSemua('1000,00')
    expect(s.teks).toBe('1.000,00')
    expect(rapikan(s.nilai, s.teks, 2)).toBe('1.000')
    const t = ketikSemua('1000,5')
    expect(t.teks).toBe('1.000,5')
    expect(rapikan(t.nilai, t.teks, 2)).toBe('1.000,50')
  })

  it('angka desimal ke-3 (uang) DITOLAK: tampilan, nilai, dan kursor tidak berubah', () => {
    const s = ketikSemua('1,25')
    const t = ketik(s, '6')
    expect(t).toEqual({ teks: '1,25', caret: 4, nilai: '1.25' })
  })

  it('qty: sampai 4 desimal, kanonik 4 desimal seperti normalizeQty; ke-5 ditolak', () => {
    const s = ketikSemua('1234,5678', 4)
    expect(s.teks).toBe('1.234,5678')
    expect(s.nilai).toBe('1234.5678')
    expect(ketik(s, '9', 4).teks).toBe('1.234,5678')
    expect(ketikSemua('2', 4).nilai).toBe('2.0000')
  })
})

describe('posisi kursor tidak meloncat', () => {
  it('menyisip di tengah angka: kursor tepat di belakang angka yang diketik', () => {
    const s = ketik(field('1.000.000', 1), '2')
    expect(s.teks).toBe('12.000.000')
    expect(s.caret).toBe(2)
  })

  it('menyisip yang melahirkan kelompok baru: kursor ikut bergeser melewati titik baru', () => {
    const s = ketik(field('100.000', 1), '2')
    expect(s.teks).toBe('1.200.000')
    expect(s.caret).toBe(3) // "1.2|00.000"
  })

  it('menyisip paling depan', () => {
    const s = ketik(field('1.000', 0), '9')
    expect(s.teks).toBe('91.000')
    expect(s.caret).toBe(1)
  })

  it('backspace di tengah yang menghilangkan titik: kursor tetap di tempat angka yang dihapus', () => {
    const s = backspace(field('1.234.567', 5)) // hapus '4'
    expect(s.teks).toBe('123.567')
    expect(s.caret).toBe(3)
    expect(s.nilai).toBe('123567.00')
  })

  it('backspace TEPAT di belakang titik → angka di depannya yang terhapus', () => {
    const s = backspace(field('12.345', 3))
    expect(s.teks).toBe('1.345')
    expect(s.caret).toBe(1)
    expect(s.nilai).toBe('1345.00')
  })

  it('delete tepat di depan titik → angka di belakangnya yang terhapus', () => {
    const s = hapusMaju(field('12.345', 2))
    expect(s.teks).toBe('1.245')
    expect(s.caret).toBe(3) // "1.2|45"
  })

  it('menyisip sebelum koma desimal', () => {
    const s = ketik({ ...ketikSemua('1000,25'), caret: 5 }, '5') // "1.000|,25"
    expect(s.teks).toBe('10.005,25')
    expect(s.caret).toBe(6)
  })

  it('tolak desimal berlebih di tengah: kursor kembali ke posisinya', () => {
    const s = ketik({ ...ketikSemua('1,25'), caret: 2 }, '9') // "1,|25" → 3 desimal
    expect(s).toEqual({ teks: '1,25', caret: 2, nilai: '1.25' })
  })
})

describe('masukan yang tidak terbaca: tampil apa adanya, galat di field', () => {
  it('huruf → teks mentah dikirim ke form, parser bersama menandainya', () => {
    const s = ketik(ketikSemua('5000'), 'x')
    expect(s.teks).toBe('5.000x')
    expect(s.nilai).toBe('5.000x')
    expect(pesanGalatNominal(s.nilai)).toContain('angka, titik, dan koma')
    // Dihapus lagi → kembali terformat.
    const t = backspace(s)
    expect(t.teks).toBe('5.000')
    expect(t.nilai).toBe('5000.00')
  })

  it('tanda minus → galat negatif', () => {
    const s = ketik(awal(), '-')
    expect(pesanGalatNominal(s.nilai)).toContain('negatif')
  })

  it('pemisah desimal kedua → galat format, bukan diabaikan', () => {
    const s = ketik(ketikSemua('1000,5'), '.')
    expect(s.teks).toBe('1.000,5,')
    expect(pesanGalatNominal(s.nilai)).toContain('tidak terbaca')
  })
})

describe('tempel', () => {
  it('"Rp 1.500.000,-", "1500000", "1,500,000.25", "1.500.000,25" terbaca benar', () => {
    const tempel = (t: string) => olahTempel({ teks: '', awal: 0, akhir: 0, tempel: t, maxDesimal: 2 })
    expect(tempel('Rp 1.500.000,-')).toEqual({ teks: '1.500.000', caret: 9, nilai: '1500000.00' })
    expect(tempel('1500000')).toMatchObject({ teks: '1.500.000', nilai: '1500000.00' })
    expect(tempel('1,500,000.25')).toMatchObject({ teks: '1.500.000,25', nilai: '1500000.25' })
    expect(tempel('1.500.000,25')).toMatchObject({ teks: '1.500.000,25', nilai: '1500000.25' })
    expect(tempel('Rp. 750.000')).toMatchObject({ teks: '750.000', nilai: '750000.00' })
  })

  it('menimpa seleksi (mis. seluruh isi field terpilih)', () => {
    const s = olahTempel({ teks: '1.000', awal: 0, akhir: 5, tempel: '2.500.000', maxDesimal: 2 })
    expect(s).toEqual({ teks: '2.500.000', caret: 9, nilai: '2500000.00' })
  })

  it('tempelan tidak terbaca → mentah + galat, tidak jadi 0', () => {
    const s = olahTempel({ teks: '', awal: 0, akhir: 0, tempel: 'abc', maxDesimal: 2 })
    expect(s.nilai).toBe('abc')
    expect(pesanGalatNominal(s.nilai)).not.toBeNull()
  })

  it('qty: "2,5" → 2,5 (kanonik 2.5000)', () => {
    const s = olahTempel({ teks: '', awal: 0, akhir: 0, tempel: '2,5', maxDesimal: 4 })
    expect(s).toMatchObject({ teks: '2,5', nilai: '2.5000' })
  })
})

describe('tampilan dari nilai luar (data ubah, subtotal otomatis, reset)', () => {
  it('sen hanya tampil bila tidak nol', () => {
    expect(tampilanDari('1000000.00', 2)).toBe('1.000.000')
    expect(tampilanDari('1000000.50', 2)).toBe('1.000.000,50')
    expect(tampilanDari('1000000.05', 2)).toBe('1.000.000,05')
    expect(tampilanDari('0.00', 2)).toBe('0')
    expect(tampilanDari('', 2)).toBe('')
  })

  it('qty: nol di belakang desimal dipangkas', () => {
    expect(tampilanDari('2.0000', 4)).toBe('2')
    expect(tampilanDari('2.5000', 4)).toBe('2,5')
    expect(tampilanDari('1000.1250', 4)).toBe('1.000,125')
  })

  it('nilai mentah yang tidak terbaca ditampilkan apa adanya', () => {
    expect(tampilanDari('12.345.67', 2)).toBe('12.345.67')
  })

  it('formatTampilan hanya menerima kanonik — tampilannya terbaca lagi ke nilai yang sama (uang)', () => {
    for (const k of ['0.00', '1.00', '999.99', '1000.00', '1000000.50', '123456789.01']) {
      const h = bacaNominal(formatTampilan(k, 2))
      expect(h.status === 'ok' && h.nilai, k).toBe(k)
    }
  })
})

describe('nilai yang terkirim SELALU kanonik', () => {
  it('berbagai angka diketik per tombol → nilai kanonik, sama dengan pembacaan server', () => {
    for (const [ketikan, kanonik] of [
      ['1', '1.00'],
      ['12', '12.00'],
      ['1500000', '1500000.00'],
      ['1500000,25', '1500000.25'],
      ['1500000.25', '1500000.25'],
      ['400000,5', '400000.50'],
      ['0,01', '0.01'],
      ['90000000000000', '90000000000000.00'],
    ]) {
      const s = ketikSemua(ketikan)
      expect(s.nilai, ketikan).toBe(kanonik)
      expect(pesanGalatNominal(s.nilai), ketikan).toBeNull()
      // Yang tampil dan yang dikirim menyatakan angka yang sama.
      expect(toMinorUnits(s.nilai), ketikan).toBe(toMinorUnits(bacaNominal(s.teks).status === 'ok' ? s.teks : 'x'))
    }
  })

  it('qty terkirim 4 desimal dan lolos parser qty', () => {
    const s = ketikSemua('12,5', 4)
    expect(s.nilai).toBe('12.5000')
    expect(pesanGalatQty(s.nilai)).toBeNull()
    expect(bacaQty(s.nilai)).toEqual({ status: 'ok', nilai: '12.5000' })
  })
})

describe('komponen & pemakaiannya (struktural)', () => {
  const baca = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
  const KOMPONEN = baca('components', 'ui', 'nominal-input.tsx')

  it('type="text" + inputMode="decimal", memakai modul ini, tanpa RegExp', () => {
    expect(KOMPONEN).toContain('type="text"')
    expect(KOMPONEN).toContain('inputMode="decimal"')
    expect(KOMPONEN).toContain('olahKetikan(')
    expect(KOMPONEN).toContain('olahTempel(')
    const modul = baca('lib', 'nominal-input.ts')
    expect(modul).toContain("from '@/lib/nominal'")
    for (const jejak of ['new RegExp', '.match(', '.replace(/', '.test(', '.split(/']) {
      expect(modul.includes(jejak), jejak).toBe(false)
    }
  })

  it('setiap field uang & qty di keempat form memakai <NominalInput>, tanpa <input> nominal sendiri', () => {
    const FIELD: [string[], string[]][] = [
      [['components', 'pembelian', 'purchase-form-modal.tsx'], ['aria-label="Harga satuan"', 'aria-label="Subtotal"', 'aria-label="PPN"', 'aria-label="Qty"']],
      [['components', 'jurnal', 'journal-form-modal.tsx'], ['aria-label={`Debit baris ${i + 1}`}', 'aria-label={`Kredit baris ${i + 1}`}']],
      [['components', 'mutasi-kas', 'mutation-form-modal.tsx'], ['id="m-nominal"']],
      [['components', 'mutasi-kas', 'allocation-panel.tsx'], ['aria-label="Nominal alokasi"']],
    ]
    for (const [berkas, penanda] of FIELD) {
      const src = baca(...berkas)
      for (const p of penanda) {
        const i = src.indexOf(p)
        expect(i, `${berkas.at(-1)}: ${p}`).toBeGreaterThan(-1)
        // Elemen pembuka terdekat sebelum penanda harus <NominalInput.
        const buka = src.lastIndexOf('<', i)
        expect(src.slice(buka, buka + 13), `${berkas.at(-1)}: ${p}`).toBe('<NominalInput')
      }
      expect(src, berkas.at(-1)).not.toContain('inputMode="decimal"')
    }
  })

  it('qty memakai batas 4 desimal dan galatnya ditampilkan', () => {
    const src = baca('components', 'pembelian', 'purchase-form-modal.tsx')
    const i = src.indexOf('aria-label="Qty"')
    expect(src.slice(src.lastIndexOf('<NominalInput', i), i)).toContain('maxDesimal={4}')
    expect(src).toContain('pesanGalatQty(')
  })
})
