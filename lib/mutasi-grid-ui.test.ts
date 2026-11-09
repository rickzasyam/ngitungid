import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// S9 — UI grid /mutasi-kas. Struktural (P15), bukan render: yang dijaga adalah
// janji yang mudah hilang dalam satu polish pass. Perilakunya diuji di modul
// murni (mutasi-grid-state, mutasi-grid-turunan) dan di uji klik dev.

// CRLF → LF: checkout Windows (core.autocrlf) tidak boleh memerahkan pola multi-baris.
const baca = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8').split('\r\n').join('\n')
const PAGE = baca('app', 'mutasi-kas', 'page.tsx')
const LEMBAR = baca('components', 'mutasi-kas', 'grid', 'lembar-mutasi.tsx')
const GRID = baca('components', 'mutasi-kas', 'grid', 'grid-mutasi.tsx')
const PB = baca('components', 'mutasi-kas', 'grid', 'panel-pindah-buku.tsx')
const KIRIM = baca('components', 'mutasi-kas', 'grid', 'kirim-simpan.ts')
const CADANGAN = baca('components', 'mutasi-kas', 'grid', 'cadangan-draf.ts')
const CSS = baca('components', 'mutasi-kas', 'grid', 'grid-mutasi.css')
const KOMBO = baca('components', 'mutasi-kas', 'grid', 'kombo-akun.tsx')
const KOMBO_CSS = baca('components', 'mutasi-kas', 'grid', 'kombo-akun.css')
const KALENDER = baca('components', 'mutasi-kas', 'grid', 'kalender-sel.tsx')
const AKUN_KAS = baca('lib', 'akun-kas-klien.ts')
const SETTINGS = baca('app', 'settings', 'page.tsx')
const FORM = baca('components', 'mutasi-kas', 'mutation-form-modal.tsx')
const PKG = JSON.parse(baca('package.json')) as { dependencies: Record<string, string> }
const PANEL_PDF = baca('components', 'mutasi-kas', 'grid', 'panel-unggah-pdf.tsx')

