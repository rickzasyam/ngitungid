import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bacaNominal, pemisahDesimal, pesanGalatNominal, type RingkasPemisah } from './nominal'
import { parseNominalCell } from './csv/mutasi-kas'

const nilai = (s: string) => {
  const h = bacaNominal(s)
  return h.status === 'ok' ? h.nilai : h.status
}

describe('bacaNominal — tiga bentuk yang diminta', () => {
  it('titik ribuan + koma desimal, tanpa titik, dan titik desimal', () => {
    expect(nilai('1.500.000,25')).toBe('1500000.25')
    expect(nilai('500000,25')).toBe('500000.25')
    expect(nilai('500000.25')).toBe('500000.25')
  })

  it('satu pemisah diikuti 1–2 angka = desimal', () => {
    expect(nilai('500000,5')).toBe('500000.50')
    expect(nilai('500000.5')).toBe('500000.50')
    expect(nilai('1,5')).toBe('1.50')
    expect(nilai('1.5')).toBe('1.50')
    expect(nilai(',5')).toBe('0.50')
  })
})

describe('bacaNominal — kasus ambigu', () => {
  it('"1.000" adalah SERIBU, bukan satu koma nol', () => {
    // Pemisah ribuan selalu diikuti tepat 3 angka; desimal rupiah paling
    // banyak 2. Tiga angka di belakang satu pemisah hanya bisa berarti ribuan.
    expect(nilai('1.000')).toBe('1000.00')
    expect(nilai('1,000')).toBe('1000.00')
    expect(nilai('12.500')).toBe('12500.00')
  })

  it('"1.000,5" adalah seribu lima puluh sen', () => {
    expect(nilai('1.000,5')).toBe('1000.50')
    expect(nilai('1.000,50')).toBe('1000.50')
  })

  it('titik dan koma sama-sama muncul → yang terakhir desimal (juga gaya Inggris)', () => {
    expect(nilai('1,500,000.25')).toBe('1500000.25')
    expect(nilai('1,000.5')).toBe('1000.50')
  })

  it('pemisah di ujung tanpa angka sesudahnya = tanpa sen', () => {
    expect(nilai('5,')).toBe('5.00')
    expect(nilai('5.')).toBe('5.00')
  })

  it('kelompok ribuan yang bukan 3 angka DITOLAK, bukan ditebak', () => {
    for (const s of ['12.345.67', '1.50.000', '1.500.000.25', '10000.000', '.500', '1..000', '1.000.', '1,000.000,5']) {
      expect(bacaNominal(s).status, s).toBe('galat')
    }
  })

  it('lebih dari 2 angka desimal ditolak dengan pesan soal sen', () => {
    const h = bacaNominal('1.000,505')
    expect(h.status).toBe('galat')
    expect(h.status === 'galat' && h.pesan).toContain('2 angka desimal')
  })
})

describe('bacaNominal — bentuk kanonik tidak berubah arti', () => {
  // Nilai dari DB (numeric(18,2)) dan dari JSON lama selalu ≤ 2 desimal, jadi
  // ia tidak pernah jatuh ke aturan ribuan yang butuh tepat 3 angka.
  it('string kanonik dibaca apa adanya', () => {
    for (const [masuk, keluar] of [
      ['0', '0.00'],
      ['0.00', '0.00'],
      ['1000', '1000.00'],
      ['1000.5', '1000.50'],
      ['1000.05', '1000.05'],
      ['1500000.25', '1500000.25'],
      ['9999999999999.99', '9999999999999.99'],
    ]) {
      expect(nilai(masuk), masuk).toBe(keluar)
    }
  })

  it('nol di depan dibuang tanpa mengubah nilai', () => {
    expect(nilai('0012')).toBe('12.00')
    expect(nilai('000,50')).toBe('0.50')
  })
})

describe('bacaNominal — tambahan yang lazim diketik', () => {
  it('awalan Rp / Rp. / IDR, akhiran ,-, spasi, dan NBSP', () => {
    expect(nilai('Rp 1.500.000')).toBe('1500000.00')
    expect(nilai('Rp. 1.500.000')).toBe('1500000.00')
    expect(nilai('rp1.500.000,25')).toBe('1500000.25')
    expect(nilai('IDR 1,500,000.00')).toBe('1500000.00')
    expect(nilai('Rp 1.500.000,-')).toBe('1500000.00')
    expect(nilai('1 500 000')).toBe('1500000.00')
    expect(nilai('1 500 000,25')).toBe('1500000.25')
  })
})

describe('bacaNominal — galat terlihat, tidak pernah diam-diam jadi 0', () => {
  it('kosong dibedakan dari galat', () => {
    expect(bacaNominal('').status).toBe('kosong')
    expect(bacaNominal('   ').status).toBe('kosong')
  })

  it('negatif, huruf, dan tanpa angka → galat dengan pesan', () => {
    const pesan = (s: string) => {
      const h = bacaNominal(s)
      return h.status === 'galat' ? h.pesan : `BUKAN GALAT: ${h.status}`
    }
    expect(pesan('-500')).toContain('negatif')
    expect(pesan('(500)')).toContain('negatif')
    expect(pesan('1e5')).toContain('angka, titik, dan koma')
    expect(pesan('abc')).toContain('angka, titik, dan koma')
    expect(pesan('.')).toContain('tidak terbaca')
    expect(pesan('Rp')).toContain('tidak terbaca')
  })

  it('bukan string → galat (number diurus normalizeNominal)', () => {
    expect(bacaNominal(1000).status).toBe('galat')
    expect(bacaNominal(null).status).toBe('galat')
  })
})

