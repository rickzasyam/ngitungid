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
