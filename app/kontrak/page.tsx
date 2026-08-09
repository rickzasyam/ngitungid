'use client'

// Halaman Kontrak — daftar kontrak klien aktif + buat/ubah/hapus + preview PDF.
// Layout mengikuti /laporan (tabel lebar di dalam shell 3-lapis), bukan gaya
// baru: keduanya "kelola dokumen milik satu klien" dan tidak ada alasan terlihat
// berbeda.
//
// Yang SENGAJA belum ada di sini: status (Aktif / Akan Datang / Berakhir),
// warnanya, dan badge-nya. Itu 3c. `contractStatus()` sudah ada di lib/contracts
// dan sengaja TIDAK di-import — kalau halaman ini mulai menurunkan status
// sendiri, 3c akan menemukan dua sumber kebenaran.
//
// Akses: owner + finance + klien; akunting TIDAK (canViewContracts di
// lib/roles.ts, ditegakkan proxy lewat CONTRACT_PREFIXES). Klien read-only —
// tombol tulis digerbangi canManageCommercial, dan API-nya requireCommercial.

import { useState, useEffect, useMemo, Fragment } from 'react'
import {
  FileSignature, Loader2, Trash2, Pencil, Eye, Inbox, RotateCw, Plus, X, Check,
} from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import { useRupiah } from '@/lib/preferences-context'
import { PdfPreviewModal } from '@/components/ui/pdf-preview-modal'
import { ModalShell } from '@/components/ui/modal-portal'
import { canManageCommercial } from '@/lib/roles'
import { layananOptionsForContract, type LayananRow } from '@/lib/layanan'
import {
  CONTRACT_JENIS, MAX_DOKUMEN_BYTES, TANGGAL_PENAGIHAN_MIN, TANGGAL_PENAGIHAN_MAX,
  type ContractJenis,
} from '@/lib/contracts'

type Contract = {
  id: string
  clientId: string
  noKontrak: string
  jenis: ContractJenis
  /** 'YYYY-MM-DD' — string, dan tetap string di seluruh file ini. */
  tanggalMulai: string
  tanggalAkhir: string
  tanggalPenagihan: number
  /** numeric(18,2) → driver mengembalikannya sebagai STRING, bukan number. */
  nominal: string
  namaDokumen: string
  ukuranDokumen: number
  layananIds: string[]
}

const JENIS_LABEL: Record<ContractJenis, string> = { reguler: 'Reguler', project: 'Project' }
const JENIS_ACCENT: Record<ContractJenis, string> = { reguler: '#daf163', project: '#bbb3f3' }

// ══ TANGGAL: dipecah manual, TIDAK PERNAH lewat objek Date ═══════
// Aturan yang sama dengan lib/contracts.ts & fmtTanggal di /laporan. `new
// Date('2026-01-01')` = tengah malam UTC, yang di WIB mundur sehari dan melempar
// 1 Januari ke 31 Desember tahun sebelumnya. Sudah pernah terjadi di periode
// laporan; tidak diulang di kontrak.
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmtTanggal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}

const HARI_PENAGIHAN = Array.from(
  { length: TANGGAL_PENAGIHAN_MAX - TANGGAL_PENAGIHAN_MIN + 1 },
  (_, i) => TANGGAL_PENAGIHAN_MIN + i
)

const fmtUkuran = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

// ── Form ─────────────────────────────────────────────────────────
type FormState = {
  clientId: string
  noKontrak: string
  jenis: ContractJenis
  tanggalMulai: string
  tanggalAkhir: string
  tanggalPenagihan: string
  nominal: string
  layananIds: string[]
  file: File | null
}

type FieldKey = keyof Omit<FormState, 'file'> | 'dokumen'

const emptyForm = (clientId: string): FormState => ({
  clientId,
  noKontrak: '',
  jenis: 'reguler',
  tanggalMulai: '',
  tanggalAkhir: '',
  tanggalPenagihan: '1',
  nominal: '',
  layananIds: [],
  file: null,
})

