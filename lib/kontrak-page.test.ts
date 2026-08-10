import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas source halaman /kontrak.
//
// Yang dijaga di sini adalah sebuah KETIADAAN: tidak ada sumber kebenaran kedua
// untuk "klien mana". Invarian berbentuk "X tidak ada di mana pun" tidak muncul
// di nilai kembalian fungsi apa pun, jadi ia hanya bisa dijaga di sisi
// penulisan. Pola & alasannya sama dengan lib/contracts-api.test.ts (halaman
// React juga tidak bisa di-import untuk diuji — proyek ini tidak punya setup
// component-testing).
//
// ══ KENAPA INI PERNAH SALAH ════════════════════════════════════════════════
// Form kontrak sempat punya <select> klien sendiri. Switcher sidebar sudah
// memiliki "klien mana" untuk seluruh app — Dashboard, Analytics, dan Laporan
// semuanya mengikutinya — sehingga selector kedua itu BERSAING dengannya. Dan
// ia sudah merusak sungguhan: Graphicook aktif di sidebar, Rasyuka terpilih di
// form, kontrak tersimpan di bawah klien yang daftarnya tidak ada di layar.
// Pesan "ganti klien di sidebar untuk melihatnya" adalah tambalan untuk masalah
// yang seharusnya tidak ada.

const SRC = readFileSync(join(process.cwd(), 'app', 'kontrak', 'page.tsx'), 'utf8')

describe('form kontrak tidak punya pemilih klien sendiri', () => {
  it('FormState TIDAK memuat clientId', () => {
    // Menghapus FIELD-nya, bukan menonaktifkan kontrolnya: selama nilainya
    // masih hidup di state form, ia bisa menyimpang dari sidebar lagi.
    const mulai = SRC.indexOf('type FormState = {')
    expect(mulai).toBeGreaterThan(-1)
    const blok = SRC.slice(mulai, SRC.indexOf('}', mulai))
    expect(blok).not.toContain('clientId')
  })

  it('tidak ada yang membaca form.clientId', () => {
    expect(SRC).not.toMatch(/form\.clientId/)
    expect(SRC).not.toMatch(/form\?\.clientId/)
  })

  it('tidak ada kontrol <select> klien di form', () => {
    expect(SRC).not.toContain('id="k-klien"')
    expect(SRC).not.toContain('htmlFor="k-klien"')
  })

  it('halaman tidak lagi memetakan daftar klien jadi <option>', () => {
    // `clients` dari useClient() hanya dipakai untuk mengisi dropdown itu, jadi
    // ketiadaannya adalah buktinya. Sengaja TIDAK melarang <option> secara
    // umum: select Tanggal Penagihan (1-31) memakainya dan memang sah.
    expect(SRC).not.toMatch(/clients\.map\(/)
    expect(SRC).not.toMatch(/\bclients\b/)
  })
})

describe('clientId yang dikirim SELALU klien aktif', () => {
  it('POST memakai `clientId` dari context, bukan dari isi form', () => {
    expect(SRC).toContain("fd.append('clientId', clientId)")
  })

  it('clientId diturunkan dari activeClient, satu baris, satu tempat', () => {
    expect(SRC).toContain('const clientId = activeClient?.id ?? null')
    // Tidak ada setState yang menulis ulang clientId di mana pun.
    expect(SRC).not.toMatch(/setClientId/)
  })

  it('PATCH tidak mengirim clientId — kontrak tidak bisa pindah klien', () => {
    // Penjagaannya: append-nya digerbangi `!editing`.
    expect(SRC).toMatch(/if \(!editing && clientId\) fd\.append\('clientId', clientId\)/)
  })
})

describe('tombol Kontrak Baru mati tanpa klien aktif', () => {
  it('memakai predikat canCreateContract, bukan cek inline', () => {
    expect(SRC).toContain('canCreateContract(')
    expect(SRC).toContain('const bolehBuat = canCreateContract(role, clientId)')
  })

  it('form tidak bisa dibuka lewat jalur lain saat tidak boleh', () => {
    // Pagar kedua di openCreate, di belakang tombol yang sudah disabled.
    expect(SRC).toMatch(/if \(!bolehBuat\) return/)
  })

  it('kedua tombol "Kontrak Baru" (header & empty state) ikut digerbangi', () => {
    const kemunculan = SRC.split('Kontrak Baru').length - 1
    // 2 tombol + 1 judul form ("Kontrak Baru" saat bukan mode edit).
    expect(kemunculan).toBeGreaterThanOrEqual(3)
    expect(SRC.split('disabled={!bolehBuat').length - 1).toBe(2)
  })
})

describe('tambalan lamanya ikut hilang', () => {
  it('tidak ada lagi pesan "ganti klien di sidebar untuk melihatnya"', () => {
    // Pesan itu hanya masuk akal kalau kontrak bisa dibuat untuk klien yang
    // tidak sedang dilihat. Sekarang tidak bisa, jadi kasusnya tidak ada.
    expect(SRC).not.toContain('Ganti klien aktif di sidebar')
    expect(SRC).not.toMatch(/dibuatUntukKlienLain/)
  })

  it('state actionInfo yang hanya menampungnya ikut dihapus', () => {
    expect(SRC).not.toMatch(/actionInfo/)
  })
})
