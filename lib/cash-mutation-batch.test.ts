import { describe, it, expect, vi, beforeEach } from 'vitest'

// Perencana diuji SUNGGUHAN, dengan DB di-mock (pola lib/ai-features.test.ts).
// `db` hanya bisa MEMBACA: tidak ada insert/update/delete/batch, jadi apa pun
// yang mencoba menyusun tulisan di jalur galat langsung melempar. Kueri ke
// cash_mutations mengembalikan `tersimpan`, kueri alokasi (innerJoin)
// mengembalikan `alokasiTersimpan`, selebihnya [].
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: async () => (t === cashMutations ? tersimpan : []),
        innerJoin: () => ({ where: async () => alokasiTersimpan }),
      }),
    }),
  },
}))
vi.mock('@/lib/api/cash-mutation-queries', () => ({
  loadCashAccount: vi.fn(async (_c: string, id: string) => (id === KAS ? { id: KAS } : null)),
}))
vi.mock('@/lib/api/period-lock', () => ({ loadPeriodLocks: vi.fn(async () => locks) }))
vi.mock('@/lib/api/cash-mutation-journal', () => ({
  muatInfoJurnal: vi.fn(async () => infoJurnal),
  rencanakanJurnalMutasi: vi.fn(async () => {
    throw new Error('SAMPAI_PERENCANA_JURNAL — tidak boleh di jalur galat')
  }),
}))

import { rencanakanSimpanMutasi, jawabanTunggal, BATAS_BARU, type MasukanBaru, type MasukanUbah, type PermintaanSimpan } from './api/cash-mutation-batch'
import { cashMutations } from './db/schema'
import { ALASAN_TERALOKASI, ALASAN_TERPOSTING } from './cash-mutation'

const KAS = '11111111-1111-4111-8111-111111111111'
const CLIENT = '99999999-9999-4999-8999-999999999999'
let locks: { terkunciSampai: string }[] = []
let tersimpan: Record<string, unknown>[] = []
let alokasiTersimpan: Record<string, unknown>[] = []
let infoJurnal = new Map<string, { status: string; dibalik: boolean }>()

const baris = (o: Partial<MasukanBaru> = {}): MasukanBaru => ({
  kunci: `baru-${Math.random()}`,
  tanggal: '2026-10-05',
  debit: '1000.00',
  kredit: '0.00',
  saldo: null,
  keterangan: 'TRF',
  catatan: null,
  akunLawanId: null,
  urutan: 1,
  asal: 'tempel',
  blok: null,
  saldoDikosongkan: null,
  ...o,
})

const minta = (o: Partial<PermintaanSimpan>): PermintaanSimpan => ({
  clientId: CLIENT,
  akunKasId: KAS,
  periode: { mulai: '2026-10-01', akhir: '2026-10-31' },
  baru: [],
  ubah: [],
  hapus: [],
  berkas: [],
  dryRun: false,
  ...o,
})

beforeEach(() => {
  locks = []
  tersimpan = []
  alokasiTersimpan = []
  infoJurnal = new Map()
})

// ── Baris yang sudah tersimpan (untuk ubah/hapus) ──
const ID = '44444444-4444-4444-8444-444444444444'
const JURNAL = '55555555-5555-4555-8555-555555555555'
const WAKTU = '2026-10-20T03:04:05.678Z'
const simpanLama = (o: Record<string, unknown> = {}) => {
  tersimpan = [
    {
      id: ID,
      clientId: CLIENT,
      akunKasId: KAS,
      akunLawanId: null,
      tanggal: '2026-10-05',
      keterangan: 'TRF',
      debit: '1000.00',
      kredit: '0.00',
      saldo: null,
      catatan: null,
      journalId: JURNAL,
      updatedAt: new Date(WAKTU),
      ...o,
    },
  ]
}
const ubahBaris = (o: Partial<MasukanUbah> = {}): MasukanUbah => ({
  id: ID,
  updatedAt: WAKTU,
  tanggal: '2026-10-05',
  debit: '1000.00',
  kredit: '0.00',
  saldo: null,
  keterangan: 'TRF diubah',
  catatan: null,
  akunLawanId: null,
  saldoDikosongkan: null,
  ...o,
})

