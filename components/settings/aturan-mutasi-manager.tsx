'use client'

// Tab Settings → Aturan Mutasi (MP §5.G S4, D57). Aturan akun lawan per klien:
// "uraian mengandung X → akun lawan Y".
//
// ══ ATURAN MENGHASILKAN USULAN, BUKAN NILAI ══════════════════════════════
// Tidak ada mutasi tersimpan yang berubah karena aturan ditambah, diubah,
// atau dihapus. Usulannya tampil lilac di grid /mutasi-kas dan baru masuk sel
// lewat "Terapkan usulan". Itu yang membuat tab ini aman disunting kapan saja.
//
// ══ finance MELIHAT, tidak mengelola ═════════════════════════════════════
// Pola Supplier (R4): seluruh kontrol tulis digerbangi satu prop `readOnly`.
// Menyembunyikan tombol bukan kontrol keamanan — route menegakkan baca
// requireInternal, tulis requireAkunting.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, FlaskConical, Inbox, Loader2, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import {
  ARAH_ATURAN,
  LABEL_ARAH_ATURAN,
  POLA_MAX,
  validateAturanInput,
  type ArahAturan,
} from '@/lib/aturan-mutasi'

interface AturanRow {
  id: string
  pola: string
  arah: ArahAturan
  akunLawanId: string
  akunLawanKode: string
  akunLawanNama: string
  akunKasId: string | null
  akunKasKode: string | null
  akunKasNama: string | null
  prioritas: number
  aktif: boolean
}

interface AkunRow {
  id: string
  kode: string
  nama: string
  subKelompok?: string | null
}

interface FormState {
  pola: string
  arah: ArahAturan
  akunLawanId: string
  akunKasId: string
  prioritas: string
  aktif: boolean
}

interface HasilUji {
  jumlah: number
  diperiksa: number
  sejak: string
  contoh: string[]
  terpotong: boolean
}

const kosongForm = (): FormState => ({
  pola: '',
  arah: 'keduanya',
  akunLawanId: '',
  akunKasId: '',
  prioritas: '0',
  aktif: true,
})

const keNilai = (f: FormState) => ({
  pola: f.pola,
  arah: f.arah,
  akunLawanId: f.akunLawanId,
  akunKasId: f.akunKasId === '' ? null : f.akunKasId,
  prioritas: f.prioritas.trim() === '' ? 0 : Number(f.prioritas),
  aktif: f.aktif,
})

