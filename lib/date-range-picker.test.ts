import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test STRUKTURAL atas components/date-range-picker.tsx — a11y sel tanggal
// (keputusan Ricko di CP-8, gotcha #3/#4 CLAUDE.md). Temuan uji klik: sel
// tanggal berupa <div onClick> — tanpa peran, tidak bisa difokus Tab, tidak
// bereaksi pada Enter/Spasi — dan panelnya di-portal ke ujung <body>, jadi
// dari tombol pemicu Tab tidak pernah sampai ke kalender.

const SRC = readFileSync(join(process.cwd(), 'components', 'date-range-picker.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('sel tanggal bisa dipakai keyboard', () => {
  it('sel tanggal adalah TOMBOL ASLI — peran, fokus, dan Enter/Spasi dari browser', () => {
    expect(SRC).toMatch(/<button\s+type="button"\s+key=\{colIdx\}\s+data-hari=""/)
    // Pemilih tanggal tidak lagi dipasang pada <div>.
    expect(SRC).not.toMatch(/<div[^>]*\n[^<]*onClick=\{\(\) => onDayClick\(date\)\}/)
    const tombol = SRC.slice(SRC.indexOf('data-hari=""'), SRC.indexOf('</button>', SRC.indexOf('data-hari=""')))
    expect(tombol).toContain('onClick={() => onDayClick(date)}')
  })

  it('tiap sel punya nama tanggal lengkap, status terpilih, dan penanda hari ini', () => {
    expect(SRC).toContain('aria-label={formatDayLabel(date)}')
    expect(SRC).toContain("weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'")
    expect(SRC).toContain('aria-pressed={isSelected}')
    expect(SRC).toContain("aria-current={isToday ? 'date' : undefined}")
  })

  it('fokus menyalakan pratinjau rentang yang SAMA dengan hover (gotcha #4)', () => {
    expect(SRC).toContain('onMouseEnter={() => onDayHover(date)}')
    // onFocus juga mencatat tanggal terfokus untuk roving tabindex — pratinjaunya tetap sama.
    const fokus = SRC.slice(SRC.indexOf('onFocus={() => {'), SRC.indexOf('}}', SRC.indexOf('onFocus={() => {')))
    expect(fokus).toContain('onDayHover(date)')
    expect(fokus).toContain('onDayFocus(date)')
    expect(SRC).toContain('onMouseLeave={() => onDayHover(null)}')
    expect(SRC).toContain('onBlur={() => onDayHover(null)}')
  })

  it('cincin fokus terlihat untuk keyboard', () => {
    expect(SRC).toContain('group-focus-visible:ring-2')
  })
})

describe('fokus masuk dan keluar kalender', () => {
  it('saat dibuka, fokus pindah ke tanggal awal terpilih atau tanggal pertama', () => {
    expect(SRC).toContain('button[data-hari][aria-pressed="true"]')
    // Tanpa tanggal terpilih: sel Tab bulan pertama (roving tabindex — hari ini atau tanggal 1).
    expect(SRC).toContain("panel?.querySelector<HTMLButtonElement>('button[data-hari][tabindex=\"0\"]')")
    expect(SRC).toContain('sasaran?.focus({ preventScroll: true })')
  })

  it('Batal & Terapkan mengembalikan fokus ke tombol pemicu', () => {
    expect(SRC).toContain('onClick={tutupKePemicu}')
    const apply = SRC.slice(SRC.indexOf('const handleApply'), SRC.indexOf('const handleClear'))
    expect(apply).toContain('tutupKePemicu()')
  })

  it('Escape mengembalikan fokus HANYA bila fokus sedang di dalam panel', () => {
    expect(SRC).toContain('if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus()')
  })

  it('pemicu mengumumkan panelnya; panel dan tombol bulan bernama', () => {
    expect(SRC).toContain('aria-haspopup="dialog"')
    expect(SRC).toContain('aria-expanded={isOpen}')
    expect(SRC).toContain('role="dialog"')
    expect(SRC).toContain('aria-label="Bulan sebelumnya"')
    expect(SRC).toContain('aria-label="Bulan berikutnya"')
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
    const masuk = SRC.split('onMouseEnter=').length - 1
    const keluar = SRC.split('onMouseLeave=').length - 1
    expect([masuk, keluar]).toEqual([1, 1])
    expect(SRC).not.toContain('e.currentTarget.style')
    expect(SRC).not.toContain('(e.currentTarget as HTMLElement).style')
  })

  it('tiap kelas punya gaya hover DAN fokus di globals.css, di luar @layer', () => {
    for (const k of ['drp-nav', 'drp-batal', 'drp-terapkan', 'drp-clear']) expect(SRC, k).toContain(k)
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
    expect(SRC).toContain('tabIndex={date.getDate() === aktif ? 0 : -1}')
    expect(SRC).toContain('data-tanggal={localDateToYmd(date)}')
    expect(SRC).toContain('onKeyDown={e => onDayKeyDown(date, e)}')
    expect(SRC).toContain('const tujuan = tujuanTombol(date, e.key, e.shiftKey)')
    expect(SRC).toContain('e.preventDefault()')
    expect(SRC).toContain('aktif={hariAktif(viewYear, viewMonth, kandidatAktif)}')
    expect(SRC).toContain('aktif={hariAktif(secondYear, secondMonth, kandidatAktif)}')
  })

  it('tujuan di luar bulan yang tampil → bulan tujuan jadi bulan pertama, fokus menyusul', () => {
    const k = SRC.slice(SRC.indexOf('const handleDayKeyDown'), SRC.indexOf('const tutupKePemicu'))
    expect(k).toContain('fokusTertunda.current = ymd')
    expect(k).toContain('setViewYear(tujuan.getFullYear())')
    expect(k).toContain('setViewMonth(tujuan.getMonth())')
    expect(SRC).toContain('el.offsetParent !== null')
  })
})
