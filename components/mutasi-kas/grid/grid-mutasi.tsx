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

import 'react-data-grid/lib/styles.css'
import './grid-mutasi.css'

import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import {
  Cell,
  DataGrid,
  type Column,
  type DataGridHandle,
  type RenderCellProps,
  type RenderEditCellContentProps,
} from 'react-data-grid'
import { Lock } from 'lucide-react'
import { NominalInput } from '@/components/ui/nominal-input'
import { fromMinorUnits, toMinorUnits } from '@/lib/journal'
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
}

export type PosisiAktif = { kunci: string | null; kolom: KolomGrid | null }

type Props = {
  baris: readonly BarisGrid[]
  konteks: KonteksTampilan
  labelGrid: string
  idBantuan: string
  /** id `<datalist>` akun lawan yang dirender halaman. */
  idDaftarAkun: string
  gridRef: RefObject<DataGridHandle | null>
  onUbahSel: (kunci: string, kolom: KolomGrid, nilai: string) => void
  onTempel: (teks: string, posisi: PosisiAktif) => void
  onUndo: () => void
  onRedo: () => void
  onAktif: (p: PosisiAktif) => void
}

const UANG = new Set<KolomGrid>(['masuk', 'keluar', 'saldo'])
const LEBAR: Record<KolomGrid, number> = {
  tanggal: 108,
  uraian: 320,
  masuk: 132,
  keluar: 132,
  saldo: 144,
  akunLawan: 230,
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
  let isi: ReactNode = UANG.has(k) ? tampilUang(k, b.sel[k]) : k === 'akunLawan' ? labelAkun(b.sel[k], kt.indeksAkun) : b.sel[k]
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

function buatEditorAkun(idDaftar: string) {
  return function EditorAkun({ row, onRowChange, onClose }: RenderEditCellContentProps<BarisGrid>) {
    return (
      <input
        autoFocus
        className="gm-editor"
        aria-label="Akun lawan — ketik kode atau nama akun"
        list={idDaftar}
        value={row.sel.akunLawan}
        onFocus={e => e.currentTarget.select()}
        onChange={e => onRowChange({ ...row, sel: { ...row.sel, akunLawan: e.target.value } })}
        onBlur={() => onClose(true, false)}
      />
    )
  }
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
      {tanda}
    </>
  )
}

export default function GridMutasi({ baris, konteks, labelGrid, idBantuan, idDaftarAkun, gridRef, onUbahSel, onTempel, onUndo, onRedo, onAktif }: Props) {
  const aktif = useRef<PosisiAktif>({ kunci: null, kolom: null })

  const EditorAkun = useMemo(() => buatEditorAkun(idDaftarAkun), [idDaftarAkun])

  const kolom = useMemo((): readonly Column<BarisGrid>[] => {
    const kt = konteks
    const data = KOLOM_GRID.map(
      (k): Column<BarisGrid> => ({
        key: k,
        name: LABEL_KOLOM[k],
        width: LEBAR[k],
        resizable: true,
        editable: b => kt.bolehTulis && alasanTerkunci(b, k) === null,
        cellClass: b => infoSel(b, k, kt).kelas || undefined,
        renderCell: ({ row }) => {
          const i = infoSel(row, k, kt)
          return (
            <>
              {i.isi}
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
  }, [konteks, EditorAkun])

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
  )
}
