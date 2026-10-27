'use client'

// SPIKE S0 (MP §5.G, D46) — branch `spike/grid-library`, TIDAK di-merge.
// react-data-grid@7.0.0-beta.63 dengan data sintetis. Mengukur enam kriteria
// S0; angkanya dibaca skrip spike/ukur-grid.mjs lewat window.__spike.

import 'react-data-grid/lib/styles.css'
import './spike-grid.css'

import { useMemo, useRef, useState } from 'react'
import {
  Cell,
  DataGrid,
  renderTextEditor,
  type Column,
  type DataGridHandle,
  type RenderCellProps,
  type RenderEditCellContentProps,
} from 'react-data-grid'
import { NominalInput } from '@/components/ui/nominal-input'
import { formatTampilan } from '@/lib/nominal-input'
import { bacaNominal } from '@/lib/nominal'
import { buatData, galatBaris, KOLOM_UANG, putusPertama, tempel, tsvSintetis, type BarisDraf, type Kolom } from './data'

type Ukur = { label: string; ms: number; detail?: Record<string, number | string | null> }

declare global {
  interface Window {
    __spike?: { ukur: Ukur[] }
  }
}

function catat(u: Ukur) {
  window.__spike ??= { ukur: [] }
  window.__spike.ukur.push(u)
}

const JUDUL: Record<Kolom, string> = {
  tanggal: 'Tanggal',
  uraian: 'Uraian',
  masuk: 'Masuk',
  keluar: 'Keluar',
  saldo: 'Saldo',
  akunLawan: 'Akun lawan',
  catatan: 'Catatan',
}

const tampilUang = (v: string) => {
  if (v === '') return ''
  const h = bacaNominal(v)
  return h.status === 'ok' ? formatTampilan(h.nilai, 2) : v
}

function EditorNominal({ row, column, onRowChange, onClose }: RenderEditCellContentProps<BarisDraf>) {
  const k = column.key as Kolom
  return (
    <NominalInput
      autoFocus
      onFocus={e => e.currentTarget.select()}
      className="spike-editor spike-editor-uang"
      aria-label={JUDUL[k]}
      value={row[k]}
      onChange={v => onRowChange({ ...row, [k]: v })}
      onBlur={() => onClose(true, false)}
    />
  )
}

const idGalat = (row: BarisDraf, k: string) => `galat-${row.kunci}-${k}`

const kolom: readonly Column<BarisDraf>[] = (['tanggal', 'uraian', 'masuk', 'keluar', 'saldo', 'akunLawan', 'catatan'] as const).map(
  (k): Column<BarisDraf> => ({
    key: k,
    name: JUDUL[k],
    width: k === 'uraian' ? 320 : k === 'tanggal' ? 110 : 150,
    resizable: true,
    cellClass: row => {
      const g = galatBaris(row)?.[k]
      return [KOLOM_UANG.has(k) ? 'sel-uang' : '', g ? 'sel-galat' : ''].join(' ') || undefined
    },
    renderCell: ({ row }) => {
      const g = galatBaris(row)?.[k]
      return (
        <>
          {KOLOM_UANG.has(k) ? tampilUang(row[k]) : row[k]}
          {/* `hidden`: tidak ikut NAMA sel (nilai saja), tapi tetap dibaca
              sebagai DESKRIPSI lewat aria-describedby — elemen tersembunyi
              yang dirujuk tetap dipakai dalam perhitungan deskripsi. */}
          {g && (
            <span id={idGalat(row, k)} hidden>
              {g}
            </span>
          )}
        </>
      )
    },
    renderEditCell: KOLOM_UANG.has(k) ? EditorNominal : renderTextEditor,
  })
)

// Atribut galat dipasang di sel role=gridcell itu sendiri (Cell menyebar
// props ekstra ke div-nya), supaya pembaca layar membacanya saat sel fokus.
function renderSel(key: React.Key, props: RenderCellProps<BarisDraf, unknown>) {
  const g = galatBaris(props.row)?.[props.column.key as Kolom]
  return (
    <Cell
      key={key}
      {...props}
      aria-invalid={g ? true : undefined}
      aria-describedby={g ? idGalat(props.row, props.column.key) : undefined}
    />
  )
}

