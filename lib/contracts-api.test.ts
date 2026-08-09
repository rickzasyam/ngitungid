import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas source route kontrak.
//
// Kenapa membaca file, bukan memanggil fungsinya: yang dijaga di sini adalah
// invarian yang tidak muncul di nilai kembalian mana pun — kolom apa yang IKUT
// di query, guard mana yang dipasang, dan URUTAN pemeriksaan akses. Ketiganya
// hanya bisa salah di sisi penulisan, dan ketiganya mahal kalau lolos:
// satu blob 25MB di query daftar, atau satu guard yang tertukar.
//
// Route handler tidak bisa di-import langsung untuk diuji (butuh runtime
// Next + sesi + DB), dan menambah export non-handler ke file route ditolak
// pemeriksa tipe Next.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LIST = read('app', 'api', 'contracts', 'route.ts')
const DETAIL = read('app', 'api', 'contracts', '[id]', 'route.ts')
const DOKUMEN = read('app', 'api', 'contracts', '[id]', 'dokumen', 'route.ts')

/**
 * Ambil badan satu handler HTTP dari source.
 *
 * Di module scope (bukan di dalam satu describe) karena dipakai DUA kelompok
 * test: matriks guard, dan pemeriksaan blob per-handler — sejak route detail
 * punya GET, "tidak menyentuh dokumen" harus bisa ditanyakan per handler, bukan
 * cuma untuk seluruh file.
 */
const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length ? Math.min(...next) : undefined)
}

// ══ BLOB TIDAK PERNAH IKUT DI DAFTAR ═════════════════════════════
describe('kolom dokumen tidak pernah masuk query daftar', () => {
  it('route daftar TIDAK menyebut contracts.dokumen sama sekali', () => {
    // Satu-satunya tempat byte dokumen boleh disentuh adalah route dokumen.
    expect(LIST).not.toContain('contracts.dokumen')
  })

  it('route detail (GET/PATCH/DELETE) TIDAK menyebutnya di daftar kolom', () => {
    // PATCH boleh MENULIS dokumen (lewat dokumenPatch), tapi tidak boleh
    // MEMBACANYA ke dalam response. GET memakai daftar kolom yang sama.
    const cols = DETAIL.slice(DETAIL.indexOf('const cols = {'), DETAIL.indexOf('}', DETAIL.indexOf('const cols = {')))
    expect(cols).not.toContain('dokumen')
  })

  it('GET /api/contracts/[id] TIDAK menyentuh byte dokumen sama sekali', () => {
    // Gerbang yang sebenarnya. `cols` yang bersih tidak menolong kalau handler
    // GET menambahkan select-nya sendiri — dan GET detail adalah handler baru
    // yang paling mungkin "sekalian" mengembalikan dokumennya demi form edit.
    // Form itu cukup tahu namaDokumen & ukurannya; byte-nya lewat /dokumen.
    const h = handler(DETAIL, 'GET')
    expect(h).not.toContain('contracts.dokumen')
    expect(h).not.toContain('dokumen:')
  })

  it('hanya route dokumen yang memilih contracts.dokumen', () => {
    expect(DOKUMEN).toContain('dokumen: contracts.dokumen')
  })

  it('tidak ada select(*) / select() tanpa kolom di ketiga route', () => {
    for (const [nama, src] of [['daftar', LIST], ['detail', DETAIL], ['dokumen', DOKUMEN]] as const) {
      expect(src, nama).not.toMatch(/\.select\(\s*\)/)
    }
  })

  it('daftar kolom memuat metadata dokumen, bukan byte-nya', () => {
    // namaDokumen & ukuranDokumen aman dan memang dibutuhkan UI.
    expect(LIST).toContain('namaDokumen: contracts.namaDokumen')
    expect(LIST).toContain('ukuranDokumen: contracts.ukuranDokumen')
  })
})

