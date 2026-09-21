import { describe, it, expect } from 'vitest'
import { akunPpnMasukan, bolehEditPosting, diubahSetelahPosting } from './accounting-settings'

// ══ PENJAGA BERDIRI: TIGA KEADAAN, DAN DUA DI ANTARANYA WAJIB SAMA ═══════
// Permintaan eksplisit Ricko 2026-09-20. `client_accounting_settings` diisi
// lazily, jadi "baris tidak ada" adalah jawaban untuk MAYORITAS klien — bukan
// kasus pinggiran. Bentuk `?? true` akan membalik keputusannya untuk hampir
// semua klien sekaligus, dan tidak ada yang menyadarinya sampai ada jurnal
// terposting yang berubah.
describe('bolehEditPosting — tiga keadaan', () => {
  it('baris TIDAK ADA → false', () => {
    expect(bolehEditPosting(null)).toBe(false)
    expect(bolehEditPosting(undefined)).toBe(false)
  })

  it('baris ada bernilai false → false', () => {
    expect(bolehEditPosting({ postingBisaDiedit: false })).toBe(false)
  })

  it('baris ada bernilai true → true', () => {
    expect(bolehEditPosting({ postingBisaDiedit: true })).toBe(true)
  })

  it('"baris tidak ada" dan "false" menghasilkan jawaban yang SAMA PERSIS', () => {
    // Kalau keduanya pernah berbeda, klien yang belum pernah disetel akan
    // berperilaku beda dari yang pernah disetel lalu dikembalikan.
    expect(bolehEditPosting(null)).toBe(bolehEditPosting({ postingBisaDiedit: false }))
    expect(bolehEditPosting(undefined)).toBe(bolehEditPosting({ postingBisaDiedit: false }))
  })

  it('nilai yang bukan boolean true tidak pernah membukanya', () => {
    for (const aneh of [null, undefined]) {
      expect(bolehEditPosting({ postingBisaDiedit: aneh }), String(aneh)).toBe(false)
    }
  })
})

describe('akunPpnMasukan', () => {
  it('null saat belum disetel — bukan nilai bawaan yang boleh dipakai', () => {
    expect(akunPpnMasukan(null)).toBeNull()
    expect(akunPpnMasukan({ akunPpnMasukanId: null })).toBeNull()
  })

  it('mengembalikan id yang tersimpan', () => {
    expect(akunPpnMasukan({ akunPpnMasukanId: 'abc' })).toBe('abc')
  })
})

// ══ MITIGASI (c) D42: LENCANA "DIUBAH SETELAH POSTING" ═══════════════════
// Diturunkan dari riwayat, tidak disimpan (P3).
describe('diubahSetelahPosting', () => {
  const ev = (event: string, at: string) => ({ event, at })

  it('updated SESUDAH posted → true', () => {
    expect(
      diubahSetelahPosting([
        ev('created', '2026-09-01T10:00:00Z'),
        ev('posted', '2026-09-02T10:00:00Z'),
        ev('updated', '2026-09-03T10:00:00Z'),
      ])
    ).toBe(true)
  })

  it('updated SEBELUM posted → false (itu penyuntingan draf yang wajar)', () => {
    expect(
      diubahSetelahPosting([
        ev('created', '2026-09-01T10:00:00Z'),
        ev('updated', '2026-09-01T11:00:00Z'),
        ev('posted', '2026-09-02T10:00:00Z'),
      ])
    ).toBe(false)
  })

  it('belum pernah diposting → false, apa pun jumlah updated-nya', () => {
    expect(
      diubahSetelahPosting([ev('created', '2026-09-01T10:00:00Z'), ev('updated', '2026-09-05T10:00:00Z')])
    ).toBe(false)
  })

  it('urutan masukan tidak mempengaruhi jawabannya', () => {
    const acak = [
      ev('updated', '2026-09-03T10:00:00Z'),
      ev('created', '2026-09-01T10:00:00Z'),
      ev('posted', '2026-09-02T10:00:00Z'),
    ]
    expect(diubahSetelahPosting(acak)).toBe(true)
    expect(diubahSetelahPosting([...acak].reverse())).toBe(true)
  })

  it('memakai posted TERAKHIR bila ada lebih dari satu', () => {
    // Bisa terjadi lewat balapan posting yang menyisakan satu event berlebih
    // (lihat catatan di route posting). Yang berlaku adalah yang terakhir.
    expect(
      diubahSetelahPosting([
        ev('posted', '2026-09-02T10:00:00Z'),
        ev('updated', '2026-09-03T10:00:00Z'),
        ev('posted', '2026-09-04T10:00:00Z'),
      ])
    ).toBe(false)
  })

  it('kosong / null / undefined → false, tidak melempar', () => {
    expect(diubahSetelahPosting([])).toBe(false)
    expect(diubahSetelahPosting(null)).toBe(false)
    expect(diubahSetelahPosting(undefined)).toBe(false)
  })

  it('menerima Date maupun string ISO', () => {
    expect(
      diubahSetelahPosting([
        { event: 'posted', at: new Date('2026-09-02T10:00:00Z') },
        { event: 'updated', at: new Date('2026-09-03T10:00:00Z') },
      ])
    ).toBe(true)
  })

  it('waktu yang tidak bisa dibaca dilewati, bukan bikin melempar', () => {
    expect(
      diubahSetelahPosting([
        ev('posted', 'bukan-tanggal'),
        ev('updated', '2026-09-03T10:00:00Z'),
      ])
    ).toBe(false)
  })
})

