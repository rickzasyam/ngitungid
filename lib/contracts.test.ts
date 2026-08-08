import { describe, it, expect } from 'vitest'
import {
  CONTRACT_JENIS,
  contractStatus,
  sisaHari,
  hariAntara,
  isValidYmd,
  normalizeNominal,
  validateContract,
  MAX_DOKUMEN_BYTES,
  TANGGAL_PENAGIHAN_MIN,
  TANGGAL_PENAGIHAN_MAX,
} from './contracts'

const base = {
  noKontrak: 'KTR-2026-001',
  jenis: 'reguler' as const,
  tanggalMulai: '2026-01-01',
  tanggalAkhir: '2026-12-31',
  tanggalPenagihan: 25,
  nominal: 150_000_000,
}

// ══ PENJAGA BERDIRI: tanggal TIDAK PERNAH bergeser ═══════════════
// tanggal_mulai/akhir bertipe `date`, sama seperti period_start/period_end.
// Sesi terdahulu mengirim tanggal periode lewat toISOString() di WIB dan
// melempar Januari ke Desember. Modul ini memperlakukan tanggal sebagai STRING
// dari ujung ke ujung — tidak ada Date, Intl, maupun toISOString.
describe('tanggal kontrak tidak pernah bergeser', () => {
  const CASES = [
    '2026-01-01', '2026-01-31', '2026-02-28', '2026-03-01', '2026-03-31',
    '2026-07-01', '2026-07-31', '2026-12-01', '2026-12-31',
  ]

  it('tanggal 1 & 31 di berbagai bulan tetap valid dan utuh', () => {
    for (const ymd of CASES) expect(isValidYmd(ymd), ymd).toBe(true)
  })

  it('validateContract meneruskan tanggal PERSIS seperti yang diterima', () => {
    for (const ymd of CASES) {
      const r = validateContract({ ...base, tanggalMulai: ymd, tanggalAkhir: '2027-01-01' })
      expect(r.ok, ymd).toBe(true)
      if (r.ok) expect(r.tanggalMulai, ymd).toBe(ymd)
    }
  })

  it('1 Januari TIDAK pernah jatuh ke 31 Desember tahun sebelumnya', () => {
    const r = validateContract({ ...base, tanggalMulai: '2026-01-01' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.tanggalMulai).toBe('2026-01-01')
      expect(r.tanggalMulai).not.toBe('2025-12-31')
      expect(r.tanggalMulai.startsWith('2026-01')).toBe(true)
    }
  })

  it('31 Desember TIDAK pernah maju ke 1 Januari tahun berikutnya', () => {
    const r = validateContract({ ...base, tanggalAkhir: '2026-12-31' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.tanggalAkhir).toBe('2026-12-31')
      expect(r.tanggalAkhir.startsWith('2027')).toBe(false)
    }
  })

  it('perbandingan rentang murni STRING — hasilnya sama di TZ mana pun', () => {
    // 'YYYY-MM-DD' urut leksikografis, jadi tidak ada objek Date yang bisa
    // menggeser apa pun. Kalau implementasinya diganti berbasis Date, salah
    // satu batas di bawah akan berubah di mesin non-UTC.
    expect(contractStatus('2026-01-01', '2026-12-31', '2026-01-01')).toBe('aktif')
    expect(contractStatus('2026-01-01', '2026-12-31', '2026-12-31')).toBe('aktif')
    expect(contractStatus('2026-01-01', '2026-12-31', '2025-12-31')).toBe('akan_datang')
    expect(contractStatus('2026-01-01', '2026-12-31', '2027-01-01')).toBe('berakhir')
  })

  it('menolak tanggal yang tidak ada (31 Februari) tanpa memakai Date', () => {
    expect(isValidYmd('2026-02-31')).toBe(false)
    expect(isValidYmd('2026-13-01')).toBe(false)
    expect(isValidYmd('2026-00-10')).toBe(false)
    expect(isValidYmd('2026-1-1')).toBe(false) // wajib zero-padded
    expect(isValidYmd('01-01-2026')).toBe(false)
  })

  it('kabisat dihitung benar', () => {
    expect(isValidYmd('2024-02-29')).toBe(true)  // kabisat
    expect(isValidYmd('2026-02-29')).toBe(false) // bukan
    expect(isValidYmd('2000-02-29')).toBe(true)  // habis dibagi 400
    expect(isValidYmd('1900-02-29')).toBe(false) // habis 100, bukan 400
  })
})

describe('contractStatus — status DITURUNKAN, tidak disimpan', () => {
  it('sebelum mulai → akan_datang', () => {
    expect(contractStatus('2026-06-01', '2026-12-31', '2026-05-31')).toBe('akan_datang')
  })

  it('di dalam rentang → aktif (inklusif kedua ujung)', () => {
    expect(contractStatus('2026-06-01', '2026-12-31', '2026-06-01')).toBe('aktif')
    expect(contractStatus('2026-06-01', '2026-12-31', '2026-09-15')).toBe('aktif')
    expect(contractStatus('2026-06-01', '2026-12-31', '2026-12-31')).toBe('aktif')
  })

  it('setelah akhir → berakhir', () => {
    expect(contractStatus('2026-06-01', '2026-12-31', '2027-01-01')).toBe('berakhir')
  })

  it('kontrak satu hari', () => {
    expect(contractStatus('2026-06-01', '2026-06-01', '2026-06-01')).toBe('aktif')
    expect(contractStatus('2026-06-01', '2026-06-01', '2026-06-02')).toBe('berakhir')
  })
})

