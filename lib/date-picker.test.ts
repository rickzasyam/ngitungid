import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas components/date-picker.tsx — date picker SATU TANGGAL
// (keputusan Ricko 2026-10-30). Perilaku murninya (batas, bulan awal, sel Tab)
// diuji di lib/kalender-batas.test.ts & lib/kalender-keyboard.test.ts; klik &
// keyboard di browser diuji dengan Playwright (lihat deskripsi PR).

const SRC = readFileSync(join(process.cwd(), 'components', 'date-picker.tsx'), 'utf8').replace(/\r\n/g, '\n')
// Kode saja (tanpa baris komentar) untuk assertion "tidak boleh ada" — komentar
// kepala memang menyebut `new Date(string)` dan "Terapkan" sebagai larangan.
const KODE = SRC.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**') && !l.trim().startsWith('{/*'))
  .join('\n')
const PANEL = readFileSync(join(process.cwd(), 'components', 'kalender-panel.tsx'), 'utf8').replace(/\r\n/g, '\n')

/** Anggota interface tanpa komentar — namanya & tipenya dikunci, dokumentasinya boleh berubah. */
function anggota(nama: string): string[] {
  const awal = SRC.indexOf(`export interface ${nama} {`)
  expect(awal, nama).toBeGreaterThan(-1)
  return SRC.slice(awal, SRC.indexOf('\n}', awal))
    .split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('/**') && !l.startsWith('*') && !l.startsWith('//'))
}

// Stream A memasang komponen ini di sel tanggal grid: antarmukanya dikunci
// seperti DateRangePicker. Mengubahnya = berhenti dan lapor dulu.
describe('antarmuka (props) dikunci', () => {
  it('DatePickerProps', () => {
    expect(anggota('DatePickerProps')).toEqual([
      'value: string',
      'onChange: (ymd: string) => void',
      'open?: boolean',
      'onOpenChange?: (open: boolean) => void',
      'renderPemicu?: (p: PemicuDatePicker) => ReactNode',
      'jangkarRef?: RefObject<HTMLElement | null>',
      'fokusKembaliKe?: RefObject<HTMLElement | null>',
      'bulanAwal?: string',
      'min?: string',
      'max?: string',
      'placeholder?: string',
    ])
  })

  it('PemicuDatePicker — props yang dipasang pada pemicu pengganti', () => {
    expect(anggota('PemicuDatePicker')).toEqual([
      'ref: Ref<HTMLButtonElement>',
      "type: 'button'",
      "'aria-haspopup': 'dialog'",
      "'aria-expanded': boolean",
      'onClick: () => void',
    ])
    expect(SRC).toContain('export function DatePicker({')
  })
})

describe('panel kalender yang SAMA dengan DateRangePicker', () => {
  it('memakai KalenderPanel: satu tanggal, satu bulan, min/max, event terisolasi', () => {
    const panel = SRC.slice(SRC.indexOf('<KalenderPanel'), SRC.indexOf('/>', SRC.indexOf('<KalenderPanel')))
    for (const s of ['tunggal', 'jumlahBulan={1}', 'batas={batas}', 'isolasiEvent', 'label="Pilih tanggal"', 'onDayClick={onDayClick}', 'onTutup={onTutup}']) {
      expect(panel, s).toContain(s)
    }
  })

  it('tidak punya kalender sendiri: sel, portal, dan navigasi panah hanya di panel bersama', () => {
    for (const s of ['data-hari', 'ModalPortal', 'tujuanTombol', 'CalendarMonth', 'onMouseEnter', 'addEventListener']) expect(KODE, s).not.toContain(s)
  })

  it('mode tunggal: tanpa pita rentang; nilai terpilih = from & to yang sama', () => {
    expect(PANEL).toContain('{shouldRenderBand && !tunggal && (')
    // Hover tetap menyala di sel yang belum terpilih walau sudah ada nilai (rentang: hanya sebelum tanggal akhir).
    expect(PANEL).toContain('(tunggal ? !isSelected : !range?.to)')
    expect(SRC).toContain('range={terpilih ? { from: terpilih, to: terpilih } : undefined}')
  })

  it('min/max: sel di luar batas MATI, panah berhenti di batas, tombol bulan aria-disabled', () => {
    expect(PANEL).toContain('const mati = !dalamBatas(localDateToYmd(date), batas)')
    expect(PANEL).toContain('disabled={mati}')
    expect(PANEL).toContain('const tujuan = jepitTanggal(arah, batas)')
    expect(PANEL).toContain('aria-disabled={!bisaMundur || undefined}')
    expect(PANEL).toContain('aria-disabled={!bisaMaju || undefined}')
    // Fokus awal tidak boleh jatuh ke sel terpilih yang mati.
    expect(PANEL).toContain('button[data-hari][aria-pressed="true"]:not(:disabled)')
  })

  it('isolasi: keydown/mousedown/click di panel tidak merambat lewat pohon React ke grid', () => {
    expect(PANEL).toContain('const isolasi = isolasiEvent ? { onKeyDown: henti, onMouseDown: henti, onClick: henti } : {}')
    expect(PANEL).toContain('const henti = (e: SyntheticEvent) => e.stopPropagation()')
    expect(PANEL).toContain('{...isolasi}')
  })

  // Temuan uji klik 2026-10-30: dengan isolasi, stopPropagation React ikut
  // menghentikan event aslinya — Escape dari dalam panel tidak pernah sampai ke
  // pendengar dokumen fase bubble, dan panel tidak bisa ditutup dengan Escape.
  it('pendengar Escape & klik-di-luar di fase CAPTURE (tidak terhenti oleh isolasi)', () => {
    expect(PANEL).toContain("document.addEventListener('keydown', handleKey, true)")
    expect(PANEL).toContain("document.addEventListener('mousedown', handleClickOutside, true)")
    expect(PANEL).toContain("document.removeEventListener('keydown', handleKey, true)")
    expect(PANEL).toContain("document.removeEventListener('mousedown', handleClickOutside, true)")
  })

  // Temuan uji klik 2026-10-30: klik sel MATI memindahkan fokus ke <body>, lalu
  // Escape tidak mengembalikan fokus ke sel grid.
  it('panel bisa difokus lewat kode (tabIndex -1, tanpa garis fokus) — klik di bagian mati tetap di dalam panel', () => {
    const akar = PANEL.slice(PANEL.indexOf('ref={setPanel}'), PANEL.indexOf('style={{', PANEL.indexOf('ref={setPanel}')))
    expect(akar).toContain('tabIndex={-1}')
    expect(akar).toContain('outline-none')
  })
})