// X5 — Unggah PDF rekening koran ke grid (PR #2 langkah 6).
describe('Unggah PDF rekening koran (X5)', () => {
  it('tombol hanya ada bila sakelar sendiri menyala (bawaan mati)', () => {
    expect(LEMBAR).toContain("const EKSTRAKSI_PDF = aiFeaturesEnabled('ekstraksiRekeningKoran')")
    expect(LEMBAR).toContain('{EKSTRAKSI_PDF && (')
  })
  it('PDF dibaca di browser (D56): pdf.js dimuat malas, berkasnya tidak pernah dikirim', () => {
    expect(PANEL_PDF).toContain("await import('@/lib/bank-statement/baca-pdf')")
    expect(PANEL_PDF).not.toContain('FormData')
    expect(PANEL_PDF).toContain("body = { clientId: k.clientId, akunKasId: k.akunKasId, halaman: n, baris, kolomSebelumnya: kolomSebelumnyaBerposisi(asal, t.grid) }")
  })
  it('halaman diproses BERURUTAN, bisa dibatalkan, galat yang pasti berulang menghentikan dokumen', () => {
    expect(PANEL_PDF).toContain('for (const n of daftar) {')
    expect(PANEL_PDF).toContain('const r = await ekstrakSatu(n, { doc, judul: judulRef.current, clientId, akunKasId, sinyal: ac.signal })')
    expect(PANEL_PDF).toContain('if (r.henti) {')
    expect(PANEL_PDF).toContain('abortRef.current?.abort()')
  })
  it('halaman gambar tanpa baris tampil sebagai peringatan + Ulangi, dan ikut ke catatan saat dimasukkan', () => {
    expect(PANEL_PDF).toContain("h.status === 'ok' && peringatanHalaman(h) ? (")
    expect(PANEL_PDF).toContain('...daftarHasil.flatMap(h => peringatanHalaman(h) ?? []),')
  })
  // Uji X6 (2026-11-09): ringkasan bank dibaca KODE dari teks halaman, dibandingkan dengan blok yang akan masuk grid.
  it('ringkasan bank sebagai pemeriksa: dibaca kode, dibandingkan, tidak cocok ikut ke catatan', () => {
    expect(PANEL_PDF).toContain('return { ...r, ringkasan: t.perluGambar ? null : bacaRingkasanBank(baris) }')
    expect(PANEL_PDF).toContain('bandingkanRingkasan(ringkasan.data, rencana.hasil)')
    expect(PANEL_PDF).toContain("role={tidakCocok.length > 0 ? 'alert' : 'status'}")
    expect(PANEL_PDF).toContain('`Tidak cocok dengan ringkasan bank: ${tidakCocok.map(b => b.label.toLowerCase()).join(\', \')}.`')
  })
  it('SALDO AWAL ringkasan ditawarkan sebagai "Saldo awal rekening koran" hanya bila grid & blok tanpa jangkar', () => {
    expect(PANEL_PDF).toContain('const teksJangkar = tawarkanJangkar && tanpaSaldoAwalBlok ? (ringkasan?.data.saldoAwalTeks ?? null) : null')
    expect(LEMBAR).toContain("tawarkanJangkar={jangkar.sumber === null || jangkar.sumber === 'manual'}")
    expect(LEMBAR).toContain('onSaldoAwal={setSaldoManual}')
  })
  it('isi manual (422 inputManual) tidak menawarkan tombol ulangi', () => {
    const manual = PANEL_PDF.slice(PANEL_PDF.indexOf("h.status === 'manual' ? ("), PANEL_PDF.indexOf(') : (', PANEL_PDF.indexOf("h.status === 'manual' ? (")))
    expect(manual).toContain('isi manual')
    expect(manual).not.toContain('Ulangi')
  })
  it('hasil masuk sebagai SATU blok DRAF sumber pdf lewat rencanaPdf; Simpan menyebut baris dari AI', () => {
    expect(PANEL_PDF).toContain('rencana: rencanaPdf(t, periode)')
    expect(PANEL_PDF).toContain('onMasukkan(rencana.hasil, catatan)')
    expect(LEMBAR).toContain("dispatch({ jenis: 'tempelBlok', indeks: s.baris.length, hasil, sumber: 'pdf', namaBerkas: pdf.name })")
    expect(LEMBAR).toContain("const dariAi = diff.baru.filter(b => b.asal === 'pdf').length")
    expect(LEMBAR).toContain('baris berasal dari AI')
  })
  // Uji klik langkah 6 (2026-11-09): sesudah satu "Hapus baris", baris berikutnya
  // naik ke posisi aktif tanpa event dari grid → klik sel yang sama tidak mengaktifkannya.
  it('baris di posisi aktif hilang → posisi aktif disinkronkan ke baris yang kini di indeks itu', () => {
    expect(GRID).toContain('indeksAktif.current = rowIdx')
    const efek = GRID.slice(GRID.indexOf('useEffect(() => {\n    const k = aktif.current.kunci'), GRID.indexOf('}, [baris, onAktif])'))
    expect(efek).toContain('if (k === null || baris.some(b => b.kunci === k)) return')
    expect(efek).toContain('baris[indeksAktif.current]?.kunci ?? null')
    expect(efek).toContain('onAktif(aktif.current)')
  })
  it('kolom Hal. baca-saja & penanda lilac berteks (bukan warna saja)', () => {
    expect(GRID).toContain("name: 'Hal.',")
    expect(GRID).toContain("r.belumDisentuh ? 'gm-baris-baru gm-baris-ai' : 'gm-baris-baru'")
    expect(GRID).toContain('dari PDF (AI)')
    expect(CSS).toContain('.grid-mutasi .gm-baris-ai {')
  })
})

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
    expect(GRID).toContain('const bolehSunting = (b: BarisGrid, k: KolomGrid) => kt.bolehTulis && alasanTerkunci(b, k) === null')
    expect(GRID).toContain('editable: b => bolehSunting(b, k)')
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
    expect(PAGE).toContain('muatAkunKas(clientId)')
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
  // Uji klik CP-20: grid di Oktober, Daftar membuka November (rentangnya sendiri).
  it('pindah ke Daftar membuka bulan grid (keputusan Ricko 2026-11-09)', () => {
    const cabang = PAGE.slice(PAGE.indexOf("if (id === 'daftar') {"), PAGE.indexOf('setTampilan(id)'))
    expect(cabang).toContain('setPeriode({ start: bulan.mulai, end: bulan.akhir })')
  })
})

