'use client'

// Grid mutasi kas (MP §5.G S9) — PRESENTASI SAJA. Semua keputusan ada di luar:
// draf & kunci di reducer S6, galat di validator S2, rantai saldo di S3,
// usulan di S4/S5, status/sisa/kunci dari server (S8). Komponen ini memetakan
// hasilnya ke sel dan meneruskan ketikan/tempelan kembali sebagai aksi.
//
// ══ TAMBALAN S0 (react-data-grid 7.0.0-beta.63, docs/plans/hasil-spike-…) ══
// 1. `onCellPaste` no-op — tanpanya Ctrl+V membuka editor dan seluruh TSV
//    masuk ke SATU sel. Tempel sebenarnya ditangani `onPasteCapture` pembungkus.
// 2. Ctrl+Home bawaan berhenti di sel JUDUL → dipindah ke sel data pertama.
// 3. Delete/Backspace bawaan membuka editor → mengosongkan sel (spreadsheet).
// 4. Galat lewat span `hidden` + `aria-describedby`: NAMA sel = nilainya,
//    DESKRIPSI = galatnya (span `sr-only` menggandakan nama sel).
//
// ══ ENTER SEPERTI EXCEL (Ricko, CP-19) ═════════════════════════════════════
// Enter di sel aktif = turun satu baris; Enter di editor = simpan lalu turun;
// Shift+Enter = naik. Menyunting: ketik langsung (menimpa) atau F2.
//
// ══ ALT+↓ (masukan Ricko 2026-10-30) ═══════════════════════════════════════
// Di sel Tanggal membuka kalender (date-range-picker yang sudah ada); di sel
// Nama Akun membuka daftar akun penuh. Ikon ▾/kalender muncul di baris yang
// aktif atau di-hover.

import 'react-data-grid/lib/styles.css'
import './grid-mutasi.css'

import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import {
  Cell,
  DataGrid,
  type Column,
  type DataGridHandle,
  type RenderCellProps,
  type RenderEditCellContentProps,
} from 'react-data-grid'
import Link from 'next/link'
import { ChevronDown, Lock } from 'lucide-react'
import { NominalInput } from '@/components/ui/nominal-input'
import { fromMinorUnits, hrefJurnal, toMinorUnits } from '@/lib/journal'
import {
  KOLOM_GRID,
  LABEL_KOLOM,
  bacaSaldoSel,
  bacaUangSel,
  nominalKeSel,
  type HasilValidasi,
  type IndeksAkun,
  type KolomGrid,
} from '@/lib/mutasi-draf'
import { alasanTerkunci, type BarisGrid } from '@/lib/mutasi-grid-state'
import { labelAkun, type GalatServerBaris, type RantaiGrid, type Usulan } from '@/lib/mutasi-grid-turunan'
import { bacaTanggalGrid, tampilTanggalSel, type BulanGrid } from '@/lib/mutasi-tanggal'
import { KalenderSel, bukaKalenderDi } from './kalender-sel'
import { KomboAkun, type AkunPilihan, type CaraPilih } from './kombo-akun'

export type InfoServerBaris = {
  status: string
  sisa: string
  jumlahAlokasi: number
  journalId: string | null
  jurnalStatus: 'draft' | 'posted' | null
  jurnalDibalik: boolean
}

export type KonteksTampilan = {
  validasi: (b: BarisGrid) => HasilValidasi
  galatServer: ReadonlyMap<string, GalatServerBaris>
  rantai: RantaiGrid
  usulan: ReadonlyMap<string, Usulan>
  bentrok: ReadonlyMap<string, number>
  duplikat: ReadonlySet<string>
  diubah: ReadonlySet<string>
  infoServer: ReadonlyMap<string, InfoServerBaris>
  indeksAkun: IndeksAkun
  /** Nomor baris di grid UTUH (1-based) — tetap benar saat filter menyala. */
  nomorBaris: (kunci: string) => number
  bolehTulis: boolean
  /** Boleh membuka /jurnal (owner + akunting; finance tidak — ACCOUNTING_ONLY_PREFIXES). */
  bolehLihatJurnal: boolean
  /** Berapa baris grid berbagi satu jurnal — >1 = jurnal ringkasan (D58). */
  jumlahPerJurnal: ReadonlyMap<string, number>
  /** Bulan grid — pemutus tanggal ambigu & tampilan "15 Okt 2026" (D66). */
  bulanGrid: BulanGrid
  /** Pilihan combobox Nama Akun — tanpa akun kas grid ini sendiri. */
  daftarAkun: readonly AkunPilihan[]
}

