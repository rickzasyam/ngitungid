import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bacaTanggalGrid,
  bulanGridDari,
  namaBulanGrid,
  normalisasiTanggal,
  tampakTanggal,
  tampilTanggalSel,
  tanggalDariRentang,
  urutanBlok,
  type BulanGrid,
} from './mutasi-tanggal'

// D66 (Ricko 2026-10-30): sel tanggal grid boleh diketik/ditempel dalam banyak
// bentuk, SELALU dinormalisasi ke YYYY-MM-DD, ambigu diputus bulan grid.

const OKT: BulanGrid = { tahun: 2026, bulan: 10 }
const APR: BulanGrid = { tahun: 2026, bulan: 4 }
const FEB_KABISAT: BulanGrid = { tahun: 2028, bulan: 2 }

const ok = (teks: string, g: BulanGrid = OKT) => {
  const h = bacaTanggalGrid(teks, g)
  if (h.status !== 'ok') throw new Error(`"${teks}" → ${JSON.stringify(h)}`)
  return h.ymd
}
const galat = (teks: string, g: BulanGrid = OKT) => {
  const h = bacaTanggalGrid(teks, g)
  if (h.status !== 'galat') throw new Error(`"${teks}" seharusnya galat → ${JSON.stringify(h)}`)
  return h.pesan
}

describe('bulan grid', () => {
  it('dari periode grid; nama Indonesia', () => {
    expect(bulanGridDari({ mulai: '2026-10-01' })).toEqual(OKT)
    expect(namaBulanGrid(OKT)).toBe('Oktober 2026')
    expect(namaBulanGrid(APR)).toBe('April 2026')
  })
})

describe('hari saja → tanggal itu di bulan grid', () => {
  it.each([
    ['15', '2026-10-15'],
    ['1', '2026-10-01'],
    ['01', '2026-10-01'],
    ['31', '2026-10-31'],
    [' 7 ', '2026-10-07'],
  ])('"%s" → %s', (teks, ymd) => expect(ok(teks)).toBe(ymd))

  it('hari yang tidak ada di bulan grid → galat menyebut bulannya', () => {
    expect(galat('31', APR)).toBe('Tanggal 31 tidak ada di April 2026.')
    expect(galat('0')).toBe('Tanggal 0 tidak ada di Oktober 2026.')
    expect(ok('29', FEB_KABISAT)).toBe('2028-02-29')
    expect(galat('29', { tahun: 2026, bulan: 2 })).toBe('Tanggal 29 tidak ada di Februari 2026.')
  })
})

describe('angka dengan pemisah', () => {
  it.each([
    ['15/10/2026', '2026-10-15'],
    ['5/10/2026', '2026-10-05'],
    ['15-10-2026', '2026-10-15'],
    ['15.10.2026', '2026-10-15'],
    ['5/10/26', '2026-10-05'],
    ['15/10', '2026-10-15'],
    ['2026-10-15', '2026-10-15'],
    ['2026/10/15', '2026-10-15'],
    ['2026-10-5', '2026-10-05'],
    ['15/10/2026 10:30', '2026-10-15'],
    ['2026-10-15 23:59:59', '2026-10-15'],
  ])('"%s" → %s', (teks, ymd) => expect(ok(teks)).toBe(ymd))

  it('d/m/yy: dua digit tahun = 20xx', () => {
    expect(ok('1/4/26', APR)).toBe('2026-04-01')
  })
})

describe('nama bulan Indonesia & Inggris, singkat & panjang', () => {
  it.each([
    ['15 okt 2026', '2026-10-15'],
    ['15 Okt 2026', '2026-10-15'],
    ['15 OKT 2026', '2026-10-15'],
    ['15 Oct 2026', '2026-10-15'],
    ['15 oktober 2026', '2026-10-15'],
    ['15 October 2026', '2026-10-15'],
    ['15-Okt-2026', '2026-10-15'],
    ['15okt2026', '2026-10-15'],
    ['15 Okt', '2026-10-15'],
    ['15 Okt 26', '2026-10-15'],
    ['Oct 15, 2026', '2026-10-15'],
    ['2026-Okt-15', '2026-10-15'],
  ])('"%s" → %s', (teks, ymd) => expect(ok(teks)).toBe(ymd))

  it('"21/Apr/2026" (format ekspor bank)', () => {
    expect(ok('21/Apr/2026', APR)).toBe('2026-04-21')
  })

  // Daftar dari masukan Ricko: jan feb mar apr mei/may jun jul agu/agt/ags/aug
  // sep okt/oct nov des/dec — plus bentuk panjangnya.
  it.each([
    ['jan', 1], ['januari', 1], ['january', 1],
    ['feb', 2], ['februari', 2], ['february', 2],
    ['mar', 3], ['maret', 3], ['march', 3],
    ['apr', 4], ['april', 4],
    ['mei', 5], ['may', 5],
    ['jun', 6], ['juni', 6], ['june', 6],
    ['jul', 7], ['juli', 7], ['july', 7],
    ['agu', 8], ['agt', 8], ['ags', 8], ['aug', 8], ['agustus', 8], ['august', 8],
    ['sep', 9], ['sept', 9], ['september', 9],
    ['okt', 10], ['oct', 10], ['oktober', 10], ['october', 10],
    ['nov', 11], ['november', 11], ['nopember', 11],
    ['des', 12], ['dec', 12], ['desember', 12], ['december', 12],
  ])('%s = bulan %i', (nama, bulan) => {
    const g = { tahun: 2026, bulan: bulan as number }
    expect(ok(`3 ${nama} 2026`, g)).toBe(`2026-${String(bulan).padStart(2, '0')}-03`)
  })

  it('nama bulan yang tidak dikenal → tidak terbaca', () => {
    expect(galat('15 Okto 2026')).toContain('tidak terbaca')
    expect(galat('15th Oct')).toContain('tidak terbaca')
  })
})