describe('nilai STRING YYYY-MM-DD masuk dan keluar', () => {
  it('tanpa new Date(...) di komponen — konversi hanya lewat lib/ymd', () => {
    expect(KODE).not.toContain('new Date(')
    expect(SRC).toContain('onChange(localDateToYmd(date))')
    expect(SRC).toContain('const nilai = ymdSah(value) ? value : \'\'')
    expect(SRC).toContain('formatDate(ymdToLocalDate(nilai))')
  })

  it('min/max lewat batasSah (nilai rusak diabaikan), bulan awal lewat bulanAwalTampil', () => {
    expect(SRC).toContain('const batas = batasSah(min, max)')
    expect(SRC).toContain('bulanAwalTampil({ value: nilai, bulanAwal, batas, hariIni: localDateToYmd(TODAY) })')
  })
})

describe('satu klik = pilih + tutup, tanpa Terapkan', () => {
  it('klik tanggal memanggil onChange lalu menutup dengan fokus kembali', () => {
    const klik = SRC.slice(SRC.indexOf('const handleDayClick'), SRC.indexOf('const handleClear'))
    expect(klik).toContain('onChange(localDateToYmd(date))')
    expect(klik).toContain('tutup(true)')
    for (const s of ['Terapkan', 'Batal', 'tempRange']) expect(KODE, s).not.toContain(s)
  })
})

describe('bisa dikendalikan dari luar (grid: Alt+↓)', () => {
  it('open/onOpenChange: terkendali bila open diisi; keadaan sendiri hanya bila tidak', () => {
    expect(SRC).toContain('const terkendali = open !== undefined')
    expect(SRC).toContain('const isOpen = terkendali ? open : bukaSendiri')
    const ubah = SRC.slice(SRC.indexOf('const ubahBuka'), SRC.indexOf('/** Tutup;'))
    expect(ubah).toContain('if (!terkendali) setBukaSendiri(buka)')
    expect(ubah).toContain('onOpenChange?.(buka)')
  })

  it('panel dipasang hanya selama terbuka — bulan awal dihitung ulang tiap dibuka', () => {
    expect(SRC).toContain('{isOpen && (\n        <PanelTanggal')
    expect(SRC).toContain('const [view, setView] = useState(() => bulanAwalTampil(')
  })
})

describe('pemicu bisa diganti; fokus kembali ke elemen pilihan pemanggil', () => {
  it('pemicu pengganti menerima ref, type, aria-haspopup, aria-expanded, onClick', () => {
    const p = SRC.slice(SRC.indexOf('const pemicu: PemicuDatePicker = {'), SRC.indexOf('}', SRC.indexOf('const pemicu: PemicuDatePicker = {')))
    for (const s of ['ref: setPemicuEl', "type: 'button'", "'aria-haspopup': 'dialog'", "'aria-expanded': isOpen", 'onClick: () => ubahBuka(!isOpen)']) expect(p, s).toContain(s)
    expect(SRC).toContain('renderPemicu(pemicu)')
    // Pemicu bawaan memakai props yang SAMA.
    expect(SRC).toContain('{...pemicu}')
  })

  it('tutup: fokus ke fokusKembaliKe, selain itu ke pemicu — hanya bila diminta (pilihan / Escape dari dalam panel)', () => {
    const t = SRC.slice(SRC.indexOf('const tutup = '), SRC.indexOf('// Satu klik'))
    expect(t).toContain('if (kembalikanFokus) (fokusKembaliKe?.current ?? pemicuEl)?.focus()')
    expect(t).toContain('ubahBuka(false)')
  })

  it('jangkar posisi bisa diganti (sel grid); klik di pembungkus pemicu bukan "di luar"', () => {
    expect(SRC).toContain('jangkarRef={jangkarRef ?? wadahRef}')
    expect(SRC).toContain('wadahRef={wadahRef}')
  })
})

describe('pemicu bawaan = pemicu DateRangePicker (a11y PR #5 ikut berlaku)', () => {
  it('tombol hapus: tombol ASLI bernama, saudara pemicu, area sentuh 32px, kelas hover CSS', () => {
    const hapus = SRC.slice(SRC.indexOf('aria-label="Hapus tanggal"') - 200, SRC.indexOf('</button>', SRC.indexOf('aria-label="Hapus tanggal"')))
    for (const s of ['<button', 'type="button"', 'onClick={handleClear}', 'w-8 h-8', 'drp-clear', 'group-focus-visible:ring-2']) expect(hapus, s).toContain(s)
    const clear = SRC.slice(SRC.indexOf('const handleClear'), SRC.indexOf('const pemicu'))
    expect(clear).toContain("onChange('')")
    expect(clear).toContain('pemicuEl?.focus()')
  })

  it('pemicu punya cincin fokus; tidak ada hover inline', () => {
    expect(SRC).toContain('focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)')
    expect(KODE).not.toContain('e.currentTarget.style')
  })
})
