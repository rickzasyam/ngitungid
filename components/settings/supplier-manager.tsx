'use client'

// Tab Settings → Supplier. Master data rekanan per klien.
//
// ══ finance MELIHAT, tidak mengelola (R4) ══════════════════════════════════
// Seluruh kontrol tulis digerbangi satu prop `readOnly`, mengikuti pola
// MasterCoaTab. Ekspor TETAP tersedia saat read-only karena ia operasi BACA —
// finance yang boleh melihat daftarnya juga boleh mengunduhnya.
//
// Menyembunyikan tombol BUKAN kontrol keamanan. Yang menegakkan tetap penjaga
// di route: baca requireInternal, tulis requireAkunting.
//
// ══ PEMILIH AKUN HUTANG ════════════════════════════════════════════════════
// Hanya akun yang lolos isHutangAccount yang masuk daftar. Fase 1 belum punya
// kolom tipe akun, jadi klasifikasinya diturunkan dari sub kelompok lewat
// classifyBs — mesin yang sama dengan Neraca. Server memeriksa ulang aturan
// yang persis sama; penyaringan di sini supaya orang tidak bisa memilih yang
// pasti ditolak, bukan sebagai penjaga.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Download,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import {
  BANK_ATAS_NAMA_MAX,
  BANK_NAMA_MAX,
  BANK_REKENING_MAX,
  isHutangAccount,
  NAMA_MAX,
  validateSupplierInput,
} from '@/lib/supplier'

interface SupplierRow {
  id: string
  nama: string
  kontak: string | null
  npwp: string | null
  bankNama: string | null
  bankRekening: string | null
  bankAtasNama: string | null
  akunHutangDefaultId: string | null
  akunHutangKode: string | null
  akunHutangNama: string | null
}

interface CoaRow {
  id: string
  kode: string
  nama: string
  subKelompok: string
}

interface FormState {
  nama: string
  kontak: string
  npwp: string
  bankNama: string
  bankRekening: string
  bankAtasNama: string
  akunHutangDefaultId: string
}

interface DryRun {
  toInsert: number
  toUpdate: number
  warnings: string[]
  note?: string
}

const kosongForm = (): FormState => ({
  nama: '',
  kontak: '',
  npwp: '',
  bankNama: '',
  bankRekening: '',
  bankAtasNama: '',
  akunHutangDefaultId: '',
})

/** Ringkasan rekening untuk tabel: "BCA · 0123456789 · a.n. PT ABC", atau null. */
function ringkasRekening(r: Pick<SupplierRow, 'bankNama' | 'bankRekening' | 'bankAtasNama'>): string | null {
  const bagian = [r.bankNama, r.bankRekening, r.bankAtasNama ? `a.n. ${r.bankAtasNama}` : null].filter(
    (x): x is string => x !== null && x !== ''
  )
  return bagian.length === 0 ? null : bagian.join(' · ')
}