export type PosisiAktif = { kunci: string | null; kolom: KolomGrid | null }

type Props = {
  baris: readonly BarisGrid[]
  konteks: KonteksTampilan
  labelGrid: string
  idBantuan: string
  /** Kolom opsional yang disembunyikan lewat "Atur kolom" (kolom inti tidak bisa). */
  sembunyi: ReadonlySet<KolomGrid>
  gridRef: RefObject<DataGridHandle | null>
  onUbahSel: (kunci: string, kolom: KolomGrid, nilai: string) => void
  onTempel: (teks: string, posisi: PosisiAktif) => void
  onUndo: () => void
  onRedo: () => void
  onAktif: (p: PosisiAktif) => void
}

const UANG = new Set<KolomGrid>(['masuk', 'keluar', 'saldo'])
const LEBAR: Record<KolomGrid, number> = {
  tanggal: 124,
  akunLawan: 240,
  uraian: 320,
  masuk: 132,
  keluar: 132,
  saldo: 144,
  catatan: 170,
}

const idGalat = (kunci: string, k: string) => `gm-galat-${kunci}-${k}`

/** Teks sel uang untuk TAMPILAN: format Indonesia bila terbaca, apa adanya bila tidak. */
function tampilUang(k: KolomGrid, teks: string): string {
  if (teks.trim() === '') return ''
  const h = k === 'saldo' ? bacaSaldoSel(teks) : bacaUangSel(teks)
  if (h.status !== 'ok') return teks
  const neg = h.minor < 0
  return (neg ? '-' : '') + nominalKeSel(fromMinorUnits(Math.abs(h.minor)))
}

type InfoSel = {
  isi: ReactNode
  galat: string | null
  deskripsi: string | null
  kelas: string
}

function infoSel(b: BarisGrid, k: KolomGrid, kt: KonteksTampilan): InfoSel {
  const v = kt.validasi(b)
  const kelas: string[] = []
  if (UANG.has(k)) kelas.push('gm-uang')
  const galat =
    v.galat[k] ??
    kt.galatServer.get(b.kunci)?.[k] ??
    (k === 'saldo' ? (kt.rantai.putus.get(b.kunci)?.pesan ?? null) : null)
  if (galat) kelas.push('gm-galat')
  const kunci = alasanTerkunci(b, k)
  const deskripsi: string[] = []
  if (kunci) {
    kelas.push('gm-terkunci')
    deskripsi.push(`Terkunci: ${kunci}`)
  }
  let isi: ReactNode = UANG.has(k)
    ? tampilUang(k, b.sel[k])
    : k === 'akunLawan'
      ? labelAkun(b.sel[k], kt.indeksAkun)
      : k === 'tanggal'
        ? tampilTanggalSel(b.sel[k], kt.bulanGrid)
        : b.sel[k]
  if (k === 'akunLawan' && b.sel.akunLawan.trim() === '') {
    const u = kt.usulan.get(b.kunci)
    if (u) {
      kelas.push('gm-usulan')
      isi = labelAkun(u.akunLawan, kt.indeksAkun)
      deskripsi.push(`${u.label} — belum diterapkan; pakai "Terapkan usulan".`)
    } else if (kt.bentrok.has(b.kunci)) {
      deskripsi.push(`${kt.bentrok.get(b.kunci)} aturan setara mengusulkan akun berbeda — tidak diusulkan.`)
    }
  }
  if (k === 'saldo' && b.saldoDikosongkan !== null && b.sel.saldo.trim() === '') {
    isi = (
      <>
        <span className="gm-dicoret">{tampilUang('saldo', b.saldoDikosongkan)}</span>
        <span className="gm-penanda gm-penanda-lilac">dikosongkan</span>
      </>
    )
    deskripsi.push(`Saldo dokumen ${tampilUang('saldo', b.saldoDikosongkan)} dikosongkan — tercatat di riwayat saat Simpan.`)
  }
  if (kunci) {
    isi = (
      <>
        <Lock className="gm-gembok" size={12} aria-hidden="true" />
        {isi}
      </>
    )
  }
  return { isi, galat: galat ?? null, deskripsi: deskripsi.length ? deskripsi.join(' ') : null, kelas: kelas.join(' ') }
}

