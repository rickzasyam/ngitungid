import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas components/date-range-picker.tsx — a11y sel tanggal
// (keputusan Ricko di CP-8, gotcha #3/#4 CLAUDE.md). Temuan uji klik: sel
// tanggal berupa <div onClick> — tanpa peran, tidak bisa difokus Tab, tidak
// bereaksi pada Enter/Spasi — dan panelnya di-portal ke ujung <body>, jadi
// dari tombol pemicu Tab tidak pernah sampai ke kalender.

const SRC = readFileSync(join(process.cwd(), 'components', 'date-range-picker.tsx'), 'utf8').replace(/\r\n/g, '\n')
// Sejak 2026-10-30 panel kalendernya (sel tanggal, fokus, Escape, navigasi
// panah) ada di komponen BERSAMA dengan DatePicker satu tanggal — assertion
// yang sama, dibaca di tempat kodenya sekarang tinggal.
const PANEL = readFileSync(join(process.cwd(), 'components', 'kalender-panel.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('sel tanggal bisa dipakai keyboard', () => {
  it('sel tanggal adalah TOMBOL ASLI — peran, fokus, dan Enter/Spasi dari browser', () => {
    expect(PANEL).toMatch(/<button\s+type="button"\s+key=\{colIdx\}\s+data-hari=""/)
    // Pemilih tanggal tidak lagi dipasang pada <div>.
    expect(PANEL).not.toMatch(/<div[^>]*\n[^<]*onClick=\{\(\) => onDayClick\(date\)\}/)
    const tombol = PANEL.slice(PANEL.indexOf('data-hari=""'), PANEL.indexOf('</button>', PANEL.indexOf('data-hari=""')))
    expect(tombol).toContain('onClick={() => onDayClick(date)}')
  })

  it('tiap sel punya nama tanggal lengkap, status terpilih, dan penanda hari ini', () => {
    expect(PANEL).toContain('aria-label={formatDayLabel(date)}')
    expect(PANEL).toContain("weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'")
    expect(PANEL).toContain('aria-pressed={isSelected}')
    expect(PANEL).toContain("aria-current={isToday ? 'date' : undefined}")
  })

  it('fokus menyalakan pratinjau rentang yang SAMA dengan hover (gotcha #4)', () => {
    expect(PANEL).toContain('onMouseEnter={() => onDayHover(date)}')
    // onFocus juga mencatat tanggal terfokus untuk roving tabindex — pratinjaunya tetap sama.
    const fokus = PANEL.slice(PANEL.indexOf('onFocus={() => {'), PANEL.indexOf('}}', PANEL.indexOf('onFocus={() => {')))
    expect(fokus).toContain('onDayHover(date)')
    expect(fokus).toContain('onDayFocus(date)')
    expect(PANEL).toContain('onMouseLeave={() => onDayHover(null)}')
    expect(PANEL).toContain('onBlur={() => onDayHover(null)}')
  })

  it('cincin fokus terlihat untuk keyboard', () => {
    expect(PANEL).toContain('group-focus-visible:ring-2')
  })

  it('DateRangePicker memakai panel bersama: dua bulan, mode rentang, tanpa batas', () => {
    const panel = SRC.slice(SRC.indexOf('<KalenderPanel'), SRC.indexOf('>', SRC.indexOf('onTutup=')))
    expect(panel).toContain('jumlahBulan={2}')
    expect(panel).toContain('range={tempRange}')
    for (const s of ['tunggal', 'batas=', 'isolasiEvent']) expect(panel, s).not.toContain(s)
  })
})

describe('fokus masuk dan keluar kalender', () => {
  it('saat dibuka, fokus pindah ke tanggal awal terpilih atau tanggal pertama', () => {
    expect(PANEL).toContain('button[data-hari][aria-pressed="true"]')
    // Tanpa tanggal terpilih: sel Tab bulan pertama (roving tabindex — hari ini atau tanggal 1).
    expect(PANEL).toContain("panel?.querySelector<HTMLButtonElement>('button[data-hari][tabindex=\"0\"]')")
    expect(PANEL).toContain('sasaran?.focus({ preventScroll: true })')
  })

  it('Batal & Terapkan mengembalikan fokus ke tombol pemicu', () => {
    expect(SRC).toContain('onClick={tutupKePemicu}')
    const apply = SRC.slice(SRC.indexOf('const handleApply'), SRC.indexOf('const handleClear'))
    expect(apply).toContain('tutupKePemicu()')
  })

  it('Escape mengembalikan fokus HANYA bila fokus sedang di dalam panel', () => {
    // Panel melaporkan apakah fokus ada di dalamnya; picker yang memindahkannya.
    expect(PANEL).toContain("if (e.key !== 'Escape') return")
    expect(PANEL).toContain('tutup.current(panelRef.current?.contains(document.activeElement) === true)')
    expect(SRC).toContain('if (kembalikanFokus) triggerRef.current?.focus()')
  })

  it('pemicu mengumumkan panelnya; panel dan tombol bulan bernama', () => {
    expect(SRC).toContain('aria-haspopup="dialog"')
    expect(SRC).toContain('aria-expanded={isOpen}')
    expect(PANEL).toContain('role="dialog"')
    expect(PANEL).toContain('aria-label={label}')
    expect(SRC).toContain('label="Pilih rentang tanggal"')
    expect(PANEL).toContain('aria-label="Bulan sebelumnya"')
    expect(PANEL).toContain('aria-label="Bulan berikutnya"')
  })
})