// ── Masukan Ricko 2026-10-30 (D63–D66, combobox, Atur kolom) ──

describe('kolom & label (D63)', () => {
  it('grid memakai LABEL_KOLOM dan urutan KOLOM_GRID — tidak ada label kolom yang ditulis ulang di komponen', () => {
    expect(GRID).toContain('name: LABEL_KOLOM[k]')
    expect(GRID).toContain('KOLOM_GRID.filter(k => !sembunyi.has(k))')
    expect(LEMBAR).toContain('Debet{\' \'}')
    expect(LEMBAR).toContain('Kredit{\' \'}')
    expect(PAGE).toContain('>Debet</th>')
    expect(PAGE).toContain('>Kredit</th>')
    expect(PAGE).not.toContain('>Masuk</th>')
  })
})

describe('Ref (D64, migrasi 0022)', () => {
  it('Daftar punya kolom Ref, colSpan rincian ikut bertambah', () => {
    expect(PAGE).toContain('<th scope="col" style={th}>Ref</th>')
    expect(PAGE).toContain("{r.ref ?? '—'}")
    expect(PAGE).toContain('colSpan={10}')
  })
  it('form satu-satu: field Ref (maks REF_MAX); ref DAN catatan ikut terkirim — PATCH tidak mengosongkannya', () => {
    expect(FORM).toContain('id="m-ref"')
    expect(FORM).toContain('maxLength={REF_MAX}')
    expect(PAGE).toContain("ref: r.ref ?? '',")
    expect(PAGE).toContain("catatan: r.catatan ?? '',")
    const body = PAGE.slice(PAGE.indexOf('async function simpan('), PAGE.indexOf('const url = editingId'))
    expect(body).toContain('ref: v.ref,')
    expect(body).toContain('catatan: v.catatan,')
  })
})

describe('Atur kolom', () => {
  it('hanya kolom opsional yang bisa disembunyikan; kolom inti tidak', () => {
    expect(LEMBAR).toContain("const KOLOM_OPSIONAL: readonly KolomGrid[] = ['ref', 'catatan']")
    expect(LEMBAR).toContain('KOLOM_OPSIONAL.filter(k => isi.includes(k))')
  })
  it('pilihan per klien di localStorage, setiap akses dibungkus try/catch', () => {
    expect(LEMBAR).toContain('`ngitungid:grid-mutasi:kolom-tersembunyi:${clientId}`')
    const baca = LEMBAR.slice(LEMBAR.indexOf('function bacaKolomTersembunyi'), LEMBAR.indexOf('function tulisKolomTersembunyi'))
    const tulis = LEMBAR.slice(LEMBAR.indexOf('function tulisKolomTersembunyi'), LEMBAR.indexOf('export function LembarMutasi'))
    expect(baca.indexOf('try {')).toBeLessThan(baca.indexOf('localStorage.getItem'))
    expect(tulis.indexOf('try {')).toBeLessThan(tulis.indexOf('localStorage.setItem'))
  })
})

