import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// S9 — UI grid /mutasi-kas. Struktural (P15), bukan render: yang dijaga adalah
// janji yang mudah hilang dalam satu polish pass. Perilakunya diuji di modul
// murni (mutasi-grid-state, mutasi-grid-turunan) dan di uji klik dev.

const baca = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const PAGE = baca('app', 'mutasi-kas', 'page.tsx')
const LEMBAR = baca('components', 'mutasi-kas', 'grid', 'lembar-mutasi.tsx')
const GRID = baca('components', 'mutasi-kas', 'grid', 'grid-mutasi.tsx')
const PB = baca('components', 'mutasi-kas', 'grid', 'panel-pindah-buku.tsx')
const KIRIM = baca('components', 'mutasi-kas', 'grid', 'kirim-simpan.ts')
const CADANGAN = baca('components', 'mutasi-kas', 'grid', 'cadangan-draf.ts')
const CSS = baca('components', 'mutasi-kas', 'grid', 'grid-mutasi.css')
const PKG = JSON.parse(baca('package.json')) as { dependencies: Record<string, string> }

describe('grid tidak menghitung angka buku sendiri (pola CP-18)', () => {
  it.each([
    ['lembar', LEMBAR],
    ['grid', GRID],
    ['panel Pindah Buku', PB],
    ['halaman', PAGE],
  ])('%s: status, sisa, kunci, dan saldo Pindah Buku tidak dihitung di browser', (_n, src) => {
    for (const terlarang of ['allocationRemaining(', 'mutationStatus(', 'kunciMutasi(', 'saldoPindahBuku(', 'cariPasangan(']) {
      expect(src).not.toContain(terlarang)
    }
  })

  it('kunci per baris datang dari server (S8) dan dipakai apa adanya', () => {
    expect(LEMBAR).toContain('terkunci: m.kunci')
    expect(LEMBAR).toContain("urut: 'buku'")
  })
})

describe('Simpan: satu jalur, terikat gerbang', () => {
  it('satu-satunya penulis adalah route batch — lembar, grid, dan panel tidak menulis sendiri', () => {
    expect(KIRIM).toContain("fetch('/api/cash-mutations/batch', {")
    for (const src of [LEMBAR, GRID, PB]) {
      expect(src).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/)
    }
  })

  it('tombol & fungsi Simpan memakai gerbang yang SAMA (galat, putus, arah, batas D52)', () => {
    expect(LEMBAR).toContain('const gerbang = gerbangSimpan(s, diff, rantai, menyimpan)')
    expect(LEMBAR).toContain('disabled={!gerbang.boleh}')
    expect(LEMBAR).toContain('if (!gerbang.boleh) return')
  })

  it('body dikirim gzip dan TIDAK dipecah diam-diam (D52)', () => {
    expect(KIRIM).toContain("new CompressionStream('gzip')")
    expect(KIRIM).toContain("'content-encoding': 'gzip'")
    expect(KIRIM).toContain('ukuran > BATAS_BODY_KIRIM')
    expect(KIRIM).not.toContain('slice(')
  })

  it('galat server dari Simpan hanya menempel di baris yang belum disunting sejak itu', () => {
    expect(LEMBAR).toContain('petaBaris.get(k)?.b === gagalSimpan.objek.get(k)')
  })
})

describe('tambalan S0 & Enter seperti Excel (CP-19)', () => {
  it('Ctrl+V tidak membuka editor; tempel ditangani pembungkus', () => {
    expect(GRID).toContain('onCellPaste={({ row }) => row}')
    expect(GRID).toContain('onPasteCapture={onPaste}')
  })
  it('Ctrl+Home ke sel data pertama; Delete/Backspace mengosongkan sel', () => {
    expect(GRID).toContain("ctrl && e.key === 'Home'")
    expect(GRID).toContain("args.setActivePosition({ idx: 0, rowIdx: 0 }, { shouldFocus: true })")
    expect(GRID).toContain("(e.key === 'Delete' || e.key === 'Backspace')")
    expect(GRID).toContain("onUbahSel(args.row.kunci, k as KolomGrid, '')")
  })
  it('galat lewat span `hidden` + aria-describedby (nama sel = nilai), bukan sr-only', () => {
    expect(GRID).toContain('<span id={idGalat(row.kunci, k)} hidden>')
    expect(GRID).toContain('aria-describedby={i.galat ? idGalat(props.row.kunci, k) : undefined}')
    expect(GRID).toContain('aria-invalid={i.galat ? true : undefined}')
    expect(GRID).not.toContain('className="sr-only"')
  })
  it('sel terkunci: alasan di aria-description, tidak bisa disunting', () => {
    expect(GRID).toContain('aria-description={i.deskripsi ?? undefined}')
    expect(GRID).toContain('editable: b => kt.bolehTulis && alasanTerkunci(b, k) === null')
  })
  it('Enter: di editor simpan lalu turun; di sel aktif turun; Shift+Enter naik', () => {
    expect(GRID).toContain('args.onClose(true, false)')
    expect(GRID).toContain('const ke = args.rowIdx + (e.shiftKey ? -1 : 1)')
  })
})

