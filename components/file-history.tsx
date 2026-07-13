'use client'

// Riwayat Upload — panel kelola laporan yang sudah masuk sistem (dulu mock
// Phase 1). Data dari GET /api/reports/list, dikelompokkan per periode (sesi).
// Aksi per laporan: Ganti file (re-upload → re-ekstrak via POST /api/upload
// yang memang replace-in-place utk klien+tipe+periode sama) dan Hapus
// (DELETE /api/reports/[id], konfirmasi 2 langkah inline). Aksi per sesi:
// Ubah Periode (PATCH /api/reports/period, atomik utk semua laporan sesi).

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  FileText, History, CheckCircle2, Clock, AlertCircle, Loader2,
  Trash2, RefreshCw, CalendarCog, X, Check,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { DateRangePicker } from '@/components/date-range-picker'

type ReportType = 'laba_rugi' | 'neraca' | 'arus_kas'
type ReportMeta = {
  id: string
  reportType: ReportType
  periodStart: string
  periodEnd: string
  sourceFileName: string
  status: 'uploaded' | 'extracting' | 'review' | 'mapped' | 'confirmed'
  lineCount: number
  mappedCount: number
}

const TYPE_LABEL: Record<ReportType, string> = { laba_rugi: 'Laba Rugi', neraca: 'Neraca', arus_kas: 'Arus Kas' }
// Field form POST /api/upload per tipe (lihat FIELD_TO_TYPE di route upload).
const TYPE_FIELD: Record<ReportType, string> = { laba_rugi: 'pnl', neraca: 'neraca', arus_kas: 'cashflow' }