describe('rencanakanSimpanMutasi — semua atau tidak sama sekali', () => {
  it('SATU baris galat di antara yang sah → ditolak, nol statement, galat per baris & per kolom', async () => {
    const h = await rencanakanSimpanMutasi(
      minta({ baru: [baris({ kunci: 'a' }), baris({ kunci: 'b', tanggal: '2026-02-31' }), baris({ kunci: 'c' })] }),
      'user-1'
    )
    expect(h.jenis).toBe('tolak')
    if (h.jenis !== 'tolak') return
    expect(h.status).toBe(400)
    expect(h.body.galat).toEqual([{ kunci: 'b', kolom: 'tanggal', pesan: 'Tanggal mutasi tidak valid (format YYYY-MM-DD).', jenis: 'validasi' }])
    expect('statements' in h).toBe(false)
  })

  it('tanggal di luar periode yang dikirim → galat sel tanggal', async () => {
    const h = await rencanakanSimpanMutasi(minta({ baru: [baris({ kunci: 'a', tanggal: '2026-11-01' })] }), 'u')
    expect(h.jenis === 'tolak' && (h.body.galat as { kolom: string }[])[0].kolom).toBe('tanggal')
  })

  it('Masuk DAN Keluar terisi → galat (cermin CHECK D36)', async () => {
    const h = await rencanakanSimpanMutasi(minta({ baru: [baris({ kunci: 'a', kredit: '5' })] }), 'u')
    expect(h.jenis).toBe('tolak')
  })

  it('Ref (0022, D64) lebih dari 100 karakter → galat sel ref', async () => {
    const h = await rencanakanSimpanMutasi(minta({ baru: [baris({ kunci: 'a', ref: 'x'.repeat(101) })] }), 'u')
    expect(h.jenis === 'tolak' && h.body.galat).toEqual([{ kunci: 'a', kolom: 'ref', pesan: 'Ref maksimal 100 karakter.', jenis: 'validasi' }])
  })

  it('akun lawan = akun kas → galat sel akun lawan', async () => {
    const h = await rencanakanSimpanMutasi(minta({ baru: [baris({ kunci: 'a', akunLawanId: KAS })] }), 'u')
    expect(h.jenis === 'tolak' && (h.body.galat as { kolom: string }[]).map(g => g.kolom)).toContain('akunLawan')
  })

  it('tanggal di periode TERKUNCI → 409 (jenis kunci), nol statement', async () => {
    locks = [{ terkunciSampai: '2026-10-10' }]
    const h = await rencanakanSimpanMutasi(minta({ baru: [baris({ kunci: 'a', tanggal: '2026-10-10' })] }), 'u')
    expect(h.jenis).toBe('tolak')
    if (h.jenis === 'tolak') {
      expect(h.status).toBe(409)
      expect((h.body.galat as { jenis: string }[])[0].jenis).toBe('kunci')
    }
  })

  it('melewati batas D52 → 413, TIDAK dipecah diam-diam', async () => {
    const banyak = Array.from({ length: BATAS_BARU + 1 }, (_, i) => baris({ kunci: `k${i}` }))
    const h = await rencanakanSimpanMutasi(minta({ baru: banyak }), 'u')
    expect(h.jenis === 'tolak' && h.status).toBe(413)
  })

  it('kunci baris baru ganda / id ubah-hapus ganda → 400', async () => {
    expect((await rencanakanSimpanMutasi(minta({ baru: [baris({ kunci: 'x' }), baris({ kunci: 'x' })] }), 'u')).jenis).toBe('tolak')
    const id = '22222222-2222-4222-8222-222222222222'
    const h = await rencanakanSimpanMutasi(minta({ hapus: [{ id, updatedAt: '' }, { id, updatedAt: '' }] }), 'u')
    expect(h.jenis === 'tolak' && h.status).toBe(400)
  })

  it('akun kas yang bukan akun kas/bank klien → 400 sebelum apa pun', async () => {
    const h = await rencanakanSimpanMutasi(minta({ akunKasId: '33333333-3333-4333-8333-333333333333', baru: [baris()] }), 'u')
    expect(h.jenis === 'tolak' && h.status).toBe(400)
  })
})

