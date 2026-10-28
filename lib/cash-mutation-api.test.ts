import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { riwayatBertahanSetelahDihapus } from './audit'

// Test STRUKTURAL atas source route mutasi kas — pola sama dengan
// lib/purchase-api.test.ts dan lib/journals-api.test.ts.
//
// Yang dijaga di sini tidak muncul di nilai kembalian mana pun: guard mana yang
// dipasang, urutan pemeriksaan, apakah jurnal benar-benar ikut di `db.batch`
// yang sama, dan apakah TIGA BATAS lintas-baris (§8.21) memang ditegakkan di
// server. Ketiganya tidak bisa jadi CHECK di Postgres, jadi satu-satunya yang
// menjaganya adalah kode di route — dan satu-satunya yang menjaga kode itu
// tetap ada adalah berkas ini.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const LIST = read('app', 'api', 'cash-mutations', 'route.ts')
const DETAIL = read('app', 'api', 'cash-mutations', '[id]', 'route.ts')
const ALLOC = read('app', 'api', 'cash-mutations', '[id]', 'allocations', 'route.ts')
const ALLOC_DEL = read('app', 'api', 'cash-mutations', '[id]', 'allocations', '[allocId]', 'route.ts')
const BATCH = read('app', 'api', 'cash-mutations', 'batch', 'route.ts')
const QUERIES = read('lib', 'api', 'cash-mutation-queries.ts')
const PERENCANA = read('lib', 'api', 'cash-mutation-batch.ts')
const JURNAL_MUTASI = read('lib', 'api', 'cash-mutation-journal.ts')
const MURNI = read('lib', 'cash-mutation.ts')
const LIST_JURNAL = read('app', 'api', 'journals', 'route.ts')

const handler = (src: string, method: string): string => {
  const start = src.indexOf(`export async function ${method}(`)
  expect(start, `${method} ada`).toBeGreaterThan(-1)
  const next = ['GET', 'POST', 'PATCH', 'DELETE']
    .map(m => src.indexOf(`export async function ${m}(`, start + 1))
    .filter(i => i > -1)
  return src.slice(start, next.length > 0 ? Math.min(...next) : undefined)
}

describe('gerbang — baca internal, tulis akunting (D45)', () => {
  it('GET daftar & detail memakai requireInternal', () => {
    expect(handler(LIST, 'GET')).toContain('requireInternal()')
    expect(handler(DETAIL, 'GET')).toContain('requireInternal()')
  })

  it('SETIAP jalur tulis memakai requireAkunting', () => {
    const tulis: [string, string, string][] = [
      ['POST mutasi', LIST, 'POST'],
      ['PATCH mutasi', DETAIL, 'PATCH'],
      ['DELETE mutasi', DETAIL, 'DELETE'],
      ['POST alokasi', ALLOC, 'POST'],
      ['DELETE alokasi', ALLOC_DEL, 'DELETE'],
      ['POST batch', BATCH, 'POST'],
    ]
    for (const [nama, src, method] of tulis) {
      const body = handler(src, method)
      expect(body.includes('requireAkunting()'), nama).toBe(true)
      expect(body.includes('requireInternal()'), `${nama} tidak boleh cukup internal`).toBe(false)
    }
  })

  it('SETIAP route memeriksa kepemilikan klien', () => {
    for (const [nama, src] of [
      ['daftar', LIST],
      ['detail', DETAIL],
      ['alokasi', ALLOC],
      ['hapus alokasi', ALLOC_DEL],
      ['batch', BATCH],
    ] as const) {
      expect(src.includes('canAccessClientData('), nama).toBe(true)
    }
  })

  it('kepemilikan diperiksa SEBELUM menulis, di setiap jalur tulis', () => {
    for (const [nama, src, method] of [
      ['POST mutasi', LIST, 'POST'],
      ['POST alokasi', ALLOC, 'POST'],
      ['POST batch', BATCH, 'POST'],
    ] as const) {
      const body = handler(src, method)
      const cek = body.indexOf('canAccessClientData(')
      const tulis = body.indexOf('await db.batch(')
      expect(cek, nama).toBeGreaterThan(-1)
      expect(tulis, nama).toBeGreaterThan(-1)
      expect(cek, nama).toBeLessThan(tulis)
    }
  })
})

