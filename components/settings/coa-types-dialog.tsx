'use client'

// Dialog dampak "Isi tipe dari berkas" (E4). Dipakai tab Master COA.
//
// ══ KENAPA SELALU ADA DIALOG, PADAHAL OPERASINYA NON-DESTRUKTIF ═══════════
// Route-nya memang hanya meng-UPDATE dua kolom dan tidak pernah menghapus apa
// pun. Tapi "tidak merusak struktur" bukan "tidak berkonsekuensi": tipe akun
// menentukan akun itu muncul di bagian mana laporan, jadi mengubahnya massal
// memindahkan angka antar-bagian. Yang ditampilkan di sini persis itu —
// sebelum → sesudah, per kode — supaya yang menyetujui tahu apa yang berpindah.

import { AlertTriangle, Loader2, Wand2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { ACCOUNT_TYPE_LABEL, type AccountType } from '@/lib/coa/account-type'

export interface CoaTypeChange {
  kode: string
  before: { tipeAkun: AccountType | null; isKas: boolean }
  after: { tipeAkun: AccountType | null; isKas: boolean }
}

export interface CoaTypesPreview {
  updated: CoaTypeChange[]
  unknownKode: string[]
  unchanged: number
  totalBaris: number
}

const tipeLabel = (t: AccountType | null) => (t ? ACCOUNT_TYPE_LABEL[t] : '— otomatis —')
const kasLabel = (v: boolean) => (v ? 'kas' : 'bukan kas')

export function CoaTypesDialog({
  preview,
  fileName,
  submitting,
  onConfirm,
  onCancel,
}: {
  preview: CoaTypesPreview
  fileName: string
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { updated, unknownKode, unchanged, totalBaris } = preview
  const adaPerubahan = updated.length > 0

  return (
    <ModalShell
      labelledBy="coa-types-title"
      className="max-w-2xl"
      onDismiss={submitting ? null : onCancel}
    >
      <div className="px-5 sm:px-6 py-5">
        <h2 id="coa-types-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Isi tipe akun dari berkas
        </h2>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>{fileName}</strong> · {totalBaris} baris
          dibaca. Yang diubah hanya <strong>Tipe Akun</strong> dan <strong>Kas</strong> — kode, nama,
          kelompok, dan pemetaan laporan tidak disentuh sama sekali.
        </p>

        <div className="flex flex-wrap gap-2 mt-3">
          <Chip label={`${updated.length} akun berubah`} tone={adaPerubahan ? 'lime' : 'muted'} />
          <Chip label={`${unchanged} sudah sesuai`} tone="muted" />
          {unknownKode.length > 0 && (
            <Chip label={`${unknownKode.length} kode tidak dikenal`} tone="warn" />
          )}
        </div>

        {!adaPerubahan && (
          <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
            Tidak ada yang perlu diubah — isi berkas sudah sama dengan yang tersimpan.
          </p>
        )}

        {adaPerubahan && (
          <div
            className="mt-3 rounded-2xl overflow-hidden"
            style={{ border: '1px solid #f0f0f0', maxHeight: 280, overflowY: 'auto' }}
          >
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <caption className="sr-only">Daftar akun yang tipenya berubah</caption>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th scope="col" style={th}>Kode</th>
                  <th scope="col" style={th}>Sebelum</th>
                  <th scope="col" style={th}>Sesudah</th>
                </tr>
              </thead>
              <tbody>
                {updated.map(u => (
                  <tr key={u.kode} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5 }}>{u.kode}</td>
                    <td style={{ ...td, color: 'var(--color-text-muted)' }}>
                      {tipeLabel(u.before.tipeAkun)} · {kasLabel(u.before.isKas)}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {tipeLabel(u.after.tipeAkun)} · {kasLabel(u.after.isKas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {unknownKode.length > 0 && (
          <div
            className="mt-3 flex items-start gap-2 px-3.5 py-2.5 rounded-2xl"
            style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
            <p className="text-xs" style={{ color: '#92400e' }}>
              Kode ini ada di berkas tapi tidak ada di Master COA klien — <strong>dilewati</strong>,
              tidak dibuatkan akun baru:{' '}
              <span style={{ fontFamily: 'monospace' }}>{unknownKode.slice(0, 12).join(', ')}</span>
              {unknownKode.length > 12 && ` +${unknownKode.length - 12} lagi`}.
            </p>
          </div>
        )}
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
          type="button"
          onClick={onConfirm}
          disabled={submitting || !adaPerubahan}
          title={adaPerubahan ? undefined : 'Tidak ada perubahan untuk disimpan.'}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
          style={{
            background: 'var(--color-accent-primary)',
            color: 'var(--color-accent-primary-fg)',
            border: 'none',
            minHeight: 34,
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan…
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" /> Terapkan ke {updated.length} akun
            </>
          )}
        </button>
      </div>
    </ModalShell>
  )
}

function Chip({ label, tone }: { label: string; tone: 'lime' | 'muted' | 'warn' }) {
  const style: React.CSSProperties =
    tone === 'lime'
      ? { background: 'color-mix(in srgb, var(--color-accent-primary) 30%, white)', color: 'var(--color-accent-primary-fg)' }
      : tone === 'warn'
        ? { background: '#fffbeb', color: '#92400e' }
        : { background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={style}>
      {label}
    </span>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const td: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12.5,
  color: 'var(--color-text-primary)',
}
