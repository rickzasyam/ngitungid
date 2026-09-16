'use client'

import { useEffect, useRef, useState } from 'react'
import { ModalShell } from '@/components/ui/modal-portal'
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Link2, Loader2, Unlink } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { TANPA_NO_BUKTI } from '@/lib/journal'

// Layar konfirmasi "Ganti Master COA". Dulu tombol Ganti Excel langsung POST —
// admin tak pernah tahu berapa mapping yang akan putus sampai semuanya sudah
// terjadi. Dialog ini menampilkan hasil dry-run dari server (bukan hitungan
// ulang di browser, supaya angkanya persis sama dengan yang akan dieksekusi).

export interface CoaImpactReport {
  reportId: string
  reportType: string
  periodStart: string
  periodEnd: string
  statusBefore: string
  statusAfter: string
  relinkedCount: number
  brokenCount: number
  brokenLines: { lineItemId: string; rawName: string; amount: string; kode: string }[]
}

export interface CoaImpact {
  matchedKode: string[]
  missingKode: string[]
  addedKode: string[]
  ambiguousKode: string[]
  relinkedLineCount: number
  brokenLineCount: number
  suggestionsLost: number
  suggestionsRelinked: number
  historySaved: number
  historyLost: number
  reports: CoaImpactReport[]
  demotedReportIds: string[]
  /**
   * Jurnal yang MENGHALANGI penggantian — akunnya hilang/ambigu di file baru.
   * Tidak kosong = server akan menolak (409), jadi tombol Lanjutkan dimatikan.
   * Opsional supaya respons lama (sebelum jurnal ada) tetap terbaca.
   */
  journalBlocked?: { journalId: string; noBukti: string | null; kode: string }[]
  journalRelinkedCount?: number
}