export default function GridSpike() {
  const [rows, setRows] = useState<BarisDraf[]>(() => {
    const t0 = performance.now()
    const data = buatData(20_000)
    catat({ label: 'buat-data-20000', ms: performance.now() - t0 })
    return data
  })
  const [pesan, setPesan] = useState('')
  const grid = useRef<DataGridHandle>(null)
  const aktif = useRef<{ rowIdx: number; idx: number }>({ rowIdx: 0, idx: 0 })

  const ringkas = useMemo(() => {
    let galat = 0
    for (const r of rows) if (galatBaris(r)) galat++
    return { galat, putus: putusPertama(rows) }
  }, [rows])

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.rdg-editor-container')) return // NominalInput/teks menangani tempelnya sendiri
    if (!target.closest('.rdg')) return
    const teks = e.clipboardData.getData('text/plain')
    if (teks === '') return
    e.preventDefault()
    e.stopPropagation()
    const t0 = performance.now()
    const { rows: baru, jumlah } = tempel(rows, teks, aktif.current.rowIdx, aktif.current.idx)
    const t1 = performance.now()
    let galat = 0
    for (const r of baru) if (galatBaris(r)) galat++
    const putus = putusPertama(baru)
    const t2 = performance.now()
    setRows(baru)
    // Dua rAF: yang pertama jalan sesudah commit React, yang kedua sesudah paint.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const t3 = performance.now()
        const u: Ukur = {
          label: `tempel-${jumlah}`,
          ms: t3 - t0,
          detail: { parseTerapkan: t1 - t0, validasiRantai: t2 - t1, renderSampaiPaint: t3 - t2, galat, putusDi: putus?.indeks ?? null },
        }
        catat(u)
        setPesan(
          `${jumlah.toLocaleString('id-ID')} baris ditempel dalam ${Math.round(u.ms).toLocaleString('id-ID')} ms. ` +
            `${galat.toLocaleString('id-ID')} baris bergalat.` +
            (putus ? ` Saldo putus di baris ${(putus.indeks + 1).toLocaleString('id-ID')}.` : '')
        )
      })
    )
  }

  const salinSintetis = async (n: number) => {
    try {
      await navigator.clipboard.writeText(tsvSintetis(n))
      setPesan(`${n.toLocaleString('id-ID')} baris TSV sintetis disalin. Klik sel lalu Ctrl+V.`)
    } catch {
      setPesan('Clipboard ditolak browser.')
    }
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="spike-btn" onClick={() => setRows(buatData(20_000))}>
          Muat 20.000 baris
        </button>
        <button type="button" className="spike-btn" onClick={() => setRows([])}>
          Kosongkan grid
        </button>
        <button type="button" className="spike-btn" onClick={() => void salinSintetis(10_000)}>
          Salin 10.000 baris TSV
        </button>
        <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {rows.length.toLocaleString('id-ID')} baris · {ringkas.galat.toLocaleString('id-ID')} bergalat
          {ringkas.putus && ` · saldo putus di baris ${(ringkas.putus.indeks + 1).toLocaleString('id-ID')}`}
        </span>
      </div>
      <p role="status" aria-live="polite" className="text-sm min-h-5" data-testid="pesan">
        {pesan}
      </p>
      <div className="min-h-0 min-w-0 flex-1" onPasteCapture={onPaste}>
        <DataGrid
          ref={grid}
          aria-label="Mutasi kas (spike)"
          className="spike-rdg"
          columns={kolom}
          rows={rows}
          rowKeyGetter={r => r.kunci}
          onRowsChange={setRows}
          rowHeight={36}
          // Tanpa onCellPaste, Ctrl+V di sel aktif dianggap ketikan dan MEMBUKA
          // editor — seluruh TSV masuk ke satu sel. Tempel sebenarnya ditangani
          // onPasteCapture di pembungkus; ini hanya mematikan perilaku itu.
          onCellPaste={({ row }) => row}
          onCellKeyDown={(args, e) => {
            // Ctrl+Home bawaan pindah ke sel JUDUL (selalu terlihat karena sticky),
            // jadi grid tidak bergulir ke atas. Spreadsheet: Ctrl+Home = sel data pertama.
            // Delete/Backspace di sel aktif = kosongkan sel (spreadsheet), bukan buka editor.
            if (args.mode === 'ACTIVE' && args.column && (e.key === 'Delete' || e.key === 'Backspace')) {
              e.preventGridDefault()
              e.preventDefault()
              const k = args.column.key as Kolom
              const i = args.rowIdx
              setRows(rs => rs.with(i, { ...rs[i], [k]: '' }))
              return
            }
            if (args.mode === 'ACTIVE' && (e.ctrlKey || e.metaKey) && e.key === 'Home') {
              e.preventGridDefault()
              e.preventDefault()
              args.setActivePosition({ idx: 0, rowIdx: 0 }, { shouldFocus: true })
            }
          }}
          onActivePositionChange={({ rowIdx, column }) => {
            aktif.current = { rowIdx: Math.max(0, rowIdx), idx: column?.idx ?? 0 }
          }}
          renderers={{ renderCell: renderSel, noRowsFallback: <div className="p-4 text-sm">Belum ada baris. Tempel dari Excel.</div> }}
        />
      </div>
    </div>
  )
}
