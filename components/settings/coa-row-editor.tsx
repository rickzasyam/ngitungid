'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Info, Loader2, Plus } from 'lucide-react'
import { classificationWarnings } from '@/lib/coa/classification-health'
import type { CoaImpact } from './coa-replace-dialog'

export interface CoaAccountRow {
  id: string
  kode: string
  nama: string
  posisi: string
  kelompok: string
  subKelompok: string
  classCf: string | null
}

const NEW_VALUE = '__new__'

/** Nilai distinct yang sudah dipakai klien ini — sumber isi dropdown. */
function distinctOf(rows: CoaAccountRow[], field: 'kelompok' | 'subKelompok' | 'classCf'): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    const v = r[field]
    if (typeof v === 'string' && v.trim() !== '') s.add(v)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'id'))
}

/**
 * Dropdown terkunci + aksi sadar "nilai baru".
 *
 * Sengaja `<select>` NATIVE, bukan dropdown custom: panel `<select>` dirender di
 * level OS sehingga mustahil tertimpa card sibling — persis bug stacking context
 * yang baru saja diperbaiki di /coa-mapping (`.ng-rise` menyisakan transform yang
 * membentuk stacking context, sehingga z-index anaknya terkurung). Di dalam modal
 * yang isinya bisa di-scroll, itu bukan risiko yang perlu diambil dua kali.
 */
function LockedSelect({
  label,
  value,
  options,
  onChange,
  required,
  allowEmpty,
  hint,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  required?: boolean
  allowEmpty?: boolean
  hint?: string
}) {
  const [creating, setCreating] = useState(false)
  const newRef = useRef<HTMLInputElement>(null)
  const isKnown = value === '' || options.includes(value)

  useEffect(() => {
    if (creating) newRef.current?.focus()
  }, [creating])

  // Nilai yang tidak ada di daftar (mis. hasil import lama) tetap harus bisa
  // ditampilkan & dipertahankan — kalau tidak, membuka form untuk mengedit
  // kolom LAIN diam-diam mengganti nilai ini.
  const selectValue = creating ? NEW_VALUE : isKnown ? value : value

  return (
    <label className="block">
      <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {label} {required && <span style={{ color: '#dc2626' }}>*</span>}
      </span>
      {creating ? (
        <div className="flex items-center gap-1.5 mt-1">
          <input
            ref={newRef}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`${label} baru…`}
            className="flex-1 px-3 py-2 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', border: '1px solid var(--color-border-subtle)' }}
          />
          <button
            type="button"
            onClick={() => { setCreating(false); onChange(options[0] ?? '') }}
            className="px-2.5 py-2 rounded-xl text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }}
          >
            Batal
          </button>
        </div>
      ) : (
        <select
          value={selectValue}
          onChange={e => {
            if (e.target.value === NEW_VALUE) { setCreating(true); onChange('') } else onChange(e.target.value)
          }}
          className="w-full mt-1 px-3 py-2 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ background: 'var(--color-muted-bg)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
        >
          {allowEmpty && <option value="">— tidak diisi —</option>}
          {!isKnown && value !== '' && <option value={value}>{value}</option>}
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value={NEW_VALUE}>+ nilai baru…</option>
        </select>
      )}
      {creating && (
        <p className="text-[10.5px] mt-1" style={{ color: '#b45309' }}>
          Nilai baru membuat pengelompokan baru — pastikan ejaannya benar, karena
          &ldquo;Fixed Cost&rdquo; dan &ldquo;Fixed cost&rdquo; akan dihitung terpisah.
        </p>
      )}
      {hint && !creating && (
        <p className="text-[10.5px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>
      )}
    </label>
  )
}

