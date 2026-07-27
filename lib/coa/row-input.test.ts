import { describe, it, expect } from 'vitest'
import { parseCoaRowInput } from './row-input'

const valid = {
  kode: '04-0001',
  nama: 'Penjualan Shopee',
  posisi: 'Debit',
  kelompok: 'Laba Rugi',
  subKelompok: 'Penjualan',
  classCf: 'Operating',
}

describe('parseCoaRowInput — validasi', () => {
  it('input lengkap diterima', () => {
    const r = parseCoaRowInput(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(valid)
  })

  it.each(['kode', 'nama', 'posisi', 'kelompok', 'subKelompok'])(
    'menolak %s yang kosong',
    field => {
      const r = parseCoaRowInput({ ...valid, [field]: '' })
      expect(r.ok).toBe(false)
    }
  )

  it('menolak field wajib yang isinya spasi saja', () => {
    const r = parseCoaRowInput({ ...valid, nama: '    ' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('Nama Akun')
  })

  it('menolak beberapa field kosong sekaligus & melaporkan semuanya', () => {
    const r = parseCoaRowInput({ ...valid, kode: '', nama: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toHaveLength(2)
  })

  it('menolak body yang bukan objek', () => {
    expect(parseCoaRowInput(null).ok).toBe(false)
    expect(parseCoaRowInput('bukan objek').ok).toBe(false)
  })
})

describe('parseCoaRowInput — trim & normalisasi', () => {
  it('semua field teks di-trim sebelum disimpan', () => {
    const r = parseCoaRowInput({
      kode: '  04-0001  ',
      nama: '  Penjualan Shopee  ',
      posisi: ' Debit ',
      kelompok: '  Laba Rugi  ',
      subKelompok: ' Penjualan ',
      classCf: '  Operating  ',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(valid)
  })

  it('trim classCf penting: "Operating " vs "Operating" akan memecah pengelompokan', () => {
    const r = parseCoaRowInput({ ...valid, classCf: 'Operating ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.classCf).toBe('Operating')
  })

  it('classCf kosong → null (kolomnya nullable, sejalan dgn parser Excel)', () => {
    const r = parseCoaRowInput({ ...valid, classCf: '   ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.classCf).toBeNull()
  })

  it('posisi dinormalisasi (debet/credit/d/k → Debit/Kredit)', () => {
    for (const [input, out] of [['debet', 'Debit'], ['DEBIT', 'Debit'], ['credit', 'Kredit'], ['k', 'Kredit']]) {
      const r = parseCoaRowInput({ ...valid, posisi: input })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.posisi).toBe(out)
    }
  })

  it('posisi yang tidak dikenali ditolak dengan pesan jelas', () => {
    const r = parseCoaRowInput({ ...valid, posisi: 'Tengah' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('Debit')
  })
})
