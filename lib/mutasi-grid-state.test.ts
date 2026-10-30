import { describe, it, expect } from 'vitest'
import {
  BATAS_RIWAYAT,
  TANPA_KUNCI,
  adaPerubahan,
  blokWajibPilih,
  buatValidator,
  diffKeBatch,
  jangkarGrid,
  keadaanAwal,
  reducerGrid,
  type AksiGrid,
  type BarisServer,
  type KeadaanGrid,
  type KonteksGrid,
} from './mutasi-grid-state'
import { bacaBlok, belahTempelan, indeksAkun, type HasilBacaBlok, type Periode } from './mutasi-draf'

const KAS = '11111111-1111-4111-8111-111111111111'
const ADMIN = '22222222-2222-4222-8222-222222222222'
const JUAL = '33333333-3333-4333-8333-333333333333'
const OKT: Periode = { mulai: '2026-10-01', akhir: '2026-10-31' }

const konteks: KonteksGrid = {
  periode: OKT,
  akunKasId: KAS,
  akun: indeksAkun([
    { id: KAS, kode: '1-1100', nama: 'Bank BCA' },
    { id: ADMIN, kode: '6-2000', nama: 'Biaya Admin' },
    { id: JUAL, kode: '4-1000', nama: 'Penjualan' },
  ]),
  terkunciSampai: null,
}

const server = (id: string, o: Partial<BarisServer['nilai']> = {}, terkunci = TANPA_KUNCI): BarisServer => ({
  id,
  updatedAt: `2026-10-27T00:00:00.000Z#${id}`,
  akunLawanTeks: o.akunLawanId === ADMIN ? '6-2000' : '',
  terkunci,
  nilai: {
    tanggal: '2026-10-05',
    debit: '0.00',
    kredit: '6500.00',
    saldo: '993500.00',
    keterangan: 'BIAYA ADM',
    catatan: null,
    akunLawanId: null,
    ...o,
  },
})

const jalankan = (s: KeadaanGrid, ...aksi: AksiGrid[]) => aksi.reduce(reducerGrid, s)
const diff = (s: KeadaanGrid, k: KonteksGrid = konteks) => diffKeBatch(s, buatValidator(k, s.server))

function blok(teks: string, sumber: 'tempel' | 'berkas' | 'pdf' = 'tempel'): Extract<HasilBacaBlok, { ok: true }> {
  const { baris, nomor } = belahTempelan(teks)
  const h = bacaBlok({ baris, nomor, sumber: sumber === 'pdf' ? 'pdf' : sumber, periode: OKT })
  if (!h.ok) throw new Error(h.pesan)
  return h
}

describe('muat & sel dari server', () => {
  it('baris server: tanggal baku YYYY-MM-DD (D66), uang format Indonesia', () => {
    const s = keadaanAwal([server('m1', { akunLawanId: ADMIN })])
    expect(s.baris[0].sel).toEqual({
      tanggal: '2026-10-05',
      uraian: 'BIAYA ADM',
      masuk: '',
      keluar: '6.500',
      saldo: '993.500',
      akunLawan: '6-2000',
      catatan: '',
    })
  })

  it('keadaan yang baru dimuat tidak punya perubahan', () => {
    const s = keadaanAwal([server('m1', { akunLawanId: ADMIN })])
    expect(adaPerubahan(diff(s))).toBe(false)
  })
})

describe('ubahSel & identitas baris', () => {
  it('baris yang TIDAK disentuh tetap objek yang sama (memo validasi bergantung padanya)', () => {
    const s0 = keadaanAwal([server('m1'), server('m2')])
    const s1 = reducerGrid(s0, { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: 'X' })
    expect(s1.baris[1]).toBe(s0.baris[1])
    expect(s1.baris[0]).not.toBe(s0.baris[0])
  })

  it('nilai yang sama → tidak ada aksi di riwayat', () => {
    const s0 = keadaanAwal([server('m1')])
    expect(reducerGrid(s0, { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: 'BIAYA ADM' })).toBe(s0)
  })
})

