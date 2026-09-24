import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL — keputusan Ricko 2026-09-24 (F6, perbaikan pra-rilis #3):
// halaman PEMBUKUAN menampilkan nominal persis sampai sen lewat rupiahPersis;
// Dashboard dan Analytics TETAP dibulatkan.
//
// Kenapa dikunci per berkas: `rupiah()` membulatkan ke rupiah utuh, jadi
// invoice Rp 1.000.000,50 tampil "Rp 1.000.001" di daftar, dialog posting, dan
// buku besar — angka yang tidak ada di dokumen mana pun (temuan smoke test
// gladi). Satu pemanggilan `rupiah(` yang tertinggal di halaman ini sudah cukup
// untuk mengembalikan masalahnya, dan tidak ada nilai kembalian yang
// menunjukkannya.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const PEMBUKUAN: [string, string][] = [
  ['app/jurnal/page.tsx', 'daftar /jurnal + dialog konfirmasi posting'],
  ['components/jurnal/journal-detail.tsx', 'rincian jurnal (di daftar /jurnal)'],
  ['components/jurnal/journal-form-modal.tsx', 'panel total form jurnal'],
  ['app/pembelian/page.tsx', '/pembelian (daftar, rincian, cicilan, dialog hapus)'],
  ['app/hutang/page.tsx', '/hutang (kartu umur, jatuh tempo, rekap)'],
  ['components/hutang/supplier-detail.tsx', 'detail hutang per supplier'],
  ['app/buku-besar/page.tsx', 'buku besar per akun + neraca saldo'],
]

describe('halaman pembukuan: persis sampai sen', () => {
  it('tidak satu pun pemanggilan rupiah()/rupiahShort()/rupiahPlain() yang membulatkan', () => {
    for (const [berkas, nama] of PEMBUKUAN) {
      const src = read(...berkas.split('/'))
      expect(src, nama).not.toMatch(/[^A-Za-z]rupiah\(/)
      expect(src, nama).not.toContain('rupiahShort(')
      expect(src, nama).not.toContain('rupiahPlain(')
      expect(src, nama).toContain('rupiahPersis(')
    }
  })

  it('nominal yang dijumlahkan di browser dijumlahkan dalam SEN, bukan Number()', () => {
    const hutang = read('app', 'hutang', 'page.tsx')
    expect(hutang).not.toContain('s + Number(r.sisa)')
    expect(hutang).toContain('toMinorUnits(neg ? r.sisa.slice(1) : r.sisa)')
    // Total berbentuk sen → string lewat fromMinorUnits, bukan dibagi 100.
    for (const berkas of ['components/jurnal/journal-detail.tsx', 'components/jurnal/journal-form-modal.tsx']) {
      const src = read(...berkas.split('/'))
      expect(src, berkas).not.toContain('/ 100)')
      expect(src, berkas).toContain('rupiahPersis(fromMinorUnits(totals.debit))')
    }
  })

  it('titik-titik yang disebut Ricko memang lewat rupiahPersis', () => {
    const jurnal = read('app', 'jurnal', 'page.tsx')
    expect(jurnal).toContain('rupiahPersis(r.totalDebit)')
    expect(jurnal).toContain('rupiahPersis(postingTarget.totalDebit)')
    const beli = read('app', 'pembelian', 'page.tsx')
    expect(beli).toContain('rupiahPersis(r.total)')
    expect(beli).toContain('rupiahPersis(r.sisa)')
    const bb = read('app', 'buku-besar', 'page.tsx')
    expect(bb).toContain('rupiahPersis(r.saldo)')
    expect(bb).toContain('rupiahPersis(data.totalDebit)')
    const detail = read('components', 'hutang', 'supplier-detail.tsx')
    expect(detail).toContain('rupiahPersis(inv.sisa)')
  })
})

describe('Dashboard dan Analytics TETAP dibulatkan', () => {
  it('tidak memakai rupiahPersis', () => {
    for (const berkas of ['app/dashboard/page.tsx', 'app/analytics/page.tsx']) {
      expect(read(...berkas.split('/')), berkas).not.toContain('rupiahPersis')
    }
  })
})