describe('akun kas datang dari penanda is_kas, bukan daftar hardcoded', () => {
  it('setiap jalur yang menerima akunKasId memanggil loadCashAccount', () => {
    for (const [nama, src] of [
      ['POST mutasi', LIST],
      ['PATCH mutasi', DETAIL],
      ['perencana batch', PERENCANA],
    ] as const) {
      expect(src.includes('loadCashAccount('), nama).toBe(true)
    }
  })

  it('loadCashAccount memakai resolveIsKas — eksplisit ?? turunan (E2)', () => {
    expect(QUERIES).toContain('resolveIsKas(row)')
    // Daftar akun kas di layar disaring dengan aturan yang sama (?kas=1), jadi
    // apa pun yang lolos ke route tanpa penanda itu datang dari luar layar.
    expect(QUERIES).not.toContain("kode === '1-1")
  })

  it('akun lawan BEBAS — tidak dibatasi tipe, hanya wajib milik klien', () => {
    expect(QUERIES).toContain('assertAccountBelongsToClient')
    expect(LIST).toContain('assertAccountBelongsToClient(check.value.akunLawanId')
  })
})

describe('tiga batas lintas-baris ditegakkan di route (P15, §8.21)', () => {
  const body = handler(ALLOC, 'POST')

  it('batas 1 — Σ alokasi ≤ nominal mutasi', () => {
    expect(body).toContain('allocationRemaining(mutation, alokasiLama)')
    expect(body).toContain('nominalMinor > sisaMutasiMinor')
  })

  it('batas 2 — Σ alokasi ≤ sisa invoice', () => {
    expect(body).toContain('invoice.sisaMinor')
    expect(body).toContain('nominalMinor > invoice.sisaMinor')
  })

  it('batas 3 — terminUrutan ≤ jumlah_termin invoice (D40)', () => {
    expect(body).toContain('terminUrutan > invoice.jumlahTermin')
  })

  it('ketiganya diperiksa SEBELUM db.batch', () => {
    const batch = body.indexOf('await db.batch(')
    for (const jejak of ['nominalMinor > sisaMutasiMinor', 'nominalMinor > invoice.sisaMinor', 'terminUrutan > invoice.jumlahTermin']) {
      expect(body.indexOf(jejak), jejak).toBeLessThan(batch)
    }
  })

  it('sisa invoice DITURUNKAN dari alokasi, bukan kolom tersimpan (D37)', () => {
    expect(QUERIES).toContain('sisaMinor: totalMinor - teralokasiMinor')
    expect(QUERIES).not.toContain('purchaseInvoices.sisa')
  })

  it('terminUrutan KOSONG = FIFO — bukan dipaksa terisi (D40)', () => {
    expect(body).toContain('let terminUrutan: number | null = null')
  })
})