// ── Editor ───────────────────────────────────────────────────

function EditorTeks({ row, column, onRowChange, onClose }: RenderEditCellContentProps<BarisGrid>) {
  const k = column.key as KolomGrid
  return (
    <input
      autoFocus
      className="gm-editor"
      aria-label={LABEL_KOLOM[k]}
      value={row.sel[k]}
      onFocus={e => e.currentTarget.select()}
      onChange={e => onRowChange({ ...row, sel: { ...row.sel, [k]: e.target.value } })}
      onBlur={() => onClose(true, false)}
    />
  )
}

/** Masuk/Keluar: NominalInput (N9) — nilai kanonik ↔ teks sel format Indonesia. */
function EditorUang({ row, column, onRowChange, onClose }: RenderEditCellContentProps<BarisGrid>) {
  const k = column.key as KolomGrid
  const h = bacaUangSel(row.sel[k])
  const nilai = h.status === 'ok' ? fromMinorUnits(h.minor) : h.status === 'kosong' ? '' : row.sel[k]
  return (
    <NominalInput
      autoFocus
      className="gm-editor gm-editor-uang"
      aria-label={LABEL_KOLOM[k]}
      value={nilai}
      onFocus={e => e.currentTarget.select()}
      onChange={v => {
        const minor = v === '' ? null : toMinorUnits(v)
        const teks = v === '' ? '' : minor === null ? v : nominalKeSel(fromMinorUnits(minor))
        onRowChange({ ...row, sel: { ...row.sel, [k]: teks } })
      }}
      onBlur={() => onClose(true, false)}
    />
  )
}

// Editor dirender react-data-grid sebagai KOMPONEN; identitasnya harus tetap
// selama menyunting (identitas baru = editor dipasang ulang, ketikan & fokus
// hilang). Karena itu data yang berubah-ubah datang lewat konteks, bukan
// closure fungsi pembuat.
type KonteksEditor = {
  daftarAkun: readonly AkunPilihan[]
  /** Sesudah akun dipilih lewat combobox: pindah seperti Enter/Tab biasa. */
  lanjut: (cara: CaraPilih, rowIdx: number, idx: number) => void
}
const KonteksEditorAkun = createContext<KonteksEditor>({ daftarAkun: [], lanjut: () => {} })

/** Nama Akun: combobox buatan sendiri (bukan daftar bawaan browser). Pilihan = kode akun; ketikan bebas tetap boleh (divalidasi). */
function EditorAkun({ row, column, rowIdx, onRowChange, onClose }: RenderEditCellContentProps<BarisGrid>) {
  const { daftarAkun, lanjut } = useContext(KonteksEditorAkun)
  return (
    <KomboAkun
      autoFocus
      selaluTerbuka
      akun={daftarAkun}
      className="gm-editor"
      label="Nama Akun — ketik kode atau nama; Alt+panah bawah untuk daftar penuh"
      nilai={row.sel.akunLawan}
      onNilai={t => onRowChange({ ...row, sel: { ...row.sel, akunLawan: t } })}
      onPilih={(a, cara) => {
        // commit=true: baris baru langsung disimpan bersama pilihannya — onClose
        // di sini akan menyimpan baris LAMA (belum ter-render ulang).
        onRowChange({ ...row, sel: { ...row.sel, akunLawan: a.kode } }, true)
        lanjut(cara, rowIdx, column.idx)
      }}
      onBlur={() => onClose(true, false)}
    />
  )
}

// ── Kolom baca-saja ──────────────────────────────────────────

const KELAS_STATUS: Record<string, string> = {
  'belum dijurnal': 'gm-status-kritis',
  sebagian: 'gm-status-sebagian',
  selesai: 'gm-status-selesai',
}

