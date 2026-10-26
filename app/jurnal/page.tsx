'use client'

// Halaman Jurnal Umum — daftar jurnal klien aktif per periode, plus buat, ubah,
// dan hapus draf. Tata letaknya mengikuti /kontrak dan /laporan (tabel di dalam
// shell tiga lapis), bukan gaya baru: ketiganya "kelola dokumen milik satu
// klien" dan tidak ada alasan terlihat berbeda.
//
// Akses: owner + akunting saja (D3 — /jurnal ada di ACCOUNTING_ONLY_PREFIXES,
// ditegakkan proxy). Halaman ini tetap MENGGERBANGI tombol tulisnya sendiri
// lewat canDoAccounting, dan API-nya requireAkunting — tiga lapis yang sama,
// karena gerbang halaman saja tidak pernah cukup.
//
// Aturan pembukuan TIDAK hidup di sini. Selisih D/K dihitung modul yang sama
// dengan server (lib/journal.ts), dan status "boleh diubah" dijawab
// canEditJournal, bukan perbandingan status lokal.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  SquareArrowOutUpRight,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useClient } from '@/lib/client-context'
import { useRupiah } from '@/lib/preferences-context'
import { ModalShell } from '@/components/ui/modal-portal'
import { DateRangePicker } from '@/components/date-range-picker'
import { localDateToYmd, ymdToLocalDate, todayYmd } from '@/lib/ymd'
import {
  canEditJournal,
  isSumberModul,
  JOURNAL_STATUS_LABEL,
  SUMBER_MODUL_LABEL,
  sumberDokumenHref,
  TANPA_NO_BUKTI,
  type JournalStatus,
} from '@/lib/journal'
import Link from 'next/link'
import {
  JournalFormModal,
  blankJournalForm,
  supplierUntukDikirim,
  type CoaOption,
  type JournalFormValue,
  type SupplierOption,
} from '@/components/jurnal/journal-form-modal'
import {
  JournalDetail,
  fmtTanggal,
  type JournalDetailData,
} from '@/components/jurnal/journal-detail'
import {
  JournalReverseModal,
  type ReverseValue,
} from '@/components/jurnal/journal-reverse-modal'
import { isDateLocked } from '@/lib/period-lock'

interface JournalRow {
  id: string
  tanggal: string
  noBukti: string | null
  keterangan: string | null
  sumber: string
  status: JournalStatus
  createdAt: string
  createdByName: string
  totalDebit: string
  lineCount: number
  /** Id pembalik yang SUDAH TERPOSTING — null berarti belum pernah dibalik.
   *  Definisinya sama persis dengan canReverse di server, jadi tombol di layar
   *  dan penolakan server tidak pernah berbeda pendapat. */
  reversedById: string | null
  reversedByNoBukti: string | null
  reversalOfId: string | null
  reversalOfNoBukti: string | null
  /** Id dokumen asal untuk jurnal bersumber modul (D32). null = tidak ketemu. */
  sumberDokumenId: string | null
  /** Mitigasi (c) D42 — diturunkan dari riwayat, tidak disimpan. */
  diubahSetelahPosting: boolean
}