// ══ S7 (D48, D58): SATU perencana simpan, SATU perencana jurnal ════════════
describe('jurnal mutasi — satu perencana, satu batch (S7)', () => {
  it('setiap jalur yang mengubah mutasi lewat perencana — tidak ada pembangun jurnal kedua', () => {
    for (const [nama, src] of [
      ['POST mutasi', LIST],
      ['PATCH/DELETE mutasi', DETAIL],
      ['batch', BATCH],
    ] as const) {
      expect(src.includes('rencanakanSimpanMutasi('), nama).toBe(true)
    }
    for (const [nama, src] of [
      ['POST alokasi', ALLOC],
      ['DELETE alokasi', ALLOC_DEL],
    ] as const) {
      expect(src.includes('rencanakanJurnalMutasi('), nama).toBe(true)
    }
    expect(PERENCANA).toContain('await rencanakanJurnalMutasi(')
    // Pembangun lama sudah DIPINDAH, bukan diduplikasi.
    for (const src of [LIST, DETAIL, ALLOC, ALLOC_DEL, QUERIES]) expect(src).not.toContain('syncMutationJournal(')
  })

  it('statement jurnal MASUK ke batch yang sama, bukan ditulis terpisah', () => {
    for (const [nama, src, method] of [
      ['POST alokasi', ALLOC, 'POST'],
      ['DELETE alokasi', ALLOC_DEL, 'DELETE'],
    ] as const) {
      const b = handler(src, method)
      expect(b.includes('...jurnal.statements'), nama).toBe(true)
      expect(b.includes('await db.batch('), nama).toBe(true)
    }
    expect(PERENCANA).toContain('statements.push(...jurnal.statements)')
  })

  it('kedua perencana TIDAK menulis sendiri — mereka menyusun statement (P10)', () => {
    for (const src of [PERENCANA, JURNAL_MUTASI]) {
      expect(src).not.toContain('await db.batch(')
      expect(src).not.toContain('await db.insert(')
      expect(src).not.toContain('await db.update(')
      expect(src).not.toContain('await db.delete(')
    }
  })

  it('jurnal dari alokasi memakai akun hutang MILIK INVOICE (snapshot D30)', () => {
    expect(PERENCANA).toContain('akunHutangId: purchaseInvoices.akunHutangId')
    expect(QUERIES).toContain('akunHutangId: purchaseInvoices.akunHutangId')
    for (const src of [PERENCANA, QUERIES, JURNAL_MUTASI]) expect(src).not.toContain('masterSupplier.akunHutangDefaultId')
  })

  it('jurnal lahir DRAF, bersumber mutasi_kas, no_bukti NULL', () => {
    expect(JURNAL_MUTASI).toContain("sumber: 'mutasi_kas'")
    expect(JURNAL_MUTASI).toContain('noBukti: null')
    expect(JURNAL_MUTASI).not.toContain("status: 'posted'")
  })

  it('ringkasan per (akun kas, akun lawan, tanggal) dibangun ulang untuk kunci LAMA dan BARU', () => {
    expect(JURNAL_MUTASI).toContain('buildDailySummaryJournalLines(')
    expect(JURNAL_MUTASI).toContain('for (const a of opts.akhir)')
    expect(JURNAL_MUTASI).toContain('for (const a of opts.awal)')
    expect(JURNAL_MUTASI).toContain('kunci.add(kunciRingkasan(')
    // Anggota tersimpan dibaca dalam SATU kueri massal, bukan per kunci.
    expect(JURNAL_MUTASI).toContain('inArray(cashMutations.tanggal,')
  })

  it('anggota jurnal terposting yang hidup TIDAK disentuh; anggota baru → draf kedua', () => {
    expect(JURNAL_MUTASI).toContain("info.get(j)?.status === 'draft'")
    expect(JURNAL_MUTASI).toContain('!(a.journalId && hidup(info.get(a.journalId)))')
  })

  it('jaring terakhir: perubahan atas anggota jurnal terposting yang hidup = 409', () => {
    const jaring = JURNAL_MUTASI.indexOf('if (a.journalId && hidup(info.get(a.journalId)))')
    expect(jaring).toBeGreaterThan(-1)
    expect(JURNAL_MUTASI.slice(jaring, jaring + 300)).toContain('return tolak(')
  })

  it('"sudah dibalik" dihitung dari rantai pembalik TERPOSTING, dalam kueri massal (tanpa N+1)', () => {
    expect(JURNAL_MUTASI).toContain("eq(journalEntries.status, 'posted')")
    expect(JURNAL_MUTASI).toContain('inArray(journalEntries.reversalOfId,')
    expect(JURNAL_MUTASI).toContain('dibalik = n % 2 === 1')
  })

  it('draf yang tidak dipakai lagi dihapus BESERTA riwayatnya; yang terposting tidak pernah', () => {
    expect(JURNAL_MUTASI).toContain("purgeAuditEventsMany('journal', hapus)")
    expect(JURNAL_MUTASI).toContain("info.get(j)?.status !== 'draft'")
  })

  it('D42 tidak membuka mutasi terposting — kunciMutasi tidak membaca setelannya', () => {
    const k = MURNI.slice(MURNI.indexOf('export function kunciMutasi'))
    expect(k.slice(0, k.indexOf('\n}\n'))).not.toContain('bolehEditPosting')
  })
})

