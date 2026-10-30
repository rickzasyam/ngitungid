'use client'

// Halaman Mutasi Kas/Bank — baris rekening koran per akun kas dan periode,
// plus tambah manual dan alokasi ke invoice hutang. Tata letaknya mengikuti
// /jurnal, /buku-besar, dan /pembelian (shell tiga lapis).
//
// ══ DUA TAMPILAN (MP §5.G S9) ════════════════════════════════════════════
// ≥ md: GRID per akun kas (tab sheet) per bulan — tampilan utama untuk
// menempel, membuka berkas CSV (D47, pengganti wizard impor), dan menyunting
// ribuan baris sekaligus. < md (HP): DAFTAR + form satu-satu, seperti dulu.
// Daftar tetap bisa dibuka di layar lebar (dan dibuka otomatis oleh tautan
// "Koreksi di Mutasi Kas" dari /jurnal, D32).
//
// Akses: owner + akunting + finance (D45 — '/mutasi-kas' ada di
// INTERNAL_ONLY_PREFIXES). Finance MEMBACA; tombol tulisnya digerbangi
// canDoAccounting di sini DAN requireAkunting di API.
//
// ══ TIDAK ADA ANGKA YANG DIHITUNG DI SINI ═════════════════════════════════
// Sisa dan status datang JADI dari server, yang menurunkannya lewat
// lib/cash-mutation.ts. Dua tempat yang menghitung sisa berarti dua jawaban
// yang bisa berbeda — dan yang di layar yang akan dipercaya.
//
// ══ "BELUM DIJURNAL" HARUS MENONJOL ══════════════════════════════════════
// Permintaan eksplisit Ricko: baris yang belum dijurnal TIDAK boleh terlihat
// sama dengan yang sudah selesai. Ia mendapat warna kritis, bukan abu-abu
// netral — baris yang tenggelam adalah baris yang tidak pernah dikerjakan.

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import { useRupiah } from '@/lib/preferences-context'
import { ModalShell } from '@/components/ui/modal-portal'
import { DateRangePicker } from '@/components/date-range-picker'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import { localDateToYmd, ymdToLocalDate, hariIniJakarta } from '@/lib/ymd'
import { fmtTanggal } from '@/components/jurnal/journal-detail'
import {
  MutationFormModal,
  blankMutationForm,
  type AkunOption,
  type MutationFormValue,
} from '@/components/mutasi-kas/mutation-form-modal'
import { AllocationPanel, type AlokasiRow } from '@/components/mutasi-kas/allocation-panel'
import { LembarMutasi } from '@/components/mutasi-kas/grid/lembar-mutasi'
import { muatAkunKas } from '@/lib/akun-kas-klien'
import type { Periode } from '@/lib/mutasi-draf'

interface MutasiRow {
  id: string
  tanggal: string
  keterangan: string | null
  debit: string
  kredit: string
  saldo: string | null
  akunKasId: string
  akunKasKode: string
  akunKasNama: string
  akunLawanId: string | null
  journalId: string | null
  importId: string | null
  createdByName: string
  teralokasi: string
  alokasiCount: number
  sisa: string
  status: string
}

interface MutasiDetail extends MutasiRow {
  alokasi: AlokasiRow[]
}

/** Awal & akhir bulan berjalan, sebagai string — tanpa objek Date (P2). */
function bulanBerjalan(): { start: string; end: string } {
  const [y, m] = hariIniJakarta().split('-').map(Number)
  const akhir = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(akhir).padStart(2, '0')}` }
}

/** Bulan kalender `YYYY-MM` → periode grid (D52: satu Simpan = satu akun-bulan). */
function periodeBulan(ym: string): Periode {
  const [y, m] = ym.split('-').map(Number)
  const akhir = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { mulai: `${y}-${mm}-01`, akhir: `${y}-${mm}-${String(akhir).padStart(2, '0')}` }
}

function geserBulan(p: Periode, delta: number): Periode {
  const [y, m] = p.mulai.split('-').map(Number)
  const t = y * 12 + (m - 1) + delta
  return periodeBulan(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`)
}

