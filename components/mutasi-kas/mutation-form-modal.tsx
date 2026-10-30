'use client'

// Form mutasi kas MANUAL — dipakai untuk membuat dan mengubah satu baris.
// Dipisah dari halamannya supaya page.tsx tetap soal daftar & aksi.
//
// ══ ARAH UANG DIPILIH DENGAN KATA, BUKAN "DEBIT/KREDIT" ══════════════════
// Yang mengisi form ini membaca rekening koran, bukan buku besar. "Uang masuk"
// dan "uang keluar" tidak bisa salah dimengerti; "debit" bisa — dan artinya
// TERBALIK antara rekening koran (sudut pandang bank) dan pembukuan kita
// (akun kas adalah aset). Nominalnya satu kolom, sisinya dipilih di sini.

import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import { GalatNominal, merahBila } from '@/components/ui/galat-nominal'
import { NominalInput } from '@/components/ui/nominal-input'
import { pesanGalatNominal } from '@/lib/nominal'
import type { AccountType } from '@/lib/coa/account-type'

export interface AkunOption {
  id: string
  kode: string
  nama: string
  kelompok: string
  /** Tipe akun yang BERLAKU (GET /coa) — pengelompok combobox Nama Akun grid. */
  resolvedType?: AccountType | null
}

export interface MutationFormValue {
  tanggal: string
  akunKasId: string
  arah: 'masuk' | 'keluar'
  nominal: string
  keterangan: string
  /** Kosong = mutasi masuk berstatus "belum dijurnal" — keadaan yang sah. */
  akunLawanId: string
}

export function blankMutationForm(tanggal: string, akunKasId: string): MutationFormValue {
  return { tanggal, akunKasId, arah: 'keluar', nominal: '', keterangan: '', akunLawanId: '' }
}

export function MutationFormModal({
  mode,
  initial,
  akunKas,
  akunLawan,
  errors,
  submitting,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  initial: MutationFormValue
  akunKas: AkunOption[]
  akunLawan: AkunOption[]
  errors: string[]
  submitting: boolean
  onCancel: () => void
  onSubmit: (v: MutationFormValue) => void
}) {
  const [form, setForm] = useState<MutationFormValue>(initial)

  const opsiKas: StyledOption[] = useMemo(
    () => akunKas.map(a => ({ value: a.id, label: a.nama, badge: a.kode })),
    [akunKas]
  )
  const opsiLawan: StyledOption[] = useMemo(
    () => akunLawan.map(a => ({ value: a.id, label: a.nama, badge: a.kode, group: a.kelompok })),
    [akunLawan]
  )

  const set = <K extends keyof MutationFormValue>(k: K, v: MutationFormValue[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  // Parser bersama (lib/nominal.ts) — yang sama dengan validasi server.
  const galatNominal = pesanGalatNominal(form.nominal)

  return (
    <ModalShell onDismiss={submitting ? null : onCancel} labelledBy="mutasi-form-title" className="max-w-xl">
      <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
        <h2 id="mutasi-form-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {mode === 'edit' ? 'Ubah Mutasi Kas' : 'Mutasi Kas Baru'}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Satu baris rekening koran, diisi manual
        </p>
      </div>

      <div className="px-5 sm:px-6 py-4 flex flex-col gap-3.5 overflow-y-auto" style={{ maxHeight: '64vh' }}>
        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-2xl px-3.5 py-2.5 flex items-start gap-2"
            style={{
              background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
              border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
            }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }} />
            <ul className="text-xs flex flex-col gap-1" style={{ color: 'var(--color-text-primary)', margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="m-tanggal" style={label}>Tanggal</label>
            <input
              id="m-tanggal"
              type="date"
              value={form.tanggal}
              onChange={e => set('tanggal', e.target.value)}
              style={input}
            />
          </div>
          <div>
            <label style={label}>Akun kas / bank</label>
            <StyledSelect
              options={opsiKas}
              value={form.akunKasId}
              onChange={v => set('akunKasId', v)}
              placeholder="Pilih akun kas…"
              searchable
              searchPlaceholder="Cari kode atau nama akun…"
              ariaLabel="Akun kas mutasi"
            />
          </div>
        </div>

        {/* Arah uang — Debet = uang masuk ke rekening ini, Kredit = uang keluar
            (D63, konvensi sheet kas template akuntan). */}
        <div>
          <span style={label}>Arah uang</span>
          <div role="group" aria-label="Arah uang" className="flex gap-2">
            {(
              [
                { v: 'masuk' as const, label: 'Debet', Icon: ArrowDownLeft, warna: '#15803d' },
                { v: 'keluar' as const, label: 'Kredit', Icon: ArrowUpRight, warna: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)' },
              ]
            ).map(o => {
              const aktif = form.arah === o.v
              return (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => set('arah', o.v)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{
                    minHeight: 38,
                    border: aktif ? `1px solid ${o.warna}` : '1px solid #e5e7eb',
                    background: aktif ? 'color-mix(in srgb, currentColor 8%, white)' : 'white',
                    color: aktif ? o.warna : 'var(--color-text-muted)',
                  }}
                >
                  <o.Icon className="w-3.5 h-3.5" /> {o.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor="m-nominal" style={label}>Nominal</label>
          <NominalInput
            id="m-nominal"
            value={form.nominal}
            onChange={nilai => set('nominal', nilai)}
            placeholder="0"
            aria-invalid={galatNominal !== null}
            aria-describedby={galatNominal ? 'm-nominal-galat' : undefined}
            style={{ ...input, ...merahBila(galatNominal), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          />
          <GalatNominal id="m-nominal-galat" pesan={galatNominal} />
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Tanpa tanda minus — arahnya sudah dipilih di atas. Titik ribuan muncul sendiri; koma
            (atau titik) untuk sen.
          </p>
        </div>

        <div>
          <label htmlFor="m-ket" style={label}>
            Keterangan <span style={opsional}>(opsional)</span>
          </label>
          <input
            id="m-ket"
            value={form.keterangan}
            onChange={e => set('keterangan', e.target.value)}
            placeholder="Misal: TRF BRI ke supplier A"
            style={input}
          />
        </div>

        <div>
          <label style={label}>
            Nama Akun <span style={opsional}>(opsional)</span>
          </label>
          <StyledSelect
            options={opsiLawan}
            value={form.akunLawanId}
            onChange={v => set('akunLawanId', v)}
            placeholder="— belum ditentukan —"
            searchable
            searchPlaceholder="Cari kode atau nama akun…"
            ariaLabel="Nama Akun mutasi"
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Kosongkan kalau mutasi ini akan dialokasikan ke invoice hutang. Selama keduanya kosong,
            baris ini berstatus <strong>belum dijurnal</strong> — dan itu memang yang harus terlihat.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0' }}>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ padding: '8px 16px', minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => onSubmit(form)}
          disabled={submitting || galatNominal !== null}
          title={galatNominal ? 'Perbaiki nominal yang ditandai merah dulu.' : undefined}
          className="inline-flex items-center gap-2 rounded-full text-xs font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ padding: '8px 18px', minHeight: 34, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {mode === 'edit' ? 'Simpan perubahan' : 'Simpan mutasi'}
        </button>
      </div>
    </ModalShell>
  )
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  marginBottom: 6,
}

const opsional: React.CSSProperties = { fontWeight: 400, color: 'var(--color-text-muted)' }

const input: React.CSSProperties = {
  width: '100%',
  minHeight: 38,
  borderRadius: 14,
  border: '1px solid #e5e7eb',
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--color-text-primary)',
  background: 'white',
}