describe('ambigu diputuskan bulan grid (D66)', () => {
  it('contoh nyata sheet Rasyuka: "04/01/2026" di grid April 2026 = 1 April (bulan/hari)', () => {
    expect(ok('04/01/2026', APR)).toBe('2026-04-01')
  })
  it('teks yang sama di grid Januari 2026 = 4 Januari (hari/bulan)', () => {
    expect(ok('04/01/2026', { tahun: 2026, bulan: 1 })).toBe('2026-01-04')
  })
  it('"04/05/2026": April → 5 April, Mei → 4 Mei', () => {
    expect(ok('04/05/2026', APR)).toBe('2026-04-05')
    expect(ok('04/05/2026', { tahun: 2026, bulan: 5 })).toBe('2026-05-04')
  })
  it('hanya satu tafsiran yang sah → dipakai, walau bentuknya bulan/hari', () => {
    expect(ok('04/13/2026', APR)).toBe('2026-04-13')
    expect(ok('13/04/2026', APR)).toBe('2026-04-13')
  })
  it('hari = bulan: dua tafsiran itu tanggal yang sama', () => {
    expect(ok('10/10/2026')).toBe('2026-10-10')
  })
  it('tidak ada tafsiran di bulan grid → galat menyebut KEDUA bacaan', () => {
    expect(galat('04/01/2026')).toBe('Tanggal di luar Oktober 2026 (terbaca 4 Jan 2026 atau 1 Apr 2026).')
  })
})

describe('di luar bulan grid ditolak: "Tanggal di luar Oktober 2026"', () => {
  it.each([
    ['15/11/2026', 'Tanggal di luar Oktober 2026 (terbaca 15 Nov 2026).'],
    ['2026-09-30', 'Tanggal di luar Oktober 2026 (terbaca 30 Sep 2026).'],
    ['15 Okt 2025', 'Tanggal di luar Oktober 2026 (terbaca 15 Okt 2025).'],
    ['1/11', 'Tanggal di luar Oktober 2026 (terbaca 1 Nov 2026 atau 11 Jan 2026).'],
  ])('"%s"', (teks, pesan) => {
    expect(galat(teks)).toBe(pesan)
    expect(galat(teks).startsWith('Tanggal di luar Oktober 2026')).toBe(true)
  })
})

describe('tidak terbaca / tidak ada di kalender', () => {
  it.each(['abc', '123', '15/10/123', '2026-10', '15/x/2026', 'Tgl'])('"%s" → tidak terbaca', teks => {
    expect(galat(teks)).toContain('tidak terbaca')
  })
  it.each(['31/04/2026', '30/02/2026', '2026-13-01', '2026-02-30', '29 Feb 2026'])('"%s" → tidak ada di kalender', teks => {
    expect(galat(teks, APR)).toContain('tidak ada di kalender')
  })
  it('kosong → kosong (wajib-isi diurus validasi baris)', () => {
    expect(bacaTanggalGrid('', OKT)).toEqual({ status: 'kosong' })
    expect(bacaTanggalGrid('   ', OKT)).toEqual({ status: 'kosong' })
  })
})

describe('bukti blok (urutanBlok)', () => {
  it('potongan pertama > 12 → hari-bulan; kedua > 12 → bulan-hari', () => {
    expect(urutanBlok(['25/04/2026', '04/01/2026'])).toBe('hari-bulan')
    expect(urutanBlok(['04/25/2026', '04/01/2026'])).toBe('bulan-hari')
  })
  it('tanpa bukti atau bukti bertentangan → null (bulan grid yang memutuskan)', () => {
    expect(urutanBlok(['04/01/2026', '05/02/2026'])).toBeNull()
    expect(urutanBlok(['25/04/2026', '04/25/2026'])).toBeNull()
    expect(urutanBlok(['2026-04-25', '15 Okt 2026', '15', ''])).toBeNull()
  })
  it('berkas hari/bulan: "04/01/2026" di grid April TIDAK diam-diam jadi 1 April', () => {
    const urutan = urutanBlok(['25/04/2026', '04/01/2026'])
    const h = bacaTanggalGrid('04/01/2026', APR, urutan)
    expect(h).toEqual({ status: 'galat', pesan: 'Tanggal di luar April 2026 (terbaca 4 Jan 2026).' })
  })
  it('berkas bulan/hari (sheet Rasyuka): "04/01/2026" = 1 April', () => {
    const urutan = urutanBlok(['04/25/2026', '04/01/2026'])
    expect(bacaTanggalGrid('04/01/2026', APR, urutan)).toEqual({ status: 'ok', ymd: '2026-04-01' })
  })
  it('bukti blok tidak memaksa sel yang hanya sah dengan cara lain', () => {
    expect(bacaTanggalGrid('13/04/2026', APR, 'bulan-hari')).toEqual({ status: 'ok', ymd: '2026-04-13' })
  })
})