describe('perencana simpan (S7) — urutan pemeriksaan', () => {
  const urut = (...jejak: string[]) =>
    jejak.map(j => {
      const i = PERENCANA.indexOf(j)
      expect(i, j).toBeGreaterThan(-1)
      return i
    })

  it('validasi → akun → baris lama (kueri massal) → konkurensi → kunci → duplikat → jurnal → statement', () => {
    const i = urut(
      'validateCashMutation({ ...b, akunKasId: p.akunKasId })',
      'inArray(masterCoa.id, akunLawan)',
      'inArray(cashMutations.id, idUbahHapus)',
      'const konflik =',
      'kunciMutasi({',
      'fingerprintMutasi(b.v)',
      'await rencanakanJurnalMutasi(',
      'db.insert(cashMutations)'
    )
    for (let k = 1; k < i.length; k++) expect(i[k]).toBeGreaterThan(i[k - 1])
  })

  it('konkurensi: updatedAt beda → 409 untuk SELURUH batch, dengan daftar barisnya', () => {
    expect(PERENCANA).toContain('return tolak(409,')
    expect(PERENCANA).toContain('konflik,')
  })

  it('kunci periode memakai isDateLocked untuk tanggal BARU, kunciMutasi untuk tanggal lama', () => {
    expect(PERENCANA).toContain('isDateLocked(tanggal, locks)')
    expect(PERENCANA).toContain('for (const b of baru) tanggalTerkunci(b.kunci, b.v.tanggal)')
    expect(PERENCANA).toContain('tanggalTerkunci(u.id, u.v.tanggal)')
  })

  it('satu galat → nol statement: penolakan dikembalikan SEBELUM statement pertama disusun', () => {
    const tolak = PERENCANA.indexOf('if (galat.length > 0) {')
    const pertama = PERENCANA.indexOf('const statements: BatchItem')
    expect(tolak).toBeGreaterThan(-1)
    expect(tolak).toBeLessThan(pertama)
  })

  it('INSERT dipecah ≤ 4.000 baris per statement (batas 65.535 parameter) — tetap satu db.batch', () => {
    expect(PERENCANA).toContain('const BARIS_PER_INSERT = 4_000')
    expect(BATCH.split('await db.batch(').length - 1).toBe(1)
  })

  it('dryRun adalah jalur yang SAMA: kembali setelah statement disusun, tanpa db.batch', () => {
    expect(PERENCANA).toContain("if (p.dryRun) return { jenis: 'dryRun'")
    expect(BATCH).toContain('dryRun: body.dryRun === true')
  })

  it('duplikat = PERINGATAN (D38), dicari per (klien, akun kas) — tidak pernah menolak', () => {
    expect(PERENCANA).toContain('eq(cashMutations.akunKasId, p.akunKasId), inArray(cashMutations.fingerprint, semuaFp)')
    const dup = PERENCANA.slice(PERENCANA.indexOf('// ── 6. Dugaan duplikat'), PERENCANA.indexOf('// ── 7.'))
    expect(dup).not.toContain('tolak(')
  })

  it('riwayat: ketik/tempel = created per baris; berkas = cash_mutation_imports TANPA event per baris; saldo dikosongkan = event (D50)', () => {
    expect(PERENCANA).toContain("if (b.asal !== 'berkas' && b.asal !== 'pdf') ev.push({ ...base, entityId: id, event: 'created' })")
    expect(PERENCANA).toContain('db.insert(cashMutationImports)')
    expect(PERENCANA).toContain("event: 'saldo_dikosongkan', nilaiSebelum: { saldo: b.saldoDikosongkan }")
    expect(PERENCANA).toContain("event: 'saldo_dikosongkan', nilaiSebelum: { saldo: r.saldo }")
  })

  it('ubah menulis riwayat bernilai sebelum & sesudah; hapus memusnahkan riwayat mutasinya', () => {
    expect(PERENCANA).toContain("event: 'updated',")
    expect(PERENCANA).toContain('nilaiSebelum: { tanggal: r.tanggal')
    expect(PERENCANA).toContain("purgeAuditEventsMany('cash_mutation', idHapus)")
    // Riwayat mutasi IKUT MATI: mutasi kas bukan pengecualian riwayat abadi.
    // Pengecualian di lib/audit.ts (`RIWAYAT_ABADI`) kini `purchase_invoice` dan
    // `supplier` (#3) — keduanya tidak punya salinan di luar aplikasi; bukti
    // mutasi kas ada di rekening koran. Assertion versi Stream B (#3): predikat,
    // bukan teks persis daftar itu.
    expect(riwayatBertahanSetelahDihapus('cash_mutation')).toBe(false)
  })

  it('batas D52 ditolak dengan pesan — tidak pernah dipecah diam-diam', () => {
    expect(PERENCANA).toContain('return tolak(413,')
  })
})