/** Awal & akhir bulan berjalan, sebagai string — tanpa objek Date (P2). */
function bulanBerjalan(): { start: string; end: string } {
  const [y, m] = todayYmd().split('-').map(Number)
  const akhir = new Date(y, m, 0).getDate() // hari 0 bulan berikutnya = akhir bulan ini
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(akhir).padStart(2, '0')}` }
}

export default function JurnalPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { canDoAccounting } = useClient()
  const { rupiahPersis } = useRupiah()

  const awal = useMemo(() => bulanBerjalan(), [])
  const [periode, setPeriode] = useState<{ start: string; end: string }>(awal)
  const [rows, setRows] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<JournalDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [accounts, setAccounts] = useState<CoaOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [formInitial, setFormInitial] = useState<JournalFormValue | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])

  const [hapusTarget, setHapusTarget] = useState<JournalRow | null>(null)
  const [hapusBusy, setHapusBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [postingTarget, setPostingTarget] = useState<JournalRow | null>(null)
  const [postingBusy, setPostingBusy] = useState(false)
  const [balikTarget, setBalikTarget] = useState<JournalRow | null>(null)
  const [balikBusy, setBalikBusy] = useState(false)
  const [balikErrors, setBalikErrors] = useState<string[]>([])
  // Kunci periode (K4) — hanya untuk PERINGATAN; server menolak 409 sendiri (K2).
  const [terkunciSampai, setTerkunciSampai] = useState<string | null>(null)

  const clientId = activeClient?.id ?? null
  const postingTerkunci =
    postingTarget !== null && terkunciSampai !== null && isDateLocked(postingTarget.tanggal, [{ terkunciSampai }])

  // TIDAK menyentuh state sebelum await pertama, dan efek di bawah memanggilnya
  // dari dalam fungsi async — dua-duanya supaya tidak ada setState yang berjalan
  // sinkron di badan efek (aturan react-hooks/set-state-in-effect: render
  // berantai). Penanda `loading` sudah bernilai true sejak awal, dan yang
  // menyalakannya lagi saat muat ulang atau ganti periode adalah penangan
  // tombol — di sana setState memang boleh sinkron.
  const muat = useCallback(async () => {
    if (!clientId) return
    try {
      const qs = new URLSearchParams({
        clientId,
        periodStart: periode.start,
        periodEnd: periode.end,
      })
      const res = await fetch(`/api/journals?${qs}`)
      const payload = (await res.json().catch(() => null)) as
        | { journals?: JournalRow[]; error?: string }
        | null
      if (!res.ok) {
        setLoadError(payload?.error ?? 'Gagal memuat jurnal.')
        setRows([])
        return
      }
      setLoadError(null)
      setRows(payload?.journals ?? [])
    } catch {
      setLoadError('Gagal menghubungi server.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [clientId, periode.start, periode.end])

  useEffect(() => {
    void (async () => {
      await muat()
    })()
  }, [muat])

  // Master COA dimuat sekali per klien — dipakai pemilih akun di form.
  useEffect(() => {
    if (!clientId) return
    let batal = false
    void (async () => {
      try {
        const [res, resSup, resKunci] = await Promise.all([
          fetch(`/api/clients/${clientId}/coa`),
          fetch(`/api/clients/${clientId}/suppliers`),
          fetch(`/api/period-locks?clientId=${clientId}`),
        ])
        const payload = (await res.json().catch(() => null)) as { accounts?: CoaOption[] } | null
        const pSup = (await resSup.json().catch(() => null)) as { suppliers?: SupplierOption[] } | null
        const pKunci = (await resKunci.json().catch(() => null)) as { terkunciSampai?: string | null } | null
        if (batal) return
        // Gagal membaca kunci tidak menggagalkan halaman: peringatannya sekadar
        // tidak muncul, dan server tetap menolak.
        setTerkunciSampai(resKunci.ok ? (pKunci?.terkunciSampai ?? null) : null)
        setAccounts(payload?.accounts ?? [])
        // Supplier untuk penanda baris berakun hutang (F4). Gagal memuatnya
        // tidak menggagalkan form: pemilihnya sekadar tidak muncul.
        setSuppliers(pSup?.suppliers ?? [])
      } catch {
        if (!batal) {
          setAccounts([])
          setSuppliers([])
        }
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId])

  /** Buka rincian satu jurnal. Dipakai tombol expand DAN sesudah posting /
   *  pembalikan, supaya hasilnya (riwayat, lencana) langsung terlihat. */
  async function bukaDetail(id: string) {
    setExpanded(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/journals/${id}`)
      const payload = (await res.json().catch(() => null)) as JournalDetailData | null
      setDetail(res.ok ? payload : null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function toggleRow(row: JournalRow) {
    if (expanded === row.id) {
      setExpanded(null)
      return
    }
    await bukaDetail(row.id)
  }

  function bukaBuat() {
    setActionError(null)
    setFormErrors([])
    setEditingId(null)
    setFormInitial(blankJournalForm(todayYmd()))
    setFormMode('create')
  }

  async function bukaUbah(row: JournalRow) {
    setActionError(null)
    setFormErrors([])
    setEditingId(row.id)
    setFormMode('edit')
    setFormInitial(null)
    try {
      const res = await fetch(`/api/journals/${row.id}`)
      const d = (await res.json().catch(() => null)) as JournalDetailData | null
      if (!res.ok || !d) {
        setActionError('Gagal memuat jurnal untuk diubah.')
        setFormMode(null)
        return
      }
      setFormInitial({
        tanggal: d.tanggal,
        noBukti: d.noBukti ?? '',
        keterangan: d.keterangan ?? '',
        lines: d.lines.map(l => ({
          key: l.id,
          masterCoaId: l.masterCoaId,
          debit: Number(l.debit) > 0 ? l.debit : '',
          kredit: Number(l.kredit) > 0 ? l.kredit : '',
          keterangan: l.keterangan ?? '',
          // WAJIB ikut: PATCH mengganti seluruh baris, jadi supplier yang
          // tidak dimuat ke form terhapus saat disimpan.
          supplierId: l.supplierId ?? '',
        })),
      })
    } catch {
      setActionError('Gagal menghubungi server.')
      setFormMode(null)
    }
  }

  async function simpan(value: JournalFormValue) {
    if (!clientId) return
    setSubmitting(true)
    setFormErrors([])
    const body = {
      clientId,
      tanggal: value.tanggal,
      noBukti: value.noBukti,
      keterangan: value.keterangan,
      lines: value.lines.map(l => ({
        masterCoaId: l.masterCoaId,
        debit: l.debit,
        kredit: l.kredit,
        keterangan: l.keterangan,
        supplierId: supplierUntukDikirim(l, accounts),
      })),
    }
    try {
      const url = formMode === 'edit' && editingId ? `/api/journals/${editingId}` : '/api/journals'
      const res = await fetch(url, {
        method: formMode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[] }
        | null
      if (!res.ok) {
        setFormErrors(payload?.details?.length ? payload.details : [payload?.error ?? 'Gagal menyimpan jurnal.'])
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
      const res = await fetch(`/api/journals/${hapusTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setActionError(payload?.error ?? 'Gagal menghapus jurnal.')
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

  // ── Posting ───────────────────────────────────────────────────
  // Konfirmasi dulu, selalu: sesudah diposting jurnal tidak bisa diubah maupun
  // dihapus, hanya dibalik. Server memeriksa ulang seluruh syaratnya lewat
  // canPost — tombol yang tampil di sini bukan izin, cuma jalan pintas.
  async function posting() {
    if (!postingTarget) return
    const id = postingTarget.id
    setPostingBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/journals/${id}/post`, { method: 'POST' })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setActionError(payload?.error ?? 'Gagal memposting jurnal.')
        return
      }
      setPostingTarget(null)
      await muat()
      await bukaDetail(id)
    } catch {
      setActionError('Gagal menghubungi server.')
    } finally {
      setPostingBusy(false)
    }
  }

  // ── Jurnal balik ──────────────────────────────────────────────
  // Barisnya disusun SERVER dari jurnal aslinya (buildReversalLines). Yang
  // dikirim dari sini hanya tanggal, nomor bukti, dan keterangan pembaliknya.
  async function balik(value: ReverseValue) {
    if (!balikTarget) return
    setBalikBusy(true)
    setBalikErrors([])
    try {
      const res = await fetch(`/api/journals/${balikTarget.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      const payload = (await res.json().catch(() => null)) as
        | { id?: string; error?: string; details?: string[] }
        | null
      if (!res.ok) {
        setBalikErrors(
          payload?.details?.length ? payload.details : [payload?.error ?? 'Gagal membuat jurnal balik.']
        )
        return
      }
      setBalikTarget(null)
      await muat()
      // Yang dibuka adalah DRAF PEMBALIKNYA, bukan jurnal asal: pekerjaannya
      // belum selesai — draf itu masih harus diposting.
      if (payload?.id) await bukaDetail(payload.id)
    } catch {
      setBalikErrors(['Gagal menghubungi server.'])
    } finally {
      setBalikBusy(false)
    }
  }

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
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: 0 }}>Jurnal Umum</h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {activeClient.name} · {rows.length} jurnal pada periode ini
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ width: 260 }}>
              <DateRangePicker
                value={{ from: ymdToLocalDate(periode.start), to: ymdToLocalDate(periode.end) }}
                onChange={r => {
                  if (!r?.from) return
                  setLoading(true)
                  setPeriode({
                    start: localDateToYmd(r.from),
                    end: localDateToYmd(r.to ?? r.from),
                  })
                }}
                placeholder="Filter periode"
              />
            </div>
            <button
              onClick={() => { setLoading(true); void muat() }}
              disabled={loading}
              aria-label="Muat ulang daftar jurnal"
              className="inline-flex items-center gap-2 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{
                padding: '8px 14px',
                fontSize: 12.5,
                minHeight: 34,
                border: '1px solid #e5e7eb',
                background: 'white',
                color: 'var(--color-text-muted)',
              }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
            {bolehTulis && (
              <button
                onClick={bukaBuat}
                disabled={accounts.length === 0}
                title={
                  accounts.length === 0
                    ? 'Master COA klien ini masih kosong — impor dulu di Settings.'
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{
                  padding: '8px 16px',
                  fontSize: 12.5,
                  minHeight: 34,
                  border: 'none',
                  background: 'var(--color-accent-primary)',
                  color: 'var(--color-accent-primary-fg)',
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Jurnal Baru
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          {actionError && (
            <div
              role="alert"
              className="mx-4 mt-4 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
              }}
            >
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
              />
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{actionError}</p>
            </div>
          )}

          {loading ? (
            <div
              className="flex items-center justify-center gap-2 h-full"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Memuat jurnal…</span>
            </div>
          ) : loadError ? (
            <p className="px-6 py-8 text-sm" style={{ color: '#b91c1c' }}>{loadError}</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <Inbox className="w-10 h-10" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Belum ada jurnal pada periode ini
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {bolehTulis
                    ? 'Buat jurnal pertama, atau ganti periodenya di filter di atas.'
                    : 'Coba ganti periodenya di filter di atas.'}
                </p>
              </div>
              {bolehTulis && (
                <button
                  onClick={bukaBuat}
                  disabled={accounts.length === 0}
                  className="inline-flex items-center gap-2 rounded-full font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{
                    padding: '8px 16px',
                    fontSize: 12.5,
                    minHeight: 34,
                    border: 'none',
                    background: 'var(--color-accent-primary)',
                    color: 'var(--color-accent-primary-fg)',
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Jurnal Baru
                </button>
              )}
            </div>
          ) : (
            <div className="px-4 py-4">
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1px solid #f0f0f0' }}
              >
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <caption className="sr-only">
                    Daftar jurnal {activeClient.name} periode {fmtTanggal(periode.start)} sampai{' '}
                    {fmtTanggal(periode.end)}
                  </caption>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th scope="col" style={{ ...th, width: 34 }} />
                      <th scope="col" style={th}>Tanggal</th>
                      <th scope="col" style={th}>No. Bukti</th>
                      <th scope="col" style={th}>Keterangan</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th>
                      <th scope="col" style={th}>Status</th>
                      <th scope="col" style={th}>Dibuat oleh</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const open = expanded === r.id
                      // D32: jurnal bersumber modul dimiliki dokumen asalnya.
                      const bisaUbah = bolehTulis && canEditJournal(r.status, r.sumber)
                      const dariModul = isSumberModul(r.sumber)
                      const bisaPosting = bolehTulis && r.status === 'draft'
                      // "Belum dibalik" = belum punya pembalik TERPOSTING.
                      // Pembalik yang masih draf tidak menghalangi, persis
                      // seperti canReverse di server.
                      const bisaBalik = bolehTulis && r.status === 'posted' && !r.reversedById
                      const adaAksi = bisaUbah || bisaPosting || bisaBalik || dariModul
                      return (
                        <Fragment key={r.id}>
                          <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                            <td style={{ ...td, paddingRight: 0 }}>
                              <button
                                type="button"
                                onClick={() => void toggleRow(r)}
                                aria-expanded={open}
                                aria-label={`${open ? 'Tutup' : 'Buka'} rincian jurnal ${r.noBukti ?? TANPA_NO_BUKTI}`}
                                className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                style={{
                                  width: 32,
                                  height: 32,
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--color-text-muted)',
                                  cursor: 'pointer',
                                }}
                              >
                                {open ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTanggal(r.tanggal)}</td>
                            <td
                              style={{
                                ...td,
                                whiteSpace: 'nowrap',
                                fontWeight: r.noBukti ? 600 : 400,
                                color: r.noBukti ? undefined : 'var(--color-text-muted)',
                              }}
                            >
                              {r.noBukti ?? '—'}
                              {/* Lencana keterkaitan pembalik. Ditaruh di sel
                                  nomor bukti, bukan di kolom Status: yang
                                  ditunjuknya adalah DOKUMEN lain, bukan
                                  keadaan jurnal ini. */}
                              {r.reversedById && (
                                <span
                                  style={lencana}
                                  title={`Dibalik oleh ${r.reversedByNoBukti ?? TANPA_NO_BUKTI}`}
                                >
                                  Dibalik oleh {r.reversedByNoBukti ?? TANPA_NO_BUKTI}
                                </span>
                              )}
                              {r.reversalOfId && (
                                <span
                                  style={lencana}
                                  title={`Pembalik dari ${r.reversalOfNoBukti ?? TANPA_NO_BUKTI}`}
                                >
                                  Pembalik dari {r.reversalOfNoBukti ?? TANPA_NO_BUKTI}
                                </span>
                              )}
                              {/* ── Mitigasi (c) D42 ──────────────────────
                                  Pembaca berhak tahu bahwa sebuah angka pernah
                                  berbeda TANPA harus membuka panel riwayat
                                  lebih dulu. Warnanya kritis, bukan netral:
                                  ini bukan informasi tambahan, ini peringatan. */}
                              {r.diubahSetelahPosting && (
                                <span
                                  style={lencanaPeringatan}
                                  title="Jurnal ini diubah SESUDAH diposting. Rinciannya ada di panel Riwayat."
                                >
                                  diubah setelah posting
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                ...td,
                                maxWidth: 280,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={r.keterangan ?? undefined}
                            >
                              {r.keterangan ?? '—'}
                            </td>
                            <td
                              style={{
                                ...td,
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {rupiahPersis(r.totalDebit)}
                            </td>
                            <td style={td}>
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={
                                  r.status === 'draft'
                                    ? { background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }
                                    : {
                                        background:
                                          'color-mix(in srgb, var(--color-accent-primary) 30%, white)',
                                        color: 'var(--color-accent-primary-fg)',
                                      }
                                }
                              >
                                {JOURNAL_STATUS_LABEL[r.status] ?? r.status}
                              </span>
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.createdByName}</td>
                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {adaAksi ? (
                                <span className="inline-flex items-center gap-1">
                                  {bisaUbah && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void bukaUbah(r)}
                                        aria-label={`Ubah jurnal ${r.noBukti ?? TANPA_NO_BUKTI}`}
                                        className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                        style={iconBtn}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setHapusTarget(r)}
                                        aria-label={`Hapus jurnal ${r.noBukti ?? TANPA_NO_BUKTI}`}
                                        className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                        style={iconBtn}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  )}
                                  {bisaPosting && (
                                    <button
                                      type="button"
                                      onClick={() => { setActionError(null); setPostingTarget(r) }}
                                      aria-label={`Posting jurnal ${r.noBukti ?? TANPA_NO_BUKTI}`}
                                      title="Posting jurnal ini"
                                      className="inline-flex items-center gap-1 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                      style={aksiBtn}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Posting
                                    </button>
                                  )}
                                  {/* ── D32: JALAN KELUAR, bukan sekadar tombol
                                      yang hilang ──────────────────────────
                                      Tombol edit yang lenyap tanpa penjelasan
                                      adalah kebuntuan: akunting melihat jurnal
                                      yang salah, tahu ia salah, dan tidak
                                      diberi tahu ke mana harus pergi. */}
                                  {dariModul && r.sumberDokumenId && (
                                    <Link
                                      href={sumberDokumenHref(r.sumber, r.sumberDokumenId) ?? '#'}
                                      aria-label={`Koreksi jurnal ${r.noBukti ?? TANPA_NO_BUKTI} di ${SUMBER_MODUL_LABEL[r.sumber] ?? 'dokumen asalnya'}`}
                                      className="inline-flex items-center gap-1 rounded-full font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                      style={{ ...aksiBtn, background: 'white', border: '1px solid #e5e7eb', color: 'var(--color-text-muted)', textDecoration: 'none' }}
                                    >
                                      <SquareArrowOutUpRight className="w-3.5 h-3.5" />
                                      Koreksi di {SUMBER_MODUL_LABEL[r.sumber] ?? 'dokumen asal'}
                                    </Link>
                                  )}
                                  {/* Dokumen asalnya bisa saja sudah dihapus
                                      lewat jalur lain. Keterangan jujur lebih
                                      baik daripada tombol menuju halaman
                                      kosong. */}
                                  {dariModul && !r.sumberDokumenId && (
                                    <span
                                      className="text-[11px]"
                                      style={{ color: 'var(--color-text-muted)' }}
                                      title="Jurnal ini dibuat dari sebuah dokumen yang sudah tidak ada."
                                    >
                                      dokumen asal tidak ditemukan
                                    </span>
                                  )}
                                  {bisaBalik && (
                                    <button
                                      type="button"
                                      onClick={() => { setBalikErrors([]); setBalikTarget(r) }}
                                      aria-label={`Buat jurnal balik untuk ${r.noBukti ?? TANPA_NO_BUKTI}`}
                                      title="Buat jurnal balik"
                                      className="inline-flex items-center gap-1 rounded-full font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                      style={{ ...aksiBtn, background: 'white', border: '1px solid #e5e7eb', color: 'var(--color-text-muted)' }}
                                    >
                                      <Undo2 className="w-3.5 h-3.5" /> Balik
                                    </button>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={8} style={{ background: '#fbfbfb', padding: 0 }}>
                                <JournalDetail detail={detail} loading={detailLoading} />
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
          )}
        </main>
      </div>

      {formMode && formInitial && activeClient && (
        <JournalFormModal
          mode={formMode}
          clientId={activeClient.id}
          clientName={activeClient.name}
          accounts={accounts}
          suppliers={suppliers}
          initial={formInitial}
          submitting={submitting}
          serverErrors={formErrors}
          terkunciSampai={terkunciSampai}
          onSubmit={simpan}
          onCancel={() => {
            setFormMode(null)
            setFormInitial(null)
            setEditingId(null)
            setFormErrors([])
          }}
        />
      )}

      {postingTarget && (
        <ModalShell
          labelledBy="jurnal-posting-title"
          className="max-w-md"
          onDismiss={postingBusy ? null : () => setPostingTarget(null)}
        >
          <div className="px-5 sm:px-6 py-5">
            <h2
              id="jurnal-posting-title"
              className="text-base font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Posting jurnal ini?
            </h2>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>
                {postingTarget.noBukti ?? TANPA_NO_BUKTI}
              </strong>{' '}
              · {fmtTanggal(postingTarget.tanggal)} · {rupiahPersis(postingTarget.totalDebit)}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>
                Setelah diposting, jurnal tidak bisa diubah — hanya dibalik.
              </strong>{' '}
              Baris-barisnya masuk buku besar dan ikut menghitung saldo akun.
            </p>
            {postingTerkunci && (
              <p role="alert" className="text-xs mt-2" style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>
                Periode sudah dikunci sampai {fmtTanggal(terkunciSampai ?? '')} — jurnal bertanggal ini tidak bisa diposting.
              </p>
            )}
          </div>
          <div
            className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <button
              type="button"
              onClick={() => setPostingTarget(null)}
              disabled={postingBusy}
              className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void posting()}
              disabled={postingBusy || postingTerkunci}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: 'var(--color-accent-primary)',
                color: 'var(--color-accent-primary-fg)',
                border: 'none',
                minHeight: 34,
              }}
            >
              {postingBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memposting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Posting
                </>
              )}
            </button>
          </div>
        </ModalShell>
      )}

      {balikTarget && (
        <JournalReverseModal
          target={balikTarget}
          submitting={balikBusy}
          serverErrors={balikErrors}
          onSubmit={v => void balik(v)}
          onCancel={() => {
            setBalikTarget(null)
            setBalikErrors([])
          }}
        />
      )}

      {hapusTarget && (
        <ModalShell
          labelledBy="jurnal-hapus-title"
          className="max-w-md"
          onDismiss={hapusBusy ? null : () => setHapusTarget(null)}
        >
          <div className="px-5 sm:px-6 py-5">
            <h2
              id="jurnal-hapus-title"
              className="text-base font-bold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Hapus jurnal ini?
            </h2>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>
                {hapusTarget.noBukti ?? TANPA_NO_BUKTI}
              </strong>{' '}
              · {fmtTanggal(hapusTarget.tanggal)} · {hapusTarget.lineCount} baris. Jurnal draf
              beserta barisnya dihapus permanen.
            </p>
          </div>
          <div
            className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <button
              type="button"
              onClick={() => setHapusTarget(null)}
              disabled={hapusBusy}
              className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void hapus()}
              disabled={hapusBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)',
                minHeight: 34,
              }}
            >
              {hapusBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menghapus…
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </>
              )}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
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

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
}

// Tombol beraksara (Posting/Balik), bukan ikon telanjang: keduanya aksi yang
// tidak bisa dibatalkan begitu saja, dan ikon tanpa label menyisakan tebakan.
const aksiBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 11.5,
  minHeight: 32,
  border: 'none',
  background: 'var(--color-accent-primary)',
  color: 'var(--color-accent-primary-fg)',
  cursor: 'pointer',
}

const lencanaPeringatan: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 6,
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 10.5,
  fontWeight: 600,
  background: 'color-mix(in srgb, var(--color-accent-critical) 16%, white)',
  color: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)',
  verticalAlign: 'middle',
}

const lencana: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 6,
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 10.5,
  fontWeight: 600,
  background: 'color-mix(in srgb, var(--color-accent-secondary) 28%, white)',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
}
