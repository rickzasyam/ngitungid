import { describe, it, expect } from 'vitest'
import { BATAS_SIMPAN, gerbangSimpan, hitungUsulan, labelAkun, petaGalatServer, rantaiGrid, rencanaBerkas, rencanaTempel, ringkasGrid, teksKetikan } from './mutasi-grid-turunan'
import { buatValidator, diffKeBatch, keadaanAwal, potretCadangan, reducerGrid, TANPA_KUNCI, type BarisGrid, type BarisServer } from './mutasi-grid-state'
import { indeksAkun, selKosong, type SelDraf } from './mutasi-draf'
import { siapkanAturan, type AturanMutasi } from './aturan-mutasi'

const KAS = '11111111-1111-4111-8111-111111111111'
const OKT = { mulai: '2026-10-01', akhir: '2026-10-31' }
const COA = [
  { id: 'a-gaji', kode: '6-1001', nama: 'Beban Gaji' },
  { id: 'a-sewa', kode: '6-1002', nama: 'Beban Sewa Kantor' },
  { id: 'a-pb', kode: '1-1900', nama: 'Pindah Buku' },
]
const indeks = indeksAkun(COA)
const akunById = new Map(COA.map(a => [a.id, a]))

const baris = (kunci: string, sel: Partial<SelDraf>, o: Partial<BarisGrid> = {}): BarisGrid => ({
  kunci,
  id: null,
  sel: { ...selKosong(), ...sel },
  asal: 'ketik',
  blok: null,
  halaman: null,
  penanda: null,
  saldoDikosongkan: null,
  terkunci: TANPA_KUNCI,
  ...o,
})

const server = (id: string, o: Partial<BarisServer['nilai']> = {}, kunci = TANPA_KUNCI): BarisServer => ({
  id,
  updatedAt: '2026-10-20T00:00:00.000Z',
  nilai: { tanggal: '2026-10-05', debit: '0.00', kredit: '100.00', saldo: null, keterangan: 'TRF', catatan: null, akunLawanId: null, ...o },
  akunLawanTeks: '',
  terkunci: kunci,
})

describe('rantaiGrid — putus per KUNCI baris, jangkar D61', () => {
  const rows = [
    baris('a', { masuk: '1.000', saldo: '11.000' }),
    baris('b', { keluar: '500' }),
    baris('c', { keluar: '250,50', saldo: '10.249,50' }),
    baris('d', { masuk: '1', saldo: '99' }),
  ]
  it('rantai dari jangkar: baris c cocok, baris d putus dan dipetakan ke kuncinya', () => {
    const r = rantaiGrid(rows, '10.000')
    expect(r.utuh).toBe(false)
    expect([...r.putus.keys()]).toEqual(['d'])
    expect(r.pertama).toBe('d')
    expect(r.putus.get('d')!.selisih).toBe(9900 - 1025050)
    expect(r.putus.get('d')!.pesan).toContain('Saldo putus')
    expect(r.pertamaTanpaJangkar).toBe(false)
  })
  it('jangkar salah → baris bersaldo pertama sudah putus', () => {
    expect(rantaiGrid(rows.slice(0, 3), '9.000').pertama).toBe('a')
  })
  it('tanpa jangkar → baris bersaldo pertama tak terverifikasi, dan itu dilaporkan', () => {
    const r = rantaiGrid(rows.slice(0, 3), null)
    expect(r.utuh).toBe(true)
    expect(r.pertamaTanpaJangkar).toBe(true)
  })
})