function SelStatus({ b, kt }: { b: BarisGrid; kt: KonteksTampilan }) {
  const tanda: ReactNode[] = []
  if (kt.duplikat.has(b.kunci)) tanda.push(<span key="d" className="gm-penanda">duplikat?</span>)
  if (b.id === null) {
    return (
      <>
        <span className="gm-status gm-status-netral">baru</span>
        {tanda}
      </>
    )
  }
  const info = kt.infoServer.get(b.id)
  return (
    <>
      {kt.diubah.has(b.kunci) ? (
        <span className="gm-status gm-status-sebagian">diubah</span>
      ) : info ? (
        <span className={`gm-status ${KELAS_STATUS[info.status] ?? 'gm-status-netral'}`}>{info.status}</span>
      ) : null}
      {info && info.jumlahAlokasi > 0 && <span className="gm-penanda gm-penanda-lilac">{info.jumlahAlokasi} alokasi</span>}
      {info?.jurnalStatus === 'posted' && !info.jurnalDibalik && <span className="gm-penanda gm-penanda-lilac">terposting</span>}
      {/* Tautan ke jurnal baris ini (CP-20). tabIndex -1: sel grid bukan tempat
          berhenti Tab; jalur keyboardnya tombol "Buka jurnal" di bilah alat. */}
      {info?.journalId && kt.bolehLihatJurnal && (
        <Link className="gm-tautan" href={hrefJurnal(info.journalId)} tabIndex={-1}>
          {(kt.jumlahPerJurnal.get(info.journalId) ?? 1) > 1
            ? `jurnal ringkasan (${kt.jumlahPerJurnal.get(info.journalId)} baris) ↗`
            : 'jurnal ↗'}
        </Link>
      )}
      {tanda}
    </>
  )
}