const TYPE_LABEL: Record<string, string> = {
  laba_rugi: 'Laba Rugi',
  neraca: 'Neraca',
  arus_kas: 'Arus Kas',
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmtTanggal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${BULAN[m - 1] ?? '?'} ${y}`
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'ok' | 'warn' | 'neutral'
}) {
  const color = tone === 'ok' ? '#15803d' : tone === 'warn' ? '#b45309' : '#4b5563'
  const bg = tone === 'ok' ? '#f0fdf4' : tone === 'warn' ? '#fffbeb' : 'var(--color-muted-bg)'
  return (
    <div className="rounded-2xl px-3.5 py-3" style={{ background: bg }}>
      <p className="text-xl font-bold leading-none" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </div>
  )
}

export function CoaReplaceDialog({
  fileName,
  impact,
  newCount,
  oldCount,
  warnings,
  submitting,
  onConfirm,
  onCancel,
}: {
  fileName: string
  impact: CoaImpact
  newCount: number
  oldCount: number
  warnings: string[]
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { rupiahPlain } = useRupiah()
  // amount datang sebagai STRING dari API — dikonversi di titik pakai.
  const fmtRupiah = (v: string) => { const n = Number(v); return Number.isFinite(n) ? rupiahPlain(n) : v }
  const [expanded, setExpanded] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Esc menutup; fokus awal ke Batal — aksi teraman jadi default, karena
  // Lanjutkan mengubah data laporan yang sudah dipetakan.
  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  const affected = impact.reports.filter(r => r.brokenCount > 0 || r.relinkedCount > 0)
  const demoted = impact.demotedReportIds.length
  // Bukan peringatan, melainkan PENGHALANG: server menolak 409 selama daftar
  // ini tidak kosong. Tombol Lanjutkan ikut dimatikan supaya tidak ada yang
  // menekannya lalu menerima galat yang seolah-olah kegagalan tak terduga.
  const blocked = impact.journalBlocked ?? []
  const terhalang = blocked.length > 0

  return (
    <ModalShell
      labelledBy="coa-replace-title"
      className="max-w-2xl"
      onDismiss={submitting ? null : onCancel}
    >
        {/* Header */}
        <div className="flex-shrink-0 px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
          <h2 id="coa-replace-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Ganti Master COA
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            <span className="font-medium">{fileName}</span> · {oldCount} akun lama → {newCount} akun baru
          </p>
        </div>

        {/* Isi */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4" style={{ background: '#f8f8f8' }}>
          {/* Penghalang diletakkan PALING ATAS: ia menentukan apakah seluruh
              layar ini masih bisa ditindaklanjuti, jadi tidak boleh terkubur di
              bawah statistik yang jadi tidak relevan. */}
          {terhalang && (
            <div
              role="alert"
              className="mb-4 px-3.5 py-3 rounded-2xl"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
                />
                <div className="min-w-0">
                  <p
                    className="text-xs font-semibold"
                    style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
                  >
                    Master COA tidak bisa diganti dengan file ini
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    {blocked.length} jurnal memakai akun yang tidak ada di file baru. Baris jurnal tidak
                    bisa dilepas dari akunnya seperti baris laporan — isinya pencatatan yang sudah
                    terjadi. Tambahkan kembali kode akun di bawah ke file, lalu ulangi.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {blocked.slice(0, 8).map(b => (
                      <li key={`${b.journalId}-${b.kode}`} className="text-xs flex items-center gap-1.5">
                        <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {b.noBukti ?? TANPA_NO_BUKTI}
                        </span>
                        <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                        <span
                          className="font-mono px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
                        >
                          {b.kode}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {blocked.length > 8 && (
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      +{blocked.length - 8} jurnal lain
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat value={impact.relinkedLineCount} label="Mapping tersambung otomatis" tone="ok" />
            <Stat value={impact.brokenLineCount} label="Mapping putus, perlu dipetakan ulang" tone={impact.brokenLineCount > 0 ? 'warn' : 'neutral'} />
            <Stat value={impact.historySaved} label="Riwayat auto-match terselamatkan" tone="ok" />
            <Stat value={demoted} label="Laporan kembali ke Perlu Review" tone={demoted > 0 ? 'warn' : 'neutral'} />
          </div>

          <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Mapping disambung ulang lewat <strong>kode akun</strong>. Kode yang masih ada di file baru
            tetap terhubung; {impact.missingKode.length > 0 ? <>kode yang hilang ({impact.missingKode.slice(0, 6).join(', ')}
            {impact.missingKode.length > 6 ? `, +${impact.missingKode.length - 6} lagi` : ''}) akan putus.</> : 'tidak ada kode yang hilang.'}
          </p>

          {impact.ambiguousKode.length > 0 && (
            <div className="mt-3 flex items-start gap-2 px-3.5 py-2.5 rounded-2xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
              <p className="text-xs" style={{ color: '#92400e' }}>
                Kode dobel di file baru ({impact.ambiguousKode.join(', ')}) sengaja <strong>tidak</strong> disambung
                otomatis — baris mana yang dimaksud tidak bisa dipastikan, jadi lebih aman dipetakan ulang manual.
              </p>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mt-3 px-3.5 py-2.5 rounded-2xl" style={{ background: '#faf9ff', border: '1px solid rgba(187,179,243,0.4)' }}>
              {warnings.map((w, i) => (
                <p key={i} className="text-xs" style={{ color: '#6d5fd0' }}>{w}</p>
              ))}
            </div>
          )}

          {/* Rincian per laporan */}
          {affected.length > 0 && (
            <>
              <h3 className="text-xs font-semibold mt-5 mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Dampak per laporan
              </h3>
              <div className="space-y-2">
                {affected.map(r => {
                  const isOpen = expanded === r.reportId
                  return (
                    <div key={r.reportId} className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : r.reportId)}
                        aria-expanded={isOpen}
                        disabled={r.brokenCount === 0}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-150 enabled:hover:bg-(--color-muted-bg) disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {TYPE_LABEL[r.reportType] ?? r.reportType} · {fmtTanggal(r.periodStart)} – {fmtTanggal(r.periodEnd)}
                          </p>
                          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                            {r.relinkedCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: '#15803d' }}>
                                <Link2 className="w-3 h-3" /> {r.relinkedCount} tersambung
                              </span>
                            )}
                            {r.brokenCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: '#b45309' }}>
                                <Unlink className="w-3 h-3" /> {r.brokenCount} putus
                              </span>
                            )}
                            {r.statusAfter !== r.statusBefore && (
                              <span className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                                <ArrowRight className="w-3 h-3" /> {r.statusBefore} → {r.statusAfter}
                              </span>
                            )}
                          </div>
                        </div>
                        {r.brokenCount > 0 && (isOpen
                          ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                          : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />)}
                      </button>

                      {isOpen && r.brokenLines.length > 0 && (
                        <div className="border-t px-3.5 py-2" style={{ borderColor: '#f0f0f0', background: '#fafafa' }}>
                          {r.brokenLines.map(l => (
                            <div key={l.lineItemId} className="flex items-center justify-between gap-3 py-1">
                              <span className="text-[11px] truncate" style={{ color: 'var(--color-text-primary)' }}>
                                {l.rawName}
                              </span>
                              <span className="text-[10.5px] flex-shrink-0 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                {l.kode} · {fmtRupiah(l.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {impact.brokenLineCount > 0 && (
            <p className="text-[11px] mt-4 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Setelah diganti, buka <strong>COA Mapping</strong> untuk memetakan ulang baris yang putus.
              Laporan tidak dihapus dan angkanya tidak hilang.
            </p>
          )}
        </div>

        {/* Aksi */}
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
            disabled={submitting || terhalang}
            title={terhalang ? 'Ada jurnal yang memakai akun yang hilang di file baru.' : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:shadow-[0_4px_14px_rgba(218,241,99,0.4)] disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
          >
            {submitting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />Mengganti…</>) : 'Lanjutkan Ganti'}
          </button>
        </div>
    </ModalShell>
  )
}