// ══ Utang a11y 2026-10-30: tombol hapus, hover CSS, navigasi panah ══════════
// ATURAN Ricko: cara komponen dipanggil TIDAK berubah — Stream A memakai picker
// yang sama di sel tanggal grid. Test pertama mengunci antarmukanya persis.
describe('antarmuka (props) tidak berubah', () => {
  it('DateRangePickerProps & DateRange persis seperti sebelumnya', () => {
    expect(SRC).toContain(`interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
}`)
    expect(SRC).toContain("export function DateRangePicker({ value, onChange, placeholder = 'Pilih periode laporan' }: DateRangePickerProps)")
  })
})

describe('tombol hapus terjangkau keyboard', () => {
  const pemicu = SRC.slice(SRC.indexOf('ref={triggerRef}'), SRC.indexOf('</button>', SRC.indexOf('ref={triggerRef}')))
  const hapus = SRC.slice(SRC.indexOf('aria-label="Hapus rentang tanggal"') - 200, SRC.indexOf('</button>', SRC.indexOf('aria-label="Hapus rentang tanggal"')))

  it('tombol ASLI bernama, SAUDARA pemicu — bukan <span onClick> di dalam tombol', () => {
    expect(hapus).toContain('<button')
    expect(hapus).toContain('type="button"')
    expect(hapus).toContain('onClick={handleClear}')
    expect(pemicu).not.toContain('handleClear')
    expect(pemicu).not.toContain('onClick={(e)')
    expect(SRC).not.toContain('e.stopPropagation(); handleClear()')
  })

  it('area sentuh 32px, cincin fokus terlihat, fokus kembali ke pemicu sesudah hapus', () => {
    expect(hapus).toContain('w-8 h-8')
    expect(hapus).toContain('group-focus-visible:ring-2')
    const clear = SRC.slice(SRC.indexOf('const handleClear'), SRC.indexOf('return (', SRC.indexOf('const handleClear')))
    expect(clear).toContain('triggerRef.current?.focus()')
  })

  it('pemicu punya type="button" dan cincin fokus', () => {
    expect(pemicu).toContain('type="button"')
    expect(pemicu).toContain('focus-visible:ring-2')
  })
})

describe('hover lewat kelas CSS, bukan onMouseEnter inline (gotcha #4)', () => {
  const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

  it('satu-satunya onMouseEnter/Leave yang tersisa = pratinjau rentang sel tanggal (berpasangan dengan onFocus/onBlur)', () => {
    expect([SRC.split('onMouseEnter=').length - 1, SRC.split('onMouseLeave=').length - 1]).toEqual([0, 0])
    const masuk = PANEL.split('onMouseEnter=').length - 1
    const keluar = PANEL.split('onMouseLeave=').length - 1
    expect([masuk, keluar]).toEqual([1, 1])
    for (const f of [SRC, PANEL]) {
      expect(f).not.toContain('e.currentTarget.style')
      expect(f).not.toContain('(e.currentTarget as HTMLElement).style')
    }
  })

  it('tiap kelas punya gaya hover DAN fokus di globals.css, di luar @layer', () => {
    expect(PANEL).toContain('drp-nav')
    for (const k of ['drp-batal', 'drp-terapkan', 'drp-clear']) expect(SRC, k).toContain(k)
    for (const sel of ['.drp-nav:hover', '.drp-nav:focus-visible', '.drp-batal:hover', '.drp-batal:focus-visible', '.drp-terapkan:not(:disabled):hover', '.drp-clear:hover .drp-clear-dot', '.drp-clear:focus-visible .drp-clear-dot']) {
      expect(CSS, sel).toContain(sel)
    }
    const awalLayer = CSS.indexOf('@layer utilities {')
    expect(CSS.indexOf('.drp-nav {')).toBeGreaterThan(awalLayer)
    // Bukan di dalam blok @layer utilities: blok itu ditutup sebelum kelas ini.
    const blok = CSS.slice(awalLayer, CSS.indexOf('.drp-nav {'))
    expect(blok.split('{').length).toBe(blok.split('}').length)
  })
})

describe('navigasi panah antar tanggal (roving tabindex)', () => {
  it('hanya satu sel Tab per bulan; panah ditangani lewat lib/kalender-keyboard', () => {
    expect(PANEL).toContain('tabIndex={date.getDate() === aktif ? 0 : -1}')
    expect(PANEL).toContain('data-tanggal={localDateToYmd(date)}')
    expect(PANEL).toContain('onKeyDown={e => onDayKeyDown(date, e)}')
    expect(PANEL).toContain('const arah = tujuanTombol(date, e.key, e.shiftKey)')
    expect(PANEL).toContain('e.preventDefault()')
    // Satu pembuat bulan untuk kedua bulan yang tampil: sel Tab dari hariAktif bulan itu.
    expect(PANEL).toContain('aktif={hariAktif(year, month, kandidatAktif, batas)}')
    expect(PANEL).toContain('{bulan(viewYear, viewMonth)}')
    expect(PANEL).toContain('{bulan(secondYear, secondMonth)}')
  })

  it('tujuan di luar bulan yang tampil → bulan tujuan jadi bulan pertama, fokus menyusul', () => {
    const k = PANEL.slice(PANEL.indexOf('const handleDayKeyDown'), PANEL.indexOf('const secondMonth'))
    expect(k).toContain('fokusTertunda.current = ymd')
    expect(k).toContain('onViewChange(tujuan.getFullYear(), tujuan.getMonth())')
    expect(PANEL).toContain('el.offsetParent !== null')
    // DateRangePicker meneruskan pergeseran itu ke tampilannya sendiri.
    expect(SRC).toContain('setViewYear(tahun)')
    expect(SRC).toContain('setViewMonth(bulan)')
  })
})