// ══ STRUKTURAL (M8) ══════════════════════════════════════════════════════
// Yang dijaga di bawah tidak muncul di nilai kembalian mana pun: guard mana
// yang dipasang di route setelan, dan apakah bentuk `=== true` benar-benar
// dipakai di SETIAP tempat yang membaca sakelar D42. Satu `?? true` yang lolos
// membalik keputusan Ricko untuk hampir semua klien sekaligus.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const bacaSumber = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

/** Sumber tanpa komentar — lib/accounting-settings.ts sengaja MENGUTIP bentuk
 *  yang salah (`?? true`) sebagai peringatan, dan kutipan itu tidak boleh
 *  membuat pemindaian di bawah merah. Yang dicari adalah KODE-nya. */
const tanpaKomentar = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const SETTINGS_ROUTE = bacaSumber('app', 'api', 'clients', '[id]', 'accounting-settings', 'route.ts')
const JURNAL_DETAIL = bacaSumber('app', 'api', 'journals', '[id]', 'route.ts')
const SETTINGS_PAGE = bacaSumber('app', 'settings', 'page.tsx')
const PREDIKAT = bacaSumber('lib', 'accounting-settings.ts')

describe('route setelan pembukuan — baca internal, tulis akunting', () => {
  const potong = (m: string) => {
    const mulai = SETTINGS_ROUTE.indexOf(`export async function ${m}(`)
    expect(mulai, `${m} ada`).toBeGreaterThan(-1)
    const berikut = ['GET', 'POST', 'PATCH', 'DELETE']
      .map(x => SETTINGS_ROUTE.indexOf(`export async function ${x}(`, mulai + 1))
      .filter(i => i > -1)
    return SETTINGS_ROUTE.slice(mulai, berikut.length > 0 ? Math.min(...berikut) : undefined)
  }

  it('GET memakai requireInternal — membaca setelan tidak mengubah apa pun', () => {
    expect(potong('GET')).toContain('requireInternal()')
  })

  it('PATCH memakai requireAkunting, BUKAN requireInternal', () => {
    // Sakelar ini menentukan apakah angka yang sudah diserahkan ke klien boleh
    // berubah. requireInternal akan memberikannya juga kepada finance.
    const patch = potong('PATCH')
    expect(patch).toContain('requireAkunting()')
    expect(patch).not.toContain('requireInternal()')
  })

  it('PATCH memeriksa kepemilikan klien SEBELUM menulis', () => {
    const patch = potong('PATCH')
    const cek = patch.indexOf('canAccessClientData(')
    const tulis = patch.indexOf('.insert(clientAccountingSettings)')
    expect(cek).toBeGreaterThan(-1)
    expect(tulis).toBeGreaterThan(-1)
    expect(cek).toBeLessThan(tulis)
  })

  it('akun PPN yang dikirim diperiksa milik klien yang sama', () => {
    // Tanpa ini, id akun klien lain bisa diselundupkan lewat body dan
    // ter-snapshot ke invoice klien ini.
    expect(potong('PATCH')).toContain('assertInvoiceAccountsBelongToClient(')
  })

  it('upsert, bukan update — baris setelan lahir di jalur ini', () => {
    // UPDATE saja akan diam-diam tidak melakukan apa pun untuk klien yang
    // belum punya baris, dan UI menampilkan nilai yang dikiranya tersimpan.
    expect(potong('PATCH')).toContain('onConflictDoUpdate(')
  })
})

describe('bentuk "=== true" dipakai di setiap pembaca sakelar D42', () => {
  it('predikat lib membandingkan eksplisit ke true', () => {
    expect(PREDIKAT).toContain('settings?.postingBisaDiedit === true')
  })

  it('tidak ada "?? true" di mana pun yang membaca setelan ini', () => {
    for (const [nama, src] of [
      ['lib/accounting-settings.ts', PREDIKAT],
      ['route setelan', SETTINGS_ROUTE],
      ['route detail jurnal', JURNAL_DETAIL],
      ['halaman Settings', SETTINGS_PAGE],
    ] as const) {
      expect(tanpaKomentar(src).includes('postingBisaDiedit ?? true'), nama).toBe(false)
    }
  })

  it('GET setelan menjawab nilai bawaan, BUKAN 404, saat barisnya belum ada', () => {
    const get = SETTINGS_ROUTE.slice(
      SETTINGS_ROUTE.indexOf('export async function GET('),
      SETTINGS_ROUTE.indexOf('export async function PATCH(')
    )
    expect(get).toContain('postingBisaDiedit: row?.postingBisaDiedit === true')
    expect(get).not.toContain('status: 404')
  })

  it('halaman Settings membaca respons dengan === true, bukan truthy biasa', () => {
    expect(SETTINGS_PAGE).toContain('setelan?.postingBisaDiedit === true')
  })
})