describe('hitungUsulan — hanya sel kosong & tidak terkunci; Pindah Buku didahulukan', () => {
  const aturan: AturanMutasi[] = [
    { id: 'r1', pola: 'gaji', arah: 'keluar', akunLawanId: 'a-gaji', akunKasId: null, prioritas: 0, aktif: true },
    { id: 'r2', pola: 'sewa', arah: 'keduanya', akunLawanId: 'a-sewa', akunKasId: null, prioritas: 0, aktif: true },
    { id: 'r3', pola: 'sewa', arah: 'keduanya', akunLawanId: 'a-gaji', akunKasId: null, prioritas: 0, aktif: true },
  ]
  const siap = siapkanAturan(aturan)
  it('aturan berlaku sesuai arah; sel terisi, sel terkunci, dan bentrok tidak diusulkan', () => {
    const rows = [
      baris('k1', { uraian: 'TRF GAJI OKT', keluar: '100' }),
      baris('k2', { uraian: 'TRF GAJI OKT', masuk: '100' }), // arah salah
      baris('k3', { uraian: 'GAJI', keluar: '100', akunLawan: '6-1002' }), // sudah terisi
      baris('k4', { uraian: 'GAJI', keluar: '100' }, { terkunci: { baris: 'Terposting', kolom: {} } }),
      baris('k5', { uraian: 'BAYAR SEWA', keluar: '100' }), // dua aturan setara, akun beda
    ]
    const h = hitungUsulan({ baris: rows, akunKasId: KAS, aturan: siap, akunById, pindahBuku: new Map() })
    expect([...h.usulan.keys()]).toEqual(['k1'])
    expect(h.usulan.get('k1')).toMatchObject({ akunLawan: '6-1001', sumber: 'aturan' })
    expect(h.bentrok.get('k5')).toBe(2)
  })
  it('pasangan Pindah Buku dari server menang atas aturan', () => {
    const rows = [baris('m1', { uraian: 'TRF GAJI', keluar: '100' }, { id: 'm1', asal: 'server' })]
    const h = hitungUsulan({
      baris: rows,
      akunKasId: KAS,
      aturan: siap,
      akunById,
      pindahBuku: new Map([['m1', { akunId: 'a-pb', seberang: 'Bank BCA 6 Okt' }]]),
    })
    expect(h.usulan.get('m1')).toMatchObject({ akunLawan: '1-1900', sumber: 'pindah-buku' })
  })
})

describe('labelAkun', () => {
  it('kode/nama yang cocok → "kode · nama"; tak dikenal → apa adanya', () => {
    expect(labelAkun('6-1002', indeks)).toBe('6-1002 · Beban Sewa Kantor')
    expect(labelAkun('beban gaji', indeks)).toBe('6-1001 · Beban Gaji')
    expect(labelAkun('6-1002 · Beban Sewa Kantor', indeks)).toBe('6-1002 · Beban Sewa Kantor')
    expect(labelAkun('Beban Lain', indeks)).toBe('Beban Lain')
  })
})

