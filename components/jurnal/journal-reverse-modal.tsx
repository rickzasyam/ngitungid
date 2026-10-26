'use client'

// Modal "Buat jurnal balik". Dipakai halaman /jurnal.
//
// ══ YANG TIDAK DIKERJAKAN DI SINI ═════════════════════════════════════════
// Barisnya TIDAK disusun di browser. Server yang membaca jurnal aslinya lalu
// menukar D/K lewat buildReversalLines — kalau form ini ikut menyusun baris,
// ada dua sumber untuk isi jurnal yang sama, dan yang kedua tidak pernah tahu
// kalau aslinya berubah. Form ini hanya mengumpulkan tanggal, nomor bukti, dan
// keterangan pembaliknya.
//
// Usulan nomor bukti datang dari defaultReversalNoBukti — dan untuk jurnal
// TANPA nomor bukti, usulannya juga kosong. Mengarang 'REV-null' berarti
// membuat penanda dokumen yang tidak menunjuk dokumen apa pun.

import { useState } from 'react'
import { AlertTriangle, Loader2, Undo2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { defaultReversalNoBukti, NO_BUKTI_MAX, TANPA_NO_BUKTI } from '@/lib/journal'
import { hariIniJakarta } from '@/lib/ymd'

export interface ReverseTarget {
  id: string
  tanggal: string
  noBukti: string | null
  keterangan: string | null
}

export interface ReverseValue {
  tanggal: string
  noBukti: string
  keterangan: string
}

export function JournalReverseModal({
  target,
  submitting,
  serverErrors,
  onSubmit,
  onCancel,
}: {
  target: ReverseTarget
  submitting: boolean
  serverErrors: string[]
  onSubmit: (value: ReverseValue) => void
  onCancel: () => void
}) {
  // Tanggal pembalik default HARI INI, bukan tanggal jurnal aslinya: membalik
  // adalah peristiwa baru yang terjadi sekarang, dan menaruhnya di tanggal lama
  // memindahkan koreksi ke periode yang mungkin sudah dilaporkan.
  const [tanggal, setTanggal] = useState(() => hariIniJakarta())
  const [noBukti, setNoBukti] = useState(defaultReversalNoBukti(target.noBukti) ?? '')
  const [keterangan, setKeterangan] = useState('')

  return (
    <ModalShell
      labelledBy="jurnal-balik-title"
      className="max-w-lg"
      onDismiss={submitting ? null : onCancel}
    >
      <form
        onSubmit={e => {
          e.preventDefault()
          if (submitting) return
          onSubmit({ tanggal, noBukti, keterangan })
        }}
      >
        <div className="px-5 sm:px-6 py-5">
          <h2
            id="jurnal-balik-title"
            className="text-base font-bold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Buat jurnal balik
          </h2>
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Membalik{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {target.noBukti ?? TANPA_NO_BUKTI}
            </strong>
            . Jurnal aslinya <strong>tidak diubah</strong> — pembalik adalah entri baru yang
            menukar debit dan kredit, dan lahir sebagai <strong>draf</strong> sampai kamu
            mempostingnya.
          </p>

          {serverErrors.length > 0 && (
            <div
              role="alert"
              className="mt-3 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
              }}
            >
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
              />
              <ul className="text-xs flex flex-col gap-0.5" style={{ color: 'var(--color-text-primary)' }}>
                {serverErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={label} htmlFor="balik-tanggal">
                Tanggal pembalik
              </label>
              <input
                id="balik-tanggal"
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                required
                style={input}
              />
            </div>
            <div>
              <label style={label} htmlFor="balik-no-bukti">
                No. bukti{' '}
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(opsional)</span>
              </label>
              <input
                id="balik-no-bukti"
                type="text"
                value={noBukti}
                maxLength={NO_BUKTI_MAX}
                onChange={e => setNoBukti(e.target.value)}
                placeholder={target.noBukti ? undefined : 'Aslinya tanpa nomor bukti'}
                style={input}
              />
            </div>
          </div>

          <div className="mt-3">
            <label style={label} htmlFor="balik-keterangan">
              Keterangan{' '}
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(opsional)</span>
            </label>
            <input
              id="balik-keterangan"
              type="text"
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              placeholder={target.keterangan ?? 'Alasan koreksi'}
              style={input}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
          style={{ borderColor: '#f0f0f0', background: 'white' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{
              background: 'var(--color-accent-primary)',
              color: 'var(--color-accent-primary-fg)',
              minHeight: 34,
              border: 'none',
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Membuat…
              </>
            ) : (
              <>
                <Undo2 className="w-3.5 h-3.5" /> Buat draf pembalik
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  marginBottom: 4,
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 12.5,
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: 'var(--color-text-primary)',
  minHeight: 34,
}