export function CoaRowForm({
  clientId,
  rows,
  editing,
  onDone,
  onCancel,
}: {
  clientId: string
  rows: CoaAccountRow[]
  /** null = tambah baru. */
  editing: CoaAccountRow | null
  onDone: () => void
  onCancel: () => void
}) {
  const [kode, setKode] = useState(editing?.kode ?? '')
  const [nama, setNama] = useState(editing?.nama ?? '')
  const [posisi, setPosisi] = useState(editing?.posisi ?? 'Debit')
  const [kelompok, setKelompok] = useState(editing?.kelompok ?? '')
  const [subKelompok, setSubKelompok] = useState(editing?.subKelompok ?? '')
  const [classCf, setClassCf] = useState(editing?.classCf ?? '')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const cancelRef = useRef<HTMLButtonElement>(null)

  const kelompokOpts = useMemo(() => distinctOf(rows, 'kelompok'), [rows])
  const subOpts = useMemo(() => distinctOf(rows, 'subKelompok'), [rows])
  const cfOpts = useMemo(() => distinctOf(rows, 'classCf'), [rows])

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  // Peringatan dihitung dari fungsi klasifikasi ASLI (classifyPnl/classifyBs +
  // ambang classCf), bukan daftar hardcoded — kalau aturan klasifikasi berubah,
  // peringatan ini ikut benar sendiri tanpa disinkronkan manual.
  const warnings = useMemo(
    () => classificationWarnings({ kelompok, subKelompok, classCf: classCf === '' ? null : classCf }),
    [kelompok, subKelompok, classCf]
  )

  const kodeChanged = editing !== null && kode.trim() !== editing.kode

  const submit = async () => {
    setSaving(true)
    setErrors([])
    try {
      const url = editing
        ? `/api/clients/${clientId}/coa/rows/${editing.id}`
        : `/api/clients/${clientId}/coa/rows`
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kode, nama, posisi, kelompok, subKelompok, classCf }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null
      if (!res.ok) {
        setErrors(payload?.details?.length ? payload.details : [payload?.error ?? 'Gagal menyimpan akun.'])
        return
      }
      onDone()
    } catch {
      setErrors(['Terjadi kesalahan jaringan. Coba lagi.'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,26,26,0.45)' }}
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget && !saving) onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-row-title"
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
          <h2 id="coa-row-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {editing ? 'Edit Akun' : 'Tambah Akun'}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {editing ? `${editing.kode} · ${editing.nama}` : 'Akun baru untuk Master COA klien ini'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5" style={{ background: '#f8f8f8' }}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Kode <span style={{ color: '#dc2626' }}>*</span>
              </span>
              <input
                type="text"
                value={kode}
                onChange={e => setKode(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ background: 'var(--color-muted-bg)', border: '1px solid var(--color-border-subtle)' }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Posisi <span style={{ color: '#dc2626' }}>*</span>
              </span>
              <select
                value={posisi}
                onChange={e => setPosisi(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ background: 'var(--color-muted-bg)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
              >
                <option value="Debit">Debit</option>
                <option value="Kredit">Kredit</option>
              </select>
            </label>
          </div>

          {kodeChanged && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
              <p className="text-[11px]" style={{ color: '#92400e' }}>
                Mapping laporan tetap aman (terhubung lewat id, bukan kode). Tapi <strong>kode</strong> adalah
                kunci penyambungan saat Master COA diganti lewat Excel nanti — kalau kode di file Excel
                berikutnya masih yang lama, mapping akun ini akan terputus dan harus dipetakan ulang.
              </p>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Nama Akun <span style={{ color: '#dc2626' }}>*</span>
            </span>
            <input
              type="text"
              value={nama}
              onChange={e => setNama(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', border: '1px solid var(--color-border-subtle)' }}
            />
          </label>

          <LockedSelect label="Kelompok" value={kelompok} options={kelompokOpts} onChange={setKelompok} required />
          <LockedSelect label="Sub Kelompok" value={subKelompok} options={subOpts} onChange={setSubKelompok} required />
          <LockedSelect label="Class CF" value={classCf} options={cfOpts} onChange={setClassCf} allowEmpty hint="Kosongkan kalau akun ini tidak muncul di Arus Kas." />

          {warnings.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
              <div>
                {warnings.map((w, i) => (
                  <p key={i} className="text-[11px]" style={{ color: '#92400e' }}>{w.message}</p>
                ))}
                <p className="text-[10.5px] mt-1" style={{ color: '#a16207' }}>
                  Tetap bisa disimpan — kadang ini disengaja.
                </p>
              </div>
            </div>
          )}

          {editing && (
            <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Perubahan klasifikasi berlaku untuk <strong>semua periode</strong>, termasuk laporan
              yang sudah selesai — ini disengaja, supaya koreksi klasifikasi ikut merapikan angka historis.
            </p>
          )}

          {errors.length > 0 && (
            <div className="px-3 py-2 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              {errors.map((e, i) => (
                <p key={i} className="text-[11px] font-medium" style={{ color: '#dc2626' }}>{e}</p>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0', background: 'white' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-full text-xs font-medium transition-colors duration-150 hover:bg-(--color-border-subtle) disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:shadow-[0_4px_14px_rgba(218,241,99,0.4)] disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
          >
            {saving ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Menyimpan…</>) : (editing ? 'Simpan' : <><Plus className="w-3.5 h-3.5" />Tambah</>)}
          </button>
        </div>
      </div>
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = { laba_rugi: 'Laba Rugi', neraca: 'Neraca', arus_kas: 'Arus Kas' }
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmtTanggal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}

/** Konfirmasi hapus akun — memakai laporan dampak dari dry-run server,
 *  pola yang sama dengan dialog ganti Excel. */
export function CoaDeleteDialog({
  account,
  impact,
  submitting,
  onConfirm,
  onCancel,
}: {
  account: { kode: string; nama: string }
  impact: CoaImpact
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  const affected = impact.reports.filter(r => r.brokenCount > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(26,26,26,0.45)' }}
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget && !submitting) onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coa-del-title"
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
          <h2 id="coa-del-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Hapus akun COA?
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <span className="font-mono">{account.kode}</span> · {account.nama}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4" style={{ background: '#f8f8f8' }}>
          {impact.brokenLineCount === 0 ? (
            <p className="text-sm" style={{ color: '#15803d' }}>
              Akun ini belum dipakai laporan mana pun — menghapusnya tidak berdampak ke data laporan.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl px-3.5 py-3" style={{ background: '#fffbeb' }}>
                  <p className="text-xl font-bold leading-none" style={{ color: '#b45309' }}>{impact.brokenLineCount}</p>
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>baris kehilangan mapping</p>
                </div>
                <div className="rounded-2xl px-3.5 py-3" style={{ background: '#fffbeb' }}>
                  <p className="text-xl font-bold leading-none" style={{ color: '#b45309' }}>{impact.demotedReportIds.length}</p>
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>laporan kembali ke Perlu Review</p>
                </div>
                <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--color-muted-bg)' }}>
                  <p className="text-xl font-bold leading-none" style={{ color: '#4b5563' }}>{impact.historyLost}</p>
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>riwayat auto-match hilang</p>
                </div>
              </div>

              {affected.length > 0 && (
                <div className="mt-4 space-y-2">
                  {affected.map(r => (
                    <div key={r.reportId} className="rounded-2xl px-3.5 py-2.5" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {TYPE_LABEL[r.reportType] ?? r.reportType} · {fmtTanggal(r.periodStart)} – {fmtTanggal(r.periodEnd)}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#b45309' }}>
                        {r.brokenCount} baris putus
                        {r.statusAfter !== r.statusBefore && ` · ${r.statusBefore} → ${r.statusAfter}`}
                      </p>
                      <div className="mt-1.5">
                        {r.brokenLines.map(l => (
                          <div key={l.lineItemId} className="flex items-center justify-between gap-3 py-0.5">
                            <span className="text-[11px] truncate" style={{ color: 'var(--color-text-primary)' }}>{l.rawName}</span>
                            <span className="text-[10.5px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                              {Number(l.amount).toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] mt-4 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Laporan tidak dihapus dan angkanya tidak hilang — baris di atas kembali ke antrean
                <strong> COA Mapping</strong> untuk dipetakan ke akun lain.
              </p>
            </>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0', background: 'white' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-full text-xs font-medium transition-colors duration-150 hover:bg-(--color-border-subtle) disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition-all duration-200 enabled:hover:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-critical) focus-visible:ring-offset-2"
            style={{ background: '#dc2626' }}
          >
            {submitting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Menghapus…</>) : 'Hapus Akun'}
          </button>
        </div>
      </div>
    </div>
  )
}