describe('tidak ada penulis cash_mutations di luar perencana & alokasi', () => {
  it('route tidak meng-insert/update cash_mutations sendiri', () => {
    for (const [nama, src] of [
      ['POST mutasi', LIST],
      ['PATCH/DELETE mutasi', DETAIL],
      ['batch', BATCH],
      ['POST alokasi', ALLOC],
      ['DELETE alokasi', ALLOC_DEL],
    ] as const) {
      expect(src.includes('.insert(cashMutations)'), nama).toBe(false)
      expect(src.includes('.update(cashMutations)'), nama).toBe(false)
      expect(src.includes('${cashMutations}'), nama).toBe(false)
    }
  })

  it('route impor CSV lama sudah tidak ada (D47 — berkas masuk lewat grid)', () => {
    expect(() => read('app', 'api', 'cash-mutations', 'import', 'route.ts')).toThrow()
  })
})

describe('route batch', () => {
  it('requireAkunting, canAccessClientData, periode wajib (satu akun-bulan, D52)', () => {
    expect(BATCH).toContain('await requireAkunting()')
    expect(BATCH).toContain('canAccessClientData(')
    expect(BATCH).toContain('Periode wajib dikirim')
  })
})

describe('bentuk respons daftar', () => {
  it('sisa & status DITURUNKAN di query, tidak dibaca dari kolom', () => {
    expect(QUERIES).toContain('mutationStatus(r, alokasiSemu)')
    expect(QUERIES).toContain('allocationRemaining(r, alokasiSemu)')
    expect(QUERIES).not.toContain('cashMutations.status')
    expect(QUERIES).not.toContain('cashMutations.sisa')
  })

  it('Σ alokasi dijumlahkan di Postgres sebagai text, bukan float JS (P1)', () => {
    expect(QUERIES).toContain('::numeric(18,2)::text')
  })
})