describe('combobox Nama Akun (pengganti <datalist>)', () => {
  it('tidak ada <datalist> lagi; editor sel dan dialog "Isi Nama Akun kosong" memakai KomboAkun', () => {
    for (const src of [GRID, LEMBAR]) {
      expect(src).not.toContain('<datalist')
      expect(src).not.toContain('list={')
      expect(src).toContain('<KomboAkun')
    }
  })
  it('ARIA combobox: role, aria-expanded, aria-controls, aria-activedescendant; opsi role=option + aria-selected', () => {
    expect(KOMBO).toContain('role="combobox"')
    expect(KOMBO).toContain('aria-controls={idDaftar}')
    expect(KOMBO).toContain('aria-activedescendant=')
    expect(KOMBO).toContain('role="listbox"')
    expect(KOMBO).toContain('role="option"')
    expect(KOMBO).toContain('aria-selected={i === aktif}')
  })
  it('keyboard: Alt+↓ daftar penuh, ↑↓ pilih, Enter pasang, Tab pasang yang disorot, Esc batal', () => {
    expect(KOMBO).toContain("e.altKey && e.key === 'ArrowDown'")
    expect(KOMBO).toContain("e.key === 'ArrowDown' || e.key === 'ArrowUp'")
    expect(KOMBO).toContain("onPilih(opsi, 'enter')")
    expect(KOMBO).toContain("onPilih(opsi, e.shiftKey ? 'tab-mundur' : 'tab')")
  })
  it('pilihan dari combobox disimpan bersama barisnya (commit=true), bukan lewat onClose yang memegang baris lama', () => {
    expect(GRID).toContain("onRowChange({ ...row, sel: { ...row.sel, akunLawan: a.kode } }, true)")
  })
  it('editor dari konteks (identitas tetap) — bukan dibuat ulang per render', () => {
    expect(GRID).toContain('const { daftarAkun, lanjut } = useContext(KonteksEditorAkun)')
    expect(GRID).not.toContain('buatEditorAkun(')
  })
  it('daftar dikelompokkan per jenis akun; item aktif lime (token), tanpa hex', () => {
    expect(KOMBO).toContain('saringAkun(akun, kueri)')
    expect(KOMBO_CSS).toContain('background: var(--color-accent-primary);')
    expect(KOMBO_CSS).toContain('color: var(--color-accent-primary-fg);')
    const aturan = KOMBO_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(aturan).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(aturan).not.toContain('@layer')
  })
})

describe('tanggal ketikan & kalender (D66)', () => {
  it('ketikan sel dinormalisasi lewat teksKetikan sebelum masuk reducer', () => {
    expect(LEMBAR).toContain("dispatch({ jenis: 'ubahSel', kunci, kolom, nilai: teksKetikan(kolom, nilai, periode) })")
  })
  it('event dari panel kalender (portal) tidak sampai ke react-data-grid', () => {
    // keydown/mousedown/click: isolasi panel bersama; sisanya di wadah sel.
    expect(KALENDER).toContain('<DatePicker')
    for (const ev of ['onDoubleClick', 'onKeyUp', 'onCopy', 'onPaste', 'onContextMenu', 'onFocus']) expect(KALENDER).toContain(`${ev}={henti}`)
    expect(KALENDER).toContain('if (!e.currentTarget.contains(e.target as Node)) e.stopPropagation()')
    // Tempelan dari panel yang di-portal tidak masuk ke grid.
    expect(GRID).toContain('if (!e.currentTarget.contains(target)) return')
  })
})

describe('Alt+↓ & ikon di sel', () => {
  it('Alt+↓ di Tanggal membuka kalender lewat keadaan grid (bukan klik tombol tersembunyi); di Nama Akun membuka editor', () => {
    expect(GRID).toContain("e.altKey && e.key === 'ArrowDown' && args.column?.key === 'tanggal'")
    // Kedua jalur (sel aktif & sedang menyunting) membuka kalender lewat keadaan grid.
    const altBawah = GRID.slice(GRID.indexOf("args.column?.key === 'tanggal'"), GRID.indexOf("args.column?.key === 'akunLawan'"))
    expect(altBawah.split('setKalender(kunci)').length - 1).toBe(2)
    expect(GRID).toContain('terbuka={kalender === row.kunci}')
    expect(KALENDER).toContain('open={terbuka}')
    expect(KALENDER).toContain('onOpenChange={onBuka}')
    expect(GRID).not.toContain('bukaKalenderDi')
    expect(GRID).toContain("e.altKey && e.key === 'ArrowDown' && args.mode === 'ACTIVE' && args.column?.key === 'akunLawan'")
  })
  it('kalender = DatePicker satu tanggal (PR #6): dikunci ke bulan grid, jangkar & fokus kembali = sel grid', () => {
    expect(KALENDER).toContain("import { DatePicker } from '@/components/date-picker'")
    expect(KALENDER).not.toContain('DateRangePicker')
    expect(KALENDER).toContain('min={batas.min}')
    expect(KALENDER).toContain('max={batas.max}')
    expect(KALENDER).toContain('bulanAwal={batas.bulanAwal}')
    expect(KALENDER).toContain('jangkarRef={selRef}')
    expect(KALENDER).toContain('fokusKembaliKe={selRef}')
    expect(KALENDER).toContain(`el?.closest<HTMLElement>('[role="gridcell"]')`)
  })
  it('ikon hanya di baris aktif/hover (CSS), tidak jadi tempat berhenti Tab', () => {
    expect(CSS).toContain(".rdg-row:has(> .rdg-cell[aria-selected='true']) .gm-picu")
    expect(GRID).toContain('tabIndex={-1}')
    expect(KALENDER).toContain('tabIndex={-1}')
  })
  it('penyiasatan date-range-picker sudah dibuang (CSS .gm-kalender, wadah 480px)', () => {
    expect(CSS).not.toContain('gm-kalender')
    expect(CSS).not.toContain('480px')
  })
})

