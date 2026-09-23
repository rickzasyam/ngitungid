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
    expect(SRC).toContain('onFocus={() => onDayHover(date)}')
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
    expect(SRC).toContain("panel?.querySelector<HTMLButtonElement>('button[data-hari]')")
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
