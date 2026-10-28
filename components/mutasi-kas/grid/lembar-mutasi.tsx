'use client'

// Lembar grid SATU akun kas, SATU bulan (MP §5.G S9, D52: satu Simpan = satu
// akun-bulan). Merangkai modul murni yang sudah diuji:
//   S8 GET mode grid → reducer S6 (draf, undo/redo, kunci) → validator S2 →
//   rantai saldo S3 + jangkar D61 → usulan S4/S5 → diffKeBatch → S7 batch.
//
// ══ TIDAK ADA ANGKA BUKU YANG DIHITUNG DI SINI ═══════════════════════════
// Status, sisa alokasi, kunci, jangkar saldo, dan saldo Pindah Buku datang
// jadi dari server. Yang dihitung di browser hanya hal yang memang milik
// draf: galat sel, rantai saldo dokumen, dan ringkasan jumlah Masuk/Keluar.
//
// ══ SIMPAN TERIKAT (D50, D52) ═════════════════════════════════════════════
// Tombol Simpan dan pintasan keyboard memakai SATU gerbang (`gerbangSimpan`):
// galat, saldo putus, arah blok yang belum dipilih, dan batas D52 menahannya.
// Satu Simpan = satu route batch; tidak ada jalur simpan lain dari halaman ini.

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  CalendarCheck,
  Eraser,
  FileUp,
  Filter,
  Info,
  Loader2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react'
import type { DataGridHandle } from 'react-data-grid'
import { useRupiah } from '@/lib/preferences-context'
import { fmtTanggal } from '@/lib/ymd'
import { indeksAkun, type KolomGrid, type Periode } from '@/lib/mutasi-draf'
import { siapkanAturan, type AturanMutasi, type AturanSiap } from '@/lib/aturan-mutasi'
import {
  blokAktif,
  buatValidator,
  diffKeBatch,
  adaPerubahan,
  jangkarGrid,
  keadaanAwal,
  potretCadangan,
  reducerGrid,
  type BarisGrid,
  type BarisServer,
  type BlokGrid,
  type KunciBaris,
  type LaporanAksi,
} from '@/lib/mutasi-grid-state'
import {
  gerbangSimpan,
  hitungUsulan,
  petaGalatServer,
  rantaiGrid,
  rencanaBerkas,
  rencanaTempel,
  ringkasGrid,
  type GalatServerBaris,
  type HasilUsulanBaris,
} from '@/lib/mutasi-grid-turunan'
import type { BarisRantai } from '@/lib/saldo-berantai'
import type { InfoServerBaris, KonteksTampilan, PosisiAktif } from './grid-mutasi'
import { bacaCadangan, hapusCadangan, tulisCadangan, type RekamanCadangan } from './cadangan-draf'
import { kirimSimpan, type HasilKirim } from './kirim-simpan'
import { PanelPindahBuku, type UsulanPindahBuku } from './panel-pindah-buku'

const GridMutasi = dynamic(() => import('./grid-mutasi'), {
  ssr: false,
  loading: () => (
    <p className="text-sm inline-flex items-center gap-2 p-4" style={{ color: 'var(--color-text-muted)' }}>
      <Loader2 className="w-4 h-4 animate-spin" /> Memuat grid…
    </p>
  ),
})

export type AkunGrid = { id: string; kode: string; nama: string }

type BarisS8 = {
  id: string
  tanggal: string
  keterangan: string | null
  catatan: string | null
  debit: string
  kredit: string
  saldo: string | null
  akunLawanId: string | null
  akunLawanKode: string | null
  journalId: string | null
  updatedAt: string
  sisa: string
  status: string
  jurnalStatus: 'draft' | 'posted' | null
  jurnalDibalik: boolean
  jumlahAlokasi: number
  kunci: KunciBaris
}

type SaldoJangkar = { saldo: string; dariTanggal: string; saldoTercetak: string; barisSesudah: number }

type Meta = {
  saldoJangkar: SaldoJangkar | null
  terkunciSampai: string | null
  info: ReadonlyMap<string, InfoServerBaris>
}

type Banner = { jenis: 'ok' | 'galat' | 'konflik'; pesan: string; detail: string[] }

type Props = {
  clientId: string
  akunKas: AkunGrid
  coa: readonly AkunGrid[]
  periode: Periode
  bolehTulis: boolean
  /** Naik dari luar (mis. alokasi berubah di panel rincian) → muat ulang. */
  versiLuar: number
  onKotor: (kotor: boolean) => void
  onPeriode: (p: Periode) => void
  onRincian: (mutasiId: string) => void
}

const META_KOSONG: Meta = { saldoJangkar: null, terkunciSampai: null, info: new Map() }
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const namaBulan = (p: Periode) => `${BULAN[Number(p.mulai.slice(5, 7)) - 1]} ${p.mulai.slice(0, 4)}`

const keBarisServer = (m: BarisS8): BarisServer => ({
  id: m.id,
  updatedAt: m.updatedAt,
  nilai: {
    tanggal: m.tanggal,
    debit: m.debit,
    kredit: m.kredit,
    saldo: m.saldo,
    keterangan: m.keterangan,
    catatan: m.catatan,
    akunLawanId: m.akunLawanId,
  },
  akunLawanTeks: m.akunLawanKode ?? '',
  terkunci: m.kunci,
})