describe('diffKeBatch — atas NILAI, Masuk/Keluar → debit/kredit hanya di sini', () => {
  it('baris yang dikembalikan ke nilai semula TIDAK ikut diff, walau teksnya beda', () => {
    const s = jalankan(
      keadaanAwal([server('m1')]),
      { jenis: 'ubahSel', kunci: 'm1', kolom: 'keluar', nilai: '7.000' },
      { jenis: 'ubahSel', kunci: 'm1', kolom: 'keluar', nilai: '6500' }
    )
    expect(diff(s).ubah).toEqual([])
  })

  it('ubah membawa updatedAt (konkurensi 409, S7); Masuk → debit (D36)', () => {
    const s = jalankan(keadaanAwal([server('m1')]), { jenis: 'ubahSel', kunci: 'm1', kolom: 'keluar', nilai: '' }, { jenis: 'ubahSel', kunci: 'm1', kolom: 'masuk', nilai: '6.500' })
    const d = diff(s)
    expect(d.ubah).toHaveLength(1)
    expect(d.ubah[0]).toMatchObject({ id: 'm1', updatedAt: '2026-10-27T00:00:00.000Z#m1', debit: '6500.00', kredit: '0.00' })
  })

  it('hapus membawa updatedAt; baris baru kosong bukan mutasi', () => {
    const s = jalankan(keadaanAwal([server('m1')]), { jenis: 'hapusBaris', kunci: ['m1'] }, { jenis: 'tambahBaris', indeks: 0, jumlah: 3 })
    const d = diff(s)
    expect(d.hapus).toEqual([{ id: 'm1', updatedAt: '2026-10-27T00:00:00.000Z#m1' }])
    expect(d.baru).toEqual([])
  })

  it('baris baru bernomor urut Simpan (urutan, D49) dalam urutan grid', () => {
    const s = jalankan(
      keadaanAwal(),
      { jenis: 'tempelBlok', indeks: 0, hasil: blok('Tanggal\tUraian\tMasuk\tKeluar\n05/10/2026\tA\t100\t\n05/10/2026\tB\t200\t\n'), sumber: 'tempel', namaBerkas: null },
      { jenis: 'pilihArah', blok: 'blok-1', orientasi: 'normal' }
    )
    expect(diff(s).baru.map(b => [b.keterangan, b.urutan, b.debit])).toEqual([
      ['A', 1, '100.00'],
      ['B', 2, '200.00'],
    ])
  })

  it('baris galat masuk daftar galat dan TIDAK ikut terkirim', () => {
    const s = jalankan(keadaanAwal(), { jenis: 'tempelSel', indeks: 0, kolom: 'tanggal', isi: [['31/02/2026', 'X', '100']] })
    const d = diff(s)
    expect(d.baru).toEqual([])
    expect(d.galat).toHaveLength(1)
  })

  it('baris tersimpan yang galat tapi TIDAK disentuh tidak menahan Simpan', () => {
    const s = keadaanAwal([server('m1', { akunLawanId: ADMIN }), server('m2')])
    // Konteks tanpa akun 6-2000 → baris m1 galat, padahal datanya dari server.
    const k = { ...konteks, akun: indeksAkun([{ id: KAS, kode: '1-1100', nama: 'Bank BCA' }]) }
    expect(diff(s, k).galat).toEqual([])
  })

  it('berkas/PDF → satu entri berkas per blok (cash_mutation_imports, N4)', () => {
    const s = jalankan(keadaanAwal(), {
      jenis: 'tempelBlok',
      indeks: 0,
      hasil: blok('Tanggal\tUraian\tMasuk\tKeluar\n05/10/2026\tA\t100\t\n06/10/2026\tB\t\t50\n', 'berkas'),
      sumber: 'berkas',
      namaBerkas: 'okt.csv',
    })
    const s2 = reducerGrid(s, { jenis: 'pilihArah', blok: 'blok-1', orientasi: 'normal' })
    expect(diff(s2).berkas).toEqual([{ blok: 'blok-1', namaBerkas: 'okt.csv', sumber: 'berkas' }])
  })
})