// ══ UI /mutasi-kas (N6) ══════════════════════════════════════════════════
// Struktural, bukan render: yang dijaga adalah janji-janji yang mudah hilang
// dalam satu polish pass — angka yang tidak dihitung ulang di browser, status
// "belum dijurnal" yang menonjol, dan tautan D32 yang tidak di-hardcode.
describe('halaman /mutasi-kas', () => {
  const PAGE = read('app', 'mutasi-kas', 'page.tsx')
  const PANEL = read('components', 'mutasi-kas', 'allocation-panel.tsx')
  const WIZARD = read('components', 'mutasi-kas', 'import-wizard.tsx')
  const JURNAL = read('app', 'jurnal', 'page.tsx')

  it('daftar akun kas datang dari ?kas=1, bukan disaring di browser', () => {
    // Penanda kas adalah aturan server (eksplisit ?? turunan). Menyalinnya ke
    // browser berarti dua definisi "akun kas" yang bisa menyimpang.
    expect(PAGE).toContain('/coa?kas=1')
  })

  it('sisa & status DIPAKAI apa adanya dari server, tidak dihitung ulang', () => {
    expect(PAGE).toContain('r.sisa')
    expect(PAGE).toContain('r.status')
    // Tidak ada penjumlahan alokasi di halaman ini.
    expect(PAGE).not.toContain('allocationRemaining(')
    expect(PAGE).not.toContain('mutationStatus(')
  })

  it('"belum dijurnal" memakai warna KRITIS, bukan abu-abu netral', () => {
    // Permintaan eksplisit Ricko: baris yang belum dijurnal tidak boleh
    // terlihat sama dengan yang sudah selesai.
    const i = PAGE.indexOf("'belum dijurnal'")
    expect(i).toBeGreaterThan(-1)
    expect(PAGE.slice(i, i + 200)).toContain('--color-accent-critical')
  })

  it('jumlah baris "belum dijurnal" ikut tampil di header', () => {
    expect(PAGE).toContain("r.status === 'belum dijurnal'")
  })

  it('panel alokasi menampilkan sisa TANPA disembunyikan di balik penutup', () => {
    expect(PANEL).toContain('Belum dialokasikan')
    // Sisa negatif ditampilkan apa adanya — tidak dikepit Math.max.
    expect(PANEL).not.toContain('Math.max(0')
    expect(PANEL).toContain('sisaAngka < 0')
  })

  it('pemilih cicilan bawaannya Otomatis (FIFO), dan penimpaan diberi tanda', () => {
    expect(PANEL).toContain('Otomatis (FIFO)')
    expect(PANEL).toContain('terminUrutan === null')
    expect(PANEL).toContain('Dipaku manual')
  })

  it('wizard impor: pratinjau dulu, commit terkunci sampai ada pratinjau', () => {
    expect(WIZARD).toContain("fd.append('dryRun', '1')")
    expect(WIZARD).toContain('disabled={!file || busy || !pratinjau}')
  })

  it('pratinjau memperingatkan agar arah beberapa baris pertama diperiksa', () => {
    // Arah yang terbalik tidak pernah menimbulkan galat — satu-satunya saat ia
    // murah diperbaiki adalah di layar ini, sebelum barisnya tersimpan.
    expect(WIZARD).toContain('Periksa arah beberapa baris pertama')
    expect(WIZARD).toContain('tidak menimbulkan galat')
  })

  it('wizard impor menandai duplikat DAN mengatakan ia tetap tersimpan (D38)', () => {
    expect(WIZARD).toContain('duplikatDiDatabase')
    expect(WIZARD).toContain('tetap akan tersimpan')
  })

  it('tautan "Koreksi di …" memakai satu sumber, bukan path yang di-hardcode', () => {
    expect(JURNAL).toContain('sumberDokumenHref(r.sumber, r.sumberDokumenId)')
    // Bentuk lamanya akan menunjuk halaman pembelian dengan id mutasi.
    expect(JURNAL).not.toContain('/pembelian?invoice=${')
  })

  it('dokumen asal dicari di KEDUA tabel, bukan hanya invoice', () => {
    expect(LIST_JURNAL).toContain('from purchase_invoices pi')
    expect(LIST_JURNAL).toContain('from cash_mutations cm')
  })
})

// ══ PELABELAN & FORMAT (temuan uji klik CP-18) ═══════════════════════════
// Tiga hal yang tidak salah secara angka, tapi menyesatkan yang membacanya.
// Dikunci test supaya tidak balik lagi dalam satu polish pass.
describe('pelabelan nominal & kolom', () => {
  const PAGE = read('app', 'mutasi-kas', 'page.tsx')
  const PANEL = read('components', 'mutasi-kas', 'allocation-panel.tsx')
  const WIZARD = read('components', 'mutasi-kas', 'import-wizard.tsx')

  it('kolom alokasi di tabel memakai judul yang SAMA dengan panelnya', () => {
    // "Sisa" mengundang dibaca sebagai "belum beres" oleh mutasi yang sudah
    // selesai lewat akun lawan.
    expect(PAGE).toContain('>Belum dialokasikan</th>')
    expect(PAGE).not.toContain("}}>Sisa</th>")
  })

  it('mutasi berakun-lawan tanpa alokasi menampilkan tanda hubung, bukan nominal', () => {
    expect(PAGE).toContain('function alokasiTidakDipakai(')
    expect(PAGE).toContain('r.akunLawanId !== null && r.alokasiCount === 0')
    expect(PAGE).toContain('alokasiTidakDipakai(r) || Number(r.sisa) === 0')
  })

  it('mutasi yang PUNYA alokasi tetap menampilkan angkanya walau berakun lawan', () => {
    // Begitu ada satu alokasi, alokasinya yang menentukan jurnalnya — jadi
    // "belum dialokasikan" kembali punya arti. Syaratnya karena itu
    // `alokasiCount === 0`, bukan sekadar `akunLawanId !== null`.
    const mulai = PAGE.indexOf('function alokasiTidakDipakai(')
    const blok = PAGE.slice(mulai, mulai + 400)
    expect(blok).toContain('alokasiCount === 0')
  })

  it('dropdown invoice di panel alokasi diformat rupiah PERSIS (CP-8)', () => {
    expect(PANEL).toContain('sisa ${rupiahPersis(i.sisa)}')
    expect(PANEL).not.toContain('sisa ${i.sisa}')
  })

  it('pratinjau impor diformat rupiah PERSIS — dicocokkan dengan rekening koran (CP-8)', () => {
    // 12.345,67 lewat rupiah() tampil "Rp 12.346": tidak cocok dengan baris
    // mana pun di rekening koran yang sedang diperiksa.
    expect(WIZARD).toContain("r.debit === '0.00' ? '—' : rupiahPersis(r.debit)")
    expect(WIZARD).toContain("r.kredit === '0.00' ? '—' : rupiahPersis(r.kredit)")
    expect(WIZARD).toContain('const { rupiahPersis } = useRupiah()')
  })
})