// Grid hanya di layar ≥ md (768 px). useSyncExternalStore, bukan efek yang
// menyetel state: tidak ada render dengan nilai basi, dan server merender daftar.
const MQ_LEBAR = '(min-width: 768px)'
function langgananLebar(cb: () => void) {
  const mq = window.matchMedia(MQ_LEBAR)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const layarLebar = () => window.matchMedia(MQ_LEBAR).matches

/**
 * Mutasi ini diselesaikan lewat AKUN LAWAN, bukan alokasi?
 *
 * Kalau ya, kolom "Belum dialokasikan" tidak punya arti untuknya: tidak ada
 * yang pernah dialokasikan dan tidak ada yang perlu dialokasikan. Mutasi yang
 * punya akun lawan DAN alokasi tetap memakai angkanya — begitu ada satu
 * alokasi, alokasinya yang menentukan jurnalnya.
 */
function alokasiTidakDipakai(r: { akunLawanId: string | null; alokasiCount: number }): boolean {
  return r.akunLawanId !== null && r.alokasiCount === 0
}

const WARNA_STATUS: Record<string, { bg: string; fg: string }> = {
  'belum dijurnal': {
    bg: 'color-mix(in srgb, var(--color-accent-critical) 16%, white)',
    fg: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)',
  },
  sebagian: {
    bg: 'color-mix(in srgb, var(--color-accent-secondary) 32%, white)',
    fg: 'var(--color-text-primary)',
  },
  selesai: { bg: '#eaf7e8', fg: '#2f6d2a' },
}