describe('normalisasi ke YYYY-MM-DD', () => {
  it('tanggal pasti → YYYY-MM-DD, di bulan grid maupun di luarnya', () => {
    expect(normalisasiTanggal('15 Okt 2026', OKT)).toBe('2026-10-15')
    expect(normalisasiTanggal('15', OKT)).toBe('2026-10-15')
    expect(normalisasiTanggal('15/11/2026', OKT)).toBe('2026-11-15')
    expect(normalisasiTanggal('04/01/2026', APR)).toBe('2026-04-01')
  })
  it('bentuk baku sendiri tetap (idempoten)', () => {
    for (const ymd of ['2026-10-01', '2026-10-31', '2026-11-15']) {
      expect(normalisasiTanggal(ymd, OKT)).toBe(ymd)
      expect(normalisasiTanggal(normalisasiTanggal(ymd, OKT), OKT)).toBe(ymd)
    }
  })
  it('ambigu tanpa tafsiran di bulan grid, atau tak terbaca → teks apa adanya (dirapikan)', () => {
    expect(normalisasiTanggal(' 04/01/2026 ', OKT)).toBe('04/01/2026')
    expect(normalisasiTanggal('abc', OKT)).toBe('abc')
    expect(normalisasiTanggal('', OKT)).toBe('')
  })
  it('dengan bukti blok, bacaan yang terbukti dipakai walau di luar bulan', () => {
    expect(normalisasiTanggal('04/01/2026', APR, 'hari-bulan')).toBe('2026-01-04')
  })
})

describe('tampilan sel: "15 Okt 2026"', () => {
  it.each([
    ['2026-10-15', '15 Okt 2026'],
    ['2026-10-01', '1 Okt 2026'],
    ['15/10/2026', '15 Okt 2026'],
    ['2026-11-15', '15 Nov 2026'],
  ])('"%s" → "%s"', (teks, tampil) => expect(tampilTanggalSel(teks, OKT)).toBe(tampil))
  it('teks yang bukan satu tanggal pasti tampil apa adanya', () => {
    expect(tampilTanggalSel('04/01/2026', OKT)).toBe('04/01/2026')
    expect(tampilTanggalSel('abc', OKT)).toBe('abc')
  })
})

describe('tampakTanggal (kelas baris blok)', () => {
  it.each(['15', '15/10/2026', '2026-10-15', '21/Apr/2026', '29/02', '15 Okt'])('"%s" → ya', t => expect(tampakTanggal(t)).toBe(true))
  it.each(['', 'SALDO AWAL', 'Tanggal', '45', '2026-13-01'])('"%s" → tidak', t => expect(tampakTanggal(t)).toBe(false))
})

describe('tanggalDariRentang — klik di date-range-picker yang dibuka dengan nilai awal', () => {
  const d = (y: number, m: number, h: number) => new Date(y, m - 1, h)
  it('klik sesudah nilai awal → [awal, klik] → tanggal klik', () => {
    expect(tanggalDariRentang({ from: d(2026, 4, 7), to: d(2026, 4, 18) }, '2026-04-07')).toBe('2026-04-18')
  })
  it('klik sebelum nilai awal → [klik, awal] → tanggal klik', () => {
    expect(tanggalDariRentang({ from: d(2026, 4, 3), to: d(2026, 4, 7) }, '2026-04-07')).toBe('2026-04-03')
  })
  it('klik nilai awal sendiri, atau klik ulang (rentang baru tanpa ujung) → tanggal mulai', () => {
    expect(tanggalDariRentang({ from: d(2026, 4, 7), to: d(2026, 4, 7) }, '2026-04-07')).toBe('2026-04-07')
    expect(tanggalDariRentang({ from: d(2026, 4, 20), to: undefined }, '2026-04-07')).toBe('2026-04-20')
  })
  it('tanpa tanggal → null', () => {
    expect(tanggalDariRentang(undefined, '2026-04-07')).toBeNull()
    expect(tanggalDariRentang({ from: undefined, to: undefined }, '2026-04-07')).toBeNull()
  })
})

describe('aturan proyek', () => {
  const src = readFileSync(join(__dirname, 'mutasi-tanggal.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  it('tanpa new Date (P2) dan tanpa RegExp (D22)', () => {
    expect(src).not.toContain('new Date')
    expect(src).not.toContain('RegExp')
    expect(src).not.toMatch(/\/[^/\n*]+\/[gimsuy]*\.(test|exec)\(/)
    expect(src).not.toContain('.match(')
    expect(src).not.toContain('.replace(')
  })
})
