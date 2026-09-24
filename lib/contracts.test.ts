import { describe, it, expect } from 'vitest'
import {
  CONTRACT_JENIS,
  contractStatus,
  contractDisplayStatus,
  countNeedsAttention,
  needsAttention,
  hasReplacement,
  tambahHari,
  EXPIRING_SOON_DAYS,
  DISPLAY_STATUS_LABEL,
  type ContractBadgeRow,
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
    for (const v of [-1, NaN, Infinity, 'abc', '', '  ', '-5', '1.000,505', '12.345.67', null, undefined, {}]) {
      expect(normalizeNominal(v), String(v)).toBeNull()
    }
  })

  // '1.234' dulu ada di daftar tolak di atas. Sejak 2026-09-24 (keputusan Ricko)
  // ia seribu dua ratus tiga puluh empat — lib/nominal.ts.
  it('format Indonesia dinormalkan ke bentuk kanonik', () => {
    expect(normalizeNominal('1.234')).toBe('1234.00')
    expect(normalizeNominal('150.000.000')).toBe('150000000.00')
    expect(normalizeNominal('1.500.000,25')).toBe('1500000.25')
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

// ══ 3c — STATUS TAMPILAN & BADGE ═════════════════════════════════
// Semua perbandingan di bawah string-based; tidak ada Date yang dibangun untuk
// membandingkan apa pun. 'HARI INI' selalu diberikan sebagai argumen.
const HARI_INI = '2026-08-09'

describe('contractDisplayStatus — batas H-7 diuji EKSPLISIT', () => {
  // Kontrak sudah berjalan (mulai jauh di belakang), yang berbeda cuma akhirnya.
  const mulai = '2026-01-01'
  const st = (akhir: string) => contractDisplayStatus(mulai, akhir, HARI_INI)

  it('berakhir 7 hari lagi → akan_berakhir (kuning)', () => {
    expect(sisaHari('2026-08-16', HARI_INI)).toBe(7)
    expect(st('2026-08-16')).toBe('akan_berakhir')
  })

  it('berakhir 8 hari lagi → aktif (hijau)', () => {
    // Sisi seberang batas. Kalau ambangnya bergeser jadi 8, test ini merah.
    expect(sisaHari('2026-08-17', HARI_INI)).toBe(8)
    expect(st('2026-08-17')).toBe('aktif')
  })

  it('batasnya persis EXPIRING_SOON_DAYS, bukan angka yang kebetulan 7', () => {
    const tepat = tambahHari(HARI_INI, EXPIRING_SOON_DAYS)
    const lewat = tambahHari(HARI_INI, EXPIRING_SOON_DAYS + 1)
    expect(st(tepat)).toBe('akan_berakhir')
    expect(st(lewat)).toBe('aktif')
  })

  it('berakhir kemarin → selesai (merah)', () => {
    expect(st('2026-08-08')).toBe('selesai')
  })

  it('berakhir HARI INI → masih akan_berakhir, belum selesai', () => {
    // Rentang inklusif: kontrak yang berakhir hari ini masih berlaku hari ini.
    // Ini yang menahan badge berubah merah sehari lebih cepat.
    expect(sisaHari(HARI_INI, HARI_INI)).toBe(0)
    expect(st(HARI_INI)).toBe('akan_berakhir')
  })

  it('berakhir besok → akan_berakhir; lusa-nya lagi tetap akan_berakhir', () => {
    expect(st(tambahHari(HARI_INI, 1))).toBe('akan_berakhir')
    expect(st(tambahHari(HARI_INI, 2))).toBe('akan_berakhir')
  })

  it('setiap hari 0..7 kuning, 8..14 hijau — sapuan penuh melintasi batas', () => {
    for (let d = 0; d <= 7; d++) expect(st(tambahHari(HARI_INI, d)), `H+${d}`).toBe('akan_berakhir')
    for (let d = 8; d <= 14; d++) expect(st(tambahHari(HARI_INI, d)), `H+${d}`).toBe('aktif')
  })

  it('belum mulai → akan_datang, TIDAK dilipat ke aktif walau berakhir dekat', () => {
    // Kontrak yang baru mulai lusa dan berakhir 5 hari lagi bukan kontrak yang
    // "akan berakhir" — ia belum berjalan sama sekali.
    expect(contractDisplayStatus(tambahHari(HARI_INI, 2), tambahHari(HARI_INI, 5), HARI_INI))
      .toBe('akan_datang')
  })

  it('mulai HARI INI sudah dihitung berjalan', () => {
    expect(contractDisplayStatus(HARI_INI, '2026-12-31', HARI_INI)).toBe('aktif')
  })

  it('kontrak lama yang berakhir bertahun lalu tetap selesai', () => {
    expect(contractDisplayStatus('2024-01-01', '2024-12-31', HARI_INI)).toBe('selesai')
  })

  it('setiap status punya label', () => {
    for (const s of ['akan_datang', 'aktif', 'akan_berakhir', 'selesai'] as const) {
      expect(DISPLAY_STATUS_LABEL[s]).toBeTruthy()
    }
  })
})

describe('tambahHari — ujung bulan & tahun tanpa objek Date', () => {
  it('melintasi akhir bulan', () => {
    expect(tambahHari('2026-01-31', 1)).toBe('2026-02-01')
    expect(tambahHari('2026-04-30', 1)).toBe('2026-05-01')
  })

  it('melintasi akhir tahun ke DEPAN, bukan mundur', () => {
    expect(tambahHari('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('mundur juga benar', () => {
    expect(tambahHari('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('29 Februari kabisat ada; tahun biasa loncat ke 1 Maret', () => {
    expect(tambahHari('2024-02-28', 1)).toBe('2024-02-29')
    expect(tambahHari('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('konsisten dengan hariAntara (dua arah cocok)', () => {
    for (const n of [0, 1, 7, 30, 365, 1000]) {
      expect(hariAntara('2026-08-09', tambahHari('2026-08-09', n)), String(n)).toBe(n)
    }
  })
})

// ══ BADGE: H-7 + SUDAH BERAKHIR TANPA PENGGANTI ══════════════════
// Dulu badge hanya menghitung H-7, sehingga kontrak yang terlanjur lewat
// MENGHILANG dari hitungan — persis kasus yang paling butuh tindakan.
const KLIEN_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const KLIEN_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const K = (mulai: string, akhir: string, clientId = KLIEN_A): ContractBadgeRow =>
  ({ clientId, tanggalMulai: mulai, tanggalAkhir: akhir })

describe('hasReplacement — pengganti = mulai PADA ATAU SESUDAH akhir', () => {
  const kadaluwarsa = K('2026-01-01', '2026-08-08')

  it('mulai TEPAT di tanggal berakhir = pengganti', () => {
    expect(hasReplacement(kadaluwarsa, [K('2026-08-08', '2027-08-07')])).toBe(true)
  })

  it('mulai SESUDAH tanggal berakhir = pengganti (ada jeda, tetap perpanjangan)', () => {
    expect(hasReplacement(kadaluwarsa, [K('2026-09-01', '2027-08-31')])).toBe(true)
  })

  it('mulai SEBELUM tanggal berakhir BUKAN pengganti (tumpang tindih)', () => {
    expect(hasReplacement(kadaluwarsa, [K('2026-08-07', '2027-01-01')])).toBe(false)
  })

  it('kontrak klien LAIN bukan pengganti, walau tanggalnya cocok', () => {
    expect(hasReplacement(kadaluwarsa, [K('2026-08-08', '2027-08-07', KLIEN_B)])).toBe(false)
  })

  it('daftar kosong → tidak ada pengganti', () => {
    expect(hasReplacement(kadaluwarsa, [])).toBe(false)
  })
})

describe('countNeedsAttention — badge sidebar', () => {
  it('sudah berakhir TANPA pengganti → DIHITUNG', () => {
    expect(countNeedsAttention([K('2026-01-01', '2026-08-08')], HARI_INI)).toBe(1)
  })

  it('sudah berakhir DENGAN pengganti klien yang sama → TIDAK dihitung', () => {
    // Yang lama diperpanjang; yang baru masih aktif. Tidak ada yang perlu
    // dikerjakan, jadi badge harus diam.
    const rows = [K('2026-01-01', '2026-08-08'), K('2026-08-08', '2027-08-07')]
    expect(countNeedsAttention(rows, HARI_INI)).toBe(0)
  })

  it('sudah berakhir dengan kontrak lebih baru milik klien BERBEDA → tetap dihitung', () => {
    const rows = [K('2026-01-01', '2026-08-08'), K('2026-08-08', '2027-08-07', KLIEN_B)]
    expect(countNeedsAttention(rows, HARI_INI)).toBe(1)
  })

  it('akan berakhir H-7 → dihitung', () => {
    expect(countNeedsAttention([K('2026-01-01', tambahHari(HARI_INI, 7))], HARI_INI)).toBe(1)
  })

  it('berakhir 8 hari lagi → TIDAK dihitung', () => {
    expect(countNeedsAttention([K('2026-01-01', tambahHari(HARI_INI, 8))], HARI_INI)).toBe(0)
  })

  it('BATAS diuji eksplisit: H+7 dihitung, H+8 tidak', () => {
    const tepat = [K('2026-01-01', tambahHari(HARI_INI, EXPIRING_SOON_DAYS))]
    const lewat = [K('2026-01-01', tambahHari(HARI_INI, EXPIRING_SOON_DAYS + 1))]
    expect(countNeedsAttention(tepat, HARI_INI)).toBe(1)
    expect(countNeedsAttention(lewat, HARI_INI)).toBe(0)
  })

  it('berakhir HARI INI → dihitung (masih akan_berakhir, belum selesai)', () => {
    expect(countNeedsAttention([K('2026-01-01', HARI_INI)], HARI_INI)).toBe(1)
  })

  it('akan datang → TIDAK dihitung, belum ada yang bisa dikerjakan', () => {
    const rows = [K(tambahHari(HARI_INI, 2), tambahHari(HARI_INI, 5))]
    expect(countNeedsAttention(rows, HARI_INI)).toBe(0)
  })

  it('aktif & masih lama → TIDAK dihitung', () => {
    expect(countNeedsAttention([K('2026-01-01', '2026-12-31')], HARI_INI)).toBe(0)
  })

  it('kontrak kedaluwarsa TIDAK boleh jadi pengganti dirinya sendiri', () => {
    // Kontrak sehari: tanggalMulai == tanggalAkhir. Kalau pengecualian diri
    // lupa dipasang, `mulai >= akhir` terpenuhi oleh dirinya sendiri dan
    // kontrak ini menghilang dari badge selamanya.
    expect(countNeedsAttention([K('2026-08-08', '2026-08-08')], HARI_INI)).toBe(1)
  })

  it('dua kontrak bertanggal IDENTIK dihitung keduanya', () => {
    // Pengecualian diri berbasis indeks, bukan nilai — kalau berbasis nilai,
    // keduanya akan saling menghapus.
    const rows = [K('2026-01-01', '2026-08-08'), K('2026-01-01', '2026-08-08')]
    expect(countNeedsAttention(rows, HARI_INI)).toBe(2)
  })

  it('kedaluwarsa TETAP dihitung sampai penggantinya ada', () => {
    const kadaluwarsa = [K('2026-01-01', '2026-08-08')]
    expect(countNeedsAttention(kadaluwarsa, HARI_INI)).toBe(1)
    // Hari-hari berikutnya: tetap 1, tidak menghilang seiring waktu.
    expect(countNeedsAttention(kadaluwarsa, tambahHari(HARI_INI, 30))).toBe(1)
    expect(countNeedsAttention(kadaluwarsa, tambahHari(HARI_INI, 365))).toBe(1)
    // Begitu penggantinya dibuat, badge diam.
    expect(countNeedsAttention([...kadaluwarsa, K('2026-08-08', '2027-08-07')], HARI_INI)).toBe(0)
  })

  it('kontrak AKAN DATANG sah menjadi pengganti', () => {
    // Justru bentuk perpanjangan yang paling normal: yang baru diteken lebih
    // dulu dan baru berlaku setelah yang lama habis. Kontrak akan datang tidak
    // dihitung untuk dirinya sendiri, tapi ia MENDIAMKAN yang kedaluwarsa.
    const kadaluwarsa = K('2026-01-01', '2026-08-08')
    expect(countNeedsAttention([kadaluwarsa], HARI_INI)).toBe(1)
    const denganPengganti = [kadaluwarsa, K(tambahHari(HARI_INI, 2), tambahHari(HARI_INI, 9))]
    expect(countNeedsAttention(denganPengganti, HARI_INI)).toBe(0)
  })

  it('campuran realistis dihitung benar', () => {
    const rows = [
      K('2025-01-01', '2025-12-31'), // lewat, TAPI diganti kontrak 2026 → tidak
      K('2026-01-01', '2026-08-08'), // lewat, tanpa pengganti          → DIHITUNG
      K('2026-01-01', '2026-08-16'), // H+7                             → DIHITUNG
      K('2026-01-01', '2026-12-31'), // aktif                           → tidak
    ]
    expect(countNeedsAttention(rows, HARI_INI)).toBe(2)
  })

  it('daftar kosong → 0 (badge tidak muncul)', () => {
    expect(countNeedsAttention([], HARI_INI)).toBe(0)
  })

  it('needsAttention konsisten dengan countNeedsAttention', () => {
    const rows = [K('2026-01-01', '2026-08-08'), K('2026-01-01', '2026-08-16')]
    const manual = rows.filter((r, i) =>
      needsAttention(r, rows.filter((_, j) => j !== i), HARI_INI)
    ).length
    expect(countNeedsAttention(rows, HARI_INI)).toBe(manual)
  })

  it('tidak memutasi input', () => {
    const rows = [K('2026-01-01', '2026-08-08'), K('2026-08-08', '2027-08-07')]
    const salinan = JSON.parse(JSON.stringify(rows))
    countNeedsAttention(rows, HARI_INI)
    expect(rows).toEqual(salinan)
  })
})