describe('pesanGalatNominal — yang ditampilkan di field', () => {
  it('null untuk kosong dan yang terbaca', () => {
    expect(pesanGalatNominal('')).toBeNull()
    expect(pesanGalatNominal('1.500.000,25')).toBeNull()
  })

  it('pesan bacaNominal diteruskan apa adanya', () => {
    expect(pesanGalatNominal('500000,2x')).toContain('angka, titik, dan koma')
  })

  it('di atas batas aman sen → "terlalu besar", sama dengan penolakan toMinorUnits', () => {
    expect(pesanGalatNominal('99999999999999999')).toBe('Nominal terlalu besar.')
    expect(pesanGalatNominal('90.000.000.000.000')).toBeNull()
  })
})

describe('pemisahDesimal — inti yang dibagi dengan CSV', () => {
  const r = (o: Partial<RingkasPemisah>): RingkasPemisah => ({
    jumlahDigit: 7,
    titik: { jumlah: 0, posisiTerakhir: -1 },
    koma: { jumlah: 0, posisiTerakhir: -1 },
    terakhir: null,
    ...o,
  })

  it('dua jenis → yang terakhir', () => {
    expect(pemisahDesimal(r({ titik: { jumlah: 2, posisiTerakhir: 4 }, koma: { jumlah: 1, posisiTerakhir: 7 }, terakhir: ',' }))).toBe(',')
  })

  it('satu jenis sekali, sisa 1–2 digit → desimal; 3 digit → ribuan', () => {
    expect(pemisahDesimal(r({ jumlahDigit: 7, koma: { jumlah: 1, posisiTerakhir: 5 }, terakhir: ',' }))).toBe(',')
    expect(pemisahDesimal(r({ jumlahDigit: 7, koma: { jumlah: 1, posisiTerakhir: 6 }, terakhir: ',' }))).toBe(',')
    expect(pemisahDesimal(r({ jumlahDigit: 4, titik: { jumlah: 1, posisiTerakhir: 1 }, terakhir: '.' }))).toBeNull()
  })

  it('satu jenis lebih dari sekali → ribuan', () => {
    expect(pemisahDesimal(r({ jumlahDigit: 7, titik: { jumlah: 2, posisiTerakhir: 4 }, terakhir: '.' }))).toBeNull()
  })
})

describe('konsisten dengan impor CSV mutasi kas', () => {
  // Teks yang sama WAJIB jadi angka yang sama di form dan di CSV. Yang dibagi
  // adalah klasifikasi pemisahnya; CSV tetap longgar di luar itu (huruf, kurung).
  it('setiap bentuk sah dibaca sama persis oleh kedua pintu', () => {
    for (const s of [
      '1.500.000,25',
      '500000,25',
      '500000.25',
      '500000,5',
      '500000.5',
      '1.000',
      '1,000',
      '1.000,5',
      '1,500,000.25',
      '1.000.000',
      '0,50',
      '1500000',
    ]) {
      const form = bacaNominal(s)
      expect(form.status, s).toBe('ok')
      expect(parseNominalCell(s), s).toBe(form.status === 'ok' ? form.nilai : null)
    }
  })
})

describe('keempat form uang memakai parser bersama dan menampilkan galatnya', () => {
  const baca = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')
  const FORM: [string, string, string][] = [
    // [berkas, nama, penahan simpan yang wajib memeriksa galat nominal]
    [baca('components', 'jurnal', 'journal-form-modal.tsx'), 'jurnal', 'barisBermasalah.every(x => x === null)'],
    [baca('components', 'pembelian', 'purchase-form-modal.tsx'), 'pembelian', 'disabled={submitting || adaGalatNominal}'],
    [baca('components', 'mutasi-kas', 'mutation-form-modal.tsx'), 'mutasi', 'disabled={submitting || galatNominal !== null}'],
    [baca('components', 'mutasi-kas', 'allocation-panel.tsx'), 'alokasi', "nominal.trim() === '' || galatNominal !== null}"],
  ]

  it('memanggil pesanGalatNominal dan menandai field dengan aria-invalid + aria-describedby', () => {
    for (const [src, nama] of FORM) {
      expect(src, nama).toContain('pesanGalatNominal(')
      expect(src, nama).toContain('aria-invalid=')
      expect(src, nama).toContain('aria-describedby=')
    }
  })

  it('galat nominal MENAHAN simpan — tidak dikirim lalu diam-diam jadi 0', () => {
    for (const [src, nama, penahan] of FORM) expect(src, nama).toContain(penahan)
  })

  it('form jurnal: galat nominal diperiksa lebih dulu daripada akun kosong', () => {
    const src = FORM[0][0]
    expect(src.indexOf("return 'nominal'")).toBeLessThan(src.indexOf("return 'akun'"))
  })
})

describe('kontrak modul', () => {
  it('TIDAK ada satu pun RegExp di berkasnya (D22)', () => {
    // Masukannya ketikan pengguna, sama dengan isi CSV — aturan yang sama.
    const src = readFileSync(join(process.cwd(), 'lib', 'nominal.ts'), 'utf8')
    for (const jejak of ['new RegExp', '.match(', '.replace(/', '.test(', '.split(/']) {
      expect(src.includes(jejak), jejak).toBe(false)
    }
  })

  it('normalizeNominal dan parseNominalCell memakai modul ini, bukan aturannya sendiri', () => {
    const kontrak = readFileSync(join(process.cwd(), 'lib', 'contracts.ts'), 'utf8')
    expect(kontrak).toContain('bacaNominal(')
    expect(kontrak).not.toContain('/^\\d+(\\.\\d{1,2})?$/')
    const csv = readFileSync(join(process.cwd(), 'lib', 'csv', 'mutasi-kas.ts'), 'utf8')
    expect(csv).toContain('pemisahDesimal(')
  })
})