export function SupplierTab({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const [rows, setRows] = useState<SupplierRow[]>([])
  const [accounts, setAccounts] = useState<CoaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [form, setForm] = useState<FormState>(kosongForm())
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [hapusTarget, setHapusTarget] = useState<SupplierRow | null>(null)
  const [hapusBusy, setHapusBusy] = useState(false)

  const [pending, setPending] = useState<{ file: File; dry: DryRun } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const muat = useCallback(async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/suppliers`),
        fetch(`/api/clients/${clientId}/coa`),
      ])
      const sPayload = (await sRes.json().catch(() => null)) as
        | { suppliers?: SupplierRow[]; error?: string }
        | null
      const cPayload = (await cRes.json().catch(() => null)) as { accounts?: CoaRow[] } | null
      if (!sRes.ok) {
        setError(sPayload?.error ?? 'Gagal memuat supplier.')
        setRows([])
      } else {
        setError(null)
        setRows(sPayload?.suppliers ?? [])
      }
      setAccounts(cPayload?.accounts ?? [])
    } catch {
      setError('Gagal menghubungi server.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void (async () => {
      await muat()
    })()
  }, [muat])

  // Hanya akun hutang yang boleh dipilih. Dikelompokkan sub kelompoknya supaya
  // daftar panjang tetap bisa ditelusuri.
  const akunOptions: StyledOption[] = useMemo(() => {
    const hutang = accounts.filter(a => isHutangAccount(a.subKelompok))
    return [
      { value: '', label: '— tanpa akun default —', kind: 'placeholder' as const },
      ...hutang.map(a => ({
        value: a.id,
        label: a.nama,
        badge: a.kode,
        group: a.subKelompok,
      })),
    ]
  }, [accounts])

  const tidakAdaAkunHutang = accounts.length > 0 && akunOptions.length === 1

  function bukaTambah() {
    setFormErrors([])
    setEditing(null)
    setForm(kosongForm())
    setFormMode('create')
  }

  function bukaUbah(r: SupplierRow) {
    setFormErrors([])
    setEditing(r)
    setForm({
      nama: r.nama,
      kontak: r.kontak ?? '',
      npwp: r.npwp ?? '',
      bankNama: r.bankNama ?? '',
      bankRekening: r.bankRekening ?? '',
      bankAtasNama: r.bankAtasNama ?? '',
      akunHutangDefaultId: r.akunHutangDefaultId ?? '',
    })
    setFormMode('edit')
  }

  async function simpan() {
    // Divalidasi lebih dulu di sini memakai modul yang SAMA dengan server, jadi
    // galat bentuk ketahuan tanpa perjalanan bolak-balik. Server tetap
    // memvalidasi ulang — ini kenyamanan, bukan penjaga.
    const check = validateSupplierInput({
      nama: form.nama,
      kontak: form.kontak,
      npwp: form.npwp,
      bankNama: form.bankNama,
      bankRekening: form.bankRekening,
      bankAtasNama: form.bankAtasNama,
      akunHutangDefaultId: form.akunHutangDefaultId === '' ? null : form.akunHutangDefaultId,
    })
    if (!check.ok) {
      setFormErrors(check.errors)
      return
    }

    setSaving(true)
    setFormErrors([])
    try {
      const url =
        formMode === 'edit' && editing
          ? `/api/clients/${clientId}/suppliers/${editing.id}`
          : `/api/clients/${clientId}/suppliers`
      const res = await fetch(url, {
        method: formMode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check.value),
      })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[] }
        | null
      if (!res.ok) {
        setFormErrors(payload?.details?.length ? payload.details : [payload?.error ?? 'Gagal menyimpan.'])
        return
      }
      setFormMode(null)
      setEditing(null)
      await muat()
    } catch {
      setFormErrors(['Gagal menghubungi server.'])
    } finally {
      setSaving(false)
    }
  }

  // Dialog konfirmasi DITUTUP di setiap akhir — berhasil maupun gagal. Pesan
  // galat (mis. 409 "masih dipakai N invoice pembelian dan M baris jurnal")
  // tampil di banner halaman, dan banner itu tertutup lapisan gelap selama
  // dialognya masih terbuka: tombol "Hapus" terlihat tidak melakukan apa-apa.
  async function hapus() {
    if (!hapusTarget) return
    setHapusBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/suppliers/${hapusTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setError(payload?.error ?? 'Gagal menghapus supplier.')
        return
      }
      await muat()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setHapusTarget(null)
      setHapusBusy(false)
    }
  }

  // Impor dua langkah: dry-run dulu untuk memperlihatkan dampaknya, commit
  // setelah dikonfirmasi — pola yang sama dengan ganti Master COA.
  async function pilihBerkas(file: File) {
    setError(null)
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('dryRun', '1')
      const res = await fetch(`/api/clients/${clientId}/suppliers/import`, { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as
        | (DryRun & { error?: string; details?: string[] })
        | null
      if (!res.ok) {
        setError(payload?.details?.join(' ') ?? payload?.error ?? 'Gagal membaca berkas.')
        return
      }
      setPending({ file, dry: payload as DryRun })
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function komitImpor() {
    if (!pending) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', pending.file)
      const res = await fetch(`/api/clients/${clientId}/suppliers/import`, { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(payload?.error ?? 'Gagal mengimpor.')
        return
      }
      setPending(null)
      await muat()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setImporting(false)
    }
  }

  const bolehTulis = !readOnly

  return (
    <div>
      {/* Header tab */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Supplier
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {rows.length} supplier
            {readOnly ? ' · Anda dapat melihat dan mengunduh, tidak mengubah' : ' · rekanan klien ini'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void muat()}
            disabled={loading}
            aria-label="Muat ulang daftar supplier"
            className="inline-flex items-center gap-1.5 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={btnGhost}
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>

          {/* Ekspor TETAP ada saat read-only — ia operasi baca. */}
          <a
            href={`/api/clients/${clientId}/suppliers/export`}
            className="inline-flex items-center gap-1.5 rounded-full font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ ...btnGhost, textDecoration: 'none' }}
          >
            <Download className="w-3.5 h-3.5" /> Ekspor
          </a>

          {bolehTulis && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                id="supplier-import-file"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) void pilihBerkas(f)
                }}
              />
              <label
                htmlFor="supplier-import-file"
                className="inline-flex items-center gap-1.5 rounded-full font-medium cursor-pointer focus-within:ring-2 focus-within:ring-(--color-accent-primary)"
                style={btnGhost}
              >
                <Upload className="w-3.5 h-3.5" /> Impor
              </label>
              <button
                type="button"
                onClick={bukaTambah}
                className="inline-flex items-center gap-1.5 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{
                  padding: '8px 16px',
                  fontSize: 12.5,
                  minHeight: 34,
                  border: 'none',
                  background: 'var(--color-accent-primary)',
                  color: 'var(--color-accent-primary-fg)',
                  cursor: 'pointer',
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Supplier Baru
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
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
          <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat supplier…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Inbox className="w-10 h-10" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Belum ada supplier
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {bolehTulis
                ? 'Tambahkan satu per satu, atau impor dari Excel.'
                : 'Belum ada rekanan yang terdaftar untuk klien ini.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 720 }}>
              <caption className="sr-only">Daftar supplier klien</caption>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th scope="col" style={th}>Nama</th>
                  <th scope="col" style={th}>Kontak</th>
                  <th scope="col" style={th}>NPWP</th>
                  <th scope="col" style={th}>Rekening</th>
                  <th scope="col" style={th}>Akun Hutang Default</th>
                  {bolehTulis && <th scope="col" style={{ ...th, textAlign: 'right' }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.nama}</td>
                    <td style={td}>{r.kontak ?? '—'}</td>
                    <td style={td}>{r.npwp ?? '—'}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{ringkasRekening(r) ?? '—'}</td>
                    <td style={td}>
                      {r.akunHutangKode ? (
                        <>
                          <span
                            className="font-mono text-[11px] px-1.5 py-0.5 rounded-full mr-1.5"
                            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
                          >
                            {r.akunHutangKode}
                          </span>
                          {r.akunHutangNama}
                        </>
                      ) : (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{
                            background: 'color-mix(in srgb, var(--color-accent-peach) 25%, white)',
                            color: '#92400e',
                          }}
                        >
                          belum lengkap
                        </span>
                      )}
                    </td>
                    {bolehTulis && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => bukaUbah(r)}
                            aria-label={`Ubah supplier ${r.nama}`}
                            className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            style={iconBtn}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHapusTarget(r)}
                            aria-label={`Hapus supplier ${r.nama}`}
                            className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            style={iconBtn}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form tambah / ubah */}
      {formMode && (
        <ModalShell
          labelledBy="supplier-form-title"
          className="max-w-lg"
          onDismiss={saving ? null : () => setFormMode(null)}
        >
          <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
            <h2 id="supplier-form-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {formMode === 'create' ? 'Supplier Baru' : 'Ubah Supplier'}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4" style={{ background: '#f8f8f8' }}>
            {formErrors.length > 0 && (
              <div
                role="alert"
                className="mb-4 px-3.5 py-2.5 rounded-2xl"
                style={{
                  background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                  border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
                }}
              >
                {formErrors.map((e, i) => (
                  <p key={i} className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{e}</p>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label style={label} htmlFor="sup-nama">Nama supplier</label>
                <input
                  id="sup-nama"
                  type="text"
                  value={form.nama}
                  maxLength={NAMA_MAX}
                  onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                  style={input}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label style={label} htmlFor="sup-kontak">
                    Kontak <span style={optional}>(opsional)</span>
                  </label>
                  <input
                    id="sup-kontak"
                    type="text"
                    value={form.kontak}
                    placeholder="mis. Pak Budi 0812…"
                    onChange={e => setForm(f => ({ ...f, kontak: e.target.value }))}
                    style={input}
                  />
                </div>
                <div>
                  <label style={label} htmlFor="sup-npwp">
                    NPWP <span style={optional}>(opsional)</span>
                  </label>
                  <input
                    id="sup-npwp"
                    type="text"
                    value={form.npwp}
                    onChange={e => setForm(f => ({ ...f, npwp: e.target.value }))}
                    style={input}
                  />
                </div>
              </div>
              {/* Data rekening (D43) — menggantikan termin, yang kini diisi per
                  invoice. Nomor rekening input TEKS: nol di depan adalah bagian
                  nomornya dan tidak boleh hilang. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label style={label} htmlFor="sup-bank-nama">
                    Nama bank <span style={optional}>(opsional)</span>
                  </label>
                  <input
                    id="sup-bank-nama"
                    type="text"
                    value={form.bankNama}
                    maxLength={BANK_NAMA_MAX}
                    placeholder="mis. BCA"
                    onChange={e => setForm(f => ({ ...f, bankNama: e.target.value }))}
                    style={input}
                  />
                </div>
                <div>
                  <label style={label} htmlFor="sup-bank-rekening">
                    No. rekening <span style={optional}>(opsional)</span>
                  </label>
                  <input
                    id="sup-bank-rekening"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.bankRekening}
                    maxLength={BANK_REKENING_MAX}
                    onChange={e => setForm(f => ({ ...f, bankRekening: e.target.value }))}
                    style={{ ...input, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
                <div>
                  <label style={label} htmlFor="sup-bank-atas-nama">
                    Atas nama <span style={optional}>(opsional)</span>
                  </label>
                  <input
                    id="sup-bank-atas-nama"
                    type="text"
                    value={form.bankAtasNama}
                    maxLength={BANK_ATAS_NAMA_MAX}
                    onChange={e => setForm(f => ({ ...f, bankAtasNama: e.target.value }))}
                    style={input}
                  />
                </div>
              </div>
              <div>
                <label style={label}>
                  Akun hutang default <span style={optional}>(opsional)</span>
                </label>
                <StyledSelect
                  options={akunOptions}
                  value={form.akunHutangDefaultId}
                  onChange={v => setForm(f => ({ ...f, akunHutangDefaultId: v }))}
                  placeholder="— tanpa akun default —"
                  searchable
                  searchPlaceholder="Cari kode atau nama akun…"
                  ariaLabel="Akun hutang default supplier"
                />
                {tidakAdaAkunHutang && (
                  <p className="text-[11px] mt-1" style={{ color: '#92400e' }}>
                    Master COA klien ini belum punya akun yang terklasifikasi sebagai hutang.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <button
              type="button"
              onClick={() => setFormMode(null)}
              disabled={saving}
              className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void simpan()}
              disabled={saving || form.nama.trim() === ''}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: 'var(--color-accent-primary)',
                color: 'var(--color-accent-primary-fg)',
                minHeight: 34,
              }}
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan…</>
              ) : (
                <><Check className="w-3.5 h-3.5" /> Simpan</>
              )}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Konfirmasi hapus */}
      {hapusTarget && (
        <ModalShell
          labelledBy="supplier-hapus-title"
          className="max-w-md"
          onDismiss={hapusBusy ? null : () => setHapusTarget(null)}
        >
          <div className="px-5 sm:px-6 py-5">
            <h2 id="supplier-hapus-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Hapus supplier ini?
            </h2>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>{hapusTarget.nama}</strong> dihapus
              permanen. Supplier yang masih dipakai invoice pembelian atau baris jurnal{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>tidak bisa dihapus</strong> — permintaan ini
              akan ditolak beserta jumlah pemakaiannya. Master COA tidak terpengaruh.
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)',
                minHeight: 34,
              }}
            >
              {hapusBusy ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menghapus…</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Hapus</>
              )}
            </button>
          </div>
        </ModalShell>
      )}

      {/* Konfirmasi impor (hasil dry-run) */}
      {pending && (
        <ModalShell
          labelledBy="supplier-impor-title"
          className="max-w-lg"
          onDismiss={importing ? null : () => setPending(null)}
        >
          <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
            <h2 id="supplier-impor-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Impor Supplier
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {pending.file.name}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4" style={{ background: '#f8f8f8' }}>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl px-3.5 py-3" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                <p className="text-xl font-bold leading-none" style={{ color: 'var(--color-text-primary)' }}>
                  {pending.dry.toInsert}
                </p>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>supplier baru</p>
              </div>
              <div className="rounded-2xl px-3.5 py-3" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
                <p className="text-xl font-bold leading-none" style={{ color: 'var(--color-text-primary)' }}>
                  {pending.dry.toUpdate}
                </p>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--color-text-muted)' }}>diperbarui</p>
              </div>
            </div>

            {/* Kebijakan sel kosong datang DARI SERVER, bukan ditulis ulang di
                sini — supaya yang dijanjikan layar ini selalu sama dengan yang
                benar-benar dikerjakan route. */}
            {pending.dry.note && (
              <p
                className="text-xs mt-3 px-3.5 py-2.5 rounded-2xl leading-relaxed"
                style={{ background: '#faf9ff', border: '1px solid rgba(187,179,243,0.4)', color: '#6d5fd0' }}
              >
                {pending.dry.note}
              </p>
            )}

            {pending.dry.warnings.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
                  Catatan ({pending.dry.warnings.length})
                </h3>
                <ul className="space-y-1">
                  {pending.dry.warnings.slice(0, 12).map((w, i) => (
                    <li key={i} className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{w}</li>
                  ))}
                </ul>
                {pending.dry.warnings.length > 12 && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    +{pending.dry.warnings.length - 12} catatan lain
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] mt-4 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Impor tidak pernah menghapus supplier. Yang tidak ada di berkas dibiarkan apa adanya.
            </p>
          </div>

          <div
            className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t"
            style={{ borderColor: '#f0f0f0', background: 'white' }}
          >
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={importing}
              className="px-4 py-2 rounded-full text-xs font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void komitImpor()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: 'var(--color-accent-primary)',
                color: 'var(--color-accent-primary-fg)',
                minHeight: 34,
              }}
            >
              {importing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengimpor…</>
              ) : (
                <><Check className="w-3.5 h-3.5" /> Lanjutkan Impor</>
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

const btnGhost: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 12.5,
  minHeight: 34,
  border: '1px solid #e5e7eb',
  background: 'white',
  color: 'var(--color-text-muted)',
  cursor: 'pointer',
}

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
}

const optional: React.CSSProperties = { fontWeight: 400, color: 'var(--color-text-muted)' }

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
