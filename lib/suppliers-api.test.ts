import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas source route supplier — pola sama dengan
// lib/journals-api.test.ts.
//
// Yang paling perlu dijaga di sini adalah PEMBELAHAN GERBANG dari R4: baca
// (daftar + ekspor) memakai requireInternal sehingga finance boleh melihat,
// sementara tulis (tambah/ubah/hapus/impor) tetap requireAkunting. Dua-duanya
// salah kalau tertukar, dan dengan cara yang berbeda: requireUser pada baca
// membocorkan daftar rekanan ke akun klien, sedangkan requireInternal pada
// tulis memberi finance kemampuan mengelola yang D7 tidak berikan.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LIST = read('app', 'api', 'clients', '[id]', 'suppliers', 'route.ts')
const ROW = read('app', 'api', 'clients', '[id]', 'suppliers', '[supplierId]', 'route.ts')
const IMPORT = read('app', 'api', 'clients', '[id]', 'suppliers', 'import', 'route.ts')
const EXPORT = read('app', 'api', 'clients', '[id]', 'suppliers', 'export', 'route.ts')
const QUERIES = read('lib', 'api', 'supplier-queries.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

describe('pembelahan gerbang R4 — finance melihat, tidak mengelola', () => {
  it('BACA (daftar & ekspor) memakai requireInternal', () => {
    expect(handler(LIST, 'GET')).toContain('await requireInternal()')
    expect(handler(EXPORT, 'GET')).toContain('await requireInternal()')
  })

  it('TULIS (tambah, ubah, hapus, impor) memakai requireAkunting', () => {
    expect(handler(LIST, 'POST')).toContain('await requireAkunting()')
    expect(handler(IMPORT, 'POST')).toContain('await requireAkunting()')
    // PATCH & DELETE lewat helper guard() yang diuji terpisah di bawah.
    expect(handler(ROW, 'PATCH')).toContain('await guard(params)')
    expect(handler(ROW, 'DELETE')).toContain('await guard(params)')
  })

  it('helper guard() route baris memakai requireAkunting, bukan requireInternal', () => {
    const helper = ROW.slice(ROW.indexOf('async function guard('))
    expect(helper.slice(0, 400)).toContain('await requireAkunting()')
    expect(helper.slice(0, 400)).not.toContain('requireInternal')
  })

  it('TIDAK ADA route supplier yang memakai requireUser — klien tidak boleh melihat', () => {
    for (const [src, nama] of [[LIST, 'daftar'], [ROW, 'baris'], [IMPORT, 'impor'], [EXPORT, 'ekspor']] as const) {
      expect(src, nama).not.toContain('requireUser()')
    }
  })

  it('batas antar-klien dinyatakan eksplisit di setiap route', () => {
    for (const [src, nama] of [[LIST, 'daftar'], [ROW, 'baris'], [IMPORT, 'impor'], [EXPORT, 'ekspor']] as const) {
      expect(src, nama).toContain('canAccessClientData(')
    }
  })
})

describe('supplier harus milik klien di URL', () => {
  it('guard mencocokkan id supplier DAN clientId sekaligus', () => {
    expect(ROW).toContain('eq(masterSupplier.id, supplierId)')
    expect(ROW).toContain('eq(masterSupplier.clientId, id)')
  })

  it('404 kalau tidak ketemu, bukan 403 yang membocorkan keberadaannya', () => {
    const helper = ROW.slice(ROW.indexOf('async function guard('))
    expect(helper.slice(0, 1200)).toContain('Supplier tidak ditemukan untuk klien ini.')
  })
})

describe('akun hutang default divalidasi dua kali, dengan aturan yang sama', () => {
  it('tambah dan ubah sama-sama memanggil penjaga bersama', () => {
    expect(handler(LIST, 'POST')).toContain('assertAkunHutangMilikKlien(')
    expect(handler(ROW, 'PATCH')).toContain('assertAkunHutangMilikKlien(')
  })

  it('penjaganya memeriksa kepemilikan klien DAN bahwa akunnya benar hutang', () => {
    expect(QUERIES).toContain('eq(masterCoa.clientId, clientId)')
    expect(QUERIES).toContain('isHutangAccount(')
  })

  it('klasifikasi hutang diturunkan dari classifyBs, bukan daftar kata kunci kedua', () => {
    const LIB = read('lib', 'supplier.ts')
    expect(LIB).toContain("classifyBs(subKelompok) === 'hutang'")
  })
})

// Impor supplier BUKAN replace-all seperti impor Master COA. Berkas impor
// lazimnya berisi TAMBAHAN, bukan seluruh daftar — replace-all akan menghapus
// supplier yang kebetulan tidak ikut di berkas terakhir.
describe('impor = upsert by nama, tidak pernah menghapus', () => {
  it('tidak ada satu pun operasi hapus di jalur impor', () => {
    expect(IMPORT).not.toContain('db.delete(')
  })

  it('mencocokkan by nama tanpa peduli besar-kecil huruf', () => {
    // Kalau di sini case-sensitive sementara parser tidak, "Toko Jaya" dan
    // "TOKO JAYA" lolos parser sebagai satu baris lalu membentur unique.
    expect(IMPORT).toContain('s.nama.toLowerCase()')
    expect(IMPORT).toContain('r.nama.toLowerCase()')
  })

  it('membaca data yang dibutuhkan sebelum menulis', () => {
    const baca = IMPORT.indexOf('await Promise.all')
    const tulis = IMPORT.indexOf('await db.batch(')
    expect(baca).toBeGreaterThan(-1)
    expect(baca).toBeLessThan(tulis)
  })

  it('dryRun mengembalikan hitungan tanpa menyentuh batch', () => {
    const dry = IMPORT.indexOf('if (dryRun)')
    const tulis = IMPORT.indexOf('await db.batch(')
    expect(dry).toBeGreaterThan(-1)
    expect(dry).toBeLessThan(tulis)
    expect(IMPORT).toContain('toInsert: toInsert.length')
    expect(IMPORT).toContain('toUpdate: toUpdate.length')
  })

  it('kode akun tak dikenal jadi warning, bukan menggagalkan berkas', () => {
    expect(IMPORT).toContain('tidak ada di Master COA — dikosongkan.')
    expect(IMPORT).toContain('bukan akun hutang — dikosongkan.')
  })

  it('galat parser TETAP menggagalkan impor sebelum apa pun ditulis', () => {
    const cek = IMPORT.indexOf('if (errors.length > 0)')
    const tulis = IMPORT.indexOf('await db.batch(')
    expect(cek).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(tulis)
  })

  it('seluruh impor dikirim dalam SATU batch, jadi atomik', () => {
    expect(IMPORT).toContain('await db.batch(')
  })
})

describe('ekspor', () => {
  it('memakai header RFC 5987 supaya nama klien non-ASCII tidak rusak', () => {
    expect(EXPORT).toContain("filename*=UTF-8''")
    expect(EXPORT).toContain('asciiFallback')
  })

  it('tidak boleh di-cache — cadangan harus mencerminkan isi DB saat diminta', () => {
    expect(EXPORT).toContain("'Cache-Control': 'no-store'")
  })

  it('urutannya sama dengan daftar, dan leftJoin supaya yang tanpa akun ikut', () => {
    expect(EXPORT).toContain('asc(masterSupplier.nama)')
    expect(EXPORT).toContain('.leftJoin(masterCoa')
  })
})

describe('daftar', () => {
  it('leftJoin akun — supplier tanpa akun default tetap muncul', () => {
    // innerJoin akan menghilangkannya diam-diam, persis supplier yang paling
    // perlu dilengkapi.
    expect(handler(LIST, 'GET')).toContain('.leftJoin(masterCoa')
  })

  it('nama dobel jadi 409 dengan pesan yang menyebut namanya', () => {
    for (const [src, m] of [[LIST, 'POST'], [ROW, 'PATCH']] as const) {
      const body = handler(src, m)
      expect(body, m).toContain('isUniqueViolation(e)')
      expect(body, m).toContain('status: 409')
    }
  })
})
