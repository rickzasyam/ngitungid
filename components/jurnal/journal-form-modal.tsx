'use client'

// Form jurnal manual — buat & ubah. Dipakai halaman /jurnal.
//
// ══ VALIDASI HIDUP, TAPI SATU SUMBER ATURAN ════════════════════════════════
// Panel selisih dihitung ulang tiap ketukan lewat `computeTotals` dari
// lib/journal.ts — modul yang SAMA yang dipakai server lewat
// validateJournalInput. Browser tidak pernah menegakkan apa pun sendiri: ia
// cuma menampilkan lebih awal apa yang akan dikatakan server. Kalau halaman ini
// mulai menghitung selisihnya sendiri, akan ada dua aturan pembukuan dan salah
// satunya diam-diam menyimpang.
//
// ══ SARAN AI TIDAK PERNAH OTOMATIS (D10) ═══════════════════════════════════
// Tombol eksplisit, hasilnya DAFTAR pilihan (R1: hingga 3 pasangan), dan tidak
// ada yang masuk ke baris sampai "Terapkan" ditekan. Kuota Gemini milik bersama,
// dan saran yang sudah terisi cenderung diterima begitu saja — dua alasan untuk
// tidak memanggilnya sambil orang mengetik.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import { NominalInput } from '@/components/ui/nominal-input'
import { useRupiah } from '@/lib/preferences-context'
import { computeTotals, fromMinorUnits, MIN_LINES, NO_BUKTI_MAX, toMinorUnits } from '@/lib/journal'
import { pesanGalatNominal } from '@/lib/nominal'

export interface CoaOption {
  id: string
  kode: string
  nama: string
  kelompok: string
  /**
   * Tipe akun yang BERLAKU — eksplisit ?? turunan, dihitung server (E2/E3).
   * Opsional supaya respons lama tetap terbaca. Dipakai F4: pemilih supplier
   * hanya muncul pada baris yang akunnya `liability`.
   */
  resolvedType?: string | null
}

export interface SupplierOption {
  id: string
  nama: string
}

/** Satu baris di form. Debit/kredit berisi NILAI dari <NominalInput>: kanonik
 *  ("150000.25"), '' bila kosong, atau teks mentah bila tidak terbaca — yang
 *  terakhir itu yang membuat pesanGalatNominal menandai barisnya. */
export interface FormLine {
  key: string
  masterCoaId: string
  debit: string
  kredit: string
  keterangan: string
  /** '' = tidak ditandai supplier. Hanya bermakna pada baris liability (F1). */
  supplierId: string
}

export interface JournalFormValue {
  tanggal: string
  noBukti: string
  keterangan: string
  lines: FormLine[]
}

interface AiPair {
  debit: { id: string; kode: string; nama: string }
  kredit: { id: string; kode: string; nama: string }
  confidence: number
  reason: string
}

const newKey = () => Math.random().toString(36).slice(2, 10)

export const emptyLine = (): FormLine => ({
  key: newKey(),
  masterCoaId: '',
  debit: '',
  kredit: '',
  keterangan: '',
  supplierId: '',
})

/**
 * Supplier yang BOLEH dikirim untuk baris ini: hanya bila akunnya liability.
 *
 * Dipakai saat MENGIRIM, bukan cuma saat merender: akun sebuah baris bisa
 * berganti lewat banyak jalan (dipilih ulang, diisi saran AI), dan supplier
 * yang tertinggal di baris yang sudah bukan hutang akan ditolak server dengan
 * galat yang tidak dimengerti orang yang tidak pernah melihat pemilihnya.
 */
export function supplierUntukDikirim(line: FormLine, accounts: readonly CoaOption[]): string {
  const akun = accounts.find(a => a.id === line.masterCoaId)
  return akun?.resolvedType === 'liability' ? line.supplierId : ''
}

export function blankJournalForm(tanggal: string): JournalFormValue {
  return { tanggal, noBukti: '', keterangan: '', lines: [emptyLine(), emptyLine()] }
}