describe('tab rekening kas dari SATU fungsi (D)', () => {
  it('muatAkunKas satu-satunya pemanggil /coa?kas=1 di halaman', () => {
    expect(AKUN_KAS).toContain('`/api/clients/${clientId}/coa?kas=1`')
    expect(PAGE).not.toContain('coa?kas=1')
    expect(SETTINGS).not.toContain('coa?kas=1')
    expect(SETTINGS).toContain('muatAkunKas(clientId)')
  })

  // Sebelumnya `.catch(() => [])`: gagal muat = "tidak ada akun kas" → akun kas
  // ditawarkan sebagai Pindah Buku dan baru ditolak server (keputusan Ricko 2026-11-09).
  it('Settings › Akun Pindah Buku: gagal muat akun kas tampil + "Coba lagi", pemilih ditahan', () => {
    expect(SETTINGS).not.toContain('muatAkunKas(clientId).catch(')
    expect(SETTINGS).toContain("const akunKasIds = kasDimuat && 'ids' in kasDimuat ? kasDimuat.ids : null")
    expect(SETTINGS).toContain('disabled={readOnly || saving || !akunKasIds}')
    const galat = SETTINGS.slice(SETTINGS.indexOf("{kasDimuat && 'galat' in kasDimuat && ("), SETTINGS.indexOf('Coba lagi', SETTINGS.indexOf("'galat' in kasDimuat")) + 9)
    expect(galat).toContain('role="alert"')
    expect(galat).toContain('setMuatKasKe(n => n + 1)')
    expect(galat).toContain('Coba lagi')
  })

  // Uji klik CP-20 (2026-11-07): ganti klien menampilkan tab klien LAMA di bawah
  // nama klien baru (grid meminta akunKasId klien lama → 400), dan gangguan
  // jaringan sesaat terbaca "Belum ada akun bertanda kas/bank" tanpa jalan ulang.
  it('COA termuat diikat ke clientId-nya; memuat & gagal tidak terbaca "belum ada akun kas"', () => {
    expect(PAGE).toContain('coaDimuat && coaDimuat.clientId === clientId ? coaDimuat : null')
    expect(PAGE).toContain('const akunKas = coaKlien?.kas ?? TANPA_AKUN')
    expect(PAGE).toContain("if (!rSemua.ok) throw new Error(")
    expect(PAGE).toMatch(/catch \(e\) \{\s*if \(!batal\) setCoaDimuat\(\{ clientId, kas: \[\], semua: \[\], galat: e instanceof Error/)
    const memuat = PAGE.indexOf('{!coaKlien ? (')
    const gagal = PAGE.indexOf(') : coaKlien.galat ? (')
    const kosong = PAGE.indexOf(') : akunKas.length === 0 ? (')
    expect(memuat).toBeGreaterThan(-1)
    expect(gagal).toBeGreaterThan(memuat)
    expect(kosong).toBeGreaterThan(gagal)
    expect(PAGE.slice(gagal, kosong)).toContain('Coba lagi')
    expect(PAGE).toContain("title={coaKlien && !coaKlien.galat && akunKas.length === 0 ? 'Belum ada akun bertanda")
  })
})
