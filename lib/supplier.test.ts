import { describe, it, expect } from 'vitest'
import {
  validateSupplierInput,
  isHutangAccount,
  NAMA_MIN,
  NAMA_MAX,
  TERMIN_MIN,
  TERMIN_MAX,
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
      terminPembayaran: null,
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

  it('termin 0 DIPERTAHANKAN — berbeda maknanya dari kosong', () => {
    // 0 = bayar tunai di muka. null = belum ditentukan. Dua hal berbeda.
    const nol = validateSupplierInput({ nama: 'Vendor A', terminPembayaran: 0 })
    expect(nol.ok).toBe(true)
    if (nol.ok) expect(nol.value.terminPembayaran).toBe(0)

    const kosong = validateSupplierInput({ nama: 'Vendor A', terminPembayaran: '' })
    expect(kosong.ok).toBe(true)
    if (kosong.ok) expect(kosong.value.terminPembayaran).toBeNull()
  })

  it('termin dalam bentuk string angka diterima', () => {
    const r = validateSupplierInput({ nama: 'Vendor A', terminPembayaran: '30' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.terminPembayaran).toBe(30)
  })

  it('nama tepat di batas bawah & atas diterima', () => {
    expect(validateSupplierInput({ nama: 'A'.repeat(NAMA_MIN) }).ok).toBe(true)
    expect(validateSupplierInput({ nama: 'A'.repeat(NAMA_MAX) }).ok).toBe(true)
  })

  it('termin tepat di batas diterima', () => {
    for (const t of [TERMIN_MIN, TERMIN_MAX]) {
      expect(validateSupplierInput({ nama: 'Vendor A', terminPembayaran: t }).ok, String(t)).toBe(true)
    }
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

  it('menolak termin di luar rentang, pecahan, atau bukan angka', () => {
    for (const t of [-1, TERMIN_MAX + 1, 12.5, 'tiga puluh']) {
      const r = validateSupplierInput({ nama: 'Vendor A', terminPembayaran: t })
      expect(r.ok, String(t)).toBe(false)
      if (r.ok) continue
      expect(punyaGalat(r.errors, 'Termin pembayaran')).toBe(true)
    }
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
      terminPembayaran: 999,
      akunHutangDefaultId: 'bukan-uuid',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })
})