/**
 * Petakan pesan error server ke FIELD-nya, bukan ke banner umum.
 *
 * 409 "nomor kontrak sudah ada" adalah kasus yang paling sering kena dan paling
 * jelas milik satu field — memunculkannya sebagai toast memaksa user menebak
 * mana yang harus diperbaiki, lalu toast-nya keburu hilang.
 */
function fieldForError(status: number, msg: string): FieldKey | null {
  if (status === 409) return 'noKontrak'
  const m = msg.toLowerCase()
  if (m.includes('nomor kontrak')) return 'noKontrak'
  if (m.includes('tanggal mulai')) return 'tanggalMulai'
  if (m.includes('tanggal akhir')) return 'tanggalAkhir'
  if (m.includes('tanggal penagihan')) return 'tanggalPenagihan'
  if (m.includes('nominal')) return 'nominal'
  if (m.includes('layanan')) return 'layananIds'
  if (m.includes('jenis kontrak')) return 'jenis'
  if (m.includes('klien')) return 'clientId'
  if (m.includes('dokumen') || m.includes('pdf') || m.includes('25mb')) return 'dokumen'
  return null
}

export default function KontrakPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { role, clients } = useClient()
  const { rupiah } = useRupiah()
  // Tulis = owner + finance. Klien membuka halaman ini read-only.
  const bolehKelola = canManageCommercial(role)
  const clientId = activeClient?.id ?? null

  const [contracts, setContracts] = useState<Contract[]>([])
  const [layanan, setLayanan] = useState<LayananRow[]>([])
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // ══ MEMUAT ULANG TANPA setState DI BADAN EFEK ═══════════════════
  // `reloadKey` dinaikkan dari EVENT HANDLER (tombol Muat ulang, sesudah
  // simpan/hapus) — bukan dipanggil sebagai fungsi load() dari dalam efek.
  // Efek di bawah karenanya hanya menembakkan fetch, dan setiap setState
  // terjadi di callback promise-nya.
  //
  // `loading` DITURUNKAN, bukan disimpan: kalau ia state tersendiri, satu-
  // satunya cara menyalakannya saat klien berganti adalah setState sinkron di
  // dalam efek — persis yang menambah warning react-hooks/set-state-in-effect
  // (baseline repo ini 24 dan tidak boleh bertambah).
  const [reloadKey, setReloadKey] = useState(0)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const dataKey = clientId ? `${clientId}|${reloadKey}` : null
  const loading = dataKey !== null && loadedKey !== dataKey
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionInfo, setActionInfo] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Contract | null>(null)

  // Form: null = tertutup. `editing` null berarti mode BUAT.
  const [form, setForm] = useState<FormState | null>(null)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [formErr, setFormErr] = useState<Partial<Record<FieldKey, string>>>({})
  const [formBanner, setFormBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingForm, setLoadingForm] = useState(false)

  useEffect(() => {
    if (!clientId || !dataKey) return
    let alive = true
    fetch(`/api/contracts?clientId=${clientId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { contracts: Contract[] }) => {
        if (!alive) return
        setContracts(d.contracts)
        setLoadError(false)
        setLoadedKey(dataKey)
      })
      .catch(() => {
        if (!alive) return
        setContracts([])
        setLoadError(true)
        setLoadedKey(dataKey)
      })
    return () => { alive = false }
  }, [clientId, dataKey])

  // Katalog layanan HANYA untuk yang boleh mengelola: GET /api/layanan
  // digerbangi requireInternal, jadi role 'user' akan dapat 403 — dan ia memang
  // tidak butuh, kolom Layanan tidak ada di daftar.
  useEffect(() => {
    if (!bolehKelola) return
    let alive = true
    fetch('/api/layanan')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { layanan: LayananRow[] }) => { if (alive) setLayanan(d.layanan) })
      .catch(() => { /* katalog gagal dimuat → picker kosong, form tetap jalan */ })
    return () => { alive = false }
  }, [bolehKelola])

  /** Muat ulang daftar. Dipanggil dari event handler, TIDAK dari dalam efek. */
  const reload = () => setReloadKey(k => k + 1)

  const readError = async (res: Response, fallback: string) => {
    const p = (await res.json().catch(() => null)) as { error?: string } | null
    return p?.error ?? fallback
  }

  // ── Buka form ──────────────────────────────────────────────────
  const openCreate = () => {
    if (!clientId) return
    setEditing(null)
    setFormErr({})
    setFormBanner(null)
    setForm(emptyForm(clientId))
  }

  /**
   * Ambil kontrak dari GET /api/contracts/[id] — OTORITATIF, bukan menyaring
   * dari `contracts` di state. State itu bisa basi (kontrak berubah sejak
   * daftar dimuat) dan tidak ada sama sekali kalau halaman dibuka langsung.
   */
  const openEdit = async (c: Contract) => {
    setEditing(c)
    setFormErr({})
    setFormBanner(null)
    setForm(null)
    setLoadingForm(true)
    try {
      const res = await fetch(`/api/contracts/${c.id}`)
      if (!res.ok) throw new Error(await readError(res, 'Gagal memuat kontrak.'))
      const d: { contract: Contract } = await res.json()
      setEditing(d.contract)
      setForm({
        clientId: d.contract.clientId,
        noKontrak: d.contract.noKontrak,
        jenis: d.contract.jenis,
        tanggalMulai: d.contract.tanggalMulai,
        tanggalAkhir: d.contract.tanggalAkhir,
        tanggalPenagihan: String(d.contract.tanggalPenagihan),
        nominal: d.contract.nominal,
        layananIds: d.contract.layananIds,
        file: null,
      })
    } catch (e) {
      setEditing(null)
      setActionError(e instanceof Error ? e.message : 'Gagal memuat kontrak.')
    } finally {
      setLoadingForm(false)
    }
  }

  const closeForm = () => {
    if (saving) return
    setForm(null)
    setEditing(null)
    setFormErr({})
    setFormBanner(null)
  }

  // ── Simpan ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form) return
    setFormErr({})
    setFormBanner(null)

    if (!editing && !form.file) {
      setFormErr({ dokumen: 'Dokumen kontrak (PDF) wajib diunggah.' })
      return
    }
    if (form.file && form.file.size > MAX_DOKUMEN_BYTES) {
      setFormErr({ dokumen: `"${form.file.name}" melebihi 25MB.` })
      return
    }

    const fd = new FormData()
    fd.append('clientId', form.clientId)
    fd.append('noKontrak', form.noKontrak)
    fd.append('jenis', form.jenis)
    fd.append('tanggalMulai', form.tanggalMulai)
    fd.append('tanggalAkhir', form.tanggalAkhir)
    fd.append('tanggalPenagihan', form.tanggalPenagihan)
    fd.append('nominal', form.nominal)
    // Dikirim SEMUA yang tercentang, termasuk layanan nonaktif yang sudah
    // terpasang di kontrak ini — picker-nya memang menampilkannya
    // (layananOptionsForContract), jadi tidak ada yang menguap saat menyimpan.
    for (const id of form.layananIds) fd.append('layananIds', id)
    if (form.file) fd.append('dokumen', form.file)

    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/contracts/${editing.id}`, { method: 'PATCH', body: fd })
        : await fetch('/api/contracts', { method: 'POST', body: fd })
      if (!res.ok) {
        const msg = await readError(res, 'Gagal menyimpan kontrak.')
        const field = fieldForError(res.status, msg)
        if (field) setFormErr({ [field]: msg })
        else setFormBanner(msg)
        return
      }
      const dibuatUntukKlienLain = form.clientId !== clientId
      setForm(null)
      setEditing(null)
      reload()
      setActionInfo(
        dibuatUntukKlienLain
          ? `Kontrak tersimpan untuk ${clients.find(c => c.id === form.clientId)?.name ?? 'klien lain'}. Ganti klien aktif di sidebar untuk melihatnya.`
          : null
      )
    } catch {
      setFormBanner('Gagal menyimpan kontrak. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: Contract) => {
    setBusy(`del:${c.id}`)
    setActionError(null)
    try {
      const res = await fetch(`/api/contracts/${c.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Gagal menghapus kontrak.'))
      reload()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal menghapus kontrak.')
    } finally {
      setBusy(null)
      setConfirmDeleteId(null)
    }
  }

  // Opsi picker: aktif + yang SUDAH terpasang di kontrak ini walau nonaktif.
  // selectableLayanan() saja akan menjatuhkan yang nonaktif diam-diam saat
  // disimpan ulang — lihat lib/layanan.ts.
  const opsiLayanan = useMemo(
    () => layananOptionsForContract(layanan, form?.layananIds ?? []),
    [layanan, form?.layananIds]
  )

  if (!isLoaded || !activeClient) return null

  const th: React.CSSProperties = { textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#1f2430', verticalAlign: 'middle' }
  const ghostBtn = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
    border: '1px solid #e5e7eb', background: 'white', fontSize: 12, fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
  })
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }
  const input = (invalid: boolean): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13, color: '#1f2430',
    border: `1px solid ${invalid ? 'rgba(220,38,38,0.55)' : '#e5e7eb'}`, background: 'white', outline: 'none',
  })
  const errText = (msg?: string) =>
    msg ? <p style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 5 }}>{msg}</p> : null

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div className="h-full rounded-3xl overflow-hidden flex flex-col" style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between gap-4" style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: 0 }}>Kontrak</h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {bolehKelola
                ? `${activeClient.name} · Kelola kontrak — buat, ubah, atau hapus`
                : `${activeClient.name} · Kontrak yang berlaku untuk Anda`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setActionError(null); setActionInfo(null); reload() }}
              disabled={loading || busy !== null}
              aria-label="Muat ulang daftar kontrak"
              style={{ ...ghostBtn(loading || busy !== null), color: 'var(--color-text-muted)' }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
            {bolehKelola && (
              <button
                onClick={openCreate}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ padding: '8px 16px', fontSize: 12.5, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', cursor: 'pointer' }}
              >
                <Plus className="w-3.5 h-3.5" /> Kontrak Baru
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-full" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Memuat kontrak…</span>
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: '#dc2626' }}>Gagal memuat kontrak. Coba muat ulang.</p>
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center" style={{ maxWidth: 380 }}>
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}>
                  <Inbox className="w-6 h-6" style={{ color: '#8aa32e' }} />
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: '#2d2d2d' }}>Belum ada kontrak</p>
                <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  {bolehKelola
                    ? `Belum ada kontrak tercatat untuk ${activeClient.name}. Mulai dengan membuat kontrak baru.`
                    : `Belum ada kontrak tercatat untuk ${activeClient.name}.`}
                </p>
                {bolehKelola && (
                  <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-full font-semibold"
                    style={{ padding: '8px 16px', fontSize: 12.5, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', cursor: 'pointer' }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Kontrak Baru
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1240, margin: '0 auto' }}>

              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                <span style={{ fontWeight: 700, color: '#1f2430' }}>{contracts.length}</span> kontrak tercatat
              </p>

              {actionError && (
                <div style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: '#b91c1c' }}>
                  {actionError}
                </div>
              )}
              {actionInfo && (
                <div style={{ background: '#f0f9ff', border: '1px solid rgba(2,132,199,0.15)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: '#0369a1' }}>
                  {actionInfo}
                </div>
              )}

              <div className="ng-card-lift" style={{ background: 'white', borderRadius: 18, border: '1px solid #ececec', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <th style={{ ...th, minWidth: 170 }}>No Kontrak</th>
                        <th style={{ ...th, minWidth: 150 }}>Klien</th>
                        <th style={th}>Jenis</th>
                        <th style={{ ...th, minWidth: 190 }}>Periode</th>
                        <th style={{ ...th, textAlign: 'right', minWidth: 130 }}>Nominal</th>
                        <th style={{ ...th, textAlign: 'right' }}>Tgl Penagihan</th>
                        <th style={{ ...th, textAlign: 'right' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map(c => {
                        const deleting = busy === `del:${c.id}`
                        const confirming = confirmDeleteId === c.id
                        return (
                          <Fragment key={c.id}>
                            <tr style={{ borderBottom: '1px solid #f5f5f6' }}>
                              <td style={td}>
                                <div className="flex items-center" style={{ gap: 9 }}>
                                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 8, background: JENIS_ACCENT[c.jenis] + '22' }}>
                                    <FileSignature className="w-4 h-4" style={{ color: '#1f2430' }} />
                                  </div>
                                  <span style={{ fontWeight: 600 }}>{c.noKontrak}</span>
                                </div>
                              </td>
                              <td style={{ ...td, color: 'var(--color-text-muted)' }}>{activeClient.name}</td>
                              <td style={td}>{JENIS_LABEL[c.jenis]}</td>
                              <td style={{ ...td, color: '#374151', whiteSpace: 'nowrap' }}>
                                {fmtTanggal(c.tanggalMulai)} – {fmtTanggal(c.tanggalAkhir)}
                              </td>
                              {/* numeric → string dari driver; Number() secara EKSPLISIT
                                  di batas ini, bukan dibiarkan ter-coerce diam-diam. */}
                              <td style={{ ...td, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {rupiah(Number(c.nominal))}
                              </td>
                              <td style={{ ...td, textAlign: 'right', color: '#374151' }}>Tgl {c.tanggalPenagihan}</td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                {/* Tombol LANGSUNG, bukan kebab — tiga aksi ini cukup
                                    sedikit untuk ditampilkan seluruhnya, dan menyembunyikan
                                    Preview di balik menu adalah bagaimana fitur jadi
                                    tak terlihat (pelajaran dari rail /upload). */}
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    aria-label={`Preview dokumen kontrak ${c.noKontrak}`}
                                    title="Lihat dokumen kontrak (preview inline)"
                                    onClick={() => { setPreview(c); setActionError(null) }}
                                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                    style={{ ...ghostBtn(false), color: '#374151' }}
                                  >
                                    <Eye className="w-3.5 h-3.5" /> Preview
                                  </button>
                                  {bolehKelola && (
                                    <>
                                      <button
                                        aria-label={`Ganti kontrak ${c.noKontrak}`}
                                        title="Ubah data kontrak / ganti dokumennya"
                                        disabled={busy !== null || loadingForm}
                                        onClick={() => void openEdit(c)}
                                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                        style={{ ...ghostBtn(busy !== null || loadingForm), color: '#374151' }}
                                      >
                                        <Pencil className="w-3.5 h-3.5" /> Ganti
                                      </button>
                                      <button
                                        aria-label={`Hapus kontrak ${c.noKontrak}`}
                                        title="Hapus kontrak"
                                        disabled={busy !== null}
                                        onClick={() => { setConfirmDeleteId(c.id); setActionError(null) }}
                                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                        style={{ ...ghostBtn(busy !== null), color: '#dc2626', borderColor: 'rgba(220,38,38,0.25)' }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Konfirmasi hapus — MENYEBUT nomor kontraknya, bukan "kontrak ini". */}
                            {confirming && (
                              <tr style={{ borderBottom: '1px solid #f5f5f6' }}>
                                <td colSpan={7} style={{ padding: '10px 14px', background: '#fef2f2' }}>
                                  <div className="flex items-center justify-between flex-wrap gap-3">
                                    <span style={{ fontSize: 12.5, color: '#b91c1c' }}>
                                      Hapus kontrak <strong>{c.noKontrak}</strong> ({JENIS_LABEL[c.jenis]}, {fmtTanggal(c.tanggalMulai)} – {fmtTanggal(c.tanggalAkhir)})? Dokumen PDF-nya ikut terhapus dan tidak bisa dikembalikan.
                                    </span>
                                    <div className="inline-flex items-center gap-2 flex-shrink-0">
                                      <button
                                        disabled={deleting}
                                        onClick={() => void handleDelete(c)}
                                        className="inline-flex items-center gap-1.5 rounded-full font-semibold"
                                        style={{ padding: '7px 16px', fontSize: 12, border: 'none', background: '#dc2626', color: 'white', cursor: deleting ? 'default' : 'pointer' }}
                                      >
                                        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        {deleting ? 'Menghapus…' : 'Ya, hapus'}
                                      </button>
                                      <button
                                        disabled={deleting}
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="rounded-full"
                                        style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {preview && (
        <PdfPreviewModal
          src={`/api/contracts/${preview.id}/dokumen`}
          title={`Kontrak ${preview.noKontrak}`}
          subtitle={preview.namaDokumen}
          accent={JENIS_ACCENT[preview.jenis]}
          onClose={() => setPreview(null)}
        />
      )}

      {form && (
        <ModalShell
          onDismiss={saving ? null : closeForm}
          labelledBy="kontrak-form-title"
          className="max-w-2xl"
        >
          <div className="flex items-center justify-between gap-3 flex-shrink-0" style={{ padding: '15px 20px', borderBottom: '1px solid #f0f0f0' }}>
            <h2 id="kontrak-form-title" style={{ fontSize: 15, fontWeight: 700, color: '#1f2430', margin: 0 }}>
              {editing ? `Ubah Kontrak ${editing.noKontrak}` : 'Kontrak Baru'}
            </h2>
            <button
              onClick={closeForm}
              disabled={saving}
              aria-label="Tutup form kontrak"
              className="inline-flex items-center justify-center rounded-full flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ width: 34, height: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: saving ? 'default' : 'pointer' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {formBanner && (
              <div style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: '#b91c1c' }}>
                {formBanner}
              </div>
            )}

            {/* 1 — Klien */}
            <div>
              <label htmlFor="k-klien" style={label}>Klien</label>
              <select
                id="k-klien"
                value={form.clientId}
                onChange={e => setForm({ ...form, clientId: e.target.value })}
                style={input(!!formErr.clientId)}
              >
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errText(formErr.clientId)}
            </div>

            {/* 2 — No Kontrak */}
            <div>
              <label htmlFor="k-no" style={label}>No Kontrak</label>
              <input
                id="k-no"
                value={form.noKontrak}
                onChange={e => setForm({ ...form, noKontrak: e.target.value })}
                placeholder="mis. NGT/2026/001"
                aria-invalid={!!formErr.noKontrak}
                aria-describedby={formErr.noKontrak ? 'k-no-err' : undefined}
                style={input(!!formErr.noKontrak)}
              />
              {formErr.noKontrak && <p id="k-no-err" style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 5 }}>{formErr.noKontrak}</p>}
            </div>

            {/* 3 — Jenis */}
            <div>
              <span style={label}>Jenis Kontrak</span>
              <div className="inline-flex" style={{ gap: 6 }} role="group" aria-label="Jenis kontrak">
                {CONTRACT_JENIS.map(j => {
                  const aktif = form.jenis === j
                  return (
                    <button
                      key={j}
                      type="button"
                      aria-pressed={aktif}
                      onClick={() => setForm({ ...form, jenis: j })}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                      style={{
                        padding: '7px 18px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${aktif ? 'transparent' : '#e5e7eb'}`,
                        background: aktif ? 'var(--color-accent-primary)' : 'white',
                        color: aktif ? 'var(--color-accent-primary-fg)' : '#374151',
                      }}
                    >
                      {JENIS_LABEL[j]}
                    </button>
                  )
                })}
              </div>
              {errText(formErr.jenis)}
            </div>

            {/* 4 — Tanggal Mulai & Akhir. <input type="date"> memberi & menerima
                'YYYY-MM-DD' apa adanya — tidak ada objek Date di jalur ini. */}
            <div className="flex gap-3 flex-wrap">
              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="k-mulai" style={label}>Tanggal Mulai</label>
                <input
                  id="k-mulai" type="date" value={form.tanggalMulai}
                  onChange={e => setForm({ ...form, tanggalMulai: e.target.value })}
                  style={input(!!formErr.tanggalMulai)}
                />
                {errText(formErr.tanggalMulai)}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label htmlFor="k-akhir" style={label}>Tanggal Akhir</label>
                <input
                  id="k-akhir" type="date" value={form.tanggalAkhir}
                  onChange={e => setForm({ ...form, tanggalAkhir: e.target.value })}
                  style={input(!!formErr.tanggalAkhir)}
                />
                {errText(formErr.tanggalAkhir)}
              </div>
            </div>

            {/* 5 — Tanggal Penagihan */}
            <div>
              <label htmlFor="k-tagih" style={label}>Tanggal Penagihan</label>
              <select
                id="k-tagih"
                value={form.tanggalPenagihan}
                onChange={e => setForm({ ...form, tanggalPenagihan: e.target.value })}
                style={{ ...input(!!formErr.tanggalPenagihan), maxWidth: 160 }}
              >
                {HARI_PENAGIHAN.map(d => <option key={d} value={String(d)}>Tanggal {d}</option>)}
              </select>
              {errText(formErr.tanggalPenagihan)}
            </div>

            {/* 6 — Nominal */}
            <div>
              <label htmlFor="k-nominal" style={label}>Nominal (Rp)</label>
              <input
                id="k-nominal"
                inputMode="decimal"
                value={form.nominal}
                onChange={e => setForm({ ...form, nominal: e.target.value })}
                placeholder="mis. 15000000"
                style={{ ...input(!!formErr.nominal), maxWidth: 260 }}
              />
              {errText(formErr.nominal)}
            </div>

            {/* 7 — Layanan */}
            <div>
              <span style={label}>Layanan</span>
              {opsiLayanan.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Belum ada layanan aktif. Tambahkan lewat Settings → Layanan.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 190, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 10, padding: 12 }}>
                  {opsiLayanan.map(l => {
                    const dipilih = form.layananIds.includes(l.id)
                    return (
                      <label key={l.id} className="flex items-center gap-2.5" style={{ fontSize: 13, color: '#1f2430', cursor: 'pointer', minHeight: 32 }}>
                        <input
                          type="checkbox"
                          checked={dipilih}
                          onChange={() =>
                            setForm({
                              ...form,
                              layananIds: dipilih
                                ? form.layananIds.filter(x => x !== l.id)
                                : [...form.layananIds, l.id],
                            })
                          }
                          style={{ width: 16, height: 16, accentColor: 'var(--color-accent-primary)', cursor: 'pointer' }}
                        />
                        {/* Nonaktif dirender NORMAL — tanpa coretan, tanpa
                            "(nonaktif)". Bagi kontrak ini, layanan itu memang
                            dijual saat itu (lihat lib/layanan.ts). */}
                        <span>{l.nama}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {errText(formErr.layananIds)}
            </div>

            {/* 8 — Dokumen */}
            <div>
              <label htmlFor="k-dokumen" style={label}>
                Dokumen Kontrak (PDF{editing ? ', opsional' : ', wajib'})
              </label>
              {editing && (
                <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Terpasang: {editing.namaDokumen} ({fmtUkuran(editing.ukuranDokumen)}). Kosongkan untuk mempertahankannya.
                </p>
              )}
              <input
                id="k-dokumen"
                type="file"
                accept=".pdf"
                onChange={e => setForm({ ...form, file: e.target.files?.[0] ?? null })}
                style={{ ...input(!!formErr.dokumen), padding: '8px 10px', fontSize: 12.5 }}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5 }}>Maks 25 MB.</p>
              {errText(formErr.dokumen)}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 flex-shrink-0" style={{ padding: '13px 20px', borderTop: '1px solid #f0f0f0' }}>
            <button
              onClick={closeForm}
              disabled={saving}
              className="rounded-full"
              style={{ padding: '8px 16px', fontSize: 12.5, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: saving ? 'default' : 'pointer' }}
            >
              Batal
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 18px', fontSize: 12.5, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Menyimpan…' : editing ? 'Simpan Perubahan' : 'Simpan Kontrak'}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