export default function GridMutasi({ baris, konteks, labelGrid, idBantuan, sembunyi, gridRef, onUbahSel, onTempel, onUndo, onRedo, onAktif }: Props) {
  const aktif = useRef<PosisiAktif>({ kunci: null, kolom: null })

  const kolom = useMemo((): readonly Column<BarisGrid>[] => {
    const kt = konteks
    const bolehSunting = (b: BarisGrid, k: KolomGrid) => kt.bolehTulis && alasanTerkunci(b, k) === null
    const data = KOLOM_GRID.filter(k => !sembunyi.has(k)).map(
      (k): Column<BarisGrid> => ({
        key: k,
        name: LABEL_KOLOM[k],
        width: LEBAR[k],
        resizable: true,
        editable: b => bolehSunting(b, k),
        cellClass: b => {
          const kelas = infoSel(b, k, kt).kelas
          // Ruang untuk ikon ▾/kalender supaya teks tidak tertindih.
          const picu = (k === 'tanggal' || k === 'akunLawan') && bolehSunting(b, k) ? 'gm-ber-picu' : ''
          return [kelas, picu].filter(Boolean).join(' ') || undefined
        },
        renderCell: ({ row, rowIdx, column }) => {
          const i = infoSel(row, k, kt)
          return (
            <>
              {i.isi}
              {k === 'tanggal' && bolehSunting(row, k) && (
                <KalenderSel
                  ymd={tanggalPasti(row.sel.tanggal, kt.bulanGrid)}
                  bulanGrid={kt.bulanGrid}
                  onPilih={ymd => onUbahSel(row.kunci, 'tanggal', ymd)}
                />
              )}
              {k === 'akunLawan' && bolehSunting(row, k) && (
                // Jalur MOUSE ke daftar penuh; jalur keyboard & pembaca layar adalah
                // Alt+↓ (bantuan grid). aria-hidden + tabIndex -1: tidak menambah
                // bacaan sel dan bukan tempat berhenti Tab.
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  title="Buka daftar Nama Akun (Alt+↓)"
                  className="gm-picu gm-panah"
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => {
                    e.stopPropagation()
                    gridRef.current?.setActivePosition({ idx: column.idx, rowIdx }, { enableEditor: true, shouldFocus: true })
                  }}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              )}
              {i.galat && (
                <span id={idGalat(row.kunci, k)} hidden>
                  {i.galat}
                </span>
              )}
            </>
          )
        },
        renderEditCell: k === 'masuk' || k === 'keluar' ? EditorUang : k === 'akunLawan' ? EditorAkun : EditorTeks,
      })
    )
    const nomor: Column<BarisGrid> = {
      key: 'nomor',
      name: '#',
      width: 64,
      frozen: true,
      resizable: false,
      cellClass: () => 'gm-nomor',
      renderCell: ({ row }) => {
        const v = kt.validasi(row)
        const galatBaris = [...v.galatBaris, ...(kt.galatServer.get(row.kunci)?.baris ? [kt.galatServer.get(row.kunci)!.baris!] : [])]
        return (
          <>
            {kt.nomorBaris(row.kunci).toLocaleString('id-ID')}
            {galatBaris.length > 0 && (
              <span id={idGalat(row.kunci, 'nomor')} hidden>
                {galatBaris.join(' ')}
              </span>
            )}
          </>
        )
      },
    }
    const status: Column<BarisGrid> = {
      key: 'status',
      name: 'Status',
      width: 190,
      resizable: true,
      renderCell: ({ row }) => <SelStatus b={row} kt={kt} />,
    }
    return [nomor, ...data, status]
  }, [konteks, sembunyi, gridRef, onUbahSel])

  const jumlahBaris = baris.length
  const konteksEditor = useMemo(
    (): KonteksEditor => ({
      daftarAkun: konteks.daftarAkun,
      lanjut: (cara, rowIdx, idx) => {
        const g = gridRef.current
        if (!g) return
        if (cara === 'enter') g.setActivePosition({ idx, rowIdx: Math.min(rowIdx + 1, jumlahBaris - 1) }, { shouldFocus: true })
        else if (cara === 'tab') g.setActivePosition({ idx: Math.min(idx + 1, kolom.length - 1), rowIdx }, { shouldFocus: true })
        else if (cara === 'tab-mundur') g.setActivePosition({ idx: Math.max(idx - 1, 0), rowIdx }, { shouldFocus: true })
      },
    }),
    [konteks.daftarAkun, gridRef, kolom.length, jumlahBaris]
  )

  // Atribut a11y dipasang di sel role=gridcell itu sendiri (Cell menyebar
  // props ekstra ke div-nya) supaya pembaca layar membacanya saat sel fokus.
  const renderSel = (key: React.Key, props: RenderCellProps<BarisGrid, unknown>) => {
    const k = props.column.key
    if (k === 'nomor') {
      const v = konteks.validasi(props.row)
      const ada = v.galatBaris.length > 0 || Boolean(konteks.galatServer.get(props.row.kunci)?.baris)
      return (
        <Cell
          key={key}
          {...props}
          aria-invalid={ada || undefined}
          aria-describedby={ada ? idGalat(props.row.kunci, 'nomor') : undefined}
        />
      )
    }
    if (!(KOLOM_GRID as readonly string[]).includes(k)) return <Cell key={key} {...props} />
    const i = infoSel(props.row, k as KolomGrid, konteks)
    return (
      <Cell
        key={key}
        {...props}
        aria-invalid={i.galat ? true : undefined}
        aria-describedby={i.galat ? idGalat(props.row.kunci, k) : undefined}
        aria-description={i.deskripsi ?? undefined}
      />
    )
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.rdg-editor-container')) return // editor menangani tempelnya sendiri
    const teks = e.clipboardData.getData('text/plain')
    if (teks === '') return
    e.preventDefault()
    e.stopPropagation()
    onTempel(teks, aktif.current)
  }

  return (
    <KonteksEditorAkun.Provider value={konteksEditor}>
    <div className="min-h-0 min-w-0 flex-1 flex" onPasteCapture={onPaste}>
      <DataGrid
        ref={gridRef}
        aria-label={labelGrid}
        aria-describedby={idBantuan}
        className="grid-mutasi flex-1"
        columns={kolom}
        rows={baris}
        rowKeyGetter={r => r.kunci}
        rowHeight={34}
        headerRowHeight={36}
        rowClass={r => (r.id === null ? 'gm-baris-baru' : undefined)}
        onRowsChange={(rows, data) => {
          const k = data.column.key as KolomGrid
          for (const i of data.indexes) onUbahSel(rows[i].kunci, k, rows[i].sel[k])
        }}
        onCellPaste={({ row }) => row}
        onCellCopy={({ row, column }, e) => {
          if (!(KOLOM_GRID as readonly string[]).includes(column.key)) return
          e.clipboardData.setData('text/plain', row.sel[column.key as KolomGrid])
          e.preventDefault()
        }}
        onActivePositionChange={({ row, column }) => {
          const k = column && (KOLOM_GRID as readonly string[]).includes(column.key) ? (column.key as KolomGrid) : null
          aktif.current = { kunci: row?.kunci ?? null, kolom: k }
          onAktif(aktif.current)
        }}
        onCellKeyDown={(args, e) => {
          const ctrl = e.ctrlKey || e.metaKey
          if (e.altKey && e.key === 'ArrowDown' && args.column?.key === 'tanggal') {
            e.preventGridDefault()
            e.preventDefault()
            if (!konteks.bolehTulis || alasanTerkunci(args.row, 'tanggal') !== null) return
            const selAktif = () => gridRef.current?.element?.querySelector('.rdg-cell[aria-selected="true"]') ?? null
            if (args.mode === 'EDIT') {
              // Simpan ketikan dulu; kalender dibuka dari sel yang sudah kembali tampil.
              args.onClose(true, true)
              window.setTimeout(() => bukaKalenderDi(selAktif()), 0)
            } else {
              bukaKalenderDi(selAktif())
            }
            return
          }
          if (e.altKey && e.key === 'ArrowDown' && args.mode === 'ACTIVE' && args.column?.key === 'akunLawan') {
            e.preventGridDefault()
            e.preventDefault()
            if (!konteks.bolehTulis || alasanTerkunci(args.row, 'akunLawan') !== null) return
            args.setActivePosition({ idx: args.column.idx, rowIdx: args.rowIdx }, { enableEditor: true, shouldFocus: true })
            return
          }
          if (args.mode === 'EDIT') {
            if (e.key === 'Enter' && !e.altKey) {
              e.preventGridDefault()
              e.preventDefault()
              args.onClose(true, false)
              const ke = args.rowIdx + (e.shiftKey ? -1 : 1)
              if (ke >= 0 && ke < baris.length) gridRef.current?.setActivePosition({ idx: args.column.idx, rowIdx: ke }, { shouldFocus: true })
              else gridRef.current?.setActivePosition({ idx: args.column.idx, rowIdx: args.rowIdx }, { shouldFocus: true })
            }
            return
          }
          if (ctrl && (e.key === 'z' || e.key === 'Z')) {
            e.preventGridDefault()
            e.preventDefault()
            if (e.shiftKey) onRedo()
            else onUndo()
            return
          }
          if (ctrl && (e.key === 'y' || e.key === 'Y')) {
            e.preventGridDefault()
            e.preventDefault()
            onRedo()
            return
          }
          if (ctrl && e.key === 'Home') {
            e.preventGridDefault()
            e.preventDefault()
            args.setActivePosition({ idx: 0, rowIdx: 0 }, { shouldFocus: true })
            return
          }
          if (e.key === 'Enter' && !ctrl && !e.altKey) {
            e.preventGridDefault()
            e.preventDefault()
            const ke = args.rowIdx + (e.shiftKey ? -1 : 1)
            if (ke >= 0 && ke < baris.length) args.setActivePosition({ idx: args.column?.idx ?? 0, rowIdx: ke }, { shouldFocus: true })
            return
          }
          if ((e.key === 'Delete' || e.key === 'Backspace') && args.column && !ctrl) {
            const k = args.column.key
            if (!(KOLOM_GRID as readonly string[]).includes(k)) return
            e.preventGridDefault()
            e.preventDefault()
            if (!konteks.bolehTulis) return
            onUbahSel(args.row.kunci, k as KolomGrid, '')
          }
        }}
        renderers={{
          renderCell: renderSel,
          noRowsFallback: (
            <div className="gm-kosong" style={{ gridColumn: '1 / -1' }}>
              Belum ada mutasi di bulan ini. Pilih sel judul Tanggal lalu Ctrl+V untuk menempel dari Excel/Google
              Sheets, buka berkas CSV, atau tambah baris.
            </div>
          ),
        }}
      />
    </div>
    </KonteksEditorAkun.Provider>
  )
}

/** 'YYYY-MM-DD' bila sel berisi satu tanggal pasti di bulan grid — nilai awal kalender. */
function tanggalPasti(teks: string, g: BulanGrid): string | null {
  const h = bacaTanggalGrid(teks, g)
  return h.status === 'ok' ? h.ymd : null
}