function MutasiKasContent() {
  const { activeClient, isLoaded } = useRequireClient()
  const { canDoAccounting } = useClient()
  const { rupiahPersis } = useRupiah()
  const searchParams = useSearchParams()

  const awal = useMemo(() => bulanBerjalan(), [])
  const [periode, setPeriode] = useState(awal)
  const [akunKasId, setAkunKasId] = useState('')
  const [rows, setRows] = useState<MutasiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [akunKas, setAkunKas] = useState<AkunOption[]>([])
  const [akunSemua, setAkunSemua] = useState<AkunOption[]>([])

  // Dibuka dari tombol "Koreksi di Mutasi Kas" di /jurnal (D32). Dipakai
  // sebagai KEADAAN AWAL, bukan efek yang menyetel ulang: bentuk efek melanggar
  // react-hooks/set-state-in-effect, dan lebih buruk — ia akan membuka kembali
  // baris yang baru saja ditutup akunting setiap kali komponennya render ulang.
  const mutasiDariUrl = searchParams.get('mutasi')
  const [expanded, setExpanded] = useState<string | null>(mutasiDariUrl)
  const [detail, setDetail] = useState<MutasiDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [formInitial, setFormInitial] = useState<MutationFormValue | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const lebar = useSyncExternalStore(langgananLebar, layarLebar, () => false)
  const [tampilan, setTampilan] = useState<'grid' | 'daftar'>(mutasiDariUrl ? 'daftar' : 'grid')
  const pakaiGrid = lebar && tampilan === 'grid'
  const [bulan, setBulan] = useState<Periode>(() => ({ mulai: awal.start, akhir: awal.end }))
  const [kasTab, setKasTab] = useState('')
  const [gridKotor, setGridKotor] = useState(false)
  const [versiLuar, setVersiLuar] = useState(0)
  const [rincianId, setRincianId] = useState<string | null>(null)

  const [hapusTarget, setHapusTarget] = useState<MutasiRow | null>(null)
  const [hapusBusy, setHapusBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const clientId = activeClient?.id ?? null

  // Master COA klien: seluruh akun (untuk Nama Akun) dan yang bertanda kas.
  // Dua permintaan, bukan satu yang disaring di browser: penanda kas adalah
  // aturan server (eksplisit ?? turunan), dan menyalinnya ke sini berarti dua
  // definisi "akun kas" yang bisa menyimpang. Tab rekening datang dari SATU
  // fungsi, `muatAkunKas` (lib/akun-kas-klien.ts).
  useEffect(() => {
    if (!clientId) return
    let batal = false
    void (async () => {
      try {
        const [kas, rSemua] = await Promise.all([muatAkunKas(clientId), fetch(`/api/clients/${clientId}/coa`)])
        const semua = (await rSemua.json().catch(() => null)) as { accounts?: AkunOption[] } | null
        if (batal) return
        setAkunKas(kas)
        setAkunSemua(semua?.accounts ?? [])
      } catch {
        if (!batal) {
          setAkunKas([])
          setAkunSemua([])
        }
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId])

  // Akun kas yang dipilih HARUS ada di daftar klien aktif. Diturunkan, bukan
  // dibereskan efek yang memanggil setState (react-hooks/set-state-in-effect):
  // ganti klien akan menyisakan satu render dengan id akun klien LAMA.
  const akunValid = useMemo(
    () => (akunKasId && akunKas.some(a => a.id === akunKasId) ? akunKasId : ''),
    [akunKasId, akunKas]
  )

  const muat = useCallback(async () => {
    if (!clientId) return
    try {
      const qs = new URLSearchParams({
        clientId,
        periodStart: periode.start,
        periodEnd: periode.end,
      })
      if (akunValid) qs.set('akunKasId', akunValid)
      const res = await fetch(`/api/cash-mutations?${qs}`)
      const payload = (await res.json().catch(() => null)) as
        | { mutations?: MutasiRow[]; error?: string }
        | null
      if (!res.ok) {
        setLoadError(payload?.error ?? 'Gagal memuat mutasi kas.')
        setRows([])
        return
      }
      setLoadError(null)
      setRows(payload?.mutations ?? [])
    } catch {
      setLoadError('Gagal menghubungi server.')
    } finally {
      setLoading(false)
    }
  }, [clientId, periode.start, periode.end, akunValid])

  useEffect(() => {
    // Grid memuat datanya sendiri (S8, mode grid); daftar hanya bila tampil.
    if (pakaiGrid) return
    void (async () => {
      await muat()
    })()
  }, [muat, pakaiGrid])

  const muatDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/cash-mutations/${id}`)
      const payload = (await res.json().catch(() => null)) as MutasiDetail | null
      setDetail(res.ok ? payload : null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  function toggleDetail(id: string) {
    setDetail(null)
    setExpanded(lama => (lama === id ? null : id))
  }

  // Rinciannya menyusul BARIS YANG TERBUKA, dari mana pun ia terbuka — klik
  // maupun tautan dari /jurnal. Satu jalur muat, bukan dua yang bisa berbeda.
  useEffect(() => {
    if (!expanded) return
    void (async () => {
      await muatDetail(expanded)
    })()
  }, [expanded, muatDetail])

  function bukaBuat() {
    setFormErrors([])
    setEditingId(null)
    setFormInitial(blankMutationForm(hariIniJakarta(), akunValid || (akunKas[0]?.id ?? '')))
    setFormMode('create')
  }

  function bukaUbah(r: MutasiRow) {
    setFormErrors([])
    setEditingId(r.id)
    const masuk = Number(r.debit) > 0
    setFormInitial({
      tanggal: r.tanggal,
      akunKasId: r.akunKasId,
      arah: masuk ? 'masuk' : 'keluar',
      nominal: masuk ? r.debit : r.kredit,
      keterangan: r.keterangan ?? '',
      akunLawanId: r.akunLawanId ?? '',
    })
    setFormMode('edit')
  }

  async function simpan(v: MutationFormValue) {
    if (!clientId) return
    setSubmitting(true)
    setFormErrors([])
    const body = {
      clientId,
      tanggal: v.tanggal,
      akunKasId: v.akunKasId,
      debit: v.arah === 'masuk' ? v.nominal : '',
      kredit: v.arah === 'keluar' ? v.nominal : '',
      keterangan: v.keterangan,
      akunLawanId: v.akunLawanId || null,
    }
    try {
      const url = editingId ? `/api/cash-mutations/${editingId}` : '/api/cash-mutations'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[] }
        | null
      if (!res.ok) {
        setFormErrors(
          payload?.details?.length ? payload.details : [payload?.error ?? 'Gagal menyimpan mutasi.']
        )
        return
      }
      setFormMode(null)
      setFormInitial(null)
      setEditingId(null)
      setExpanded(null)
      await muat()
    } catch {
      setFormErrors(['Gagal menghubungi server.'])
    } finally {
      setSubmitting(false)
    }
  }

  async function hapus() {
    if (!hapusTarget) return
    setHapusBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/cash-mutations/${hapusTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; details?: string[] }
          | null
        setActionError(
          payload?.details?.length
            ? `${payload.error} ${payload.details.join(' ')}`
            : (payload?.error ?? 'Gagal menghapus mutasi.')
        )
        return
      }
      setHapusTarget(null)
      setExpanded(null)
      await muat()
    } catch {
      setActionError('Gagal menghubungi server.')
    } finally {
      setHapusBusy(false)
    }
  }

  const opsiAkunKas: StyledOption[] = useMemo(
    () => akunKas.map(a => ({ value: a.id, label: a.nama, badge: a.kode })),
    [akunKas]
  )

  // Tab grid: diturunkan dari daftar akun kas klien aktif (sama seperti
  // `akunValid`) — ganti klien tidak menyisakan tab milik klien lama.
  const kasGrid = akunKas.find(a => a.id === kasTab) ?? akunKas[0] ?? null
  const coaGrid = useMemo(() => akunSemua.map(a => ({ id: a.id, kode: a.kode, nama: a.nama, jenis: a.resolvedType ?? null })), [akunSemua])
  const onKotor = useCallback((k: boolean) => setGridKotor(k), [])

  function pindahTab(id: string) {
    if (id === kasGrid?.id) return
    if (gridKotor && !window.confirm('Ada perubahan grid yang belum disimpan. Pindah akun kas? Draf tetap ada di cadangan browser ini.')) return
    setKasTab(id)
  }

  function pindahBulan(p: Periode) {
    if (p.mulai === bulan.mulai) return
    if (gridKotor && !window.confirm('Ada perubahan grid yang belum disimpan. Pindah bulan? Draf tetap ada di cadangan browser ini.')) return
    setBulan(p)
  }

  // Rincian & alokasi dari grid: memakai jalur muat rincian yang sama dengan daftar.
  useEffect(() => {
    if (!rincianId) return
    void (async () => {
      await muatDetail(rincianId)
    })()
  }, [rincianId, muatDetail])

  if (!isLoaded || !activeClient) {
    return (
      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl flex items-center justify-center gap-2"
          style={{ background: 'white', color: 'var(--color-text-muted)' }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat…</span>
        </div>
      </div>
    )
  }

  const bolehTulis = canDoAccounting
  const belumDijurnal = rows.filter(r => r.status === 'belum dijurnal').length

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 flex-wrap"
          style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: 0 }}>
              Mutasi Kas / Bank
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {pakaiGrid ? (
                <>{activeClient.name} · grid per akun kas, satu bulan per Simpan</>
              ) : (
                <>
                  {activeClient.name} · {rows.length} baris pada periode ini
                  {belumDijurnal > 0 && (
                    <>
                      {' · '}
                      <strong style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)' }}>
                        {belumDijurnal} belum dijurnal
                      </strong>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lebar && (
              <div className="inline-flex items-center gap-1 rounded-full" style={{ background: 'var(--color-muted-bg)', padding: 3 }}>
                {(
                  [
                    ['grid', 'Grid', LayoutGrid],
                    ['daftar', 'Daftar', List],
                  ] as const
                ).map(([id, label, Ikon]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tampilan === id}
                    onClick={() => {
                      if (id === tampilan) return
                      if (gridKotor && !window.confirm('Ada perubahan grid yang belum disimpan. Pindah ke daftar? Draf tetap ada di cadangan browser ini.')) return
                      if (id === 'daftar') setLoading(true)
                      setTampilan(id)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                    style={{
                      padding: '6px 14px',
                      fontSize: 12,
                      minHeight: 32,
                      border: 'none',
                      background: tampilan === id ? 'white' : 'transparent',
                      color: tampilan === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}
                  >
                    <Ikon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            )}
            {pakaiGrid ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => pindahBulan(geserBulan(bulan, -1))}
                  aria-label="Bulan sebelumnya"
                  className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ width: 34, height: 34, border: '1px solid #e5e7eb', background: 'white' }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="month"
                  aria-label="Bulan grid"
                  value={bulan.mulai.slice(0, 7)}
                  onChange={e => e.target.value && pindahBulan(periodeBulan(e.target.value))}
                  className="rounded-full px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ minHeight: 34, border: '1px solid #e5e7eb', fontSize: 12.5 }}
                />
                <button
                  type="button"
                  onClick={() => pindahBulan(geserBulan(bulan, 1))}
                  aria-label="Bulan berikutnya"
                  className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ width: 34, height: 34, border: '1px solid #e5e7eb', background: 'white' }}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
            <div style={{ width: 210 }}>
              <StyledSelect
                options={opsiAkunKas}
                value={akunValid}
                onChange={v => {
                  setLoading(true)
                  setExpanded(null)
                  setAkunKasId(v)
                }}
                placeholder="Semua akun kas"
                searchable
                searchPlaceholder="Cari akun kas…"
                ariaLabel="Saring per akun kas"
              />
            </div>
            <div style={{ width: 240 }}>
              <DateRangePicker
                value={{ from: ymdToLocalDate(periode.start), to: ymdToLocalDate(periode.end) }}
                onChange={r => {
                  if (!r?.from) return
                  setLoading(true)
                  setExpanded(null)
                  setPeriode({ start: localDateToYmd(r.from), end: localDateToYmd(r.to ?? r.from) })
                }}
                placeholder="Filter periode"
              />
            </div>
            <button
              onClick={() => {
                setLoading(true)
                void muat()
              }}
              disabled={loading}
              aria-label="Muat ulang daftar mutasi"
              className="inline-flex items-center gap-2 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 14px', fontSize: 12.5, minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
            {bolehTulis && (
              <>
                <button
                  onClick={bukaBuat}
                  disabled={akunKas.length === 0}
                  title={akunKas.length === 0 ? 'Belum ada akun bertanda kas/bank di Master COA klien ini.' : undefined}
                  className="inline-flex items-center gap-2 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ padding: '8px 16px', fontSize: 12.5, minHeight: 34, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Mutasi Baru
                </button>
              </>
            )}
              </>
            )}
          </div>
        </div>

        {pakaiGrid && (
          <div className="flex-1 min-h-0 flex flex-col" style={{ background: '#f8f8f8' }}>
            {akunKas.length === 0 ? (
              <p className="text-sm text-center py-16" style={{ color: 'var(--color-text-muted)' }}>
                Belum ada akun bertanda kas/bank di Master COA klien ini.
              </p>
            ) : (
              <>
                <div role="tablist" aria-label="Akun kas" className="flex items-center gap-1 flex-wrap px-4 pt-3">
                  {akunKas.map(a => {
                    const terpilih = a.id === kasGrid?.id
                    return (
                      <button
                        key={a.id}
                        id={`tab-kas-${a.id}`}
                        type="button"
                        role="tab"
                        aria-selected={terpilih}
                        aria-controls="panel-kas"
                        tabIndex={terpilih ? 0 : -1}
                        onClick={() => pindahTab(a.id)}
                        onKeyDown={e => {
                          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                          e.preventDefault()
                          const i = akunKas.findIndex(x => x.id === a.id)
                          const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + akunKas.length) % akunKas.length
                          pindahTab(akunKas[j].id)
                          document.getElementById(`tab-kas-${akunKas[j].id}`)?.focus()
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                        style={{
                          padding: '6px 14px',
                          fontSize: 12.5,
                          minHeight: 34,
                          border: terpilih ? 'none' : '1px solid #e5e7eb',
                          background: terpilih ? 'var(--color-accent-primary)' : 'white',
                          color: terpilih ? 'var(--color-accent-primary-fg)' : 'var(--color-text-primary)',
                        }}
                      >
                        <span className="font-mono text-[11px]">{a.kode}</span> {a.nama}
                      </button>
                    )
                  })}
                </div>
                {kasGrid && (
                  <div id="panel-kas" role="tabpanel" aria-labelledby={`tab-kas-${kasGrid.id}`} className="flex-1 min-h-0 flex flex-col p-3 sm:p-4">
                    <LembarMutasi
                      key={`${kasGrid.id}:${bulan.mulai}`}
                      clientId={activeClient.id}
                      akunKas={{ id: kasGrid.id, kode: kasGrid.kode, nama: kasGrid.nama }}
                      coa={coaGrid}
                      periode={bulan}
                      bolehTulis={bolehTulis}
                      bolehLihatJurnal={canDoAccounting}
                      versiLuar={versiLuar}
                      onKotor={onKotor}
                      onPeriode={p => setBulan(p)}
                      onRincian={id => {
                        setDetail(null)
                        setRincianId(id)
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Isi */}
        {!pakaiGrid && (
        <div className="flex-1 overflow-y-auto min-h-0" style={{ background: '#f8f8f8' }}>
          <div className="p-3 sm:p-4">
            {actionError && (
              <div role="alert" className="rounded-2xl px-3.5 py-2.5 mb-3" style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)', border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)' }}>
                <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{actionError}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16" style={{ color: 'var(--color-text-muted)' }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Memuat mutasi…</span>
              </div>
            ) : loadError ? (
              <p role="alert" className="text-sm text-center py-16" style={{ color: 'var(--color-accent-critical)' }}>
                {loadError}
              </p>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16" style={{ color: 'var(--color-text-muted)' }}>
                <Inbox className="w-8 h-8" />
                <p className="text-sm">Belum ada mutasi pada periode ini.</p>
              </div>
            ) : (
              <div className="rounded-3xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <caption className="sr-only">Daftar mutasi kas/bank periode ini</caption>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th scope="col" style={{ ...th, width: 36 }} />
                      <th scope="col" style={th}>Tanggal</th>
                      <th scope="col" style={th}>Akun kas</th>
                      <th scope="col" style={th}>Keterangan</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Debet</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Kredit</th>
                      {/* Judulnya sama dengan panel alokasi, bukan "Sisa":
                          angka ini soal ALOKASI, dan "Sisa" mengundang dibaca
                          sebagai "belum beres" oleh mutasi yang sudah selesai
                          lewat akun lawan. */}
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Belum dialokasikan</th>
                      <th scope="col" style={th}>Status</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const terbuka = expanded === r.id
                      const warna = WARNA_STATUS[r.status] ?? {
                        bg: 'var(--color-muted-bg)',
                        fg: 'var(--color-text-muted)',
                      }
                      return (
                        <Fragment key={r.id}>
                          <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                            <td style={td}>
                              <button
                                type="button"
                                onClick={() => toggleDetail(r.id)}
                                aria-expanded={terbuka}
                                aria-label={`${terbuka ? 'Tutup' : 'Buka'} rincian mutasi ${fmtTanggal(r.tanggal)}`}
                                className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: 'var(--color-text-muted)' }}
                              >
                                {terbuka ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </td>
                            <td style={td}>{fmtTanggal(r.tanggal)}</td>
                            <td style={td}>
                              <span
                                className="font-mono text-[11px] px-1.5 py-0.5 rounded-full mr-1.5"
                                style={{ background: 'var(--color-muted-bg)' }}
                              >
                                {r.akunKasKode}
                              </span>
                              {r.akunKasNama}
                            </td>
                            <td style={{ ...td, color: 'var(--color-text-muted)' }}>{r.keterangan ?? '—'}</td>
                            {/* Nominal PERSIS sampai sen, bukan dibulatkan (keputusan
                                Ricko sesudah CP-8): tabel ini dicocokkan dengan
                                rekening koran, sama seperti pratinjau impornya. */}
                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {Number(r.debit) > 0 ? rupiahPersis(r.debit) : '—'}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {Number(r.kredit) > 0 ? rupiahPersis(r.kredit) : '—'}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {/* Mutasi yang lawannya sebuah AKUN tidak memakai
                                  alokasi sama sekali — menampilkan nominal
                                  penuhnya di kolom ini membuat baris yang sudah
                                  selesai terbaca seperti masih menggantung. */}
                              {alokasiTidakDipakai(r) || Number(r.sisa) === 0
                                ? '—'
                                : rupiahPersis(r.sisa)}
                            </td>
                            <td style={td}>
                              <span
                                className="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                style={{ background: warna.bg, color: warna.fg }}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {bolehTulis && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => bukaUbah(r)}
                                    aria-label={`Ubah mutasi ${fmtTanggal(r.tanggal)}`}
                                    className="inline-flex items-center justify-center rounded-full mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                    style={{ width: 32, height: 32, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActionError(null)
                                      setHapusTarget(r)
                                    }}
                                    aria-label={`Hapus mutasi ${fmtTanggal(r.tanggal)}`}
                                    className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                    style={{ width: 32, height: 32, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                          {terbuka && (
                            <tr style={{ background: '#fcfcfc' }}>
                              <td colSpan={9} style={{ padding: 0 }}>
                                {detailLoading || !detail || detail.id !== r.id ? (
                                  <div className="flex items-center gap-2 px-4 py-4" style={{ color: 'var(--color-text-muted)' }}>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="text-xs">Memuat rincian…</span>
                                  </div>
                                ) : (
                                  <AllocationPanel
                                    mutationId={detail.id}
                                    clientId={activeClient.id}
                                    alokasi={detail.alokasi}
                                    sisa={detail.sisa}
                                    status={detail.status}
                                    bolehTulis={bolehTulis}
                                    onBerubah={() => {
                                      void muatDetail(detail.id)
                                      void muat()
                                    }}
                                  />
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {formMode && formInitial && (
        <MutationFormModal
          mode={formMode}
          initial={formInitial}
          akunKas={akunKas}
          akunLawan={akunSemua}
          errors={formErrors}
          submitting={submitting}
          onCancel={() => {
            setFormMode(null)
            setFormInitial(null)
            setEditingId(null)
          }}
          onSubmit={v => void simpan(v)}
        />
      )}

      {rincianId && (
        <ModalShell
          onDismiss={() => {
            setRincianId(null)
            setDetail(null)
          }}
          labelledBy="rincian-title"
          className="max-w-3xl"
        >
          <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
            <h2 id="rincian-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Rincian & alokasi mutasi
            </h2>
            {detail && detail.id === rincianId && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {fmtTanggal(detail.tanggal)} · {detail.keterangan ?? '(tanpa keterangan)'} ·{' '}
                {Number(detail.debit) > 0 ? `masuk ${rupiahPersis(detail.debit)}` : `keluar ${rupiahPersis(detail.kredit)}`}
              </p>
            )}
          </div>
          {detailLoading || !detail || detail.id !== rincianId ? (
            <div className="flex items-center gap-2 px-5 py-6" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Memuat rincian…</span>
            </div>
          ) : (
            <AllocationPanel
              mutationId={detail.id}
              clientId={activeClient.id}
              alokasi={detail.alokasi}
              sisa={detail.sisa}
              status={detail.status}
              bolehTulis={bolehTulis}
              onBerubah={() => {
                void muatDetail(detail.id)
                setVersiLuar(v => v + 1)
              }}
            />
          )}
        </ModalShell>
      )}

      {hapusTarget && (
        <ModalShell onDismiss={hapusBusy ? null : () => setHapusTarget(null)} labelledBy="hapus-title" className="max-w-md">
          <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
            <h2 id="hapus-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Hapus mutasi ini?
            </h2>
          </div>
          <div className="px-5 sm:px-6 py-4">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {fmtTanggal(hapusTarget.tanggal)} · {hapusTarget.keterangan ?? '(tanpa keterangan)'}
            </p>
            <div
              role="note"
              className="mt-3 rounded-2xl px-3.5 py-2.5 flex items-start gap-2"
              style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)', border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)' }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }} />
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                Alokasi, jurnal draf, dan riwayat mutasi ini ikut terhapus. Baris yang jurnalnya
                sudah diposting tidak bisa dihapus — balik jurnalnya dulu.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0' }}>
            <button
              type="button"
              onClick={() => setHapusTarget(null)}
              className="rounded-full text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 16px', minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void hapus()}
              disabled={hapusBusy}
              className="inline-flex items-center gap-2 rounded-full text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 18px', minHeight: 34, border: 'none', background: 'var(--color-accent-critical)', color: 'white' }}
            >
              {hapusBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Hapus
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// useSearchParams menuntut batas Suspense (bailout CSR) — pola yang sama
// dengan /extraction-review dan /login. Fallback null: shell halamannya sudah
// punya keadaan "Memuat…" sendiri.
export default function MutasiKasPage() {
  return (
    <Suspense fallback={null}>
      <MutasiKasContent />
    </Suspense>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12.5,
  color: 'var(--color-text-primary)',
}
