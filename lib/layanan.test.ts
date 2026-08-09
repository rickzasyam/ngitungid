import { describe, it, expect } from 'vitest'
import {
  selectableLayanan,
  resolveLayanan,
  layananOptionsForContract,
  layananDisplayName,
  validateLayanan,
  NAMA_MIN,
  NAMA_MAX,
  DESKRIPSI_MAX,
  type LayananRow,
} from './layanan'

const L = (id: string, nama: string, aktif = true, deskripsi: string | null = null): LayananRow =>
  ({ id, nama, deskripsi, aktif })

const SETUP_SCM = L('11111111-1111-1111-1111-111111111111', 'Setup SCM', false, 'Implementasi rantai pasok')
const PEMBUKUAN = L('22222222-2222-2222-2222-222222222222', 'Pembukuan Bulanan', true)
const PAJAK = L('33333333-3333-3333-3333-333333333333', 'Konsultasi Pajak', true)
const ALL = [SETUP_SCM, PEMBUKUAN, PAJAK]

// ══ ATURAN INTI: nonaktif ≠ terhapus ═════════════════════════════
// Kontrak mencatat layanan APA yang dijual. Menonaktifkan "Setup SCM" hari ini
// tidak boleh mengubah satu pun kontrak 2026 yang memuatnya.
describe('layanan nonaktif tetap tampil di kontrak yang memakainya', () => {
  it('resolveLayanan MENGEMBALIKAN layanan nonaktif apa adanya', () => {
    const [got] = resolveLayanan(ALL, [SETUP_SCM.id])
    expect(got).not.toBeNull()
    expect(got).toEqual(SETUP_SCM)
    expect(got!.aktif).toBe(false)
  })

  it('namanya dirender NORMAL — bukan error, bukan dicoret, bukan "(dihapus)"', () => {
    const [got] = resolveLayanan(ALL, [SETUP_SCM.id])
    const label = layananDisplayName(got!)
    expect(label).toBe('Setup SCM')
    expect(label).not.toMatch(/dihapus|nonaktif|tidak aktif|~~/i)
  })

  it('kontrak campuran (aktif + nonaktif) resolve utuh dan urut sesuai id-nya', () => {
    const ids = [PEMBUKUAN.id, SETUP_SCM.id, PAJAK.id]
    const got = resolveLayanan(ALL, ids)
    expect(got.map(l => l?.nama)).toEqual(['Pembukuan Bulanan', 'Setup SCM', 'Konsultasi Pajak'])
    expect(got.every(l => l !== null)).toBe(true)
  })

  it('menonaktifkan TIDAK mengubah hasil resolve kontrak lama', () => {
    const sebelum = resolveLayanan(ALL, [PEMBUKUAN.id])
    // Layanan yang sama kemudian dinonaktifkan.
    const setelah = resolveLayanan(
      ALL.map(l => (l.id === PEMBUKUAN.id ? { ...l, aktif: false } : l)),
      [PEMBUKUAN.id]
    )
    expect(setelah[0]!.nama).toBe(sebelum[0]!.nama)
    expect(setelah[0]!.id).toBe(sebelum[0]!.id)
  })

  it('id yang benar-benar tidak ada → null (kasus BERBEDA dari nonaktif)', () => {
    // Lewat jalur normal ini tidak akan terjadi: baris layanan tidak pernah
    // dihapus. Dibedakan supaya pemanggil bisa menangani data rusak.
    expect(resolveLayanan(ALL, ['99999999-9999-9999-9999-999999999999'])).toEqual([null])
  })
})

describe('selectableLayanan — picker kontrak BARU', () => {
  it('menyembunyikan yang nonaktif', () => {
    expect(selectableLayanan(ALL).map(l => l.nama)).toEqual(['Pembukuan Bulanan', 'Konsultasi Pajak'])
  })

  it('tidak memuat Setup SCM yang nonaktif', () => {
    expect(selectableLayanan(ALL).find(l => l.id === SETUP_SCM.id)).toBeUndefined()
  })

  it('semua aktif → semua terpilih; semua nonaktif → kosong', () => {
    expect(selectableLayanan([PEMBUKUAN, PAJAK])).toHaveLength(2)
    expect(selectableLayanan([SETUP_SCM])).toEqual([])
  })

  it('urutan dari pemanggil dipertahankan', () => {
    expect(selectableLayanan([PAJAK, PEMBUKUAN]).map(l => l.nama))
      .toEqual(['Konsultasi Pajak', 'Pembukuan Bulanan'])
  })

  it('picker & resolver BERBEDA perlakuan untuk baris yang sama', () => {
    // Ini seluruh inti modul ini dalam satu assertion.
    expect(selectableLayanan(ALL).some(l => l.id === SETUP_SCM.id)).toBe(false)
    expect(resolveLayanan(ALL, [SETUP_SCM.id])[0]).not.toBeNull()
  })
})