// ══ SEN TIDAK DIBULATKAN DI LAYAR YANG DICOCOKKAN KE DOKUMEN (keputusan CP-8) ══
// rupiah() membulatkan ke rupiah utuh — benar untuk Dashboard & Analytics,
// salah untuk layar yang dibaca berdampingan dengan rekening koran atau invoice
// kertas. Tidak satu pun pemanggilan rupiah(...) boleh tersisa di sini.
describe('rupiahPersis di layar pencocokan dokumen', () => {
  const PANEL = read('components', 'mutasi-kas', 'allocation-panel.tsx')
  const WIZARD = read('components', 'mutasi-kas', 'import-wizard.tsx')
  const INVOICE_FORM = read('components', 'pembelian', 'purchase-form-modal.tsx')
  const PAGE = read('app', 'mutasi-kas', 'page.tsx')

  it.each([
    ['panel alokasi', PANEL],
    ['pratinjau impor', WIZARD],
    ['form invoice', INVOICE_FORM],
    ['tabel utama /mutasi-kas', PAGE],
  ])('%s: tidak ada rupiah(...) yang membulatkan', (_nama, src) => {
    expect(src).not.toMatch(/[^A-Za-z]rupiah\(/)
    expect(src).toContain('rupiahPersis')
  })

  it('tabel utama /mutasi-kas: Masuk, Keluar, dan Belum dialokasikan persis — dicocokkan dengan rekening koran', () => {
    expect(PAGE).toContain("{Number(r.debit) > 0 ? rupiahPersis(r.debit) : '—'}")
    expect(PAGE).toContain("{Number(r.kredit) > 0 ? rupiahPersis(r.kredit) : '—'}")
    expect(PAGE).toContain(': rupiahPersis(r.sisa)}')
  })

  it('panel alokasi: sisa mutasi dan nominal alokasi juga persis', () => {
    expect(PANEL).toContain('{rupiahPersis(sisa)}')
    expect(PANEL).toContain('{rupiahPersis(a.nominal)}')
  })

  it('form invoice: total, termin, dan pratinjau jurnal lewat sen → string, tanpa pembagian float', () => {
    expect(INVOICE_FORM).toContain('const rpSen = (minor: number) => rupiahPersis(fromMinorUnits(minor))')
    expect(INVOICE_FORM).toContain('<Angka label="Subtotal" nilai={rpSen(totals.subtotalMinor)} />')
    expect(INVOICE_FORM).toContain('<Angka label="PPN" nilai={rpSen(totals.ppnMinor)} />')
    expect(INVOICE_FORM).toContain('<Angka label="Total" nilai={rpSen(totals.totalMinor)} tebal />')
    // Termin menaruh sisa sen di cicilan terakhir — justru yang harus terlihat.
    expect(INVOICE_FORM).toContain('{rpSen(c.nominalMinor)}')
    expect(INVOICE_FORM).not.toContain('Minor / 100')
  })
})
