import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
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

  it('mencocokkan lewat kunci nama bersama, bukan perbandingan ad-hoc', () => {
    // Sejak 2026-09-16 kuncinya menyamakan spasi DAN besar-kecil huruf, dan
    // hidup di satu tempat (namaSupplierKey) supaya route, parser, dan indeks
    // unik di DB tidak bisa berbeda pendapat.
    expect(IMPORT).toContain('namaSupplierKey(')
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
    // Pesannya kini bercabang: supplier baru "dikosongkan", supplier yang sudah
    // ada "akun lama dipertahankan" — lihat blok penyesuaian di bawah.
    expect(IMPORT).toContain('tidak ada di Master COA')
    expect(IMPORT).toContain('bukan akun hutang')
    expect(IMPORT).toContain('dikosongkan')
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

// Dua penyesuaian 2026-09-16, keduanya soal TIDAK MERUSAK data yang sudah ada.
describe('impor: pencocokan nama & sel kosong', () => {
  it('memakai kunci nama bersama, bukan toLowerCase() sendiri', () => {
    // Kalau route dan parser memakai aturan berbeda, baris yang lolos parser
    // sebagai satu supplier bisa membentur indeks unik di DB.
    expect(IMPORT).toContain('namaSupplierKey(s.nama)')
    expect(IMPORT).toContain('namaSupplierKey(r.nama)')
    expect(IMPORT).not.toContain('.nama.toLowerCase()')
  })

  it('supplier BARU: seluruh field ditulis, termasuk yang kosong', () => {
    const blokBaru = IMPORT.slice(IMPORT.indexOf('if (!ada) {'), IMPORT.indexOf('// Supplier yang SUDAH ADA'))
    for (const f of ['kontak:', 'npwp:', 'bankNama:', 'bankRekening:', 'bankAtasNama:', 'akunHutangDefaultId:']) {
      expect(blokBaru, f).toContain(f)
    }
  })

  it('supplier YANG SUDAH ADA: hanya field terisi yang ditulis', () => {
    // Sel kosong berarti "tidak disebut", bukan "kosongkan". Tanpa penjagaan
    // ini, berkas impor yang cuma memuat kolom nama akan menghapus kontak,
    // NPWP, rekening, dan akun default seluruh supplier yang disebutnya.
    expect(IMPORT).toContain('if (r.kontak !== null) isi.kontak = r.kontak')
    expect(IMPORT).toContain('if (r.npwp !== null) isi.npwp = r.npwp')
    expect(IMPORT).toContain('if (nilai[i].akunDiputuskan) isi.akunHutangDefaultId')
  })

  it('kolom rekening tunduk pada aturan sel kosong yang SAMA (D43)', () => {
    // Berkas yang tidak memuat kolom rekening tidak boleh menghapus nomor
    // rekening yang sudah tersimpan.
    expect(IMPORT).toContain('if (r.bankNama !== null) isi.bankNama = r.bankNama')
    expect(IMPORT).toContain('if (r.bankRekening !== null) isi.bankRekening = r.bankRekening')
    expect(IMPORT).toContain('if (r.bankAtasNama !== null) isi.bankAtasNama = r.bankAtasNama')
  })

  it('kode akun salah pada supplier yang sudah ada TIDAK mengosongkan akun lamanya', () => {
    expect(IMPORT).toContain('akunDiputuskan')
    expect(IMPORT).toContain('akun lama dipertahankan')
  })

  it('kebijakan sel kosong ikut dikirim di respons, bukan cuma di kepala berkas', () => {
    expect(IMPORT).toContain('CATATAN_SEL_KOSONG')
    expect(IMPORT).toContain('note: CATATAN_SEL_KOSONG')
    // Ada di dryRun DAN di commit — layar konfirmasi harus bisa mengatakannya
    // sebelum orang menekan lanjut.
    const dry = IMPORT.indexOf('dryRun: true')
    const sesudahDry = IMPORT.indexOf('note: CATATAN_SEL_KOSONG', dry)
    expect(sesudahDry).toBeGreaterThan(-1)
  })
})

describe('keunikan nama di DB ikut case-insensitive', () => {
  it('skema memakai indeks unik atas lower(nama), bukan batasan biasa', () => {
    const SCHEMA = read('lib', 'db', 'schema.ts')
    expect(SCHEMA).toContain("uniqueIndex('master_supplier_client_nama_lower_unique')")
    expect(SCHEMA).toContain('lower(${table.nama})')
    // Batasan lama sudah diganti, bukan dibiarkan berdampingan.
    expect(SCHEMA).not.toContain("unique('master_supplier_client_nama_unique')")
  })

  it('migrasi 0013 mengganti batasan lama dengan indeks baru', () => {
    const M = read('lib', 'db', 'migrations', '0013_supplier_nama_case_insensitive.sql')
    expect(M).toContain('DROP CONSTRAINT "master_supplier_client_nama_unique"')
    expect(M).toContain('CREATE UNIQUE INDEX')
    expect(M).toContain('lower("nama")')
  })
})

// ══ DELETE SUPPLIER YANG MASIH DIRUJUK → 409, BUKAN set null (F1) ═══════
// Invoice & baris jurnal bersupplier adalah catatan yang SUDAH TERJADI.
// Memutus suppliernya jadi null menyisakan hutang tanpa pemilik: rekonsiliasi
// kehilangan barisnya, dan tidak ada satu galat pun yang memberi tahu.
describe('DELETE supplier yang masih dirujuk', () => {
  const body = handler(ROW, 'DELETE')

  it('menghitung invoice DAN baris jurnal yang merujuknya', () => {
    expect(body).toContain('.from(purchaseInvoices)')
    expect(body).toContain('eq(purchaseInvoices.supplierId, g.supplierId)')
    expect(body).toContain('.from(journalLines)')
    expect(body).toContain('eq(journalLines.supplierId, g.supplierId)')
  })

  it('pemeriksaannya terjadi SEBELUM penghapusan', () => {
    const cek = body.indexOf('.from(purchaseInvoices)')
    const hapus = body.indexOf('db.delete(masterSupplier)')
    expect(cek).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(hapus)
  })

  it('menolak 409 dengan menyebut BERAPA yang menghalangi', () => {
    expect(body).toContain('status: 409')
    expect(body).toContain('invoice pembelian')
    expect(body).toContain('baris jurnal')
  })

  it('TIDAK memutus suppliernya jadi null di mana pun', () => {
    // Pemeriksaan ini yang merah kalau seseorang kelak "memudahkan" hapus
    // supplier dengan mengosongkan rujukannya lebih dulu.
    expect(body).not.toContain('supplierId: null')
    expect(body).not.toContain('.update(purchaseInvoices)')
    expect(body).not.toContain('.update(journalLines)')
  })

  it('isFkViolation tetap dipasang sebagai JARING TERAKHIR', () => {
    expect(body).toContain('isFkViolation(e)')
  })
})

// ══ UI hapus supplier (keputusan CP-8 #3) ═══════════════════════════════
// Uji klik CP-8: 409 "masih dipakai…" tampil di banner halaman, tapi dialog
// konfirmasi tetap terbuka dan lapisan gelapnya menutupi banner itu — tombol
// "Hapus" terlihat tidak melakukan apa-apa.
describe('dialog hapus supplier', () => {
  const UI = read('components', 'settings', 'supplier-manager.tsx').replace(/\r\n/g, '\n')
  const mulai = UI.indexOf('async function hapus()')
  const HAPUS = UI.slice(mulai, UI.indexOf('\n  }\n', mulai))

  it('dialog DITUTUP di setiap akhir — termasuk saat 409 — supaya galatnya terlihat', () => {
    const fin = HAPUS.indexOf('} finally {')
    expect(fin).toBeGreaterThan(-1)
    expect(HAPUS.slice(fin)).toContain('setHapusTarget(null)')
    // Hanya di finally: jalur galat tidak boleh punya jalan pulang lain yang
    // membiarkan dialognya terbuka.
    expect(HAPUS.split('setHapusTarget(null)').length - 1).toBe(1)
  })

  it('pesan galat server dipakai apa adanya — ia yang menyebut jumlah pemakaian', () => {
    expect(HAPUS).toContain("setError(payload?.error ?? 'Gagal menghapus supplier.')")
  })

  it('teks konfirmasi mengatakan jurnal MEMBLOKIR, bukan "tidak terpengaruh"', () => {
    expect(UI).not.toContain('Master COA dan jurnal tidak terpengaruh')
    expect(UI).toContain('Supplier yang masih dipakai invoice pembelian atau baris jurnal')
    expect(UI).toContain('tidak bisa dihapus')
  })
})

// ══ MIGRASI 0019 (D43): termin supplier dihapus, rekening menggantikannya ══
describe('termin supplier sudah tidak dirujuk kode mana pun', () => {
  const semuaBerkas = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir)).flatMap(n => {
      const rel = join(dir, n)
      return statSync(join(process.cwd(), rel)).isDirectory() ? semuaBerkas(rel) : [rel]
    })

  it('tidak ada terminPembayaran / termin_pembayaran di app, lib, components — kecuali migrasi & test', () => {
    const berkas = ['app', 'lib', 'components']
      .flatMap(semuaBerkas)
      .filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) && !f.includes('migrations'))
    // Komentar dibuang dulu: skema sengaja MENJELASKAN bahwa kolom itu sudah
    // dihapus di 0019, dan penjelasan itu bukan rujukan.
    const tanpaKomentar = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const perujuk = berkas.filter(f =>
      /terminPembayaran|termin_pembayaran|TERMIN_M(IN|AX)/.test(tanpaKomentar(read(f)))
    )
    expect(perujuk).toEqual([])
  })

  it('daftar & ekspor membaca kolom rekening', () => {
    for (const [nama, src] of [['daftar', LIST], ['ekspor', EXPORT]] as const) {
      expect(src, nama).toContain('bankNama: masterSupplier.bankNama')
      expect(src, nama).toContain('bankRekening: masterSupplier.bankRekening')
      expect(src, nama).toContain('bankAtasNama: masterSupplier.bankAtasNama')
    }
  })

  it('0019 hanya men-DROP satu kolom itu — tidak menyentuh objek lain', () => {
    const berkas0019 = readdirSync(join(process.cwd(), 'lib', 'db', 'migrations')).filter(n => n.startsWith('0019_'))
    expect(berkas0019).toHaveLength(1)
    const isi = read('lib', 'db', 'migrations', berkas0019[0])
      .split(/\r?\n/)
      .filter(l => l.trim() !== '' && !l.trim().startsWith('--'))
      .join(' ')
    expect(isi.trim()).toBe('ALTER TABLE "master_supplier" DROP COLUMN "termin_pembayaran";')
  })
})

