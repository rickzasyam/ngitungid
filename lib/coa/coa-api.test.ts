import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas source route Master COA — pola sama dengan
// lib/contracts-api.test.ts.
//
// Kenapa membaca file, bukan memanggil handler-nya: yang dijaga di sini adalah
// URUTAN, dan urutan tidak muncul di nilai kembalian mana pun. Route handler
// juga tidak bisa di-import untuk diuji (butuh runtime Next + sesi + DB).
//
// Yang dikunci: penolakan karena jurnal harus terjadi SEBELUM satu statement
// pun dikirim. Kalau ia bergeser ke belakang db.batch, yang menolak jadi FK
// Postgres — galatnya tidak menyebut satu pun nomor bukti, dan pengguna tidak
// punya cara tahu jurnal mana yang harus diperbaiki.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const REPLACE = read('app', 'api', 'clients', '[id]', 'coa', 'route.ts')
const ROW = read('app', 'api', 'clients', '[id]', 'coa', 'rows', '[coaId]', 'route.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

const REPLACE_POST = handler(REPLACE, 'POST')
const ROW_DELETE = handler(ROW, 'DELETE')

describe('ganti Master COA — jurnal diperiksa sebelum menulis', () => {
  it('baris jurnal dibaca sebelum buildReplacePlan dipanggil', () => {
    const baca = REPLACE_POST.indexOf('.from(journalLines)')
    const rencana = REPLACE_POST.indexOf('buildReplacePlan(')
    expect(baca).toBeGreaterThan(-1)
    expect(baca).toBeLessThan(rencana)
  })

  it('baris jurnal diambil lewat join ke header, di-scope ke klien di URL', () => {
    expect(REPLACE_POST).toContain('.innerJoin(journalEntries')
    expect(REPLACE_POST).toContain('eq(journalEntries.clientId, id)')
  })

  it('nomor bukti ikut dibaca — tanpa itu pesan blokir tidak bisa ditindak', () => {
    expect(REPLACE_POST).toContain('noBukti: journalEntries.noBukti')
  })

  it('penolakan 409 terjadi SEBELUM db.batch', () => {
    const tolak = REPLACE_POST.indexOf('plan.journalBlocked.length > 0')
    const batch = REPLACE_POST.indexOf('await db.batch(')
    expect(tolak).toBeGreaterThan(-1)
    expect(batch).toBeGreaterThan(-1)
    expect(tolak).toBeLessThan(batch)
  })

  it('penolakan 409 juga terjadi sebelum statement apa pun disusun', () => {
    const tolak = REPLACE_POST.indexOf('plan.journalBlocked.length > 0')
    const statements = REPLACE_POST.indexOf('const statements')
    expect(tolak).toBeLessThan(statements)
  })

  it('dryRun mengembalikan impact lebih dulu, jadi pratinjau tetap bisa menampilkan blokir', () => {
    const dry = REPLACE_POST.indexOf('if (dryRun)')
    const tolak = REPLACE_POST.indexOf('plan.journalBlocked.length > 0')
    expect(dry).toBeGreaterThan(-1)
    expect(dry).toBeLessThan(tolak)
  })

  it('pesan galat menyebut nomor bukti, bukan cuma jumlah', () => {
    expect(REPLACE_POST).toContain('b.noBukti')
  })
})

// Urutan tulis pada jalur "ada jurnal" dibalik karena journal_lines.master_coa_id
// NOT NULL dengan FK restrict: ia tidak bisa dilepas dulu seperti
// report_line_items, sementara menyisipkan baris baru lebih dulu ditabrak
// unique(client_id, kode). Dua invarian di bawah yang membuat jalur itu benar.
describe('ganti Master COA — urutan tulis saat ada jurnal', () => {
  it('menyisipkan COA baru SEBELUM memindahkan baris jurnal', () => {
    const insert = REPLACE_POST.indexOf('db.insert(masterCoa).values(values)')
    const pindah = REPLACE_POST.indexOf('update ${journalLines} as jl')
    expect(insert).toBeGreaterThan(-1)
    expect(pindah).toBeGreaterThan(-1)
    expect(insert).toBeLessThan(pindah)
  })

  it('memindahkan baris jurnal SEBELUM menghapus COA lama', () => {
    const pindah = REPLACE_POST.indexOf('update ${journalLines} as jl')
    const hapus = REPLACE_POST.indexOf('db.delete(masterCoa).where(inArray(masterCoa.id, oldIds))')
    expect(hapus).toBeGreaterThan(-1)
    expect(pindah).toBeLessThan(hapus)
  })

  it('penghapusan di jalur itu dibatasi ke id LAMA, bukan ke clientId', () => {
    // Kalau dibatasi ke clientId, baris yang baru saja disisipkan ikut terhapus
    // dan klien kehilangan seluruh Master COA-nya.
    expect(REPLACE_POST).toContain('db.delete(masterCoa).where(inArray(masterCoa.id, oldIds))')
  })

  it('kode lama dinamai ulang memakai id barisnya sendiri supaya dijamin unik', () => {
    expect(REPLACE_POST).toContain("'~' || ${masterCoa.id}::text")
  })

  it('jalur tanpa jurnal masih memakai hapus-semua-lalu-sisipkan yang lama', () => {
    expect(REPLACE_POST).toContain('journalRows.length === 0')
    expect(REPLACE_POST).toContain('db.delete(masterCoa).where(eq(masterCoa.clientId, id))')
  })
})

describe('hapus satu baris COA — ditolak kalau dipakai jurnal', () => {
  it('hanya membaca baris jurnal yang menunjuk akun yang dihapus', () => {
    expect(ROW_DELETE).toContain('eq(journalLines.masterCoaId, g.coaId)')
  })

  it('di-scope ke klien di URL, bukan hanya ke id akun', () => {
    expect(ROW_DELETE).toContain('eq(journalEntries.clientId, g.clientId)')
  })

  it('baris jurnal dibaca sebelum buildReplacePlan', () => {
    const baca = ROW_DELETE.indexOf('.from(journalLines)')
    const rencana = ROW_DELETE.indexOf('buildReplacePlan(')
    expect(baca).toBeGreaterThan(-1)
    expect(baca).toBeLessThan(rencana)
  })

  it('penolakan 409 terjadi sebelum db.batch', () => {
    const tolak = ROW_DELETE.indexOf('plan.journalBlocked.length > 0')
    const batch = ROW_DELETE.indexOf('await db.batch(')
    expect(tolak).toBeGreaterThan(-1)
    expect(tolak).toBeLessThan(batch)
  })

  it('dryRun tetap mengembalikan impact sebelum penolakan', () => {
    const dry = ROW_DELETE.indexOf('if (dryRun)')
    const tolak = ROW_DELETE.indexOf('plan.journalBlocked.length > 0')
    expect(dry).toBeLessThan(tolak)
  })
})

describe('guard tidak bergeser', () => {
  it('ganti Master COA tetap requireAkunting', () => {
    expect(REPLACE_POST).toContain('requireAkunting()')
  })

  it('baca Master COA tetap requireUser + canAccessClientData', () => {
    const get = handler(REPLACE, 'GET')
    expect(get).toContain('requireUser()')
    expect(get).toContain('canAccessClientData(')
  })

  it('route baris COA memakai guard yang memastikan akun milik klien di URL', () => {
    expect(ROW).toContain('eq(masterCoa.clientId, id)')
    expect(ROW).toContain('requireAkunting()')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// FASE 2 (E3) — tipe akun & penanda kas
// ══════════════════════════════════════════════════════════════════════════

const TYPES = read('app', 'api', 'clients', '[id]', 'coa', 'types', 'route.ts')

// ══ PENJAGA BERDIRI: GANTI-MASSAL TIDAK MENGHAPUS TIPE AKUN ══════════════
// Keputusan Ricko 2026-09-18. Kedua kolom diisi manual lewat layar; berkas
// Excel klien lazimnya tidak memuatnya. Kalau carryAccountTypes lepas dari
// jalur ini, setiap impor ulang COA menghapus seluruh tipe akun yang sudah
// disetel — tanpa galat, tanpa jejak, dan baru ketahuan saat laporan salah.
describe('replace-all membawa tipe_akun & is_kas yang lama', () => {
  const body = handler(REPLACE, 'POST')

  it('memanggil carryAccountTypes', () => {
    expect(body).toContain('carryAccountTypes(oldAccounts, rows)')
  })

  it('kolom lamanya benar-benar dibaca — carry tanpa sumber cuma hiasan', () => {
    expect(body).toContain('tipeAkun: masterCoa.tipeAkun')
    expect(body).toContain('isKas: masterCoa.isKas')
  })

  it('pembacaan COA lama terjadi SEBELUM values disusun', () => {
    const baca = body.indexOf('.select({')
    const carry = body.indexOf('carryAccountTypes(')
    const values = body.indexOf('const values =')
    expect(baca).toBeGreaterThan(-1)
    expect(baca).toBeLessThan(carry)
    expect(carry).toBeLessThan(values)
  })

  it('yang disisipkan adalah hasil carry, bukan baris mentah dari berkas', () => {
    expect(body).toContain('carried.map(')
    expect(body).not.toContain('rows.map(r => ({ id: randomUUID()')
  })
})

// ══ PENJAGA BERDIRI: ROUTE TIPE AKUN NON-DESTRUKTIF ══════════════════════
// Ia hanya boleh UPDATE dua kolom by kode. Begitu ia bisa menyisipkan atau
// menghapus, ia diam-diam menjadi jalur impor kedua — tanpa validasi
// kelompok/sub kelompok dan tanpa re-link apa pun.
describe('POST /coa/types non-destruktif', () => {
  const body = handler(TYPES, 'POST')

  it('digerbangi requireAkunting dan batas antar-klien dinyatakan', () => {
    expect(body).toContain('await requireAkunting()')
    expect(body).toContain('canAccessClientData(')
    expect(TYPES).not.toContain('requireUser()')
  })

  it('TIDAK ADA insert maupun delete di berkas ini', () => {
    for (const needle of ['db.insert(', 'db.delete(', '.insert(masterCoa)', '.delete(masterCoa)']) {
      expect(TYPES, needle).not.toContain(needle)
    }
  })

  it('UPDATE-nya hanya menyentuh tipe_akun, is_kas, dan updatedAt', () => {
    const set = body.match(/\.set\(\{[^}]*\}\)/g) ?? []
    expect(set.length).toBeGreaterThan(0)
    for (const s of set) {
      expect(s).toContain('tipeAkun')
      expect(s).toContain('isKas')
      for (const terlarang of ['kode:', 'nama:', 'posisi:', 'kelompok:', 'subKelompok:', 'classCf:']) {
        expect(s, terlarang).not.toContain(terlarang)
      }
    }
  })

  it('disaring clientId, bukan cuma kode — kode tidak unik lintas klien', () => {
    expect(body).toContain('eq(masterCoa.clientId, id)')
    expect(body).toContain('inArray(masterCoa.kode,')
  })

  it('kode yang tidak dikenal DILAPORKAN, tidak dibuatkan barisnya', () => {
    expect(body).toContain('unknownKode')
    expect(body).toContain('if (!row)')
  })

  it('dryRun mengembalikan ringkasan tanpa menulis apa pun', () => {
    const dry = body.indexOf('if (dryRun) return')
    const batch = body.indexOf('await db.batch(')
    expect(dry).toBeGreaterThan(-1)
    expect(batch).toBeGreaterThan(-1)
    expect(dry).toBeLessThan(batch)
  })

  it('memakai parser COA yang SAMA, bukan parser kedua', () => {
    expect(TYPES).toContain("from '@/lib/coa-import'")
    expect(TYPES).toContain('parseCoaWorkbook(')
  })

  it('sel kosong tidak menghapus nilai yang sudah ada', () => {
    expect(body).toContain('r.tipeAkun ?? row.tipeAkun')
    expect(body).toContain('r.isKas ?? row.isKas')
  })
})

describe('GET /coa membawa tipe turunan dan penyaring opsional (R8)', () => {
  const body = handler(REPLACE, 'GET')

  it('respons memuat tipeAkun, isKas, resolvedType, resolvedIsKas', () => {
    expect(REPLACE).toContain('tipeAkun: masterCoa.tipeAkun')
    expect(REPLACE).toContain('isKas: masterCoa.isKas')
    expect(body).toContain('resolveAccountType(rest)')
    expect(body).toContain('resolveIsKas(rest)')
  })

  it('parameter tipe yang tidak dikenali ditolak 400, bukan diabaikan', () => {
    expect(body).toContain('isAccountType(tipeFilter)')
    expect(body).toContain('status: 400')
  })

  it('updatedAt dihitung sebelum penyaringan', () => {
    const updated = body.indexOf('const updatedAt =')
    const filter = body.indexOf('.filter(a =>')
    expect(updated).toBeGreaterThan(-1)
    expect(updated).toBeLessThan(filter)
  })
})

// ══ PENJAGA BERDIRI: PERUJUK master_coa DARI MODUL PEMBELIAN (M5) ════════
// Kolom perujuk yang lupa didaftarkan membuat ganti-massal COA memutus FK
// atau memindahkan angka ke akun yang salah — dan tidak ada test perilaku
// yang otomatis merah. Penjaganya harus struktural.
describe('replace-all sadar invoice pembelian & setelan klien', () => {
  const body = handler(REPLACE, 'POST')

  it('keempat kolom akun invoice dibaca dan MASUK ke daftar yang dioper', () => {
    for (const kolom of ['akunTujuanId', 'akunKasId', 'akunHutangId', 'akunPpnMasukanId']) {
      expect(body, kolom).toContain(`purchaseInvoices.${kolom}`)
    }
    // Sama dengan penjaga mutasi di bawah: kolom yang dibaca tapi lupa masuk
    // ke `invoiceAccounts` tidak tertangkap oleh pemeriksaan SELECT saja.
    for (const pasangan of [
      "['tujuan', inv.akunTujuanId]",
      "['kas', inv.akunKasId]",
      "['hutang', inv.akunHutangId]",
      "['ppn', inv.akunPpnMasukanId]",
    ]) {
      expect(body, pasangan).toContain(pasangan)
    }
    expect(body).toContain('invoiceAccounts,')
  })

  it('setelan klien ikut dioper — akun PPN Masukan juga merujuk master_coa', () => {
    expect(body).toContain('clientAccountingSettings.akunPpnMasukanId')
    expect(body).toContain('accountingSettings: settingRows')
  })

  it('invoice yang terblokir menolak 409 SEBELUM satu statement pun dikirim', () => {
    const blokir = body.indexOf('plan.invoiceBlocked.length > 0')
    const batch = body.indexOf('await db.batch(')
    expect(blokir).toBeGreaterThan(-1)
    expect(blokir).toBeLessThan(batch)
  })

  it('pesan blokirnya menyebut nomor invoice DAN kolom mana yang bermasalah', () => {
    expect(body).toContain('b.noInvoice')
    expect(body).toContain('labelKolom[b.kolom]')
  })

  it('jalur hapus-langsung hanya dipakai bila TIDAK ada jurnal DAN tidak ada invoice', () => {
    // Keempat kolom akun invoice juga FK RESTRICT, jadi DELETE master_coa
    // ditolak selama sebuah invoice masih menunjuk ke sana.
    expect(body).toContain('journalRows.length === 0 &&')
    expect(body).toContain('invoiceAccounts.length === 0 &&')
  })

  it('relink invoice dieksekusi per KOLOM, di dalam batch', () => {
    expect(body).toContain('invoiceRelinks.filter(r => r.kolom === kolom)')
    expect(body).toContain('update ${purchaseInvoices} as pi')
    expect(body).not.toContain('await db.execute(')
  })

  it('setelan klien DIPUTUS jadi null, bukan memblokir', () => {
    expect(body).toContain('for (const r of settingRelinks)')
    expect(body).toContain('akunPpnMasukanId: r.newMasterCoaId')
  })

  it('akun Pindah Buku (0021) ikut dibaca, dioper, dan disambung', () => {
    expect(body).toContain('akunPindahBukuId: clientAccountingSettings.akunPindahBukuId')
    expect(body).toContain('akunPindahBukuId: r.newMasterCoaId')
  })

  it('setelan yang punya relink memaksa jalur ganti-nama — FK SET NULL memutusnya di jalur hapus-langsung', () => {
    expect(body).toContain('settingRelinks.length === 0')
  })
})

// ══ PENJAGA BERDIRI: PERUJUK master_coa DARI ATURAN MUTASI (S1, D57) ═══════
describe('replace-all sadar aturan mutasi', () => {
  const body = handler(REPLACE, 'POST')

  it('kedua kolom perujuk dibaca dan MASUK ke daftar yang dioper', () => {
    // Diperiksa di titik penyusunan daftar, bukan di SELECT (alasan sama dengan
    // penjaga mutasi di bawah).
    expect(body).toContain("['lawan', r.akunLawanId]")
    expect(body).toContain("['kas', r.akunKasId]")
    expect(body).toContain('ruleAccounts,')
  })

  it('aturan yang terblokir menolak 409 SEBELUM satu statement pun dikirim, dengan polanya', () => {
    const blokir = body.indexOf('plan.ruleBlocked.length > 0')
    const batch = body.indexOf('await db.batch(')
    expect(blokir).toBeGreaterThan(-1)
    expect(blokir).toBeLessThan(batch)
    expect(body).toContain('b.pola')
  })

  it('jalur hapus-langsung ikut memperhitungkan aturan (FK restrict)', () => {
    expect(body).toContain('ruleAccounts.length === 0')
  })

  it('relink aturan dieksekusi per kolom, di dalam batch', () => {
    expect(body).toContain('ruleRelinks.filter(r => r.kolom === kolom)')
    expect(body).toContain('update ${cashMutationRules} as cr')
  })
})


// ══ PENJAGA BERDIRI: PERUJUK master_coa DARI MODUL MUTASI KAS (N5) ═══════
// Sama mendesaknya dengan M5, dan dengan satu bentuk kegagalan tambahan:
// ketiga kolom di bawah adalah FK RESTRICT, jadi kolom yang lupa didaftarkan
// membuat ganti-massal GAGAL DI DATABASE dengan galat yang tidak menyebut satu
// baris pun — bukan salah angka, melainkan buntu yang tidak bisa dijelaskan.
describe('replace-all sadar mutasi kas', () => {
  const body = handler(REPLACE, 'POST')

  it('ketiga kolom perujuk dibaca dan MASUK ke daftar yang dioper', () => {
    // Diperiksa pada TITIK PENYUSUNAN daftarnya, bukan pada SELECT-nya.
    // Membaca kolom di query tapi lupa memasukkannya ke `mutationAccounts`
    // adalah persis bentuk kegagalan yang diminta Ricko supaya membuat test
    // merah — dan bentuk `toContain('cashMutations.akunLawanId')` saja TIDAK
    // menangkapnya, karena string itu tetap ada di SELECT.
    expect(body).toContain("['kas', m.akunKasId]")
    expect(body).toContain("['lawan', m.akunLawanId]")
    expect(body).toContain('masterCoaId: i.akunKasId')
    expect(body).toContain('mutationAccounts,')
  })

  it('mutasi yang terblokir menolak 409 SEBELUM satu statement pun dikirim', () => {
    const blokir = body.indexOf('plan.mutationBlocked.length > 0')
    const batch = body.indexOf('await db.batch(')
    expect(blokir).toBeGreaterThan(-1)
    expect(blokir).toBeLessThan(batch)
  })

  it('pesan blokirnya menyebut BARIS MANA, bukan sekadar akunnya', () => {
    // Tanpa label, akunting cuma diberi tahu "ada akun yang dipakai" dan harus
    // menebak baris rekening koran mana yang harus dibereskan.
    expect(body).toContain('b.label')
    expect(body).toContain("kas: 'akun kas'")
    expect(body).toContain("'impor-kas':")
  })

  it('jalur hapus-langsung ikut memperhitungkan mutasi', () => {
    expect(body).toContain('mutationAccounts.length === 0')
  })

  it('relink mutasi dieksekusi per kolom, dan impor punya cabang tabelnya sendiri', () => {
    expect(body).toContain("mutationRelinks.filter(r => r.kolom === kolom)")
    expect(body).toContain('update ${cashMutations} as cm')
    expect(body).toContain('update ${cashMutationImports} as ci')
  })
})

// ══ E6 (F03-14): riwayat tipe akun & penanda kas ═══════════════════════
// Ketiga jalan yang mengubah tipe_akun/is_kas menulis audit_events DI BATCH
// YANG SAMA dengan perubahannya (P10). Riwayat mengikuti KODE saat
// ganti-massal memberi setiap akun id baru.
describe('riwayat tipe & kas — ditulis bersama perubahannya (E6)', () => {
  const ROW_PATCH = handler(ROW, 'PATCH')
  const ROW_GET = handler(ROW, 'GET')
  const TYPES_POST = handler(TYPES, 'POST')

  it('form baris: event hanya bila tipe/kas berubah, di db.batch yang sama dengan UPDATE', () => {
    expect(ROW_PATCH).toContain('tipeKasBerubah(sebelum, sesudah)')
    expect(ROW_PATCH).toContain('catatan: SUMBER_PERUBAHAN_TIPE.form')
    expect(ROW_PATCH).toContain('db.batch([ubah, riwayat])')
    // UPDATE tidak lagi dijalankan sendiri di luar batch.
    expect(ROW_PATCH).not.toMatch(/await db\s*\.update\(masterCoa\)/)
  })

  it('isi tipe dari berkas: satu INSERT riwayat untuk akun yang berubah, sebelum db.batch', () => {
    const catat = TYPES_POST.indexOf('recordCoaTypeEvents(')
    const dorong = TYPES_POST.indexOf('if (riwayat) statements.push(riwayat)')
    const batch = TYPES_POST.indexOf('await db.batch(')
    expect(catat).toBeGreaterThan(-1)
    expect(dorong).toBeGreaterThan(catat)
    expect(batch).toBeGreaterThan(dorong)
    expect(TYPES_POST).toContain('catatan: SUMBER_PERUBAHAN_TIPE.berkas')
  })

  it('ganti-massal: sambung riwayat by kode, hapus yang kodenya hilang, catat perubahan — sebelum db.batch', () => {
    const potong = REPLACE_POST.indexOf('rencanaRiwayatGantiMassal(oldAccounts, newKodeToId)')
    const batch = REPLACE_POST.lastIndexOf('await db.batch(')
    expect(potong).toBeGreaterThan(-1)
    expect(batch).toBeGreaterThan(potong)
    const blok = REPLACE_POST.slice(potong, batch)
    expect(blok).toContain("relinkAuditEvents('master_coa', nasibRiwayat.sambung)")
    expect(blok).toContain("purgeAuditEventsMany('master_coa', nasibRiwayat.hapus)")
    expect(blok).toContain('perubahanTipeGantiMassal(oldAccounts, values)')
    expect(blok).toContain('catatan: SUMBER_PERUBAHAN_TIPE.ganti_massal')
    expect(blok).toContain('statements.push(st)')
  })

  it('hapus satu baris: riwayatnya ikut dihapus di batch yang sama', () => {
    const hapusAkun = ROW_DELETE.indexOf('db.delete(masterCoa).where(eq(masterCoa.id, g.coaId))')
    const hapusRiwayat = ROW_DELETE.indexOf("purgeAuditEvents('master_coa', g.coaId)")
    const batch = ROW_DELETE.indexOf('await db.batch(')
    expect(hapusAkun).toBeGreaterThan(-1)
    expect(hapusRiwayat).toBeGreaterThan(-1)
    expect(batch).toBeGreaterThan(hapusRiwayat)
  })

  it('GET riwayat: penjaga baris yang sama, disaring ke akun & klien ini, kalimat dari lib', () => {
    expect(ROW_GET).toContain('await guard(params)')
    expect(ROW_GET).toContain("eq(auditEvents.entityType, 'master_coa')")
    expect(ROW_GET).toContain('eq(auditEvents.entityId, g.coaId)')
    expect(ROW_GET).toContain('eq(auditEvents.clientId, g.clientId)')
    expect(ROW_GET).toContain('ringkasPerubahanTipe(r.nilaiSebelum, r.nilaiSesudah)')
    expect(ROW_GET).not.toContain('db.insert(')
  })

  it('form akun menampilkan riwayat dari server, tanpa menafsirkan jsonb sendiri', () => {
    const FORM = read('components', 'settings', 'coa-row-editor.tsx')
    expect(FORM).toContain('/coa/rows/${editingId}')
    expect(FORM).toContain("r.perubahan.join(' · ')")
    expect(FORM).not.toContain('nilaiSebelum')
  })
})
