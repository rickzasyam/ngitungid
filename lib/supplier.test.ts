import { describe, it, expect } from 'vitest'
import {
  validateSupplierInput,
  isHutangAccount,
  NAMA_MIN,
  NAMA_MAX,
  BANK_NAMA_MAX,
  BANK_REKENING_MAX,
  BANK_ATAS_NAMA_MAX,
  normalizeNamaSupplier,
  namaSupplierKey,
  KOLOM_DATA_SUPPLIER,
  SUPPLIER_EVENTS,
  snapshotSupplier,
  supplierBerubah,
  type SupplierValue,
} from './supplier'

const AKUN = '11111111-1111-4111-8111-111111111111'

const punyaGalat = (errors: string[], potongan: string) =>
  errors.some(e => e.includes(potongan))

describe('isHutangAccount', () => {
  // Diturunkan dari classifyBs — mesin yang SAMA dengan Neraca dan rasio.
  // Kalau di sini ada daftar kata kunci kedua, "Hutang Usaha" bisa terhitung
  // hutang di satu layar dan bukan di layar lain tanpa ada yang menyadarinya.
  it('mengenali penamaan hutang yang lazim di COA Indonesia', () => {
    for (const s of ['Hutang Usaha', 'Hutang Lancar', 'Kewajiban Jangka Pendek', 'Liabilitas']) {
      expect(isHutangAccount(s), s).toBe(true)
    }
  })

  it('menolak sisi aset dan modal', () => {
    for (const s of ['Aktiva Lancar', 'Aktiva Tetap', 'Modal', 'Ekuitas']) {
      expect(isHutangAccount(s), s).toBe(false)
    }
  })

  it('menolak pos laba rugi', () => {
    for (const s of ['Pendapatan', 'Fixed Cost', 'Beban Operasional']) {
      expect(isHutangAccount(s), s).toBe(false)
    }
  })
})

