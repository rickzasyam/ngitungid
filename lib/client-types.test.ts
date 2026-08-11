import { describe, it, expect } from 'vitest'
import { clientTypeOptions, FALLBACK_CLIENT_TYPES } from './client-types'

// ══ KATALOG MENCERMINKAN DATA ════════════════════════════════════
// Dropdown Jenis Usaha dulu memakai array hardcoded enam nilai yang DISALIN di
// dua file. Sekarang isinya diturunkan dari nilai yang benar-benar dipakai
// klien, jadi test ini yang memastikan "mencerminkan data" bukan sekadar niat.
describe('clientTypeOptions — diturunkan dari data', () => {
  it('mengembalikan nilai distinct yang dipakai klien', () => {
    const opts = clientTypeOptions(['E-commerce', 'Retail', 'Manufaktur'])
    expect(opts).toEqual(['E-commerce', 'Manufaktur', 'Retail'])
  })

  it('duplikat digabung jadi satu entri', () => {
    // Empat klien Retail tidak berarti "Retail" muncul empat kali di dropdown.
    const opts = clientTypeOptions(['Retail', 'Retail', 'Retail', 'F&B'])
    expect(opts).toEqual(['F&B', 'Retail'])
  })

  it('diurutkan menurut kaidah bahasa Indonesia', () => {
    expect(clientTypeOptions(['Retail', 'E-commerce', 'Manufaktur', 'F&B']))
      .toEqual(['E-commerce', 'F&B', 'Manufaktur', 'Retail'])
  })

  it('nilai di-trim, dan spasi ujung tidak membuat entri kembar', () => {
    // '  Retail ' dan 'Retail' adalah jenis usaha yang sama bagi pembacanya.
    expect(clientTypeOptions(['  Retail ', 'Retail'])).toEqual(['Retail'])
  })

  it('kosong / whitespace / null / undefined dibuang', () => {
    expect(clientTypeOptions(['Retail', '', '   ', null, undefined])).toEqual(['Retail'])
  })

  it('nilai yang tidak ada di daftar bawaan tetap muncul apa adanya', () => {
    // Inti dari katalog turunan: apa pun yang diketik lewat "+ Jenis Usaha
    // Baru" akan ada di dropdown berikutnya, tanpa mengubah kode.
    const opts = clientTypeOptions(['Agrikultur', 'Retail'])
    expect(opts).toContain('Agrikultur')
    expect(FALLBACK_CLIENT_TYPES).not.toContain('Agrikultur')
  })

  it('tidak memutasi input', () => {
    const data = ['Retail', 'E-commerce']
    const salinan = [...data]
    clientTypeOptions(data)
    expect(data).toEqual(salinan)
  })
})

// ══ CADANGAN HANYA SAAT DATA BISU ════════════════════════════════
describe('clientTypeOptions — fallback', () => {
  it('daftar kosong → enam nilai bawaan', () => {
    expect(clientTypeOptions([])).toEqual([...FALLBACK_CLIENT_TYPES])
  })

  it('semua nilai kosong/null (mis. fetch gagal) → bawaan juga', () => {
    expect(clientTypeOptions([null, undefined, '', '  '])).toEqual([...FALLBACK_CLIENT_TYPES])
  })

  it('SATU nilai nyata sudah cukup untuk mematikan fallback', () => {
    // Cadangan tidak digabung: begitu data bicara, daftarnya murni cerminan
    // data. Kalau digabung, enam nilai bawaan ikut selamanya di setiap
    // instalasi walau tak satu klien pun memakainya.
    const opts = clientTypeOptions(['Agrikultur'])
    expect(opts).toEqual(['Agrikultur'])
    for (const bawaan of FALLBACK_CLIENT_TYPES) {
      expect(opts, bawaan).not.toContain(bawaan)
    }
  })

  it('cadangan berisi persis enam nilai yang dulu di-hardcode', () => {
    expect([...FALLBACK_CLIENT_TYPES]).toEqual([
      'E-commerce', 'Jasa Kreatif', 'Manufaktur', 'Retail', 'F&B', 'Jasa',
    ])
  })

  it('hasilnya selalu array baru — pemanggil tidak bisa merusak konstanta', () => {
    const a = clientTypeOptions([])
    a.push('Rusak')
    expect([...FALLBACK_CLIENT_TYPES]).not.toContain('Rusak')
    expect(clientTypeOptions([])).not.toContain('Rusak')
  })
})