describe('hariAntara / sisaHari — aritmetika integer, tanpa Date', () => {
  it('selisih hari dasar', () => {
    expect(hariAntara('2026-01-01', '2026-01-31')).toBe(30)
    expect(hariAntara('2026-01-01', '2026-02-01')).toBe(31)
    expect(hariAntara('2026-01-01', '2027-01-01')).toBe(365)
    expect(hariAntara('2024-01-01', '2025-01-01')).toBe(366) // kabisat
  })

  it('lintas akhir tahun tidak meleset', () => {
    expect(hariAntara('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('sisaHari 0 kalau sudah lewat', () => {
    expect(sisaHari('2026-06-30', '2026-07-01')).toBe(0)
    expect(sisaHari('2026-06-30', '2026-06-01')).toBe(29)
    expect(sisaHari('2026-06-30', '2026-06-30')).toBe(0)
  })
})

describe('normalizeNominal — uang tidak pernah jadi float', () => {
  it('number → string 2 desimal', () => {
    expect(normalizeNominal(150_000_000)).toBe('150000000.00')
    expect(normalizeNominal(0)).toBe('0.00')
  })

  it('string desimal dipertahankan & di-pad', () => {
    expect(normalizeNominal('150000000')).toBe('150000000.00')
    expect(normalizeNominal('1500.5')).toBe('1500.50')
    expect(normalizeNominal('1500.55')).toBe('1500.55')
  })

  it('nilai besar (ratusan juta s/d belasan digit) tetap utuh sebagai string', () => {
    expect(normalizeNominal('9999999999999.99')).toBe('9999999999999.99')
  })

  it('menolak negatif, NaN, dan yang bukan angka', () => {
    for (const v of [-1, NaN, Infinity, 'abc', '', '  ', '1.234', null, undefined, {}]) {
      expect(normalizeNominal(v), String(v)).toBeNull()
    }
  })
})

describe('validateContract', () => {
  it('menerima input yang sah', () => {
    const r = validateContract(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.noKontrak).toBe('KTR-2026-001')
      expect(r.nominal).toBe('150000000.00')
      expect(r.layananIds).toEqual([])
    }
  })

  it('menolak tanggalAkhir SEBELUM tanggalMulai', () => {
    const r = validateContract({ ...base, tanggalMulai: '2026-12-31', tanggalAkhir: '2026-01-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/sebelum tanggal mulai/i)
  })

  it('menerima tanggalAkhir SAMA dengan tanggalMulai (kontrak satu hari)', () => {
    expect(validateContract({ ...base, tanggalMulai: '2026-06-01', tanggalAkhir: '2026-06-01' }).ok).toBe(true)
  })

  it(`menolak tanggalPenagihan di luar ${TANGGAL_PENAGIHAN_MIN}-${TANGGAL_PENAGIHAN_MAX}`, () => {
    for (const tp of [0, -1, 32, 100]) {
      const r = validateContract({ ...base, tanggalPenagihan: tp })
      expect(r.ok, String(tp)).toBe(false)
    }
    expect(validateContract({ ...base, tanggalPenagihan: 1 }).ok).toBe(true)
    expect(validateContract({ ...base, tanggalPenagihan: 31 }).ok).toBe(true)
  })

  it('menolak tanggalPenagihan pecahan atau bukan angka', () => {
    expect(validateContract({ ...base, tanggalPenagihan: 15.5 }).ok).toBe(false)
    expect(validateContract({ ...base, tanggalPenagihan: '15' }).ok).toBe(false)
    expect(validateContract({ ...base, tanggalPenagihan: undefined }).ok).toBe(false)
  })

  it('menolak jenis di luar daftar tertutup', () => {
    expect(validateContract({ ...base, jenis: 'retainer' }).ok).toBe(false)
    for (const j of CONTRACT_JENIS) {
      expect(validateContract({ ...base, jenis: j }).ok, j).toBe(true)
    }
  })

  it('menolak noKontrak kosong & men-trim yang berspasi', () => {
    expect(validateContract({ ...base, noKontrak: '   ' }).ok).toBe(false)
    const r = validateContract({ ...base, noKontrak: '  KTR-1  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.noKontrak).toBe('KTR-1')
  })

  it('layananIds: menolak id non-UUID, membuang duplikat', () => {
    expect(validateContract({ ...base, layananIds: ['bukan-uuid'] }).ok).toBe(false)
    const id = '11111111-1111-1111-1111-111111111111'
    const r = validateContract({ ...base, layananIds: [id, id] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layananIds).toEqual([id])
  })

  it('batas unggah dokumen sama dengan /api/upload (25MB)', () => {
    expect(MAX_DOKUMEN_BYTES).toBe(25 * 1024 * 1024)
  })
})