describe('ringkasGrid & gerbangSimpan', () => {
  const konteks = { periode: OKT, akunKasId: KAS, akun: indeks, terkunciSampai: null }

  it('total dalam SEN — 0,10 + 0,20 = 0,30 persis', () => {
    let s = keadaanAwal()
    s = reducerGrid(s, { jenis: 'tempelSel', indeks: 0, kolom: 'tanggal', isi: [['05/10/2026', '', 'A', '0,10'], ['05/10/2026', '', 'B', '0,20']] })
    const v = buatValidator(konteks, s.server)
    const r = ringkasGrid(s.baris, diffKeBatch(s, v))
    expect(r.totalMasuk).toBe('0.30')
    expect(r.baru).toBe(2)
  })

  it('Simpan TERIKAT: galat, putus, arah wajib, dan "belum ada perubahan" menahan', () => {
    const s0 = keadaanAwal([server('m1')])
    const v0 = buatValidator(konteks, s0.server)
    const utuh = rantaiGrid(s0.baris, null)
    expect(gerbangSimpan(s0, diffKeBatch(s0, v0), utuh, false)).toMatchObject({ boleh: false, alasan: ['Belum ada perubahan.'] })

    const s1 = reducerGrid(s0, { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: 'TRF diubah' })
    const v1 = buatValidator(konteks, s1.server)
    expect(gerbangSimpan(s1, diffKeBatch(s1, v1), utuh, false)).toEqual({ boleh: true, label: 'Simpan 1 perubahan' })
    expect(gerbangSimpan(s1, diffKeBatch(s1, v1), utuh, true).boleh).toBe(false)

    const s2 = reducerGrid(s1, { jenis: 'ubahSel', kunci: 'm1', kolom: 'tanggal', nilai: '31/02/2026' })
    const g2 = gerbangSimpan(s2, diffKeBatch(s2, buatValidator(konteks, s2.server)), utuh, false)
    expect(g2.boleh === false && g2.alasan[0]).toContain('bergalat')

    const putus = rantaiGrid([baris('x', { masuk: '1', saldo: '5' })], '0')
    const g3 = gerbangSimpan(s1, diffKeBatch(s1, v1), putus, false)
    expect(g3.boleh === false && g3.alasan.join(' ')).toContain('Saldo putus')
  })

  it('blok yang arahnya wajib dipilih menahan Simpan sampai dipilih', () => {
    const t = rencanaTempel('Tanggal\tUraian\tDebet\tKredit\n05/10/2026\tA\t100\t\n06/10/2026\tB\t\t50\n', { kolom: 'tanggal' }, OKT)
    expect(t.jenis).toBe('blok')
    if (t.jenis !== 'blok') return
    const s = reducerGrid(keadaanAwal(), { jenis: 'tempelBlok', indeks: 0, hasil: t.hasil, sumber: 'tempel', namaBerkas: null })
    const v = buatValidator(konteks, s.server)
    const g = gerbangSimpan(s, diffKeBatch(s, v), rantaiGrid(s.baris, null), false)
    expect(g.boleh === false && g.alasan.join(' ')).toContain('Arah 1 blok')
    const blokId = s.baris[0].blok as string
    const s2 = reducerGrid(s, { jenis: 'pilihArah', blok: blokId, orientasi: 'normal' })
    expect(gerbangSimpan(s2, diffKeBatch(s2, v), rantaiGrid(s2.baris, null), false).boleh).toBe(true)
  })
})