describe('rencanakanSimpanMutasi — konkurensi & kunci baris tersimpan', () => {
  it('updatedAt berbeda → 409 untuk SELURUH batch, id-nya disebut di `konflik`', async () => {
    simpanLama()
    const h = await rencanakanSimpanMutasi(
      minta({ baru: [baris({ kunci: 'a' })], ubah: [ubahBaris({ updatedAt: '2026-10-20T03:04:05.000Z' })] }),
      'u'
    )
    expect(h.jenis).toBe('tolak')
    if (h.jenis !== 'tolak') return
    expect(h.status).toBe(409)
    expect(h.body.konflik).toEqual([ID])
  })

  it('updatedAt berbeda pada HAPUS juga konflik', async () => {
    simpanLama()
    const h = await rencanakanSimpanMutasi(minta({ hapus: [{ id: ID, updatedAt: 'bukan-waktu' }] }), 'u')
    expect(h.jenis === 'tolak' && h.body.konflik).toEqual([ID])
  })

  it('jurnal TERPOSTING & belum dibalik → ubah ditolak 409 (D42 tidak membuka)', async () => {
    simpanLama()
    infoJurnal = new Map([[JURNAL, { status: 'posted', dibalik: false }]])
    const h = await rencanakanSimpanMutasi(minta({ ubah: [ubahBaris()] }), 'u')
    expect(h.jenis).toBe('tolak')
    if (h.jenis !== 'tolak') return
    expect(h.status).toBe(409)
    expect(h.body.konflik).toBeUndefined()
    expect(h.body.galat).toEqual([{ kunci: ID, pesan: ALASAN_TERPOSTING, jenis: 'kunci' }])
  })

  it('jurnal TERPOSTING & belum dibalik → hapus ditolak 409', async () => {
    simpanLama()
    infoJurnal = new Map([[JURNAL, { status: 'posted', dibalik: false }]])
    const h = await rencanakanSimpanMutasi(minta({ hapus: [{ id: ID, updatedAt: WAKTU }] }), 'u')
    expect(h.jenis === 'tolak' && h.status).toBe(409)
    expect(h.jenis === 'tolak' && h.body.galat).toEqual([{ kunci: ID, pesan: ALASAN_TERPOSTING, jenis: 'kunci' }])
  })

  it('jurnal terposting yang SUDAH DIBALIK → lolos pemeriksaan kunci (sampai ke perencana jurnal)', async () => {
    simpanLama()
    infoJurnal = new Map([[JURNAL, { status: 'posted', dibalik: true }]])
    await expect(rencanakanSimpanMutasi(minta({ ubah: [ubahBaris()] }), 'u')).rejects.toThrow('SAMPAI_PERENCANA_JURNAL')
  })

  it('beralokasi → nominal terkunci (galat sel masuk), keterangan saja boleh', async () => {
    simpanLama({ journalId: null })
    alokasiTersimpan = [{ mutationId: ID, nominal: '1000.00', akunHutangId: KAS, noInvoice: 'INV-1' }]
    const h = await rencanakanSimpanMutasi(minta({ ubah: [ubahBaris({ debit: '900.00' })] }), 'u')
    expect(h.jenis === 'tolak' && h.body.galat).toEqual([{ kunci: ID, kolom: 'masuk', pesan: ALASAN_TERALOKASI, jenis: 'kunci' }])
    await expect(rencanakanSimpanMutasi(minta({ ubah: [ubahBaris()] }), 'u')).rejects.toThrow('SAMPAI_PERENCANA_JURNAL')
  })

  it('id ubah milik klien LAIN → 404 tidak-ada, tidak bocor', async () => {
    simpanLama({ clientId: '66666666-6666-4666-8666-666666666666' })
    const h = await rencanakanSimpanMutasi(minta({ ubah: [ubahBaris()] }), 'u')
    expect(h.jenis === 'tolak' && h.status).toBe(404)
  })
})

describe('jawabanTunggal — bentuk lama untuk form satu-satu', () => {
  it('galat per baris diratakan jadi { error, details } dengan status yang sama', () => {
    const j = jawabanTunggal({
      jenis: 'tolak',
      status: 409,
      body: { error: '1 baris tidak bisa disimpan.', galat: [{ kunci: 'x', pesan: 'Jurnalnya sudah diposting', jenis: 'kunci' }] },
    })
    expect(j).toEqual({ status: 409, body: { error: 'Jurnalnya sudah diposting', details: ['Jurnalnya sudah diposting'] } })
  })
})