describe('tempel', () => {
  it('tempelSel menimpa persegi dari sel aktif, menambah baris di luar akhir grid', () => {
    const s = jalankan(keadaanAwal([server('m1')]), { jenis: 'tempelSel', indeks: 0, kolom: 'akunLawan', isi: [['6-2000'], ['4-1000']] })
    expect(s.baris).toHaveLength(2)
    expect(s.baris[0].sel.akunLawan).toBe('6-2000')
    expect(s.baris[1]).toMatchObject({ id: null, asal: 'tempel' })
    expect(s.baris[1].sel.akunLawan).toBe('4-1000')
  })

  it('tempelBlok DISISIPKAN sebagai baris baru — tidak pernah menimpa mutasi tersimpan', () => {
    const s0 = keadaanAwal([server('m1')])
    const s = jalankan(s0, {
      jenis: 'tempelBlok',
      indeks: 0,
      hasil: blok('Tanggal\tUraian\tMasuk\n05/10/2026\tA\t100\n'),
      sumber: 'tempel',
      namaBerkas: null,
    })
    expect(s.baris.map(b => b.kunci)).toEqual(['baru-2', 'm1'])
    // Mutasi tersimpan tidak tersentuh sama sekali — objek yang sama.
    expect(s.baris[1]).toBe(s0.baris[0])
  })

  it('arah TERBALIK terdeteksi dari saldo → ditukar otomatis, tidak wajib dipilih', () => {
    const s = jalankan(keadaanAwal(), {
      jenis: 'tempelBlok',
      indeks: 0,
      hasil: blok(
        'Tanggal\tUraian\tDebet\tKredit\tSaldo\n01/10/2026\tSALDO AWAL\t\t\t1.000\n' +
          '02/10/2026\tTRF\t500\t\t500\n03/10/2026\tSETOR\t\t200\t700\n'
      ),
      sumber: 'tempel',
      namaBerkas: null,
    })
    expect(s.blok['blok-1']).toMatchObject({ status: 'otomatis', diterapkan: 'tukar' })
    expect(s.baris.map(b => [b.sel.masuk, b.sel.keluar])).toEqual([
      ['', '500'],
      ['200', ''],
    ])
    expect(blokWajibPilih(s)).toEqual([])
    // SALDO AWAL blok pembuka grid jadi jangkar (D61).
    expect(jangkarGrid(s, '5000000.00', '')).toEqual({ teks: '1.000', sumber: 'blok' })
  })

  it('tanpa saldo → arah WAJIB dipilih; pilihArah menukar sesuai pilihan dan melepas Simpan', () => {
    let s = jalankan(keadaanAwal(), {
      jenis: 'tempelBlok',
      indeks: 0,
      hasil: blok('Tanggal\tUraian\tDebet\tKredit\n02/10/2026\tA\t500\t\n'),
      sumber: 'tempel',
      namaBerkas: null,
    })
    expect(blokWajibPilih(s).map(b => b.id)).toEqual(['blok-1'])
    s = reducerGrid(s, { jenis: 'pilihArah', blok: 'blok-1', orientasi: 'tukar' })
    expect(s.baris[0].sel).toMatchObject({ masuk: '', keluar: '500' })
    expect(blokWajibPilih(s)).toEqual([])
    // Mengonfirmasi orientasi yang sudah diterapkan juga melepas Simpan, tanpa menukar.
    let t = jalankan(keadaanAwal(), {
      jenis: 'tempelBlok',
      indeks: 0,
      hasil: blok('Tanggal\tUraian\tDebet\tKredit\n02/10/2026\tA\t500\t\n'),
      sumber: 'tempel',
      namaBerkas: null,
    })
    t = reducerGrid(t, { jenis: 'pilihArah', blok: 'blok-1', orientasi: 'normal' })
    expect(t.baris[0].sel.masuk).toBe('500')
    expect(blokWajibPilih(t)).toEqual([])
  })
})