// ══ GUARD PER ENDPOINT ═══════════════════════════════════════════
describe('matriks guard endpoint kontrak', () => {
  it('GET /api/contracts → requireUser + canAccessClientData (klien boleh kontraknya sendiri)', () => {
    const h = handler(LIST, 'GET')
    expect(h).toContain('requireUser()')
    // Keduanya WAJIB berpasangan: requireUser sendirian meloloskan setiap klien
    // ke ?clientId= milik klien lain. Kalau baris scoping ini hilang, gerbangnya
    // bukan longgar — ia bocor antar-klien.
    expect(h).toContain('canAccessClientData(')
    expect(h).not.toContain('requireInternal()')
  })

  it('POST /api/contracts → requireCommercial (owner + finance, bukan akunting)', () => {
    expect(handler(LIST, 'POST')).toContain('requireCommercial()')
  })

  it('PATCH /api/contracts/[id] → requireCommercial', () => {
    expect(handler(DETAIL, 'PATCH')).toContain('requireCommercial()')
  })

  it('DELETE /api/contracts/[id] → requireCommercial', () => {
    expect(handler(DETAIL, 'DELETE')).toContain('requireCommercial()')
  })

  it('tulis kontrak TIDAK pernah memakai requireAkunting/requireInternal/requireUser', () => {
    // Kalau salah satunya muncul di POST/PATCH/DELETE, akunting mendapat kendali
    // atas kontrak — persis yang dipisahkan lewat canManageCommercial.
    for (const m of ['POST'] as const) {
      expect(handler(LIST, m)).not.toContain('requireAkunting')
      expect(handler(LIST, m)).not.toContain('requireInternal')
    }
    for (const m of ['PATCH', 'DELETE'] as const) {
      expect(handler(DETAIL, m)).not.toContain('requireAkunting')
      expect(handler(DETAIL, m)).not.toContain('requireInternal')
    }
    // Dan JANGAN pernah requireUser di sisi tulis — sejak GET dibuka untuk
    // klien, requireUser hidup di file yang sama dan jadi tetangga terdekat
    // yang salah untuk disalin ke handler tulis.
    expect(handler(LIST, 'POST')).not.toContain('requireUser')
    for (const m of ['PATCH', 'DELETE'] as const) {
      expect(handler(DETAIL, m)).not.toContain('requireUser')
    }
  })

  it('GET dokumen → requireUser + canAccessClientData (klien boleh dokumennya sendiri)', () => {
    expect(DOKUMEN).toContain('requireUser()')
    expect(DOKUMEN).toContain('canAccessClientData(')
  })

  it('GET /api/contracts/[id] → requireUser + canAccessClientData', () => {
    const h = handler(DETAIL, 'GET')
    expect(h).toContain('requireUser()')
    expect(h).toContain('canAccessClientData(')
    // requireCommercial di sini akan mengunci form edit dari klien yang justru
    // berhak membaca kontraknya sendiri; requireInternal akan melakukan hal yang
    // sama. Baca kontrak SATUAN mengikuti route daftar, bukan sisi tulis di
    // file yang sama.
    expect(h).not.toContain('requireCommercial()')
    expect(h).not.toContain('requireInternal()')
  })
})

// ══ URUTAN PEMERIKSAAN AKSES ═════════════════════════════════════
describe('scoping dokumen memakai clientId milik KONTRAK', () => {
  it('baris diambil DULU, canAccessClientData menyusul', () => {
    // Membalik urutan berarti memakai id yang datang dari request untuk
    // menentukan boleh-tidaknya request itu — mempercayai penyerang menyebutkan
    // kliennya sendiri. Pola ini disalin dari /api/reports/[id]/pdf.
    const iSelect = DOKUMEN.indexOf('.from(contracts)')
    const iCheck = DOKUMEN.indexOf('canAccessClientData(')
    expect(iSelect).toBeGreaterThan(-1)
    expect(iCheck).toBeGreaterThan(iSelect)
  })

  it('yang dipakai adalah row.clientId, bukan parameter request', () => {
    expect(DOKUMEN).toMatch(/canAccessClientData\([^)]*row\.clientId/)
  })

  it('GET detail ikut aturan yang sama: select DULU, cek klien menyusul', () => {
    // Route ini TIDAK menerima clientId dari pemanggil sama sekali, jadi
    // satu-satunya sumber yang sah adalah baris kontraknya sendiri. Kalau suatu
    // saat ada yang menambahkan ?clientId= "biar hemat satu query", urutan ini
    // yang menahannya.
    const h = handler(DETAIL, 'GET')
    const iSelect = h.indexOf('.from(contracts)')
    const iCheck = h.indexOf('canAccessClientData(')
    expect(iSelect).toBeGreaterThan(-1)
    expect(iCheck).toBeGreaterThan(iSelect)
    expect(h).toMatch(/canAccessClientData\([^)]*row\.clientId/)
  })

  it('runtime nodejs (bytea + neon-http tidak jalan di edge)', () => {
    expect(DOKUMEN).toContain("export const runtime = 'nodejs'")
    expect(LIST).toContain("export const runtime = 'nodejs'")
    expect(DETAIL).toContain("export const runtime = 'nodejs'")
  })

  it('disposition inline — dokumen dibuka di iframe, bukan diunduh paksa', () => {
    expect(DOKUMEN).toContain('inline; filename=')
    expect(DOKUMEN).toContain("'Content-Type': 'application/pdf'")
  })
})

// ══ TIDAK ADA DELETE UNTUK LAYANAN ═══════════════════════════════
describe('layanan tetap tidak bisa dihapus', () => {
  it('tidak ada handler DELETE di route layanan', () => {
    const l1 = read('app', 'api', 'layanan', 'route.ts')
    const l2 = read('app', 'api', 'layanan', '[id]', 'route.ts')
    expect(l1).not.toContain('export async function DELETE')
    expect(l2).not.toContain('export async function DELETE')
  })

  it('FK contract_layanan.layanan_id memakai RESTRICT, bukan cascade', () => {
    // Pertahanan terakhir di lapisan database kalau suatu hari ada yang
    // menambahkan endpoint DELETE untuk layanan.
    const schema = read('lib', 'db', 'schema.ts')
    const blok = schema.slice(schema.indexOf("'contract_layanan'"), schema.indexOf("// ── client_assignments"))
    expect(blok).toContain("references(() => layanan.id, { onDelete: 'restrict' })")
    expect(blok).toContain("references(() => contracts.id, { onDelete: 'cascade' })")
  })
})