export function AturanMutasiTab({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const [rows, setRows] = useState<AturanRow[]>([])
  const [akunSemua, setAkunSemua] = useState<AkunRow[]>([])
  const [akunKas, setAkunKas] = useState<AkunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<AturanRow | null>(null)
  const [form, setForm] = useState<FormState>(kosongForm())
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [uji, setUji] = useState<HasilUji | null>(null)
  const [ujiBusy, setUjiBusy] = useState(false)
  const [ujiError, setUjiError] = useState<string | null>(null)

  const [hapusTarget, setHapusTarget] = useState<AturanRow | null>(null)
  const [hapusBusy, setHapusBusy] = useState(false)
  const [toggleBusy, setToggleBusy] = useState<string | null>(null)

  const muat = useCallback(async () => {
    try {
      const [rAturan, rSemua, rKas] = await Promise.all([
        fetch(`/api/clients/${clientId}/cash-mutation-rules`),
        fetch(`/api/clients/${clientId}/coa`),
        fetch(`/api/clients/${clientId}/coa?kas=1`),
      ])
      const pAturan = (await rAturan.json().catch(() => null)) as { rules?: AturanRow[]; error?: string } | null
      const pSemua = (await rSemua.json().catch(() => null)) as { accounts?: AkunRow[] } | null
      const pKas = (await rKas.json().catch(() => null)) as { accounts?: AkunRow[] } | null
      if (!rAturan.ok) {
        setError(pAturan?.error ?? 'Gagal memuat aturan mutasi.')
        setRows([])
      } else {
        setError(null)
        setRows(pAturan?.rules ?? [])
      }
      setAkunSemua(pSemua?.accounts ?? [])
      setAkunKas(pKas?.accounts ?? [])
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

  const akunLawanOptions: StyledOption[] = useMemo(
    () => [
      { value: '', label: '— pilih akun lawan —', kind: 'placeholder' as const },
      ...akunSemua.map(a => ({ value: a.id, label: a.nama, badge: a.kode, group: a.subKelompok ?? undefined })),
    ],
    [akunSemua]
  )
  const akunKasOptions: StyledOption[] = useMemo(
    () => [
      { value: '', label: 'Semua akun kas' },
      ...akunKas.map(a => ({ value: a.id, label: a.nama, badge: a.kode })),
    ],
    [akunKas]
  )
  const arahOptions: StyledOption[] = ARAH_ATURAN.map(a => ({ value: a, label: LABEL_ARAH_ATURAN[a] }))

  function bukaTambah() {
    setFormErrors([])
    setEditing(null)
    setForm(kosongForm())
    setUji(null)
    setUjiError(null)
    setFormMode('create')
  }

  function bukaUbah(r: AturanRow) {
    setFormErrors([])
    setEditing(r)
    setForm({
      pola: r.pola,
      arah: r.arah,
      akunLawanId: r.akunLawanId,
      akunKasId: r.akunKasId ?? '',
      prioritas: String(r.prioritas),
      aktif: r.aktif,
    })
    setUji(null)
    setUjiError(null)
    setFormMode('edit')
  }

  async function simpan() {
    // Modul yang SAMA dengan server — galat bentuk ketahuan tanpa bolak-balik.
    const check = validateAturanInput(keNilai(form))
    if (!check.ok) {
      setFormErrors(check.errors)
      return
    }
    setSaving(true)
    setFormErrors([])
    try {
      const url =
        formMode === 'edit' && editing
          ? `/api/clients/${clientId}/cash-mutation-rules/${editing.id}`
          : `/api/clients/${clientId}/cash-mutation-rules`
      const res = await fetch(url, {
        method: formMode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check.value),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string; details?: string[] } | null
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

  async function ujiPola() {
    setUjiBusy(true)
    setUjiError(null)
    setUji(null)
    try {
      const qs = new URLSearchParams({ pola: form.pola, arah: form.arah })
      if (form.akunKasId) qs.set('akunKasId', form.akunKasId)
      const res = await fetch(`/api/clients/${clientId}/cash-mutation-rules/uji?${qs}`)
      const payload = (await res.json().catch(() => null)) as (HasilUji & { error?: string }) | null
      if (!res.ok || !payload) {
        setUjiError(payload?.error ?? 'Gagal menguji pola.')
        return
      }
      setUji(payload)
    } catch {
      setUjiError('Gagal menghubungi server.')
    } finally {
      setUjiBusy(false)
    }
  }

  // Aktif/nonaktif = PATCH utuh dengan nilai yang sama + aktif dibalik.
  async function balikAktif(r: AturanRow) {
    setToggleBusy(r.id)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/cash-mutation-rules/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pola: r.pola,
          arah: r.arah,
          akunLawanId: r.akunLawanId,
          akunKasId: r.akunKasId,
          prioritas: r.prioritas,
          aktif: !r.aktif,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setError(payload?.error ?? 'Gagal mengubah status aturan.')
        return
      }
      await muat()
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setToggleBusy(null)
    }
  }

  async function hapus() {
    if (!hapusTarget) return
    setHapusBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/cash-mutation-rules/${hapusTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        setError(payload?.error ?? 'Gagal menghapus aturan.')
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

  const bolehTulis = !readOnly
  const jumlahAktif = rows.filter(r => r.aktif).length

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Aturan Mutasi
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {rows.length} aturan · {jumlahAktif} aktif
            {readOnly
              ? ' · Anda dapat melihat, tidak mengubah'
              : ' · usulan akun lawan di grid Mutasi Kas, masuk sel lewat “Terapkan usulan”'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void muat()}
            disabled={loading}
            aria-label="Muat ulang daftar aturan mutasi"
            className="inline-flex items-center gap-1.5 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={btnGhost}
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          {bolehTulis && (
            <button
              type="button"
              onClick={bukaTambah}
              className="inline-flex items-center gap-1.5 rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={btnUtama}
            >
              <Plus className="w-3.5 h-3.5" /> Aturan Baru
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 px-3.5 py-2.5 rounded-2xl flex items-start gap-2" style={kotakGalat}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }} />
          <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat aturan…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Inbox className="w-10 h-10" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Belum ada aturan</p>
            <p className="text-xs mt-1 max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
              {bolehTulis
                ? 'Contoh: uraian mengandung “BIAYA ADM” → akun Biaya Administrasi Bank. Bisa juga dibuat dari baris di grid Mutasi Kas.'
                : 'Belum ada aturan akun lawan untuk klien ini.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 760 }}>
              <caption className="sr-only">Daftar aturan akun lawan mutasi kas</caption>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th scope="col" style={th}>Uraian mengandung</th>
                  <th scope="col" style={th}>Arah</th>
                  <th scope="col" style={th}>Akun lawan</th>
                  <th scope="col" style={th}>Akun kas</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Prioritas</th>
                  <th scope="col" style={th}>Status</th>
                  {bolehTulis && <th scope="col" style={{ ...th, textAlign: 'right' }}>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #f5f5f5', opacity: r.aktif ? 1 : 0.6 }}>
                    <td style={{ ...td, fontWeight: 600 }}>“{r.pola}”</td>
                    <td style={td}>{LABEL_ARAH_ATURAN[r.arah]}</td>
                    <td style={td}>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full mr-1.5" style={badge}>{r.akunLawanKode}</span>
                      {r.akunLawanNama}
                    </td>
                    <td style={td}>
                      {r.akunKasKode ? (
                        <>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full mr-1.5" style={badge}>{r.akunKasKode}</span>
                          {r.akunKasNama}
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Semua akun kas</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.prioritas}</td>
                    <td style={td}>
                      {bolehTulis ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.aktif}
                          aria-label={`Aturan “${r.pola}” ${r.aktif ? 'aktif' : 'nonaktif'}`}
                          disabled={toggleBusy === r.id}
                          onClick={() => void balikAktif(r)}
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                          style={{ ...chipStatus(r.aktif), minHeight: 32, border: 'none', cursor: 'pointer' }}
                        >
                          {r.aktif ? 'Aktif' : 'Nonaktif'}
                        </button>
                      ) : (
                        <span className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={chipStatus(r.aktif)}>
                          {r.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      )}
                    </td>
                    {bolehTulis && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => bukaUbah(r)}
                            aria-label={`Ubah aturan “${r.pola}”`}
                            className="inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            style={iconBtn}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHapusTarget(r)}
                            aria-label={`Hapus aturan “${r.pola}”`}
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

      {formMode && (
        <ModalShell labelledBy="aturan-form-title" className="max-w-lg" onDismiss={saving ? null : () => setFormMode(null)}>
          <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
            <h2 id="aturan-form-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {formMode === 'create' ? 'Aturan Baru' : 'Ubah Aturan'}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Dicocokkan tanpa peduli huruf besar/kecil, tanda baca, dan spasi ganda.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4" style={{ background: '#f8f8f8' }}>
            {formErrors.length > 0 && (
              <div role="alert" className="mb-4 px-3.5 py-2.5 rounded-2xl" style={kotakGalat}>
                {formErrors.map((e, i) => (
                  <p key={i} className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{e}</p>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label style={label} htmlFor="aturan-pola">Uraian mengandung</label>
                <div className="flex gap-2">
                  <input
                    id="aturan-pola"
                    type="text"
                    value={form.pola}
                    maxLength={POLA_MAX}
                    placeholder="mis. BIAYA ADM"
                    onChange={e => {
                      setForm(f => ({ ...f, pola: e.target.value }))
                      setUji(null)
                    }}
                    style={input}
                  />
                  <button
                    type="button"
                    onClick={() => void ujiPola()}
                    disabled={ujiBusy || form.pola.trim().length < 2}
                    className="inline-flex items-center gap-1.5 rounded-full font-medium flex-shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                    style={btnGhost}
                    aria-describedby="aturan-uji-hasil"
                  >
                    {ujiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />} Uji
                  </button>
                </div>
                <div id="aturan-uji-hasil" aria-live="polite" className="mt-1.5">
                  {ujiError && <p className="text-[11px]" style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}>{ujiError}</p>}
                  {uji && (
                    <div className="text-[11px] px-3 py-2 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--color-accent-secondary) 10%, white)', border: '1px solid color-mix(in srgb, var(--color-accent-secondary) 40%, white)', color: 'var(--color-accent-secondary-text)' }}>
                      <p>
                        <strong>{uji.jumlah}</strong> dari {uji.diperiksa} mutasi sejak {uji.sejak} akan kena
                        {uji.terpotong ? ' (hanya sebagian mutasi yang diperiksa)' : ''}.
                      </p>
                      {uji.contoh.length > 0 && (
                        <ul className="mt-1 list-disc pl-4">
                          {uji.contoh.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label style={label}>Arah</label>
                  <StyledSelect
                    options={arahOptions}
                    value={form.arah}
                    onChange={v => {
                      setForm(f => ({ ...f, arah: v as ArahAturan }))
                      setUji(null)
                    }}
                    ariaLabel="Arah mutasi yang dikenai aturan"
                  />
                </div>
                <div>
                  <label style={label} htmlFor="aturan-prioritas">
                    Prioritas <span style={optional}>(lebih besar menang)</span>
                  </label>
                  <input
                    id="aturan-prioritas"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    value={form.prioritas}
                    onChange={e => setForm(f => ({ ...f, prioritas: e.target.value }))}
                    style={{ ...input, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              <div>
                <label style={label}>Akun lawan</label>
                <StyledSelect
                  options={akunLawanOptions}
                  value={form.akunLawanId}
                  onChange={v => setForm(f => ({ ...f, akunLawanId: v }))}
                  placeholder="— pilih akun lawan —"
                  searchable
                  searchPlaceholder="Cari kode atau nama akun…"
                  ariaLabel="Akun lawan yang diusulkan aturan"
                />
              </div>

              <div>
                <label style={label}>
                  Hanya untuk akun kas <span style={optional}>(opsional)</span>
                </label>
                <StyledSelect
                  options={akunKasOptions}
                  value={form.akunKasId}
                  onChange={v => {
                    setForm(f => ({ ...f, akunKasId: v }))
                    setUji(null)
                  }}
                  ariaLabel="Akun kas tempat aturan berlaku"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0', background: 'white' }}>
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
              disabled={saving || form.pola.trim() === '' || form.akunLawanId === ''}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', minHeight: 34 }}
            >
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan…</> : <><Check className="w-3.5 h-3.5" /> Simpan</>}
            </button>
          </div>
        </ModalShell>
      )}

      {hapusTarget && (
        <ModalShell labelledBy="aturan-hapus-title" className="max-w-md" onDismiss={hapusBusy ? null : () => setHapusTarget(null)}>
          <div className="px-5 sm:px-6 py-5">
            <h2 id="aturan-hapus-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Hapus aturan ini?
            </h2>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              Aturan <strong style={{ color: 'var(--color-text-primary)' }}>“{hapusTarget.pola}”</strong> dihapus permanen.
              Mutasi yang sudah tersimpan <strong style={{ color: 'var(--color-text-primary)' }}>tidak berubah</strong> — aturan
              hanya menghasilkan usulan. Untuk menghentikannya sementara, nonaktifkan saja.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0', background: 'white' }}>
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
              style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)', minHeight: 34 }}
            >
              {hapusBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menghapus…</> : <><Trash2 className="w-3.5 h-3.5" /> Hapus</>}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

const chipStatus = (aktif: boolean): React.CSSProperties =>
  aktif
    ? { background: 'color-mix(in srgb, var(--color-accent-primary) 45%, white)', color: 'var(--color-accent-primary-fg)' }
    : { background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }

const kotakGalat: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
  border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
}

const badge: React.CSSProperties = { background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--color-text-primary)' }

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

const btnUtama: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 12.5,
  minHeight: 34,
  border: 'none',
  background: 'var(--color-accent-primary)',
  color: 'var(--color-accent-primary-fg)',
  cursor: 'pointer',
}

const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }

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