describe('library & pemuatan', () => {
  it('react-data-grid dipin PERSIS 7.0.0-beta.63 (D46)', () => {
    expect(PKG.dependencies['react-data-grid']).toBe('7.0.0-beta.63')
  })
  it('grid dimuat malas tanpa SSR — tidak masuk muatan pertama halaman', () => {
    expect(LEMBAR).toContain("dynamic(() => import('./grid-mutasi'), {\n  ssr: false,")
  })
  it('CSS grid tanpa @layer (menang atas @layer rdg) dan tanpa warna hex (gotcha #6)', () => {
    const aturan = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(aturan).not.toContain('@layer')
    expect(aturan).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('draf (D51)', () => {
  it('peringatan sebelum meninggalkan halaman dan penjaga tautan saat draf kotor', () => {
    expect(LEMBAR).toContain("window.addEventListener('beforeunload', tahan)")
    expect(LEMBAR).toContain("document.addEventListener('click', tautan, true)")
  })
  it('cadangan ditulis berkala saat kotor, dihapus sesudah Simpan berhasil, ditawarkan saat dibuka', () => {
    expect(LEMBAR).toContain('await tulisCadangan({')
    const simpan = LEMBAR.slice(LEMBAR.indexOf('const r = await kirimSimpan(body)'))
    expect(simpan.indexOf('await hapusCadangan(clientId, akunKas.id)')).toBeGreaterThan(-1)
    expect(LEMBAR).toContain('Pulihkan draf')
    expect(LEMBAR).toContain('Buang')
  })
  // CP-20 (Ricko 2026-10-29): draf yang diganti versi server tidak boleh hilang.
  describe('"Muat ulang dari server" (konflik 409)', () => {
    const alur = LEMBAR.slice(LEMBAR.indexOf('async function cadangkanLaluMuatUlang('), LEMBAR.indexOf('const aktifBaris ='))

    it('menulis draf ke slot `tertimpa` LEBIH DULU, dan membatalkan muat ulang bila gagal', () => {
      const tulis = alur.indexOf("'tertimpa'\n      )")
      const gagal = alur.indexOf("setMuatUlang('gagal')\n        return")
      const muat = alur.indexOf('setVersi(v => v + 1)')
      expect(tulis).toBeGreaterThan(-1)
      expect(gagal).toBeGreaterThan(tulis)
      expect(muat).toBeGreaterThan(gagal)
    })
    it('peringatan eksplisit (alertdialog), bukan window.confirm; tanpa cadangan hanya lewat pilihan kedua', () => {
      expect(LEMBAR).toContain('role="alertdialog"')
      expect(LEMBAR).toContain('Muat ulang MENGGANTI draf di layar dengan versi terbaru dari server.')
      expect(LEMBAR).not.toContain("window.confirm('Muat ulang")
      expect(LEMBAR).toContain("onClick={() => setMuatUlang('tanya')}")
      expect(LEMBAR).toContain('Tetap muat ulang — draf hilang')
    })
    it('autosave tidak menulis ulang slot draf selama penggantian', () => {
      expect(LEMBAR).toContain('if (sedangMuatUlang.current) return')
    })
    it('kedua slot ditawarkan saat dibuka; draf tertimpa bisa dipulihkan dan dibuang', () => {
      expect(LEMBAR).toContain("bacaCadangan(clientId, akunKas.id, 'tertimpa')")
      expect(LEMBAR).toContain('Pulihkan draf tertimpa')
      expect(LEMBAR).toContain('void hapusCadangan(clientId, akunKas.id, c.slot)')
    })
    it('slot tertimpa berkunci sendiri; kunci slot draf tidak berubah (cadangan lama tetap terbaca)', () => {
      expect(CADANGAN).toContain("slot === 'draf' ? `${clientId}:${akunKasId}` : `${clientId}:${akunKasId}:${slot}`")
    })
  })

  it('setiap akses IndexedDB dibungkus try/catch', () => {
    expect(CADANGAN.match(/try \{/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(CADANGAN).toContain("typeof indexedDB === 'undefined'")
  })
})

describe('halaman /mutasi-kas (S9)', () => {
  it('grid hanya di layar ≥ md; form satu-satu tetap ada untuk HP', () => {
    expect(PAGE).toContain("const MQ_LEBAR = '(min-width: 768px)'")
    expect(PAGE).toContain('const pakaiGrid = lebar && tampilan')
    expect(PAGE).toContain('<MutationFormModal')
  })
  it('tab sheet per akun kas (role=tablist) dari ?kas=1, satu bulan per grid', () => {
    expect(PAGE).toContain('role="tablist" aria-label="Akun kas"')
    expect(PAGE).toContain('role="tab"')
    expect(PAGE).toContain('aria-selected={terpilih}')
    expect(PAGE).toContain('/coa?kas=1')
    expect(PAGE).toContain('type="month"')
  })
  it('wizard impor lama hilang; CSV masuk lewat grid (D47)', () => {
    expect(PAGE).not.toContain('ImportWizard')
    expect(LEMBAR).toContain('rencanaBerkas(await file.text(), periode)')
  })
  it('pindah tab/bulan/tampilan dengan draf kotor meminta konfirmasi', () => {
    expect(PAGE.match(/gridKotor && !window\.confirm\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
  it('tautan "Koreksi di Mutasi Kas" (?mutasi=) tetap membuka daftar dengan baris terbuka', () => {
    expect(PAGE).toContain("useState<'grid' | 'daftar'>(mutasiDariUrl ? 'daftar' : 'grid')")
  })
})