describe('sel terkunci kebal — ketik, tempel, dan aksi massal', () => {
  const terkunci = { baris: 'Jurnal sudah diposting.', kolom: {} }
  const alokasi = { baris: null, kolom: { masuk: 'Sudah dialokasikan.', keluar: 'Sudah dialokasikan.' } }
  const s0 = keadaanAwal([server('m1', {}, terkunci), server('m2', {}, alokasi), server('m3')])

  it('ubahSel ditolak dengan alasan, keadaan baris tidak berubah', () => {
    const s = reducerGrid(s0, { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: 'X' })
    expect(s.baris).toBe(s0.baris)
    expect(s.laporan?.dilewati).toEqual([{ kunci: 'm1', alasan: 'Jurnal sudah diposting.' }])
  })

  it('tempelSel melompati sel terkunci dan melaporkannya', () => {
    const s = reducerGrid(s0, { jenis: 'tempelSel', indeks: 0, kolom: 'keluar', isi: [['1'], ['2'], ['3']] })
    expect(s.baris[0].sel.keluar).toBe('6.500')
    expect(s.baris[1].sel.keluar).toBe('6.500')
    expect(s.baris[2].sel.keluar).toBe('3')
    expect(s.laporan?.dilewati.map(d => d.kunci)).toEqual(['m1', 'm2'])
  })

  it('aksi massal: baris terkunci dilewati dan dilaporkan', () => {
    const s = reducerGrid(s0, { jenis: 'isiAkunLawanMassal', kunci: ['m1', 'm2', 'm3'], akunLawan: '6-2000' })
    expect(s.laporan).toEqual({ aksi: 'Isi akun lawan', diterapkan: 2, dilewati: [{ kunci: 'm1', alasan: 'Jurnal sudah diposting.' }] })
  })

  it('baris terkunci tidak bisa dihapus', () => {
    const s = reducerGrid(s0, { jenis: 'hapusBaris', kunci: ['m1', 'm3'] })
    expect(s.baris.map(b => b.kunci)).toEqual(['m1', 'm2'])
    expect(s.laporan?.dilewati).toHaveLength(1)
  })

  it('pilihArah tidak menukar Masuk/Keluar baris yang nominalnya terkunci', () => {
    const s1 = { ...s0, baris: s0.baris.map(b => (b.kunci === 'm2' ? { ...b, blok: 'blok-x' } : b)), blok: { 'blok-x': { id: 'blok-x', sumber: 'tempel' as const, namaBerkas: null, judulNominal: ['Debet', 'Kredit'], pertamaKe: 'masuk' as const, satuKolom: false, diterapkan: 'normal' as const, status: 'wajib' as const, alasan: '', peringatan: null, dilewati: [], jangkarSaldo: null } } }
    const s = reducerGrid(s1, { jenis: 'pilihArah', blok: 'blok-x', orientasi: 'tukar' })
    expect(s.baris[1].sel.keluar).toBe('6.500')
    expect(s.laporan?.dilewati.map(d => d.kunci)).toEqual(['m2'])
  })
})

describe('usulan TIDAK masuk diff sebelum diterapkan', () => {
  it('terapkanUsulan menulis akun lawan; sebelum itu diff kosong', () => {
    const s0 = keadaanAwal([server('m1')])
    expect(diff(s0).ubah).toEqual([])
    const s1 = reducerGrid(s0, { jenis: 'terapkanUsulan', usulan: [{ kunci: 'm1', akunLawan: '6-2000' }] })
    expect(diff(s1).ubah[0].akunLawanId).toBe(ADMIN)
  })
})

describe('D60 & D50', () => {
  it('isiTanggalAkhirPeriode HANYA mengisi baris yang tanggalnya kosong', () => {
    const s = jalankan(
      keadaanAwal([server('m1')]),
      { jenis: 'tempelSel', indeks: 1, kolom: 'uraian', isi: [['tanpa tanggal', '5']] },
      { jenis: 'isiTanggalAkhirPeriode', kunci: ['m1', 'baru-1'], tanggal: '2026-10-31' }
    )
    expect(s.baris[0].sel.tanggal).toBe('2026-10-05')
    expect(s.baris[1].sel.tanggal).toBe('2026-10-31')
    expect(s.laporan?.dilewati).toEqual([{ kunci: 'm1', alasan: 'Sudah bertanggal.' }])
  })

  it('kosongkanSaldo: saldo asli disimpan (terlihat) dan dikirim sebagai saldoDikosongkan (event)', () => {
    const s = reducerGrid(keadaanAwal([server('m1')]), { jenis: 'kosongkanSaldo', kunci: ['m1'] })
    expect(s.baris[0].sel.saldo).toBe('')
    expect(s.baris[0].saldoDikosongkan).toBe('993.500')
    expect(diff(s).ubah[0]).toMatchObject({ saldo: null, saldoDikosongkan: '993500.00' })
  })

  it('menghapus sel saldo dokumen dengan Delete juga TERCATAT, bukan diam-diam', () => {
    const s = reducerGrid(keadaanAwal([server('m1')]), { jenis: 'ubahSel', kunci: 'm1', kolom: 'saldo', nilai: '' })
    expect(s.baris[0].saldoDikosongkan).toBe('993.500')
    expect(diff(s).ubah[0].saldoDikosongkan).toBe('993500.00')
  })

  it('saldo di baris KETIKAN bukan fakta dokumen — menghapusnya tidak ditandai', () => {
    const s = jalankan(
      keadaanAwal(),
      { jenis: 'tambahBaris', indeks: 0, jumlah: 1 },
      { jenis: 'ubahSel', kunci: 'baru-1', kolom: 'saldo', nilai: '100' },
      { jenis: 'ubahSel', kunci: 'baru-1', kolom: 'saldo', nilai: '' }
    )
    expect(s.baris[0].saldoDikosongkan).toBeNull()
  })

  it('baris baru dari tempelan yang saldonya dikosongkan membawa saldo asli kanonik', () => {
    const s = jalankan(
      keadaanAwal(),
      { jenis: 'tempelBlok', indeks: 0, hasil: blok('Tanggal\tUraian\tMasuk\tSaldo\n05/10/2026\tA\t100\t1.234,50\n'), sumber: 'tempel', namaBerkas: null },
      { jenis: 'kosongkanSaldo', kunci: ['baru-2'] }
    )
    const d = diff(s)
    expect(d.baru[0]).toMatchObject({ saldo: null, saldoDikosongkan: '1234.50' })
  })
})