// ══ RIWAYAT SUPPLIER di audit_events (utang teknis, 2026-10-28) ══════════
// Pola modul pembelian: event ditulis di db.batch YANG SAMA dengan perubahannya
// (P10), nilai sebelum/sesudah = tujuh kolom data, dan event `deleted`
// bertahan setelah suppliernya dihapus (riwayatBertahanSetelahDihapus).
describe('riwayat supplier: setiap jalur tulis mencatat audit_events', () => {
  // Potongan harus berada di antara `const statements` dan `await db.batch(`,
  // dan di rentang itu tidak boleh ada tulis langsung (`await db.…`) — tulis
  // di luar batch berarti perubahan dan riwayatnya bisa berpisah nasib.
  const batchBerisi = (body: string, ...potongan: string[]) => {
    const awal = body.indexOf('const statements')
    const akhir = body.indexOf('await db.batch(')
    expect(awal, 'const statements').toBeGreaterThan(-1)
    expect(akhir, 'db.batch').toBeGreaterThan(awal)
    const rentang = body.slice(awal, akhir)
    expect(rentang, 'tulis langsung di luar batch').not.toContain('await db.')
    for (const p of potongan) expect(rentang, p).toContain(p)
  }

  it('tambah: insert dengan id buatan sendiri + event created, satu batch', () => {
    const body = handler(LIST, 'POST')
    batchBerisi(body, 'id: supplierId, clientId: id', "event: 'created'", 'nilaiSesudah: snapshotSupplier(check.value)')
    expect(body).toContain('randomUUID()')
    expect(body).not.toContain('.returning(')
  })

  it('ubah: event updated dengan sebelum → sesudah, hanya bila ada yang berubah', () => {
    const body = handler(ROW, 'PATCH')
    batchBerisi(body, "event: 'updated'", 'nilaiSebelum: sebelum', 'nilaiSesudah: sesudah')
    expect(body).toContain('if (supplierBerubah(sebelum, sesudah))')
    expect(body).toContain('snapshotSupplier(g.row)')
  })

  // Urutan event vs delete DI DALAM batch tidak penting (satu transaksi, tanpa
  // FK di antara keduanya); yang dijaga: keduanya di batch yang sama.
  it('hapus: event deleted (isi sebelum dihapus) di batch yang sama dengan delete, riwayat tidak dipurge', () => {
    const body = handler(ROW, 'DELETE')
    batchBerisi(body, "event: 'deleted'", 'nilaiSebelum: snapshotSupplier(g.row)', 'db.delete(masterSupplier)')
    const event = body.indexOf("event: 'deleted'")
    expect(body).not.toContain('purgeAuditEvents')
    // Pemeriksaan "masih dirujuk" tetap mendahului batch — event tidak ditulis untuk penghapusan yang ditolak.
    expect(body.indexOf('.from(purchaseInvoices)')).toBeLessThan(event)
  })

  it('guard membaca seluruh kolom data (bahan nilai_sebelum)', () => {
    expect(ROW.slice(ROW.indexOf('async function guard('))).toContain('...KOLOM_SNAPSHOT_SUPPLIER')
  })

  it('impor: created & updated untuk setiap supplier yang tersentuh, SATU insert riwayat di batch impor', () => {
    batchBerisi(IMPORT, 'recordSupplierEvents(riwayat)', 'if (insertRiwayat) statements.push(insertRiwayat)', "event: 'created'", "event: 'updated'")
    expect(IMPORT).toContain('if (supplierBerubah(sebelum, sesudah))')
    expect(IMPORT).toContain('id: supplierId,')
    expect(IMPORT).toContain('...KOLOM_SNAPSHOT_SUPPLIER')
    // dryRun tetap tidak menulis apa pun, termasuk riwayat.
    expect(IMPORT.indexOf('if (dryRun)')).toBeLessThan(IMPORT.indexOf('recordSupplierEvents('))
  })

  it('kolom yang dibaca untuk nilai_sebelum = kolom snapshot di lib/supplier', () => {
    const LIB = read('lib', 'supplier.ts')
    const daftar = LIB.slice(LIB.indexOf('export const KOLOM_DATA_SUPPLIER'), LIB.indexOf('] as const satisfies'))
    const kolom = daftar.split("'").filter((_, i) => i % 2 === 1)
    expect(kolom).toHaveLength(7)
    for (const k of kolom) expect(QUERIES, k).toContain(`${k}: masterSupplier.${k},`)
  })

  it('nama peristiwa bertipe SupplierEvent — wrapper khusus, bukan recordAuditEvent bebas', () => {
    for (const [src, nama] of [[LIST, 'daftar'], [ROW, 'baris'], [IMPORT, 'impor']] as const) {
      expect(src, nama).not.toContain('recordAuditEvent(')
    }
    expect(read('lib', 'api', 'audit.ts')).toContain('event: SupplierEvent')
  })
})