describe('validateLayanan', () => {
  it('menerima input yang sah', () => {
    const r = validateLayanan({ nama: 'Setup SCM', deskripsi: 'Rantai pasok' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.nama).toBe('Setup SCM')
      expect(r.deskripsi).toBe('Rantai pasok')
      expect(r.aktif).toBe(true)
    }
  })

  it('men-trim nama — spasi ujung membuat unique(nama) gagal menangkap duplikat', () => {
    const r = validateLayanan({ nama: '  Setup SCM  ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.nama).toBe('Setup SCM')
  })

  it('deskripsi kosong → null, bukan string kosong', () => {
    for (const d of ['', '   ']) {
      const r = validateLayanan({ nama: 'Layanan X', deskripsi: d })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.deskripsi).toBeNull()
    }
  })

  it(`menolak nama < ${NAMA_MIN} karakter (termasuk yang hanya spasi)`, () => {
    expect(validateLayanan({ nama: 'A' }).ok).toBe(false)
    expect(validateLayanan({ nama: '    ' }).ok).toBe(false)
  })

  it('menolak nama yang hilang atau bukan string', () => {
    expect(validateLayanan({}).ok).toBe(false)
    expect(validateLayanan({ nama: 123 }).ok).toBe(false)
    expect(validateLayanan({ nama: null }).ok).toBe(false)
  })

  it(`menolak nama > ${NAMA_MAX} & deskripsi > ${DESKRIPSI_MAX} karakter`, () => {
    expect(validateLayanan({ nama: 'a'.repeat(NAMA_MAX + 1) }).ok).toBe(false)
    expect(validateLayanan({ nama: 'Oke', deskripsi: 'd'.repeat(DESKRIPSI_MAX + 1) }).ok).toBe(false)
  })

  it('aktif harus boolean kalau dikirim', () => {
    expect(validateLayanan({ nama: 'Oke', aktif: 'ya' }).ok).toBe(false)
    const r = validateLayanan({ nama: 'Oke', aktif: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.aktif).toBe(false)
  })

  it('partial: PATCH boleh mengirim aktif saja tanpa nama', () => {
    // Toggle aktif tidak perlu mengulang nama.
    const r = validateLayanan({ aktif: false }, { partial: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.aktif).toBe(false)
  })

  it('partial: nama yang DIKIRIM tetap divalidasi', () => {
    expect(validateLayanan({ nama: 'A' }, { partial: true }).ok).toBe(false)
  })
})

// ══ PICKER FORM KONTRAK — kasus yang jadi alasan seluruh desain ══
//
// Form EDIT mengirim ISI PICKER ke PATCH. Jadi apa pun yang tidak muncul di
// picker akan HILANG dari kontrak begitu form disimpan — tanpa error, tanpa
// peringatan, tanpa ada yang memutuskan begitu. Kalau picker memakai
// selectableLayanan(), setiap kontrak yang memuat layanan nonaktif kehilangan
// layanan itu hanya karena dibuka dan disimpan ulang.
describe('layananOptionsForContract — nonaktif yang SUDAH terpilih tetap tampil', () => {
  it('kontrak yang memuat layanan nonaktif TETAP menampilkannya sebagai opsi', () => {
    const opts = layananOptionsForContract(ALL, [SETUP_SCM.id])
    expect(opts.map(l => l.id)).toContain(SETUP_SCM.id)
  })

  it('INI YANG DICEGAH: menyimpan ulang tidak boleh menjatuhkan layanan nonaktif', () => {
    // Simulasi jalur form: opsi → yang tercentang → payload PATCH.
    const tersimpan = [SETUP_SCM.id, PEMBUKUAN.id]
    const opts = layananOptionsForContract(ALL, tersimpan)
    const tercentang = opts.filter(l => tersimpan.includes(l.id)).map(l => l.id)
    // Tidak ada yang diklik — user cuma membuka form lalu menekan Simpan.
    expect([...tercentang].sort()).toEqual([...tersimpan].sort())

    // Pembanding: picker yang "benar" untuk kontrak BARU justru salah di sini.
    const salah = selectableLayanan(ALL).filter(l => tersimpan.includes(l.id)).map(l => l.id)
    expect(salah).not.toContain(SETUP_SCM.id)
    expect(salah).toHaveLength(1) // Setup SCM menguap tanpa jejak
  })

  it('nonaktif yang TIDAK terpilih tetap disembunyikan (bukan "tampilkan semua")', () => {
    const opts = layananOptionsForContract(ALL, [PEMBUKUAN.id])
    expect(opts.map(l => l.id)).not.toContain(SETUP_SCM.id)
  })

  it('kontrak BARU (belum ada pilihan) = persis selectableLayanan', () => {
    expect(layananOptionsForContract(ALL, [])).toEqual(selectableLayanan(ALL))
  })

  it('urutan mengikuti `all`, jadi yang nonaktif duduk di tempat alfabetisnya', () => {
    // Bukan ditempel di ujung daftar — itu akan jadi penanda visual "berbeda",
    // persis yang dilarang: kontrak lama merender layanannya NORMAL.
    const opts = layananOptionsForContract(ALL, [SETUP_SCM.id])
    expect(opts.map(l => l.id)).toEqual(ALL.map(l => l.id))
  })

  it('id asing di selectedIds tidak memunculkan entri hantu', () => {
    const opts = layananOptionsForContract(ALL, ['99999999-9999-9999-9999-999999999999'])
    expect(opts).toEqual(selectableLayanan(ALL))
    expect(opts.every(l => l !== null)).toBe(true)
  })

  it('tidak memutasi input', () => {
    const salinan = [...ALL]
    layananOptionsForContract(ALL, [SETUP_SCM.id])
    expect(ALL).toEqual(salinan)
  })

  it('konsisten dengan resolveLayanan: yang di-resolve pasti bisa dipilih ulang', () => {
    // Dua fungsi ini harus sepakat, kalau tidak kontrak bisa MENAMPILKAN
    // layanan yang form-nya sendiri tidak bisa mempertahankannya.
    const ids = [SETUP_SCM.id, PAJAK.id]
    const terpasang = resolveLayanan(ALL, ids).filter((l): l is LayananRow => l !== null)
    const opts = layananOptionsForContract(ALL, ids)
    for (const l of terpasang) expect(opts.map(o => o.id), l.nama).toContain(l.id)
  })
})