describe('undo / redo', () => {
  it('undo sesudah tempel 10.000 baris memulihkan keadaan PERSIS (identitas array yang sama)', () => {
    const baris = ['Tanggal\tUraian\tMasuk\tKeluar\tSaldo', '01/10/2026\tSALDO AWAL\t\t\t0']
    let saldo = 0
    for (let i = 0; i < 10_000; i++) {
      saldo += i % 2 ? 1000 : -500
      baris.push(`${String((i % 28) + 1).padStart(2, '0')}/10/2026\tT${i}\t${i % 2 ? '1.000' : ''}\t${i % 2 ? '' : '500'}\t${saldo}`)
    }
    const s0 = keadaanAwal([server('m1')])
    const t0 = performance.now()
    const s1 = reducerGrid(s0, { jenis: 'tempelBlok', indeks: 1, hasil: blok(baris.join('\n')), sumber: 'tempel', namaBerkas: null })
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(s1.baris).toHaveLength(10_001)
    const s2 = reducerGrid(s1, { jenis: 'undo' })
    expect(s2.baris).toBe(s0.baris)
    expect(s2.blok).toBe(s0.blok)
    const s3 = reducerGrid(s2, { jenis: 'redo' })
    expect(s3.baris).toBe(s1.baris)
  })

  it('riwayat dibatasi 100 aksi; aksi baru mengosongkan redo', () => {
    let s = keadaanAwal([server('m1')])
    for (let i = 0; i < BATAS_RIWAYAT + 20; i++) s = reducerGrid(s, { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: `v${i}` })
    expect(s.lalu).toHaveLength(BATAS_RIWAYAT)
    s = reducerGrid(s, { jenis: 'undo' })
    expect(s.nanti).toHaveLength(1)
    s = reducerGrid(s, { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: 'baru' })
    expect(s.nanti).toHaveLength(0)
  })

  it('buangSemua kembali ke keadaan server — dan bisa di-undo', () => {
    const s0 = keadaanAwal([server('m1'), server('m2')])
    const s1 = jalankan(s0, { jenis: 'hapusBaris', kunci: ['m1'] }, { jenis: 'tambahBaris', indeks: 0, jumlah: 2 })
    const s2 = reducerGrid(s1, { jenis: 'buangSemua' })
    expect(s2.baris.map(b => b.kunci)).toEqual(['m1', 'm2'])
    expect(adaPerubahan(diff(s2))).toBe(false)
    expect(reducerGrid(s2, { jenis: 'undo' }).baris).toBe(s1.baris)
  })
})

describe('validator: kunci periode untuk baris baru/berubah tanggal', () => {
  it('tanggal baru ≤ kunci periode → galat; baris tersimpan yang tanggalnya tidak berubah → bebas', () => {
    const k = { ...konteks, terkunciSampai: '2026-10-10' }
    const s0 = keadaanAwal([server('m1')])
    const v = buatValidator(k, s0.server)
    expect(v(s0.baris[0]).galat).toEqual({})
    const s1 = jalankan(s0, { jenis: 'tambahBaris', indeks: 1, jumlah: 1 }, { jenis: 'tempelSel', indeks: 1, kolom: 'tanggal', isi: [['09/10/2026', '', 'X', '100']] })
    expect(buatValidator(k, s1.server)(s1.baris[1]).galat.tanggal).toContain('Periode terkunci')
  })

  it('di-memo per objek baris', () => {
    const s = keadaanAwal([server('m1')])
    const v = buatValidator(konteks, s.server)
    expect(v(s.baris[0])).toBe(v(s.baris[0]))
  })
})