describe('rencanaTempel — persegi sel atau blok transaksi', () => {
  it('judul dikenali → blok, di kolom mana pun', () => {
    expect(rencanaTempel('Tanggal\tKeterangan\tMutasi\tSaldo\n05/10/2026\tA\t100\t1.000\n', { kolom: 'catatan' }, OKT).jenis).toBe('blok')
  })
  it('mulai sel Tanggal sampai kolom Debet (urutan D63: Tanggal · Nama Akun · Uraian · Debet) → blok', () => {
    expect(rencanaTempel('05/10/2026\t\tA\t100\n06/10/2026\t\tB\t200\n', { kolom: 'tanggal' }, OKT).jenis).toBe('blok')
    // Belum mencapai Debet → persegi sel biasa.
    expect(rencanaTempel('05/10/2026\t6-1001\tA\n', { kolom: 'tanggal' }, OKT).jenis).toBe('sel')
  })
  it('blok tanpa judul dipetakan POSISIONAL mengikuti urutan kolom grid (D63)', () => {
    const t = rencanaTempel('05/10/2026\t6-1001\tGaji\t\t2.000\t8.000\tcatat\n', { kolom: 'tanggal' }, OKT)
    expect(t.jenis === 'blok' && t.hasil.baris[0].sel).toMatchObject({
      tanggal: '2026-10-05',
      akunLawan: '6-1001',
      uraian: 'Gaji',
      keluar: '2.000',
      saldo: '8.000',
      catatan: 'catat',
    })
  })
  it('persegi sel di kolom Tanggal dinormalisasi ke YYYY-MM-DD (D66), kolom lain apa adanya', () => {
    expect(rencanaTempel('5\tA\n15 Okt 2026\tB\nkemarin\tC\n', { kolom: 'tanggal' }, OKT)).toEqual({
      jenis: 'sel',
      isi: [['2026-10-05', 'A'], ['2026-10-15', 'B'], ['kemarin', 'C']],
    })
    // Mulai di kanan Tanggal: tidak ada sel tanggal yang disentuh.
    expect(rencanaTempel('5\tA\n', { kolom: 'uraian' }, OKT)).toEqual({ jenis: 'sel', isi: [['5', 'A']] })
  })
  it('ketikan: sel Tanggal dinormalisasi, sel lain apa adanya', () => {
    expect(teksKetikan('tanggal', '15', OKT)).toBe('2026-10-15')
    expect(teksKetikan('tanggal', '15/11/2026', OKT)).toBe('2026-11-15')
    expect(teksKetikan('tanggal', '04/01/2026', OKT)).toBe('04/01/2026')
    expect(teksKetikan('uraian', ' 15 ', OKT)).toBe(' 15 ')
  })
  it('satu kolom, atau mulai di luar Tanggal tanpa judul → persegi sel', () => {
    expect(rencanaTempel('6-1001\n6-1002\n', { kolom: 'akunLawan' }, OKT)).toEqual({ jenis: 'sel', isi: [['6-1001'], ['6-1002']] })
    expect(rencanaTempel('A\t100\t\n', { kolom: 'uraian' }, OKT).jenis).toBe('sel')
  })
  it('blok bertanggal bulan/hari TIDAK ditolak lagi (D66): diputus bulan grid', () => {
    const t = rencanaTempel('10/05/2026\t\tA\t100\n10/06/2026\t\tB\t200\n', { kolom: 'tanggal' }, OKT)
    expect(t.jenis === 'blok' && t.hasil.baris.map(b => b.sel.tanggal)).toEqual(['2026-10-05', '2026-10-06'])
  })
  it('kosong → galat', () => {
    expect(rencanaTempel('\n\n', { kolom: 'tanggal' }, OKT).jenis).toBe('galat')
  })
})

describe('rencanaBerkas — CSV masuk grid lewat jalur tempelan (D47)', () => {
  it('BOM dibuang, pemisah ; dikenali, judul dipetakan, sumber berkas', () => {
    const t = rencanaBerkas('\ufeffTanggal;Keterangan;Debet;Kredit;Saldo\n05/10/2026;SETOR;1.000;;11.000\n', OKT)
    expect(t.jenis).toBe('blok')
    if (t.jenis !== 'blok') return
    expect(t.hasil.baris).toHaveLength(1)
    expect(t.hasil.baris[0].sel.uraian).toBe('SETOR')
  })
  it('berkas kosong / tanpa transaksi → galat', () => {
    expect(rencanaBerkas('', OKT).jenis).toBe('galat')
    expect(rencanaBerkas('Tanggal;Keterangan;Debet\n', OKT).jenis).toBe('galat')
  })
})

describe('pulihkan (D51) — draf kembali dengan snapshot server LAMA', () => {
  it('diff sesudah dipulihkan membawa updatedAt dari saat draf dibuat', () => {
    const konteks = { periode: OKT, akunKasId: KAS, akun: indeks, terkunciSampai: null }
    const s1 = reducerGrid(keadaanAwal([server('m1')]), { jenis: 'ubahSel', kunci: 'm1', kolom: 'uraian', nilai: 'diubah' })
    const c = JSON.parse(JSON.stringify(potretCadangan(s1)))
    // Server sudah berubah sejak itu — grid dimuat ulang dengan updatedAt baru…
    const dimuat = keadaanAwal([{ ...server('m1'), updatedAt: '2026-10-21T00:00:00.000Z' }])
    // …tapi draf yang dipulihkan tetap membandingkan dengan snapshot lamanya.
    const s2 = reducerGrid(dimuat, { jenis: 'pulihkan', cadangan: c })
    const d = diffKeBatch(s2, buatValidator(konteks, s2.server))
    expect(d.ubah).toEqual([expect.objectContaining({ id: 'm1', updatedAt: '2026-10-20T00:00:00.000Z', keterangan: 'diubah' })])
    expect(s2.lalu).toEqual([])
  })
})

