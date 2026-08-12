import { describe, it, expect } from 'vitest'
import {
  filterClients, pushRecent, recentClients, shouldShowRecents,
  RECENT_LIMIT, RECENT_MIN_CLIENTS,
} from './client-switcher'
import type { ClientInfo } from './client-context'

const C = (id: string, name: string, type = 'Retail'): ClientInfo =>
  ({ id, name, type, hasLogo: false, updatedAt: '2026-08-01T00:00:00.000Z', months: [] })

const RASYUKA = C('c1', 'Rasyuka', 'E-commerce')
const GRAPHICOOK = C('c2', 'Graphicook', 'Jasa Kreatif')
const NUSANTARA = C('c3', 'PT Nusantara Group', 'Manufaktur')
const NIKE = C('c4', 'Nike')
const SEMUA = [RASYUKA, GRAPHICOOK, NUSANTARA, NIKE]

describe('filterClients — substring, case-insensitive', () => {
  it('"ras" menemukan "Rasyuka"', () => {
    expect(filterClients(SEMUA, 'ras').map(c => c.name)).toEqual(['Rasyuka'])
  })

  it('cocok di TENGAH nama, bukan cuma awalan', () => {
    // "syuk" ada di tengah "Rasyuka" — startsWith akan melewatkannya.
    expect(filterClients(SEMUA, 'syuk').map(c => c.name)).toEqual(['Rasyuka'])
    expect(filterClients(SEMUA, 'nusantara').map(c => c.name)).toEqual(['PT Nusantara Group'])
  })

  it('huruf besar-kecil tidak berpengaruh, dua arah', () => {
    for (const q of ['RASYUKA', 'rasyuka', 'RaSyUkA']) {
      expect(filterClients(SEMUA, q).map(c => c.name), q).toEqual(['Rasyuka'])
    }
    expect(filterClients([C('x', 'NIKE')], 'nike')).toHaveLength(1)
  })

  it('query kosong / spasi → semua klien', () => {
    for (const q of ['', '   ']) {
      expect(filterClients(SEMUA, q), JSON.stringify(q)).toHaveLength(SEMUA.length)
    }
  })

  it('spasi di ujung query diabaikan', () => {
    expect(filterClients(SEMUA, '  ras  ').map(c => c.name)).toEqual(['Rasyuka'])
  })

  it('tanpa kecocokan → array kosong (memicu empty state)', () => {
    expect(filterClients(SEMUA, 'zzz')).toEqual([])
  })

  it('mencari JENIS USAHA tidak ikut cocok — hanya nama', () => {
    // Kalau `type` ikut dicocokkan, mengetik "jasa" memunculkan setiap klien
    // berjenis Jasa dan menenggelamkan nama yang sebenarnya dicari.
    expect(filterClients(SEMUA, 'Manufaktur')).toEqual([])
  })

  it('urutan asli dipertahankan', () => {
    expect(filterClients(SEMUA, '').map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('tidak memutasi input', () => {
    const salinan = [...SEMUA]
    filterClients(SEMUA, 'ras')
    expect(SEMUA).toEqual(salinan)
  })
})

describe('pushRecent — paling baru di depan, tanpa duplikat', () => {
  it('menaruh id terbaru di posisi pertama', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('membuka ulang klien yang sama MEMINDAHKANNYA ke depan, bukan menggandakan', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(pushRecent(['a', 'b', 'c'], 'c')).toHaveLength(3)
  })

  it(`dipotong di ${RECENT_LIMIT}`, () => {
    let ids: string[] = []
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) ids = pushRecent(ids, id)
    expect(ids).toHaveLength(RECENT_LIMIT)
    expect(ids[0]).toBe('g')
    expect(ids).not.toContain('a') // yang tertua terdorong keluar
  })

  it('tidak memutasi array lama (aman jadi state React)', () => {
    const lama = ['a', 'b']
    const baru = pushRecent(lama, 'c')
    expect(lama).toEqual(['a', 'b'])
    expect(baru).not.toBe(lama)
  })
})

describe('recentClients — id → klien yang masih ada', () => {
  it('mengembalikan klien sesuai urutan id', () => {
    expect(recentClients(SEMUA, ['c3', 'c1']).map(c => c.name))
      .toEqual(['PT Nusantara Group', 'Rasyuka'])
  })

  it('klien AKTIF dikecualikan — ia pasti bukan yang sedang dicari', () => {
    expect(recentClients(SEMUA, ['c1', 'c2'], { excludeId: 'c1' }).map(c => c.id)).toEqual(['c2'])
  })

  it('id yang kliennya sudah tidak ada dilewati diam-diam', () => {
    expect(recentClients(SEMUA, ['sudah-dihapus', 'c2']).map(c => c.id)).toEqual(['c2'])
  })

  it('dipotong limit', () => {
    expect(recentClients(SEMUA, ['c1', 'c2', 'c3', 'c4'], { limit: 2 })).toHaveLength(2)
  })

  it('tanpa riwayat → kosong', () => {
    expect(recentClients(SEMUA, [])).toEqual([])
  })
})

describe('shouldShowRecents', () => {
  const BANYAK = RECENT_MIN_CLIENTS

  it('tampil saat daftar panjang, ada riwayat, dan tidak sedang mencari', () => {
    expect(shouldShowRecents(BANYAK, 3, '')).toBe(true)
  })

  it('TIDAK tampil saat sedang mengetik — hasil pencarian tidak boleh tergeser', () => {
    expect(shouldShowRecents(BANYAK, 3, 'ras')).toBe(false)
  })

  it('TIDAK tampil untuk daftar pendek — cuma mengulang isi yang sudah kelihatan', () => {
    expect(shouldShowRecents(RECENT_MIN_CLIENTS - 1, 3, '')).toBe(false)
  })

  it('TIDAK tampil tanpa riwayat', () => {
    expect(shouldShowRecents(BANYAK, 0, '')).toBe(false)
  })

  it('query berisi spasi saja dianggap tidak mencari', () => {
    expect(shouldShowRecents(BANYAK, 3, '   ')).toBe(true)
  })
})

// ══ Skala yang jadi alasan modal ini ada ═════════════════════════
// 4 akunting × ~15 klien → seorang owner akan melihat ~60 entri.
describe('skala 60 klien', () => {
  const BANYAK: ClientInfo[] = Array.from({ length: 60 }, (_, i) =>
    C(`id-${i}`, `Klien ${String(i).padStart(2, '0')}`)
  )

  it('pencarian mempersempit 60 → sedikit', () => {
    expect(BANYAK).toHaveLength(60)
    expect(filterClients(BANYAK, 'Klien 07')).toHaveLength(1)
    // Nama di-pad dua digit ("Klien 01"), jadi "klien 1" cocok 10-19 saja —
    // tidak ada "Klien 1" yang berdiri sendiri.
    expect(filterClients(BANYAK, 'klien 1')).toHaveLength(10)
  })

  it('pintasan tetap dibatasi 5 walau riwayatnya panjang', () => {
    const ids = BANYAK.map(c => c.id)
    expect(recentClients(BANYAK, ids)).toHaveLength(RECENT_LIMIT)
  })

  it('seksi pintasan memang tampil di skala ini', () => {
    expect(shouldShowRecents(60, RECENT_LIMIT, '')).toBe(true)
  })
})