const STATUS_CONFIG: Record<ReportMeta['status'], { Icon: typeof CheckCircle2; label: string; bg: string; color: string; spin?: boolean }> = {
  uploaded:   { Icon: AlertCircle,  label: 'Belum diekstrak', bg: '#fffbeb', color: '#b45309' },
  extracting: { Icon: Loader2,      label: 'Proses',          bg: '#f0f9ff', color: '#0284c7', spin: true },
  review:     { Icon: Clock,        label: 'Perlu Review',    bg: '#f0f9ff', color: '#0284c7' },
  mapped:     { Icon: CheckCircle2, label: 'Ter-mapping',     bg: '#f0fdf4', color: '#15803d' },
  confirmed:  { Icon: CheckCircle2, label: 'Selesai',         bg: '#f0fdf4', color: '#15803d' },
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
/** '2026-03-01' → '1 Mar 2026'. Parse manual — new Date(ymd) = UTC midnight, bisa mundur sehari di WIB. */
const fmtTanggal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}
const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function StatusBadge({ status }: { status: ReportMeta['status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <cfg.Icon className={`w-3 h-3 ${cfg.spin ? 'animate-spin' : ''}`} />
      <span>{cfg.label}</span>
    </div>
  )
}

export function FileHistory() {
  const { activeClient } = useClient()
  const clientId = activeClient?.id ?? null

  const [reports, setReports] = useState<ReportMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Satu aksi berjalan pada satu waktu: 'del:<id>' | 'replace:<id>' | 'period:<key>'
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editPeriodKey, setEditPeriodKey] = useState<string | null>(null)
  const [editRange, setEditRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined)

  const fileRef = useRef<HTMLInputElement>(null)
  const replacingRef = useRef<ReportMeta | null>(null)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/api/reports/list?clientId=${clientId}`)
      if (!res.ok) throw new Error()
      const d: { reports: ReportMeta[] } = await res.json()
      setReports(d.reports)
    } catch {
      setLoadError(true)
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    setActionError(null)
    setConfirmDeleteId(null)
    setEditPeriodKey(null)
    void load()
  }, [load])

  // ── Aksi ─────────────────────────────────────────────────────
  const readError = async (res: Response, fallback: string) => {
    const p = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null
    return p?.details?.length ? p.details.join(' · ') : (p?.error ?? fallback)
  }

  const handleDelete = async (r: ReportMeta) => {
    setBusy(`del:${r.id}`)
    setActionError(null)
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'Gagal menghapus laporan.'))
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal menghapus laporan.')
    } finally {
      setBusy(null)
      setConfirmDeleteId(null)
    }
  }

  const handleReplaceFile = async (file: File) => {
    const r = replacingRef.current
    if (!r || !clientId) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setActionError('File pengganti harus PDF.')
      return
    }
    setBusy(`replace:${r.id}`)
    setActionError(null)
    try {
      const fd = new FormData()
      fd.append('clientId', clientId)
      fd.append('periodStart', r.periodStart)
      fd.append('periodEnd', r.periodEnd)
      fd.append(TYPE_FIELD[r.reportType], file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await readError(res, 'Gagal mengganti laporan.'))
      const d: { reports: { error?: string }[] } = await res.json()
      const extractErr = d.reports.find(x => x.error)?.error
      if (extractErr) setActionError(`File tersimpan, tapi ekstraksi gagal: ${extractErr}`)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal mengganti laporan.')
    } finally {
      setBusy(null)
      replacingRef.current = null
    }
  }

  const handleMovePeriod = async (group: { periodStart: string; periodEnd: string }) => {
    if (!clientId || !editRange?.from || !editRange?.to) return
    const a = toYMD(editRange.from)
    const b = toYMD(editRange.to)
    setBusy(`period:${group.periodStart}|${group.periodEnd}`)
    setActionError(null)
    try {
      const res = await fetch('/api/reports/period', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          periodStart: group.periodStart,
          periodEnd: group.periodEnd,
          newPeriodStart: a <= b ? a : b,
          newPeriodEnd: a <= b ? b : a,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Gagal memindahkan periode.'))
      setEditPeriodKey(null)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal memindahkan periode.')
    } finally {
      setBusy(null)
    }
  }

  // ── Grouping per periode (sesi) ──────────────────────────────
  const groups: { key: string; periodStart: string; periodEnd: string; items: ReportMeta[] }[] = []
  for (const r of reports) {
    const key = `${r.periodStart}|${r.periodEnd}`
    let gr = groups.find(x => x.key === key)
    if (!gr) {
      gr = { key, periodStart: r.periodStart, periodEnd: r.periodEnd, items: [] }
      groups.push(gr)
    }
    gr.items.push(r)
  }

  const iconBtn = (disabled: boolean): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 9, border: '1px solid #eee', background: '#fafafa',
    cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.45 : 1, flexShrink: 0,
  })

  return (
    <div className="space-y-4">
      {/* Input file tersembunyi untuk aksi Ganti */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void handleReplaceFile(f)
          e.target.value = ''
        }}
      />

      {/* Section header */}
      <div className="flex items-center" style={{ gap: 10 }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)' }}
        >
          <History style={{ width: 16, height: 16, color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="font-bold" style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Riwayat Upload</h3>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Kelola laporan yang sudah masuk — ganti file, ubah periode, atau hapus</p>
        </div>
      </div>

      {actionError && (
        <div style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 10, padding: '8px 10px', fontSize: 11, color: '#b91c1c' }}>
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4" style={{ color: '#9ca3af', fontSize: 12 }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat…
        </div>
      ) : loadError ? (
        <p style={{ fontSize: 12, color: '#dc2626', padding: '8px 0' }}>Gagal memuat riwayat. Muat ulang halaman.</p>
      ) : groups.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>Belum ada laporan ter-upload untuk klien ini.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const isEditing = editPeriodKey === group.key
            const periodBusy = busy === `period:${group.key}`
            return (
              <div key={group.key}>
                {/* Header sesi: periode + aksi ubah periode */}
                <div className="flex items-center justify-between" style={{ marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2d2d2d' }}>
                    {fmtTanggal(group.periodStart)} – {fmtTanggal(group.periodEnd)}
                  </span>
                  {!isEditing && (
                    <button
                      aria-label={`Ubah periode sesi ${fmtTanggal(group.periodStart)}`}
                      title="Ubah periode"
                      disabled={busy !== null}
                      onClick={() => {
                        setEditPeriodKey(group.key)
                        setEditRange({ from: ymdToDate(group.periodStart), to: ymdToDate(group.periodEnd) })
                        setActionError(null)
                      }}
                      style={iconBtn(busy !== null)}
                    >
                      <CalendarCog style={{ width: 14, height: 14, color: '#6b7280' }} />
                    </button>
                  )}
                </div>

                {/* Editor periode inline */}
                {isEditing && (
                  <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 6 }}>
                      Pindahkan semua laporan sesi ini ke periode:
                    </p>
                    <DateRangePicker value={editRange} onChange={setEditRange} placeholder="Pilih periode baru" />
                    <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                      <button
                        disabled={periodBusy || !editRange?.from || !editRange?.to}
                        onClick={() => void handleMovePeriod(group)}
                        className="flex items-center gap-1 rounded-full font-semibold"
                        style={{
                          padding: '6px 14px', fontSize: 11, border: 'none',
                          background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)',
                          cursor: periodBusy ? 'default' : 'pointer', opacity: !editRange?.from || !editRange?.to ? 0.5 : 1,
                        }}
                      >
                        {periodBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Simpan
                      </button>
                      <button
                        disabled={periodBusy}
                        onClick={() => { setEditPeriodKey(null); setActionError(null) }}
                        className="flex items-center gap-1 rounded-full"
                        style={{ padding: '6px 12px', fontSize: 11, border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', cursor: 'pointer' }}
                      >
                        <X className="w-3 h-3" /> Batal
                      </button>
                    </div>
                  </div>
                )}

                {/* Baris laporan */}
                <div className="space-y-1">
                  {group.items.map(r => {
                    const deleting = busy === `del:${r.id}`
                    const replacing = busy === `replace:${r.id}`
                    const confirming = confirmDeleteId === r.id
                    return (
                      <Fragment key={r.id}>
                        <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: '#fbfbfc', border: '1px solid #f3f3f4' }}>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fef2f2' }}>
                            <FileText className="w-4 h-4" style={{ color: '#dc2626' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: '#2d2d2d' }} title={r.sourceFileName}>
                              {TYPE_LABEL[r.reportType]}
                            </p>
                            <p className="text-xs truncate" style={{ color: '#9ca3af' }}>
                              {replacing ? 'Mengekstrak ulang dengan AI…' : `${r.mappedCount}/${r.lineCount} akun ter-mapping · ${r.sourceFileName}`}
                            </p>
                          </div>
                          {replacing
                            ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#0284c7' }} />
                            : <StatusBadge status={r.status} />}
                          {/* Aksi */}
                          {!confirming && (
                            <div className="flex items-center gap-1">
                              <button
                                aria-label={`Ganti file ${TYPE_LABEL[r.reportType]}`}
                                title="Ganti file (re-upload PDF → ekstraksi ulang)"
                                disabled={busy !== null}
                                onClick={() => { replacingRef.current = r; setActionError(null); fileRef.current?.click() }}
                                style={iconBtn(busy !== null)}
                              >
                                <RefreshCw style={{ width: 13, height: 13, color: '#6b7280' }} />
                              </button>
                              <button
                                aria-label={`Hapus laporan ${TYPE_LABEL[r.reportType]}`}
                                title="Hapus laporan"
                                disabled={busy !== null}
                                onClick={() => { setConfirmDeleteId(r.id); setActionError(null) }}
                                style={iconBtn(busy !== null)}
                              >
                                <Trash2 style={{ width: 13, height: 13, color: '#dc2626' }} />
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Konfirmasi hapus 2 langkah */}
                        {confirming && (
                          <div className="flex items-center justify-between gap-2 rounded-xl" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.15)', padding: '8px 12px', marginTop: 2 }}>
                            <span style={{ fontSize: 11, color: '#b91c1c' }}>
                              Hapus {TYPE_LABEL[r.reportType]} + {r.lineCount} baris? Mapping yang sudah dipelajari tetap tersimpan.
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                disabled={deleting}
                                onClick={() => void handleDelete(r)}
                                className="rounded-full font-semibold"
                                style={{ padding: '5px 12px', fontSize: 11, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer' }}
                              >
                                {deleting ? 'Menghapus…' : 'Ya, hapus'}
                              </button>
                              <button
                                disabled={deleting}
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-full"
                                style={{ padding: '5px 12px', fontSize: 11, border: '1px solid #e5e7eb', background: 'white', color: '#6b7280', cursor: 'pointer' }}
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