function teksLaporan(l: LaporanAksi): string {
  const dasar = `${l.aksi}: ${l.diterapkan.toLocaleString('id-ID')} baris.`
  if (l.dilewati.length === 0) return dasar
  const alasan = [...new Set(l.dilewati.map(d => d.alasan))].slice(0, 2).join(' ')
  return `${dasar} ${l.dilewati.length.toLocaleString('id-ID')} dilewati — ${alasan}`
}

export function LembarMutasi({ clientId, akunKas, coa, periode, bolehTulis, versiLuar, onKotor, onPeriode, onRincian }: Props) {
  const { rupiahPersis } = useRupiah()
  const idBantuan = useId()
  const idDaftarAkun = useId()
  const idAlasan = useId()
  const gridRef = useRef<DataGridHandle | null>(null)
  const berkasRef = useRef<HTMLInputElement>(null)

  const [s, dispatch] = useReducer(reducerGrid, undefined, () => keadaanAwal())
  const [muat, setMuat] = useState<{ status: 'memuat' | 'siap' | 'galat'; pesan?: string }>({ status: 'memuat' })
  const [meta, setMeta] = useState<Meta>(META_KOSONG)
  const [versi, setVersi] = useState(0)
  const [aturan, setAturan] = useState<AturanSiap[]>([])
  const [usulanPB, setUsulanPB] = useState<UsulanPindahBuku>(() => new Map())
  const [saldoManual, setSaldoManual] = useState('')
  const [gagalSimpan, setGagalSimpan] = useState<{ peta: Map<string, GalatServerBaris>; objek: Map<string, BarisGrid> } | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [duplikat, setDuplikat] = useState<ReadonlySet<string>>(() => new Set())
  const [konfirmasiDuplikat, setKonfirmasiDuplikat] = useState<number | null>(null)
  const [menyimpan, setMenyimpan] = useState(false)
  const [filter, setFilter] = useState(false)
  const [aktif, setAktif] = useState<PosisiAktif>({ kunci: null, kolom: null })
  const [pesanLokal, setPesanLokal] = useState('')
  const [tawaranCadangan, setTawaranCadangan] = useState<RekamanCadangan | null>(null)
  const [cadanganGagal, setCadanganGagal] = useState(false)
  const [isiAkun, setIsiAkun] = useState<string | null>(null)
  const pulihkanTertunda = useRef<RekamanCadangan | null>(null)
  const cadanganKami = useRef(false)

  // ── Muat: S8 mode grid ──
  useEffect(() => {
    let batal = false
    void (async () => {
      setMuat({ status: 'memuat' })
      try {
        const qs = new URLSearchParams({
          clientId,
          periodStart: periode.mulai,
          periodEnd: periode.akhir,
          akunKasId: akunKas.id,
          urut: 'buku',
        })
        const res = await fetch(`/api/cash-mutations?${qs}`)
        const data = (await res.json().catch(() => null)) as
          | { mutations?: BarisS8[]; saldoJangkar?: SaldoJangkar | null; terkunciSampai?: string | null; error?: string }
          | null
        if (batal) return
        if (!res.ok || !data?.mutations) {
          setMuat({ status: 'galat', pesan: data?.error ?? 'Gagal memuat mutasi.' })
          return
        }
        const info = new Map<string, InfoServerBaris>(
          data.mutations.map(m => [
            m.id,
            { status: m.status, sisa: m.sisa, jumlahAlokasi: m.jumlahAlokasi, journalId: m.journalId, jurnalStatus: m.jurnalStatus, jurnalDibalik: m.jurnalDibalik },
          ])
        )
        dispatch({ jenis: 'muat', baris: data.mutations.map(keBarisServer) })
        setMeta({ saldoJangkar: data.saldoJangkar ?? null, terkunciSampai: data.terkunciSampai ?? null, info })
        setGagalSimpan(null)
        setDuplikat(new Set())
        setMuat({ status: 'siap' })

        const tertunda = pulihkanTertunda.current
        if (tertunda && tertunda.periode.mulai === periode.mulai) {
          pulihkanTertunda.current = null
          dispatch({ jenis: 'pulihkan', cadangan: tertunda.cadangan })
          cadanganKami.current = true
          setTawaranCadangan(null)
          return
        }
        const c = await bacaCadangan(clientId, akunKas.id)
        if (!batal) setTawaranCadangan(c)
      } catch {
        if (!batal) setMuat({ status: 'galat', pesan: 'Gagal menghubungi server.' })
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId, akunKas.id, periode.mulai, periode.akhir, versi, versiLuar])

  // ── Aturan akun lawan (S4), sekali per klien ──
  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/cash-mutation-rules`)
        const data = (await res.json().catch(() => null)) as { rules?: AturanMutasi[] } | null
        if (!batal) setAturan(res.ok && data?.rules ? siapkanAturan(data.rules) : [])
      } catch {
        if (!batal) setAturan([])
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId])

  // ── Turunan draf ──
  const indeks = useMemo(() => indeksAkun(coa), [coa])
  const akunById = useMemo(() => new Map(coa.map(a => [a.id, a])), [coa])
  const validasi = useMemo(
    () => buatValidator({ periode, akunKasId: akunKas.id, akun: indeks, terkunciSampai: meta.terkunciSampai }, s.server),
    [periode, akunKas.id, indeks, meta.terkunciSampai, s.server]
  )
  const diff = useMemo(() => diffKeBatch(s, validasi), [s, validasi])
  const kotor = adaPerubahan(diff)
  const jangkar = jangkarGrid(s, meta.saldoJangkar?.saldo ?? null, saldoManual)
  const [memoRantai] = useState(() => new WeakMap<BarisGrid, BarisRantai>())
  const rantai = useMemo(() => rantaiGrid(s.baris, jangkar.teks, memoRantai), [s.baris, jangkar.teks, memoRantai])
  // Memo usulan per baris HARUS dibuang bila aturan, akun, atau usulan Pindah
  // Buku berubah — hasil per baris bergantung padanya. Ketiganya disebut di
  // badan supaya daftar dependensinya jujur.
  const memoUsulan = useMemo(() => {
    void [aturan, usulanPB, akunById]
    return new WeakMap<BarisGrid, HasilUsulanBaris>()
  }, [aturan, usulanPB, akunById])
  const usulan = useMemo(
    () => hitungUsulan({ baris: s.baris, akunKasId: akunKas.id, aturan, akunById, pindahBuku: usulanPB, memo: memoUsulan }),
    [s.baris, akunKas.id, aturan, akunById, usulanPB, memoUsulan]
  )
  const gerbang = gerbangSimpan(s, diff, rantai, menyimpan)
  const ringkas = useMemo(() => ringkasGrid(s.baris, diff), [s.baris, diff])
  const diubah = useMemo(() => new Set(diff.ubah.map(u => u.id)), [diff])
  const petaBaris = useMemo(() => {
    const m = new Map<string, { b: BarisGrid; i: number }>()
    s.baris.forEach((b, i) => m.set(b.kunci, { b, i }))
    return m
  }, [s.baris])

  // Galat server hanya berlaku untuk baris yang BELUM disunting sejak Simpan gagal.
  const galatServer = useMemo(() => {
    const out = new Map<string, GalatServerBaris>()
    if (!gagalSimpan) return out
    for (const [k, g] of gagalSimpan.peta) if (petaBaris.get(k)?.b === gagalSimpan.objek.get(k)) out.set(k, g)
    return out
  }, [gagalSimpan, petaBaris])

  const bermasalah = useCallback(
    (b: BarisGrid) => {
      const v = validasi(b)
      return (
        Object.keys(v.galat).length > 0 ||
        v.galatBaris.length > 0 ||
        galatServer.has(b.kunci) ||
        rantai.putus.has(b.kunci) ||
        duplikat.has(b.kunci) ||
        usulan.bentrok.has(b.kunci)
      )
    },
    [validasi, galatServer, rantai, duplikat, usulan]
  )
  const tampil = useMemo(() => (filter ? s.baris.filter(bermasalah) : s.baris), [filter, s.baris, bermasalah])

  const konteks: KonteksTampilan = useMemo(
    () => ({
      validasi,
      galatServer,
      rantai,
      usulan: usulan.usulan,
      bentrok: usulan.bentrok,
      duplikat,
      diubah,
      infoServer: meta.info,
      indeksAkun: indeks,
      nomorBaris: (k: string) => (petaBaris.get(k)?.i ?? 0) + 1,
      bolehTulis: bolehTulis && !menyimpan,
    }),
    [validasi, galatServer, rantai, usulan, duplikat, diubah, meta.info, indeks, petaBaris, bolehTulis, menyimpan]
  )

  // ── Draf kotor: induk, beforeunload, penjaga tautan, cadangan IndexedDB (D51) ──
  useEffect(() => {
    onKotor(kotor)
  }, [kotor, onKotor])

  useEffect(() => {
    if (!kotor) return
    const tahan = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const tautan = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || e.defaultPrevented) return
      if (a.origin !== window.location.origin) return
      if (!window.confirm('Ada perubahan grid yang belum disimpan. Tinggalkan halaman? Draf tetap ada di cadangan browser ini.')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', tahan)
    document.addEventListener('click', tautan, true)
    return () => {
      window.removeEventListener('beforeunload', tahan)
      document.removeEventListener('click', tautan, true)
    }
  }, [kotor])

  useEffect(() => {
    if (muat.status !== 'siap') return
    if (!kotor) {
      if (cadanganKami.current) {
        cadanganKami.current = false
        void hapusCadangan(clientId, akunKas.id)
      }
      return
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const ok = await tulisCadangan({
          clientId,
          akunKasId: akunKas.id,
          periode,
          disimpanPada: new Date().toISOString(),
          jumlahPerubahan: diff.baru.length + diff.ubah.length + diff.hapus.length,
          cadangan: potretCadangan(s),
        })
        cadanganKami.current = cadanganKami.current || ok
        setCadanganGagal(!ok)
      })()
    }, 1200)
    return () => window.clearTimeout(t)
  }, [s, kotor, muat.status, clientId, akunKas.id, periode, diff])

  // ── Aksi ──
  const tulisAktif = bolehTulis && !menyimpan

  const onUbahSel = useCallback((kunci: string, kolom: KolomGrid, nilai: string) => {
    dispatch({ jenis: 'ubahSel', kunci, kolom, nilai })
  }, [])
  const onUndo = useCallback(() => dispatch({ jenis: 'undo' }), [])
  const onRedo = useCallback(() => dispatch({ jenis: 'redo' }), [])

  const onTempel = useCallback(
    (teks: string, posisi: PosisiAktif) => {
      if (!tulisAktif) return
      if (filter) {
        setPesanLokal('Matikan filter "baris bermasalah" untuk menempel.')
        return
      }
      const kolom = posisi.kolom ?? 'tanggal'
      const indeksAktif = posisi.kunci ? (petaBaris.get(posisi.kunci)?.i ?? s.baris.length) : s.baris.length
      const r = rencanaTempel(teks, { kolom }, periode)
      if (r.jenis === 'galat') {
        setPesanLokal(`Tempel ditolak: ${r.pesan}`)
        return
      }
      setPesanLokal('')
      if (r.jenis === 'sel') dispatch({ jenis: 'tempelSel', indeks: indeksAktif, kolom, isi: r.isi })
      else dispatch({ jenis: 'tempelBlok', indeks: indeksAktif, hasil: r.hasil, sumber: 'tempel', namaBerkas: null })
    },
    [tulisAktif, filter, petaBaris, s.baris.length, periode]
  )

  async function bukaBerkas(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      setPesanLokal('Berkas melewati 25 MB.')
      return
    }
    const r = rencanaBerkas(await file.text(), periode)
    if (r.jenis !== 'blok') {
      setPesanLokal(`Berkas ditolak: ${r.jenis === 'galat' ? r.pesan : 'bukan tabel transaksi.'}`)
      return
    }
    setPesanLokal('')
    dispatch({ jenis: 'tempelBlok', indeks: s.baris.length, hasil: r.hasil, sumber: 'berkas', namaBerkas: file.name })
  }

  const ke = (kunci: string) => {
    const i = tampil.findIndex(b => b.kunci === kunci)
    if (i >= 0) gridRef.current?.setActivePosition({ idx: 1, rowIdx: i }, { shouldFocus: true })
  }

  function tanganiGagal(r: Extract<HasilKirim, { ok: false }>) {
    if (r.konflik.length > 0) {
      setBanner({ jenis: 'konflik', pesan: r.error, detail: r.details })
      return
    }
    if (r.galat.length > 0) {
      const h = petaGalatServer(r.galat, new Set(petaBaris.keys()))
      const objek = new Map<string, BarisGrid>()
      for (const k of h.perBaris.keys()) {
        const b = petaBaris.get(k)?.b
        if (b) objek.set(k, b)
      }
      setGagalSimpan({ peta: h.perBaris, objek })
      setBanner({ jenis: 'galat', pesan: `${r.error} Sel yang ditolak ditandai merah.`, detail: h.lepas })
      return
    }
    setBanner({ jenis: 'galat', pesan: r.error, detail: r.details })
  }

  async function simpan(lewatiCekDuplikat: boolean) {
    if (!gerbang.boleh) return
    setMenyimpan(true)
    setBanner(null)
    setKonfirmasiDuplikat(null)
    const body = { clientId, akunKasId: akunKas.id, periode, baru: diff.baru, ubah: diff.ubah, hapus: diff.hapus, berkas: diff.berkas }
    try {
      // D38: dugaan duplikat adalah PERINGATAN — ditanyakan sebelum menulis,
      // lewat jalur yang sama (`dryRun`), bukan ditolak.
      if (!lewatiCekDuplikat) {
        const uji = await kirimSimpan({ ...body, dryRun: true })
        if (!uji.ok) return tanganiGagal(uji)
        if (uji.duplikat.length > 0) {
          setDuplikat(new Set(uji.duplikat.map(d => d.kunci)))
          setKonfirmasiDuplikat(uji.duplikat.length)
          return
        }
      }
      const r = await kirimSimpan(body)
      if (!r.ok) return tanganiGagal(r)
      cadanganKami.current = false
      await hapusCadangan(clientId, akunKas.id)
      setBanner({
        jenis: 'ok',
        pesan: `Tersimpan: ${r.ringkasan.baru.toLocaleString('id-ID')} baru, ${r.ringkasan.ubah.toLocaleString('id-ID')} diubah, ${r.ringkasan.hapus.toLocaleString('id-ID')} dihapus · ${r.ringkasan.jurnalRingkasan.toLocaleString('id-ID')} jurnal ringkasan disusun.`,
        detail: [],
      })
      setVersi(v => v + 1)
    } finally {
      setMenyimpan(false)
    }
  }

  const aktifBaris = aktif.kunci ? petaBaris.get(aktif.kunci)?.b : undefined
  const tanpaTanggal = useMemo(() => s.baris.filter(b => b.id === null && b.sel.tanggal.trim() === '' && Object.values(b.sel).some(v => v.trim() !== '')), [s.baris])
  const akunKosong = useMemo(() => s.baris.filter(b => b.sel.akunLawan.trim() === '' && !b.terkunci.baris && Object.values(b.sel).some(v => v.trim() !== '')), [s.baris])
  const blokTampil = blokAktif(s)
  const pengumuman = s.laporan ? teksLaporan(s.laporan) : pesanLokal

  if (muat.status === 'galat') {
    return (
      <p role="alert" className="text-sm p-4" style={{ color: 'var(--color-accent-critical)' }}>
        {muat.pesan}
      </p>
    )
  }

  const tombol = 'inline-flex items-center gap-1.5 rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)'
  const gayaTombol: React.CSSProperties = { padding: '6px 12px', fontSize: 12, minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-primary)' }

  return (
    <div className="flex flex-col gap-2 min-h-0 min-w-0 flex-1">
      <p id={idBantuan} hidden>
        Panah untuk berpindah sel. Ketik atau F2 untuk menyunting; Enter menyimpan lalu turun satu baris; Esc membatalkan;
        Delete mengosongkan sel; Ctrl+V menempel dari Excel; Ctrl+Z dan Ctrl+Y mengurungkan dan mengulang; Ctrl+Home ke sel
        pertama.
      </p>
      <datalist id={idDaftarAkun}>
        {coa.map(a => (
          <option key={a.id} value={`${a.kode} · ${a.nama}`} />
        ))}
      </datalist>

      {/* ── Bilah alat ── */}
      <div role="toolbar" aria-label={`Alat grid ${akunKas.nama}`} className="flex items-center gap-1.5 flex-wrap">
        {bolehTulis && (
          <>
            <button
              type="button"
              onClick={() => void simpan(false)}
              disabled={!gerbang.boleh}
              aria-describedby={gerbang.boleh ? undefined : idAlasan}
              className={`${tombol} font-semibold`}
              style={{ ...gayaTombol, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
            >
              {menyimpan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {gerbang.label}
            </button>
            <button type="button" className={tombol} style={gayaTombol} onClick={onUndo} disabled={s.lalu.length === 0 || !tulisAktif} aria-label="Urungkan (Ctrl+Z)">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" className={tombol} style={gayaTombol} onClick={onRedo} disabled={s.nanti.length === 0 || !tulisAktif} aria-label="Ulangi (Ctrl+Y)">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={tombol}
              style={gayaTombol}
              disabled={!kotor || !tulisAktif}
              onClick={() => {
                if (window.confirm('Batalkan semua perubahan yang belum disimpan? Bisa diurungkan dengan Ctrl+Z.')) dispatch({ jenis: 'buangSemua' })
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Batalkan semua
            </button>
            <button
              type="button"
              className={tombol}
              style={gayaTombol}
              disabled={!tulisAktif}
              onClick={() => dispatch({ jenis: 'tambahBaris', indeks: aktifBaris ? (petaBaris.get(aktifBaris.kunci)?.i ?? s.baris.length) + 1 : s.baris.length, jumlah: 1 })}
            >
              <Plus className="w-3.5 h-3.5" /> Tambah baris
            </button>
            <button
              type="button"
              className={tombol}
              style={gayaTombol}
              disabled={!aktifBaris || aktifBaris.terkunci.baris !== null || !tulisAktif}
              title={aktifBaris?.terkunci.baris ?? undefined}
              onClick={() => aktifBaris && dispatch({ jenis: 'hapusBaris', kunci: [aktifBaris.kunci] })}
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus baris
            </button>
            <button
              type="button"
              className={tombol}
              style={{ ...gayaTombol, background: 'color-mix(in srgb, var(--color-accent-secondary) 22%, white)' }}
              disabled={usulan.usulan.size === 0 || !tulisAktif}
              onClick={() => dispatch({ jenis: 'terapkanUsulan', usulan: [...usulan.usulan].map(([kunci, u]) => ({ kunci, akunLawan: u.akunLawan })) })}
            >
              <Sparkles className="w-3.5 h-3.5" /> Terapkan usulan ({usulan.usulan.size.toLocaleString('id-ID')})
            </button>
            <button type="button" className={tombol} style={gayaTombol} disabled={akunKosong.length === 0 || !tulisAktif} onClick={() => setIsiAkun('')}>
              <Wand2 className="w-3.5 h-3.5" /> Isi akun lawan kosong
            </button>
            {tanpaTanggal.length > 0 && (
              <button
                type="button"
                className={tombol}
                style={gayaTombol}
                disabled={!tulisAktif}
                onClick={() => dispatch({ jenis: 'isiTanggalAkhirPeriode', kunci: tanpaTanggal.map(b => b.kunci), tanggal: periode.akhir })}
              >
                <CalendarCheck className="w-3.5 h-3.5" /> Isi tanggal akhir periode ({tanpaTanggal.length})
              </button>
            )}
            <button
              type="button"
              className={tombol}
              style={gayaTombol}
              disabled={!aktifBaris || aktifBaris.sel.saldo.trim() === '' || aktifBaris.terkunci.baris !== null || !tulisAktif}
              onClick={() => aktifBaris && dispatch({ jenis: 'kosongkanSaldo', kunci: [aktifBaris.kunci] })}
              title="D50: saldo dokumen dikosongkan secara terlihat dan tercatat di riwayat"
            >
              <Eraser className="w-3.5 h-3.5" /> Kosongkan saldo
            </button>
            <button type="button" className={tombol} style={gayaTombol} disabled={!tulisAktif} onClick={() => berkasRef.current?.click()}>
              <FileUp className="w-3.5 h-3.5" /> Buka berkas CSV
            </button>
            <input
              ref={berkasRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void bukaBerkas(f)
              }}
            />
          </>
        )}
        <button
          type="button"
          className={tombol}
          style={gayaTombol}
          disabled={!aktifBaris?.id || kotor}
          title={kotor ? 'Simpan dulu perubahan grid — alokasi mengubah mutasi tersimpan.' : undefined}
          onClick={() => aktifBaris?.id && onRincian(aktifBaris.id)}
        >
          <Info className="w-3.5 h-3.5" /> Rincian & alokasi
        </button>
        <button type="button" className={tombol} style={gayaTombol} aria-pressed={filter} onClick={() => setFilter(f => !f)}>
          <Filter className="w-3.5 h-3.5" /> Baris bermasalah saja
        </button>
      </div>

      {!gerbang.boleh && kotor && (
        <ul id={idAlasan} className="text-xs flex flex-wrap gap-x-3" style={{ color: 'var(--color-text-muted)' }}>
          {gerbang.alasan.map(a => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {/* ── Ringkasan ── */}
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {akunKas.kode} · {akunKas.nama} · {namaBulan(periode)} · {ringkas.jumlahBaris.toLocaleString('id-ID')} baris · Masuk{' '}
        <strong style={{ color: 'var(--color-text-primary)' }}>{rupiahPersis(ringkas.totalMasuk)}</strong> · Keluar{' '}
        <strong style={{ color: 'var(--color-text-primary)' }}>{rupiahPersis(ringkas.totalKeluar)}</strong>
        {kotor && (
          <>
            {' · '}
            {ringkas.baru.toLocaleString('id-ID')} baru, {ringkas.ubah.toLocaleString('id-ID')} diubah, {ringkas.hapus.toLocaleString('id-ID')} dihapus
          </>
        )}
      </p>

      <p role="status" aria-live="polite" className="text-xs min-h-4" style={{ color: 'var(--color-text-primary)' }}>
        {pengumuman}
      </p>

      {/* ── Banner ── */}
      {tawaranCadangan && (
        <div role="alert" className="rounded-2xl px-3.5 py-2.5 flex items-center gap-2 flex-wrap text-xs" style={{ background: 'color-mix(in srgb, var(--color-accent-secondary) 22%, white)' }}>
          <span>
            Ada draf yang belum disimpan untuk {akunKas.nama} {namaBulan(tawaranCadangan.periode)} ({tawaranCadangan.jumlahPerubahan.toLocaleString('id-ID')} perubahan,
            dicadangkan {new Date(tawaranCadangan.disimpanPada).toLocaleString('id-ID')}).
          </span>
          <button
            type="button"
            className={tombol}
            style={gayaTombol}
            onClick={() => {
              const c = tawaranCadangan
              setTawaranCadangan(null)
              if (c.periode.mulai === periode.mulai) {
                dispatch({ jenis: 'pulihkan', cadangan: c.cadangan })
                cadanganKami.current = true
              } else {
                pulihkanTertunda.current = c
                onPeriode(c.periode)
              }
            }}
          >
            Pulihkan draf
          </button>
          <button
            type="button"
            className={tombol}
            style={gayaTombol}
            onClick={() => {
              if (!window.confirm('Buang draf cadangan ini? Tidak bisa dikembalikan.')) return
              setTawaranCadangan(null)
              void hapusCadangan(clientId, akunKas.id)
            }}
          >
            Buang
          </button>
        </div>
      )}
      {cadanganGagal && (
        <p role="note" className="text-xs" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)' }}>
          Cadangan draf tidak tersedia di browser ini (IndexedDB ditolak) — jangan tutup tab sebelum Simpan.
        </p>
      )}
      {banner && (
        <div
          role={banner.jenis === 'ok' ? 'status' : 'alert'}
          className="rounded-2xl px-3.5 py-2.5 text-xs"
          style={{
            background: banner.jenis === 'ok' ? 'color-mix(in srgb, var(--color-accent-primary) 30%, white)' : 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
            border: banner.jenis === 'ok' ? 'none' : '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
          }}
        >
          <p>{banner.pesan}</p>
          {banner.detail.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {banner.detail.slice(0, 10).map(d => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {banner.jenis === 'konflik' && (
            <button
              type="button"
              className={`${tombol} mt-2`}
              style={gayaTombol}
              onClick={() => {
                if (window.confirm('Muat ulang dari server? Draf di layar diganti versi terbaru; cadangannya tetap ada sampai Anda membuangnya.')) {
                  cadanganKami.current = false
                  setBanner(null)
                  setVersi(v => v + 1)
                }
              }}
            >
              Muat ulang dari server
            </button>
          )}
        </div>
      )}
      {konfirmasiDuplikat !== null && (
        <div role="alert" className="rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2 flex-wrap" style={{ background: 'color-mix(in srgb, var(--color-accent-secondary) 22%, white)' }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>
            {konfirmasiDuplikat.toLocaleString('id-ID')} baris mirip mutasi yang sudah ada (tanggal, nominal, dan uraian sama) — ditandai &quot;duplikat?&quot; di
            kolom Status. Tetap simpan?
          </span>
          <button type="button" className={`${tombol} font-semibold`} style={{ ...gayaTombol, border: 'none', background: 'var(--color-accent-primary)' }} onClick={() => void simpan(true)}>
            Tetap simpan
          </button>
          <button type="button" className={tombol} style={gayaTombol} onClick={() => setKonfirmasiDuplikat(null)}>
            Periksa dulu
          </button>
        </div>
      )}
      {meta.terkunciSampai && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Periode terkunci s.d. {fmtTanggal(meta.terkunciSampai)} — baris pada atau sebelum tanggal itu tidak bisa diubah.
        </p>
      )}

      {blokTampil.map(b => (
        <BannerBlok key={b.id} blok={b} bolehTulis={tulisAktif} onPilih={o => dispatch({ jenis: 'pilihArah', blok: b.id, orientasi: o })} />
      ))}

      {/* ── Rantai saldo & jangkar (D50, D61) ── */}
      {!rantai.utuh && rantai.pertama && (
        <div role="alert" className="rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2 flex-wrap" style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)', border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)' }}>
          <span>
            Saldo putus di {rantai.putus.size.toLocaleString('id-ID')} baris — pertama di baris{' '}
            {((petaBaris.get(rantai.pertama)?.i ?? 0) + 1).toLocaleString('id-ID')}. {rantai.putus.get(rantai.pertama)?.pesan}
          </span>
          <button type="button" className={tombol} style={gayaTombol} onClick={() => rantai.pertama && ke(rantai.pertama)}>
            <ArrowDownToLine className="w-3.5 h-3.5" /> Ke baris itu
          </button>
          {tulisAktif && (
            <button type="button" className={tombol} style={gayaTombol} onClick={() => rantai.pertama && dispatch({ jenis: 'kosongkanSaldo', kunci: [rantai.pertama] })}>
              <Eraser className="w-3.5 h-3.5" /> Kosongkan saldo baris itu
            </button>
          )}
        </div>
      )}
      <div className="text-xs flex items-center gap-2 flex-wrap" style={{ color: 'var(--color-text-muted)' }}>
        <span>
          Jangkar saldo:{' '}
          {jangkar.sumber === 'blok'
            ? `baris SALDO AWAL tempelan (${jangkar.teks})`
            : jangkar.sumber === 'server' && meta.saldoJangkar
              ? `saldo tersimpan ${fmtTanggal(meta.saldoJangkar.dariTanggal)} ${rupiahPersis(meta.saldoJangkar.saldoTercetak)}${meta.saldoJangkar.barisSesudah > 0 ? ` + ${meta.saldoJangkar.barisSesudah} mutasi tanpa saldo` : ''} = ${rupiahPersis(meta.saldoJangkar.saldo)}`
              : jangkar.sumber === 'manual'
                ? `isian saldo awal rekening koran (${jangkar.teks})`
                : 'tidak ada'}
          {rantai.pertamaTanpaJangkar && ' — baris bersaldo pertama tidak terverifikasi.'}
        </span>
        {(jangkar.sumber === null || jangkar.sumber === 'manual') && (
          <label className="inline-flex items-center gap-1.5">
            Saldo awal rekening koran
            <input
              value={saldoManual}
              onChange={e => setSaldoManual(e.target.value)}
              inputMode="decimal"
              placeholder="mis. 12.500.000"
              className="rounded-full px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ minHeight: 32, border: '1px solid #e5e7eb', fontSize: 12, width: 150 }}
            />
          </label>
        )}
      </div>

      {isiAkun !== null && (
        <div role="dialog" aria-label="Isi akun lawan kosong" className="rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2 flex-wrap" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
          <label className="inline-flex items-center gap-1.5">
            Akun lawan untuk {akunKosong.length.toLocaleString('id-ID')} baris yang kosong{filter ? ' (semua, bukan hanya yang tersaring)' : ''}
            <input
              autoFocus
              list={idDaftarAkun}
              value={isiAkun}
              onChange={e => setIsiAkun(e.target.value)}
              placeholder="kode atau nama akun"
              className="rounded-full px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ minHeight: 32, border: '1px solid #e5e7eb', fontSize: 12, width: 260 }}
            />
          </label>
          <button
            type="button"
            className={`${tombol} font-semibold`}
            style={{ ...gayaTombol, border: 'none', background: 'var(--color-accent-primary)' }}
            disabled={isiAkun.trim() === ''}
            onClick={() => {
              dispatch({ jenis: 'isiAkunLawanMassal', kunci: akunKosong.map(b => b.kunci), akunLawan: isiAkun })
              setIsiAkun(null)
            }}
          >
            Isi
          </button>
          <button type="button" className={tombol} style={gayaTombol} onClick={() => setIsiAkun(null)}>
            Batal
          </button>
        </div>
      )}

      <PanelPindahBuku clientId={clientId} periode={periode} versi={versi + versiLuar} onUsulan={setUsulanPB} />

      {/* ── Grid ── */}
      <div className="flex-1 min-h-[360px] min-w-0 flex">
        {muat.status === 'memuat' ? (
          <p className="text-sm inline-flex items-center gap-2 p-4" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat mutasi {akunKas.nama}…
          </p>
        ) : (
          <GridMutasi
            baris={tampil}
            konteks={konteks}
            labelGrid={`Mutasi ${akunKas.nama} ${namaBulan(periode)}${filter ? ' — baris bermasalah saja' : ''}`}
            idBantuan={idBantuan}
            idDaftarAkun={idDaftarAkun}
            gridRef={gridRef}
            onUbahSel={onUbahSel}
            onTempel={onTempel}
            onUndo={onUndo}
            onRedo={onRedo}
            onAktif={setAktif}
          />
        )}
      </div>

      {blokTampil.some(b => b.dilewati.length > 0) && (
        <details className="text-xs rounded-2xl px-3.5 py-2.5" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
          <summary className="cursor-pointer font-semibold">
            Baris dilewati ({blokTampil.reduce((n, b) => n + b.dilewati.length, 0).toLocaleString('id-ID')}) — judul, saldo, ringkasan, dan lanjutan uraian
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {blokTampil.flatMap(b =>
              b.dilewati.map(d => (
                <li key={`${b.id}-${d.nomor}`} style={{ color: 'var(--color-text-muted)' }}>
                  {b.namaBerkas ?? 'Tempelan'} baris {d.nomor}
                  {d.halaman !== null ? ` (hal. ${d.halaman})` : ''}: {d.alasan} — <span className="font-mono">{d.teks}</span>
                </li>
              ))
            )}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Banner arah per blok tempelan/berkas (MP §5.G: arah dari saldo, bukan judul kolom). */
function BannerBlok({ blok, bolehTulis, onPilih }: { blok: BlokGrid; bolehTulis: boolean; onPilih: (o: 'normal' | 'tukar') => void }) {
  const sumber = blok.namaBerkas ?? (blok.sumber === 'pdf' ? 'PDF' : 'Tempelan')
  const judul = blok.judulNominal[0] ?? 'nominal'
  // Kolom nominal PERTAMA ditaruh sementara di `pertamaKe`; memilih arahnya = normal/tukar.
  const pilihan: { label: string; orientasi: 'normal' | 'tukar' }[] = blok.satuKolom
    ? [
        { label: `${judul}: DB = Uang keluar, CR = Uang masuk`, orientasi: 'normal' },
        { label: `${judul}: DB = Uang masuk, CR = Uang keluar`, orientasi: 'tukar' },
      ]
    : [
        { label: `Kolom "${judul}" = Uang masuk`, orientasi: blok.pertamaKe === 'masuk' ? 'normal' : 'tukar' },
        { label: `Kolom "${judul}" = Uang keluar`, orientasi: blok.pertamaKe === 'keluar' ? 'normal' : 'tukar' },
      ]
  const wajib = blok.status === 'wajib'
  return (
    <div
      role={wajib ? 'alert' : 'note'}
      className="rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2 flex-wrap"
      style={{
        background: wajib ? 'color-mix(in srgb, var(--color-accent-critical) 8%, white)' : 'color-mix(in srgb, var(--color-accent-secondary) 18%, white)',
        border: wajib ? '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)' : 'none',
      }}
    >
      <span>
        <strong>{sumber}:</strong>{' '}
        {wajib
          ? `${blok.alasan} Simpan tertahan sampai dipilih.`
          : blok.status === 'dipilih'
            ? 'Arah dipilih manual.'
            : blok.alasan}
        {blok.peringatan && ` ${blok.peringatan}`}
      </span>
      {blok.judulNominal.length > 0 &&
        pilihan.map(p => (
          <button
            key={p.label}
            type="button"
            disabled={!bolehTulis}
            aria-pressed={!wajib && blok.diterapkan === p.orientasi}
            onClick={() => onPilih(p.orientasi)}
            className="inline-flex items-center rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{
              padding: '6px 12px',
              minHeight: 32,
              fontSize: 12,
              border: '1px solid #e5e7eb',
              background: !wajib && blok.diterapkan === p.orientasi ? 'var(--color-accent-primary)' : 'white',
              color: 'var(--color-text-primary)',
            }}
          >
            {p.label}
          </button>
        ))}
    </div>
  )
}