export function JournalFormModal({
  mode,
  clientId,
  clientName,
  accounts,
  suppliers = [],
  initial,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit'
  clientId: string
  clientName: string
  accounts: CoaOption[]
  /** Supplier klien — untuk penanda di baris berakun hutang (F1/F4). */
  suppliers?: SupplierOption[]
  initial: JournalFormValue
  submitting: boolean
  /** Galat dari server (mis. 409 nomor bukti dobel) — ditampilkan inline. */
  serverErrors: string[]
  onSubmit: (value: JournalFormValue) => void
  onCancel: () => void
}) {
  const { rupiahPersis } = useRupiah()
  const [form, setForm] = useState<JournalFormValue>(initial)
  const [aiPairs, setAiPairs] = useState<AiPair[] | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  const options: StyledOption[] = useMemo(
    () =>
      accounts.map(a => ({
        value: a.id,
        label: a.nama,
        badge: a.kode,
        group: a.kelompok,
      })),
    [accounts]
  )

  const opsiSupplier: StyledOption[] = useMemo(
    () => [
      { value: '', label: '— tanpa supplier —', kind: 'placeholder' as const },
      ...suppliers.map(s => ({ value: s.id, label: s.nama })),
    ],
    [suppliers]
  )

  const akunLiability = (masterCoaId: string) =>
    accounts.find(a => a.id === masterCoaId)?.resolvedType === 'liability'

  const totals = computeTotals(form.lines)
  const seimbang = totals.selisih === 0

  // Nominal yang tidak terbaca ditunjuk DI SISINYA, dengan pesan dari parser
  // bersama (lib/nominal.ts) — bukan dihitung nol di panel total lalu baru
  // ketahuan saat Simpan. Diperiksa sebelum akun: yang diketik salah lebih
  // mendesak daripada yang belum dipilih.
  const galatNominal = form.lines.map(l => ({
    debit: pesanGalatNominal(l.debit),
    kredit: pesanGalatNominal(l.kredit),
  }))

  // Aturan "tepat satu sisi terisi" diperiksa per baris supaya pesannya bisa
  // menunjuk barisnya — sama seperti validateJournalInput di server.
  const barisBermasalah = form.lines.map((l, i) => {
    if (galatNominal[i].debit || galatNominal[i].kredit) return 'nominal'
    if (!l.masterCoaId) return 'akun'
    const d = l.debit.trim() === '' ? 0 : toMinorUnits(l.debit)
    const k = l.kredit.trim() === '' ? 0 : toMinorUnits(l.kredit)
    if (d === null || k === null) return 'nominal'
    if (d > 0 && k > 0) return 'dua-sisi'
    if (d === 0 && k === 0) return 'kosong'
    return null
  })

  const cukupBaris = form.lines.length >= MIN_LINES
  // Hanya TANGGAL yang wajib di header. Nomor bukti dan keterangan opsional
  // sejak 2026-09-16: banyak transaksi kecil memang tidak punya nomor bukti,
  // dan mewajibkannya cuma melahirkan nomor karangan. Keduanya dinormalkan
  // jadi NULL di lib/journal.ts, bukan string kosong.
  const headerLengkap = form.tanggal.trim() !== ''
  const bolehSimpan =
    headerLengkap && cukupBaris && seimbang && barisBermasalah.every(x => x === null) && !submitting

  const patch = (p: Partial<JournalFormValue>) => setForm(f => ({ ...f, ...p }))
  const patchLine = (key: string, p: Partial<FormLine>) =>
    setForm(f => ({ ...f, lines: f.lines.map(l => (l.key === key ? { ...l, ...p } : l)) }))

  const hapusBaris = (key: string) =>
    setForm(f => ({ ...f, lines: f.lines.filter(l => l.key !== key) }))

  async function mintaSaran() {
    setAiLoading(true)
    setAiError(null)
    setAiPairs(null)
    try {
      const res = await fetch('/api/journals/suggest-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, keterangan: form.keterangan }),
      })
      const payload = (await res.json().catch(() => null)) as
        | { suggestions?: AiPair[]; error?: string }
        | null
      if (!res.ok) {
        setAiError(payload?.error ?? 'Gagal meminta saran AI.')
        return
      }
      const list = payload?.suggestions ?? []
      if (list.length === 0) {
        setAiError('AI tidak cukup yakin untuk menyarankan akun dari keterangan ini.')
        return
      }
      setAiPairs(list)
    } catch {
      setAiError('Gagal menghubungi server saran AI.')
    } finally {
      setAiLoading(false)
    }
  }

  /**
   * Terapkan satu pasangan ke DUA BARIS KOSONG PERTAMA.
   *
   * Sengaja tidak menimpa baris yang sudah diisi: yang sudah diketik manusia
   * lebih berharga daripada tebakan mesin. Kalau baris kosongnya kurang,
   * barisnya ditambah.
   */
  function terapkan(p: AiPair) {
    setForm(f => {
      const lines = [...f.lines]
      const kosong = lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.masterCoaId === '' && l.debit.trim() === '' && l.kredit.trim() === '')
        .map(({ i }) => i)
      while (kosong.length < 2) {
        lines.push(emptyLine())
        kosong.push(lines.length - 1)
      }
      lines[kosong[0]] = { ...lines[kosong[0]], masterCoaId: p.debit.id, kredit: '' }
      lines[kosong[1]] = { ...lines[kosong[1]], masterCoaId: p.kredit.id, debit: '' }
      return { ...f, lines }
    })
    setAiPairs(null)
  }

  const optional: React.CSSProperties = { fontWeight: 400, color: 'var(--color-text-muted)' }
  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
  }
  const input: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    fontSize: 13,
    color: '#1f2430',
    border: '1px solid #e5e7eb',
    background: 'white',
    outline: 'none',
  }
  const nominalInput = (invalid: boolean): React.CSSProperties => ({
    ...input,
    padding: '8px 10px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    border: `1px solid ${invalid ? 'rgba(220,38,38,0.55)' : '#e5e7eb'}`,
  })

  return (
    <ModalShell
      labelledBy="jurnal-form-title"
      className="max-w-3xl"
      onDismiss={submitting ? null : onCancel}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 sm:px-6 py-4 border-b"
        style={{ borderColor: '#f0f0f0' }}
      >
        <h2
          id="jurnal-form-title"
          className="text-base font-bold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {mode === 'create' ? 'Jurnal Baru' : 'Ubah Jurnal'}
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {clientName} · debit dan kredit harus seimbang sebelum bisa disimpan
        </p>
      </div>

      {/* Isi */}
      <div
        className="flex-1 overflow-y-auto px-5 sm:px-6 py-4"
        style={{ background: '#f8f8f8' }}
      >
        {serverErrors.length > 0 && (
          <div
            role="alert"
            className="mb-4 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
            style={{
              background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
              border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
            }}
          >
            <AlertTriangle
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
            />
            <div>
              {serverErrors.map((e, i) => (
                <p key={i} className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                  {e}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Header jurnal */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label style={label} htmlFor="jurnal-tanggal">
              Tanggal
            </label>
            {/* type="date" memberi & menerima 'YYYY-MM-DD' apa adanya — tidak
                ada objek Date yang terlibat sama sekali (P2). */}
            <input
              id="jurnal-tanggal"
              type="date"
              value={form.tanggal}
              onChange={e => patch({ tanggal: e.target.value })}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="jurnal-no-bukti">
              No. Bukti <span style={optional}>(opsional)</span>
            </label>
            <input
              id="jurnal-no-bukti"
              type="text"
              value={form.noBukti}
              maxLength={NO_BUKTI_MAX}
              placeholder="mis. JU-2026-09-001"
              onChange={e => patch({ noBukti: e.target.value })}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="jurnal-keterangan">
              Keterangan <span style={optional}>(opsional)</span>
            </label>
            <input
              id="jurnal-keterangan"
              type="text"
              value={form.keterangan}
              placeholder="mis. Bayar listrik kantor September"
              onChange={e => patch({ keterangan: e.target.value })}
              style={input}
            />
          </div>
        </div>

        {/* Saran AI */}
        <div className="mt-3">
          <button
            type="button"
            onClick={mintaSaran}
            disabled={aiLoading || form.keterangan.trim() === '' || submitting}
            title={
              form.keterangan.trim() === ''
                ? 'Isi keterangan transaksi dulu.'
                : 'Minta AI menyarankan pasangan akun dari keterangan.'
            }
            className="inline-flex items-center gap-1.5 rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{
              padding: '7px 14px',
              fontSize: 12,
              border: '1px solid rgba(187,179,243,0.5)',
              background: '#faf9ff',
              color: '#6d5fd0',
              minHeight: 34,
            }}
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Meminta saran…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Sarankan akun (AI)
              </>
            )}
          </button>

          {aiError && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {aiError}
            </p>
          )}

          {aiPairs && aiPairs.length > 0 && (
            <ul className="mt-2 space-y-2">
              {aiPairs.map((p, i) => (
                <li
                  key={`${p.debit.kode}-${p.kredit.kode}-${i}`}
                  className="rounded-2xl px-3.5 py-2.5 flex items-start justify-between gap-3"
                  style={{ background: 'white', border: '1px solid #f0f0f0' }}
                >
                  <div className="min-w-0">
                    <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                      <strong>D</strong> {p.debit.kode} — {p.debit.nama}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                      <strong>K</strong> {p.kredit.kode} — {p.kredit.nama}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {p.reason} · keyakinan {p.confidence}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => terapkan(p)}
                    className="inline-flex items-center gap-1 rounded-full font-semibold flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                    style={{
                      padding: '6px 12px',
                      fontSize: 11.5,
                      minHeight: 32,
                      border: 'none',
                      background: 'var(--color-accent-secondary)',
                      color: '#1f2430',
                      cursor: 'pointer',
                    }}
                  >
                    <Check className="w-3 h-3" /> Terapkan
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Baris D/K */}
        <h3
          className="text-xs font-semibold mt-5 mb-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Baris jurnal
        </h3>
        <div className="space-y-2">
          {form.lines.map((l, i) => {
            const masalah = barisBermasalah[i]
            const galat = galatNominal[i]
            const idGalat = `jurnal-baris-${l.key}-galat`
            return (
              <div
                key={l.key}
                className="rounded-2xl px-3 py-2.5"
                style={{ background: 'white', border: '1px solid #f0f0f0' }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="text-[11px] font-semibold flex-shrink-0"
                    style={{ color: 'var(--color-text-muted)', minWidth: 18, paddingTop: 9 }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-5">
                      <StyledSelect
                        options={options}
                        value={l.masterCoaId}
                        onChange={v => patchLine(l.key, { masterCoaId: v })}
                        placeholder="Pilih akun…"
                        searchable
                        searchPlaceholder="Cari kode atau nama akun…"
                        ariaLabel={`Akun baris ${i + 1}`}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <NominalInput
                        value={l.debit}
                        placeholder="Debit"
                        aria-label={`Debit baris ${i + 1}`}
                        aria-invalid={galat.debit !== null || masalah === 'dua-sisi'}
                        aria-describedby={masalah ? idGalat : undefined}
                        // Mengisi satu sisi MENGOSONGKAN sisi lain: satu baris
                        // jurnal cuma punya satu sisi, dan membiarkan keduanya
                        // terisi memindahkan penemuan galat ke tombol Simpan.
                        onChange={v => patchLine(l.key, { debit: v, kredit: '' })}
                        style={nominalInput(galat.debit !== null || masalah === 'dua-sisi')}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <NominalInput
                        value={l.kredit}
                        placeholder="Kredit"
                        aria-label={`Kredit baris ${i + 1}`}
                        aria-invalid={galat.kredit !== null || masalah === 'dua-sisi'}
                        aria-describedby={masalah ? idGalat : undefined}
                        onChange={v => patchLine(l.key, { kredit: v, debit: '' })}
                        style={nominalInput(galat.kredit !== null || masalah === 'dua-sisi')}
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-start justify-end">
                      <button
                        type="button"
                        onClick={() => hapusBaris(l.key)}
                        disabled={form.lines.length <= MIN_LINES}
                        aria-label={`Hapus baris ${i + 1}`}
                        title={
                          form.lines.length <= MIN_LINES
                            ? `Jurnal minimal ${MIN_LINES} baris.`
                            : 'Hapus baris ini'
                        }
                        className="inline-flex items-center justify-center rounded-full disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                        style={{
                          width: 34,
                          height: 34,
                          border: '1px solid #e5e7eb',
                          background: 'white',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-2" style={{ paddingLeft: 26 }}>
                  <input
                    type="text"
                    value={l.keterangan}
                    placeholder="Keterangan baris (opsional)"
                    aria-label={`Keterangan baris ${i + 1}`}
                    onChange={e => patchLine(l.key, { keterangan: e.target.value })}
                    style={{ ...input, padding: '7px 10px', fontSize: 12 }}
                  />
                  {/* ══ PENANDA SUPPLIER — HANYA PADA BARIS HUTANG (F1/F4) ══
                      Muncul hanya bila akun baris ini bertipe liability. Di
                      baris lain ia akan ditolak server; lebih baik tidak
                      ditawarkan sama sekali daripada ditawarkan lalu ditolak.
                      Gunanya menjelaskan selisih di Rekonsiliasi /hutang. */}
                  {akunLiability(l.masterCoaId) && suppliers.length > 0 && (
                    <div className="mt-2">
                      <StyledSelect
                        options={opsiSupplier}
                        value={l.supplierId}
                        onChange={v => patchLine(l.key, { supplierId: v })}
                        placeholder="— tanpa supplier —"
                        searchable
                        searchPlaceholder="Cari supplier…"
                        ariaLabel={`Supplier baris ${i + 1} (opsional)`}
                      />
                      <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Opsional. Menandai supplier membantu menjelaskan selisih di Rekonsiliasi hutang.
                      </p>
                    </div>
                  )}
                  {masalah && (
                    <p id={idGalat} className="text-[11px] mt-1.5" style={{ color: '#b91c1c' }}>
                      {masalah === 'akun' && 'Pilih akun untuk baris ini.'}
                      {masalah === 'nominal' &&
                        `${galat.debit !== null ? 'Debit' : 'Kredit'}: ${galat.debit ?? galat.kredit ?? 'nominal tidak valid.'}`}
                      {masalah === 'dua-sisi' && 'Isi debit ATAU kredit, tidak keduanya.'}
                      {masalah === 'kosong' && 'Isi nominal di salah satu sisi.'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }))}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{
            padding: '7px 14px',
            fontSize: 12,
            minHeight: 34,
            border: '1px solid #e5e7eb',
            background: 'white',
            color: 'var(--color-text-primary)',
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Tambah baris
        </button>

        {/* Panel selisih — dihitung dari computeTotals, bukan hitungan sendiri */}
        <div
          className="mt-4 rounded-2xl px-3.5 py-3 grid grid-cols-3 gap-3"
          style={{
            background: seimbang
              ? 'color-mix(in srgb, var(--color-accent-primary) 18%, white)'
              : 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
            border: `1px solid ${
              seimbang
                ? 'color-mix(in srgb, var(--color-accent-primary) 45%, white)'
                : 'color-mix(in srgb, var(--color-accent-critical) 35%, white)'
            }`,
          }}
        >
          <div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Total Debit
            </p>
            <p
              className="text-sm font-bold"
              style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}
            >
              {rupiahPersis(fromMinorUnits(totals.debit))}
            </p>
          </div>
          <div>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Total Kredit
            </p>
            <p
              className="text-sm font-bold"
              style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}
            >
              {rupiahPersis(fromMinorUnits(totals.kredit))}
            </p>
          </div>
          <div aria-live="polite">
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Selisih
            </p>
            {seimbang ? (
              <p className="text-sm font-bold" style={{ color: '#15803d' }}>
                Seimbang
              </p>
            ) : (
              <p
                className="text-sm font-bold"
                style={{
                  color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {rupiahPersis(fromMinorUnits(totals.selisih))}
                <span className="block text-[11px] font-normal" style={{ color: 'var(--color-text-muted)' }}>
                  sisi {totals.sisiLebih} lebih besar
                </span>
              </p>
            )}
          </div>
        </div>

        {!cukupBaris && (
          <p className="text-[11px] mt-2" style={{ color: '#b91c1c' }}>
            Jurnal minimal {MIN_LINES} baris.
          </p>
        )}
      </div>

      {/* Aksi */}
      <div
        className="flex-shrink-0 flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
        style={{ borderColor: '#f0f0f0', background: 'white' }}
      >
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 rounded-full text-xs font-medium transition-colors duration-150 hover:bg-(--color-border-subtle) disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
        >
          <X className="w-3.5 h-3.5 inline mr-1" />
          Batal
        </button>
        <button
          type="button"
          onClick={() => onSubmit(form)}
          disabled={!bolehSimpan}
          title={bolehSimpan ? undefined : 'Lengkapi isian dan seimbangkan debit dengan kredit dulu.'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 enabled:hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
          style={{
            background: 'var(--color-accent-primary)',
            color: 'var(--color-accent-primary-fg)',
            minHeight: 34,
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              {mode === 'create' ? 'Simpan Jurnal' : 'Simpan Perubahan'}
            </>
          )}
        </button>
      </div>
    </ModalShell>
  )
}