describe('validateSupplierInput — yang sah', () => {
  it('nama saja sudah cukup; sisanya null', () => {
    const r = validateSupplierInput({ nama: 'Toko Bangunan Jaya' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({
      nama: 'Toko Bangunan Jaya',
      kontak: null,
      npwp: null,
      bankNama: null,
      bankRekening: null,
      bankAtasNama: null,
      akunHutangDefaultId: null,
    })
  })

  it('nama di-trim', () => {
    const r = validateSupplierInput({ nama: '   PT Sumber Rejeki   ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.nama).toBe('PT Sumber Rejeki')
  })

  it('field opsional yang kosong atau spasi jadi null, bukan string kosong', () => {
    const r = validateSupplierInput({ nama: 'Vendor A', kontak: '   ', npwp: '' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.kontak).toBeNull()
    expect(r.value.npwp).toBeNull()
    expect(r.value.kontak).not.toBe('')
  })

  it('data rekening disimpan sebagai TEKS — nol di depan nomor rekening bertahan (D43)', () => {
    const r = validateSupplierInput({
      nama: 'Vendor A',
      bankNama: ' BCA ',
      bankRekening: '0123456789',
      bankAtasNama: 'PT Vendor A',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.bankNama).toBe('BCA')
    expect(r.value.bankRekening).toBe('0123456789')
    expect(r.value.bankRekening).not.toBe('123456789')
    expect(r.value.bankAtasNama).toBe('PT Vendor A')
  })

  it('rekening yang semuanya nol pun tidak disentuh — tidak pernah lewat Number()', () => {
    const r = validateSupplierInput({ nama: 'Vendor A', bankRekening: '000012' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.bankRekening).toBe('000012')
  })

  it('kolom rekening yang kosong atau spasi jadi null', () => {
    const r = validateSupplierInput({ nama: 'Vendor A', bankNama: '  ', bankRekening: '', bankAtasNama: null })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.bankNama).toBeNull()
    expect(r.value.bankRekening).toBeNull()
    expect(r.value.bankAtasNama).toBeNull()
  })

  it('termin tidak lagi diterima — ia melekat pada invoice (D43, migrasi 0019)', () => {
    const r = validateSupplierInput({ nama: 'Vendor A', terminPembayaran: 30 } as Record<string, unknown>)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.value)).not.toContain('terminPembayaran')
  })

  it('nama tepat di batas bawah & atas diterima', () => {
    expect(validateSupplierInput({ nama: 'A'.repeat(NAMA_MIN) }).ok).toBe(true)
    expect(validateSupplierInput({ nama: 'A'.repeat(NAMA_MAX) }).ok).toBe(true)
  })

  it('data rekening tepat di batas panjang diterima', () => {
    const r = validateSupplierInput({
      nama: 'Vendor A',
      bankNama: 'B'.repeat(BANK_NAMA_MAX),
      bankRekening: '0'.repeat(BANK_REKENING_MAX),
      bankAtasNama: 'A'.repeat(BANK_ATAS_NAMA_MAX),
    })
    expect(r.ok).toBe(true)
  })

  it('akun hutang default berupa UUID diterima', () => {
    const r = validateSupplierInput({ nama: 'Vendor A', akunHutangDefaultId: AKUN })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.akunHutangDefaultId).toBe(AKUN)
  })
})

describe('validateSupplierInput — yang ditolak', () => {
  it('menolak nama kosong', () => {
    for (const nama of ['', '   ', null, undefined, 42]) {
      const r = validateSupplierInput({ nama })
      expect(r.ok, String(nama)).toBe(false)
      if (r.ok) continue
      expect(punyaGalat(r.errors, 'Nama supplier wajib diisi')).toBe(true)
    }
  })

  it('menolak nama yang terlalu pendek atau terlalu panjang', () => {
    const pendek = validateSupplierInput({ nama: 'A' })
    expect(pendek.ok).toBe(false)
    if (!pendek.ok) expect(punyaGalat(pendek.errors, `minimal ${NAMA_MIN}`)).toBe(true)

    const panjang = validateSupplierInput({ nama: 'A'.repeat(NAMA_MAX + 1) })
    expect(panjang.ok).toBe(false)
    if (!panjang.ok) expect(punyaGalat(panjang.errors, `maksimal ${NAMA_MAX}`)).toBe(true)
  })

  it('menolak data rekening yang melebihi batas panjang', () => {
    const r = validateSupplierInput({
      nama: 'Vendor A',
      bankNama: 'B'.repeat(BANK_NAMA_MAX + 1),
      bankRekening: '0'.repeat(BANK_REKENING_MAX + 1),
      bankAtasNama: 'A'.repeat(BANK_ATAS_NAMA_MAX + 1),
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(punyaGalat(r.errors, 'Nama bank maksimal')).toBe(true)
    expect(punyaGalat(r.errors, 'Nomor rekening maksimal')).toBe(true)
    expect(punyaGalat(r.errors, 'Nama pemilik rekening maksimal')).toBe(true)
  })

  it('menolak akun hutang default yang bukan UUID', () => {
    for (const id of ['bukan-uuid', '123', 42]) {
      const r = validateSupplierInput({ nama: 'Vendor A', akunHutangDefaultId: id })
      expect(r.ok, String(id)).toBe(false)
      if (r.ok) continue
      expect(punyaGalat(r.errors, 'Akun hutang default tidak valid')).toBe(true)
    }
  })

  it('mengumpulkan semua galat sekaligus, tidak berhenti di yang pertama', () => {
    const r = validateSupplierInput({
      nama: '',
      bankRekening: '0'.repeat(BANK_REKENING_MAX + 1),
      akunHutangDefaultId: 'bukan-uuid',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })
})

// ══ PENJAGA BERDIRI: NAMA YANG "SAMA" BAGI MANUSIA ═══════════════
// "PT ABC", "pt abc ", dan "PT  ABC" adalah supplier yang sama bagi orang yang
// mengetiknya. Kalau kunci pencocokannya cuma perbandingan string apa adanya,
// impor kedua menyisipkan baris baru alih-alih memperbarui, dan daftar supplier
// perlahan terisi kembaran yang tak seorang pun sengaja buat.
describe('normalisasi nama supplier', () => {
  it('bentuk simpan merapikan spasi ganda dan ujungnya, huruf dipertahankan', () => {
    expect(normalizeNamaSupplier('  PT   ABC  ')).toBe('PT ABC')
    expect(normalizeNamaSupplier('PT ABC')).toBe('PT ABC')
    // Besar-kecil TIDAK diubah — yang disimpan harus tampil seperti diketik.
    expect(normalizeNamaSupplier('pt abc')).toBe('pt abc')
  })

  it('kunci pencocokan menyamakan spasi DAN besar-kecil huruf', () => {
    const kunci = namaSupplierKey('PT ABC')
    for (const varian of ['PT ABC', 'pt abc ', 'PT  ABC', '  pt   AbC  ']) {
      expect(namaSupplierKey(varian), varian).toBe(kunci)
    }
  })

  it('nama yang benar-benar berbeda tetap berbeda kuncinya', () => {
    expect(namaSupplierKey('PT ABC')).not.toBe(namaSupplierKey('PT ABCD'))
    expect(namaSupplierKey('Toko Jaya')).not.toBe(namaSupplierKey('Toko Jaya Abadi'))
  })

  it('validateSupplierInput menyimpan bentuk yang sudah dirapikan', () => {
    const r = validateSupplierInput({ nama: '  PT   Maju  Jaya  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.nama).toBe('PT Maju Jaya')
  })

  it('panjang nama diukur SETELAH dirapikan', () => {
    // '  A  ' rapi jadi 'A' (1 karakter) → tetap ditolak, bukan lolos karena
    // spasi ikut terhitung.
    expect(validateSupplierInput({ nama: '  A  ' }).ok).toBe(false)
  })
})

describe('riwayat supplier (audit_events)', () => {
  const v: SupplierValue = {
    nama: 'PT UJI-B Jaya',
    kontak: null,
    npwp: '01.234.567.8-901.000',
    bankNama: 'BANK UJI-B',
    bankRekening: '0012345678',
    bankAtasNama: 'PT UJI-B Jaya',
    akunHutangDefaultId: AKUN,
  }

  it('nama peristiwa: created, updated, deleted', () => {
    expect([...SUPPLIER_EVENTS]).toEqual(['created', 'updated', 'deleted'])
  })

  it('snapshot = tepat tujuh kolom data — id, klien, dan cap waktu tidak ikut', () => {
    const baris = { ...v, id: 'x', clientId: 'y', updatedAt: new Date() } as SupplierValue
    expect(snapshotSupplier(baris)).toEqual(v)
    expect(Object.keys(snapshotSupplier(baris))).toEqual([...KOLOM_DATA_SUPPLIER])
  })

  it('supplierBerubah: setiap kolom data dihitung, termasuk rekening dan nol di depannya', () => {
    expect(supplierBerubah(v, { ...v })).toBe(false)
    for (const k of KOLOM_DATA_SUPPLIER) {
      const lain = k === 'bankRekening' ? '12345678' : v[k] === null ? 'baru' : null
      expect(supplierBerubah(v, { ...v, [k]: lain }), k).toBe(true)
    }
    // Besar-kecil huruf nama adalah perubahan (tampilannya berubah).
    expect(supplierBerubah(v, { ...v, nama: 'PT UJI-B JAYA' })).toBe(true)
  })
})