describe('petaGalatServer — galat route batch ke sel', () => {
  it('per kolom grid; tanpa kolom → baris; kunci di luar grid → lepas (tidak dibuang)', () => {
    const h = petaGalatServer(
      [
        { kunci: 'a', kolom: 'tanggal', pesan: 'Periode terkunci.', jenis: 'kunci' },
        { kunci: 'a', kolom: 'tanggal', pesan: 'Di luar periode.', jenis: 'validasi' },
        { kunci: 'b', pesan: 'Jurnalnya sudah diposting.', jenis: 'kunci' },
        { kunci: 'c', kolom: 'aneh', pesan: 'X', jenis: 'validasi' },
        { kunci: 'hilang', pesan: 'Mutasi tidak ditemukan.', jenis: 'tidak-ada' },
      ],
      new Set(['a', 'b', 'c'])
    )
    expect(h.perBaris.get('a')).toEqual({ tanggal: 'Periode terkunci. Di luar periode.' })
    expect(h.perBaris.get('b')).toEqual({ baris: 'Jurnalnya sudah diposting.' })
    expect(h.perBaris.get('c')).toEqual({ baris: 'X' })
    expect(h.lepas).toEqual(['Mutasi tidak ditemukan.'])
  })
})

describe('memo per objek baris', () => {
  it('rantai & usulan dengan memo = tanpa memo; baris yang diganti dihitung ulang', () => {
    const aturan = siapkanAturan([{ id: 'r1', pola: 'gaji', arah: 'keluar', akunLawanId: 'a-gaji', akunKasId: null, prioritas: 0, aktif: true }])
    const rows = [baris('a', { uraian: 'GAJI', keluar: '100', saldo: '900' }), baris('b', { uraian: 'X', keluar: '50', saldo: '850' })]
    const mR = new WeakMap()
    const mU = new WeakMap()
    const opt = { akunKasId: KAS, aturan, akunById, pindahBuku: new Map() }
    expect(rantaiGrid(rows, '1.000', mR)).toEqual(rantaiGrid(rows, '1.000'))
    expect(hitungUsulan({ baris: rows, ...opt, memo: mU }).usulan.has('a')).toBe(true)
    // baris a diisi akun lawan → objek BARU → usulan hilang walau memo lama dipakai
    const rows2 = [{ ...rows[0], sel: { ...rows[0].sel, akunLawan: '6-1001' } }, rows[1]]
    expect(hitungUsulan({ baris: rows2, ...opt, memo: mU }).usulan.has('a')).toBe(false)
    // saldo b diubah → rantai memakai nilai baru
    const rows3 = [rows[0], { ...rows[1], sel: { ...rows[1].sel, saldo: '1' } }]
    expect(rantaiGrid(rows3, '1.000', mR).utuh).toBe(false)
  })
})

describe('BATAS_SIMPAN = batas server (D52)', () => {
  it('angka grid sama dengan BATAS_* di route batch (baca-sumber)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./api/cash-mutation-batch.ts', import.meta.url), 'utf8')
    const angka = (nama: string) => Number(src.split(`export const ${nama} = `)[1].split('\n')[0].split('_').join(''))
    expect({ baru: angka('BATAS_BARU'), ubah: angka('BATAS_UBAH'), hapus: angka('BATAS_HAPUS') }).toEqual({ ...BATAS_SIMPAN })
  })
  it('melewati batas → Simpan tertahan dengan alasan', () => {
    const s = keadaanAwal()
    const diff = { baru: Array.from({ length: BATAS_SIMPAN.baru + 1 }, () => ({}) as never), ubah: [], hapus: [], berkas: [], galat: [] }
    const g = gerbangSimpan(s, diff, rantaiGrid([], null), false)
    expect(g.boleh === false && g.alasan.join(' ')).toContain('paling banyak')
  })
})
