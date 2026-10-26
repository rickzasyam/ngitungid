'use client'

// Wizard impor CSV rekening koran: pilih berkas → (pemetaan kolom bila perlu)
// → pratinjau dryRun + tanda duplikat → commit.
//
// ══ PRATINJAU MEMAKAI JALUR YANG SAMA DENGAN COMMIT ══════════════════════
// Keduanya memanggil route yang sama dengan flag `dryRun` berbeda, jadi yang
// dilihat akunting di layar ini adalah yang benar-benar akan tersimpan — bukan
// perkiraan yang dihitung ulang di browser dengan aturan yang bisa menyimpang.
//
// ══ DUPLIKAT DITANDAI, TIDAK DIHALANGI (D38) ═════════════════════════════
// Baris bertanda duplikat tetap ikut tersimpan. Dua pembayaran identik pada
// hari yang sama adalah hal yang nyata; yang dibutuhkan akunting adalah
// peringatan yang bisa ia abaikan, bukan penolakan yang harus ia akali.

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, CopyCheck, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { ModalShell } from '@/components/ui/modal-portal'
import { MUTASI_FIELD_LABEL, MUTASI_FIELDS, type MutasiField } from '@/lib/csv/mutasi-kas'
import { fmtTanggal } from '@/components/jurnal/journal-detail'

type BarisPratinjau = {
  nomor: number
  tanggal: string
  keterangan: string | null
  debit: string
  kredit: string
  saldo: string | null
  duplikatDiDatabase: boolean
  duplikatDiBerkas: boolean
}

type BarisBermasalah = { nomor: number; cells: string[]; alasan: string }

type Pratinjau = {
  dryRun: true
  pemisah: string
  terbaca: number
  dugaanDuplikat: number
  bermasalah: number
  rows: BarisPratinjau[]
  barisBermasalah: BarisBermasalah[]
}

type ButuhPemetaan = {
  butuhPemetaan: true
  pemisah: string
  contoh: { nomor: number; cells: string[] }[]
}

export function ImportWizard({
  clientId,
  akunKasId,
  akunKasNama,
  onClose,
  onSelesai,
}: {
  clientId: string
  akunKasId: string
  akunKasNama: string
  onClose: () => void
  onSelesai: (tersimpan: number) => void
}) {
  const { rupiahPersis } = useRupiah()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<string[]>([])
  // Kunci periode (K4) — hanya PERINGATAN di muka; server menolak berkasnya (K2).
  const [terkunciSampai, setTerkunciSampai] = useState<string | null>(null)
  useEffect(() => {
    let batal = false
    fetch(`/api/period-locks?clientId=${clientId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { terkunciSampai?: string | null } | null) => {
        if (!batal) setTerkunciSampai(d?.terkunciSampai ?? null)
      })
      .catch(() => {})
    return () => {
      batal = true
    }
  }, [clientId])

  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null)
  const [pemetaan, setPemetaan] = useState<ButuhPemetaan | null>(null)
  const [mapping, setMapping] = useState<Partial<Record<MutasiField, string>>>({})
  const [mulaiDariIndex, setMulaiDariIndex] = useState('0')

  function bentukBody(f: File, dryRun: boolean): FormData {
    const fd = new FormData()
    fd.append('file', f)
    fd.append('clientId', clientId)
    fd.append('akunKasId', akunKasId)
    if (dryRun) fd.append('dryRun', '1')
    if (pemetaan) {
      const bersih: Record<string, number> = {}
      for (const k of MUTASI_FIELDS) {
        const v = mapping[k]
        if (v !== undefined && v !== '') bersih[k] = Number(v)
      }
      fd.append('mapping', JSON.stringify(bersih))
      fd.append('mulaiDariIndex', mulaiDariIndex)
    }
    return fd
  }

  async function kirim(dryRun: boolean) {
    if (!file) return
    setBusy(true)
    setError(null)
    setDetails([])
    try {
      const res = await fetch('/api/cash-mutations/import', {
        method: 'POST',
        body: bentukBody(file, dryRun),
      })
      const payload = (await res.json().catch(() => null)) as
        | (Partial<Pratinjau> & Partial<ButuhPemetaan> & { error?: string; details?: string[]; tersimpan?: number })
        | null
      if (!res.ok) {
        setError(payload?.error ?? 'Gagal memproses berkas.')
        setDetails(payload?.details ?? [])
        return
      }
      if (payload?.butuhPemetaan) {
        setPemetaan(payload as ButuhPemetaan)
        setPratinjau(null)
        return
      }
      if (dryRun) {
        setPratinjau(payload as Pratinjau)
        return
      }
      onSelesai(payload?.tersimpan ?? 0)
    } catch {
      setError('Gagal menghubungi server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell onDismiss={busy ? null : onClose} labelledBy="impor-title" className="max-w-3xl">
      <div className="px-5 sm:px-6 py-4 border-b" style={{ borderColor: '#f0f0f0' }}>
        <h2 id="impor-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
          Impor Rekening Koran (CSV)
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Masuk ke akun <strong>{akunKasNama}</strong> · PDF menyusul, CSV dulu
        </p>
      </div>

      <div className="px-5 sm:px-6 py-4 flex flex-col gap-3.5 overflow-y-auto" style={{ maxHeight: '64vh' }}>
        {terkunciSampai && (
          <p role="note" className="text-xs rounded-2xl px-3.5 py-2.5" style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}>
            Periode klien ini terkunci sampai <strong>{fmtTanggal(terkunciSampai)}</strong>. Berkas yang memuat baris
            bertanggal sampai hari itu akan <strong>ditolak seluruhnya</strong>.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-2xl px-3.5 py-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
              border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
            }}
          >
            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{error}</p>
            {details.length > 0 && (
              <ul className="text-[11px] mt-1.5 flex flex-col gap-0.5" style={{ color: 'var(--color-text-muted)', margin: 0, paddingLeft: 16 }}>
                {details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Langkah 1: berkas ── */}
        <div>
          <span style={label}>Berkas CSV</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                setPratinjau(null)
                setPemetaan(null)
                setError(null)
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ padding: '8px 16px', minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-primary)' }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Pilih berkas
            </button>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {file ? file.name : 'Belum ada berkas dipilih'}
            </span>
          </div>
        </div>

        {/* ── Langkah 2: pemetaan kolom (hanya bila header tak dikenali) ── */}
        {pemetaan && (
          <div className="rounded-2xl p-3.5" style={{ border: '1px solid #e5e7eb', background: '#fafafa' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Header tidak dikenali — petakan kolomnya
            </p>
            <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Tiap bank menulis header berbeda, dan sebagian tidak menulis header sama sekali.
              Pemetaan manual bukan keadaan darurat.
            </p>

            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #ececec', background: 'white' }}>
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <caption className="sr-only">Sepuluh baris pertama berkas</caption>
                <tbody>
                  {pemetaan.contoh.map(b => (
                    <tr key={b.nomor} style={{ borderTop: '1px solid #f5f5f5' }}>
                      <th scope="row" style={{ ...sel, color: 'var(--color-text-muted)', fontWeight: 600, width: 42 }}>
                        {b.nomor}
                      </th>
                      {b.cells.map((c, i) => (
                        <td key={i} style={sel}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
              {MUTASI_FIELDS.map(f => (
                <div key={f}>
                  <label htmlFor={`map-${f}`} style={{ ...label, marginBottom: 4 }}>
                    {MUTASI_FIELD_LABEL[f]}
                    {f === 'tanggal' && <span style={{ color: 'var(--color-accent-critical)' }}> *</span>}
                  </label>
                  <input
                    id={`map-${f}`}
                    inputMode="numeric"
                    placeholder="nomor kolom (0 = pertama)"
                    value={mapping[f] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [f]: e.target.value }))}
                    style={input}
                  />
                </div>
              ))}
              <div>
                <label htmlFor="map-mulai" style={{ ...label, marginBottom: 4 }}>
                  Mulai dari baris ke- (0 = baris pertama)
                </label>
                <input
                  id="map-mulai"
                  inputMode="numeric"
                  value={mulaiDariIndex}
                  onChange={e => setMulaiDariIndex(e.target.value)}
                  style={input}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Langkah 3: pratinjau ── */}
        {pratinjau && (
          <>
            {/* ══ PERIKSA ARAH BEBERAPA BARIS PERTAMA ══════════════════════
                Permintaan eksplisit Ricko 2026-09-21. Arah yang terbalik TIDAK
                pernah menimbulkan galat: jurnalnya tetap seimbang, tetap bisa
                diposting, dan salahnya baru terlihat saat saldo kas bergerak
                berlawanan dengan rekening korannya — berbulan-bulan kemudian.
                Satu-satunya saat ia murah diperbaiki adalah SEKARANG, di layar
                ini, sebelum barisnya tersimpan. */}
            <div
              role="note"
              className="rounded-2xl px-3.5 py-2.5 flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-secondary) 14%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-secondary) 45%, white)',
              }}
            >
              <ArrowLeftRight className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-text-primary)' }} />
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                <strong>Periksa arah beberapa baris pertama</strong> sebelum melanjutkan —
                cocokkan kolom <em>Masuk</em> dan <em>Keluar</em> di bawah dengan rekening korannya.
                Arah yang terbalik <strong>tidak menimbulkan galat</strong>: jurnalnya tetap
                seimbang dan tetap bisa diposting, dan salahnya baru terlihat saat saldo kas
                bergerak berlawanan dengan rekening koran. Kalau tertukar, batalkan lalu petakan
                kolomnya manual.
              </p>
            </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
            <div className="px-3.5 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: '#fafafa', borderBottom: '1px solid #ececec' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {pratinjau.terbaca} baris terbaca
              </span>
              {pratinjau.dugaanDuplikat > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5" style={peringatan}>
                  <CopyCheck className="w-3 h-3" /> {pratinjau.dugaanDuplikat} dugaan duplikat
                </span>
              )}
              {pratinjau.bermasalah > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5" style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }}>
                  <AlertTriangle className="w-3 h-3" /> {pratinjau.bermasalah} baris dilewati
                </span>
              )}
            </div>

            <div className="overflow-x-auto" style={{ maxHeight: 280 }}>
              <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
                <caption className="sr-only">Pratinjau baris yang akan diimpor</caption>
                <thead>
                  <tr style={{ background: 'white', position: 'sticky', top: 0 }}>
                    <th scope="col" style={th}>Baris</th>
                    <th scope="col" style={th}>Tanggal</th>
                    <th scope="col" style={th}>Keterangan</th>
                    <th scope="col" style={{ ...th, textAlign: 'right' }}>Masuk</th>
                    <th scope="col" style={{ ...th, textAlign: 'right' }}>Keluar</th>
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.rows.map(r => {
                    const dup = r.duplikatDiDatabase || r.duplikatDiBerkas
                    return (
                      <tr key={r.nomor} style={{ borderTop: '1px solid #f5f5f5', background: dup ? 'color-mix(in srgb, var(--color-accent-secondary) 10%, white)' : 'white' }}>
                        <td style={sel}>
                          {r.nomor}
                          {dup && (
                            <span
                              className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={peringatan}
                              title={r.duplikatDiDatabase ? 'Baris serupa sudah ada di akun kas ini.' : 'Baris serupa muncul dua kali di berkas ini.'}
                            >
                              duplikat
                            </span>
                          )}
                        </td>
                        <td style={sel}>{r.tanggal}</td>
                        <td style={{ ...sel, color: 'var(--color-text-muted)' }}>{r.keterangan ?? '—'}</td>
                        {/* Diformat rupiah — angka mentah dari parser
                            ("2500000.00") membuat pembacanya menghitung digit
                            sendiri, justru di layar yang meminta ia memeriksa
                            arah tiap baris. PERSIS, bukan dibulatkan (keputusan
                            Ricko di CP-8): layar ini dicocokkan dengan rekening
                            koran, dan 12.345,67 yang tampil "Rp 12.346" tidak
                            akan pernah cocok dengan baris mana pun di sana. */}
                        <td style={{ ...sel, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {r.debit === '0.00' ? '—' : rupiahPersis(r.debit)}
                        </td>
                        <td style={{ ...sel, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {r.kredit === '0.00' ? '—' : rupiahPersis(r.kredit)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {pratinjau.barisBermasalah.length > 0 && (
              <div className="px-3.5 py-2.5" style={{ borderTop: '1px solid #ececec', background: '#fafafa' }}>
                <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Baris yang dilewati — ditampilkan supaya jumlahnya bisa dicocokkan dengan berkasnya
                </p>
                <ul className="text-[11px] flex flex-col gap-0.5" style={{ color: 'var(--color-text-muted)', margin: 0, paddingLeft: 16 }}>
                  {pratinjau.barisBermasalah.slice(0, 8).map(b => (
                    <li key={b.nomor}>
                      Baris {b.nomor}: {b.alasan}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pratinjau.dugaanDuplikat > 0 && (
              <p className="px-3.5 py-2.5 text-[11px]" style={{ borderTop: '1px solid #ececec', color: 'var(--color-text-muted)' }}>
                Baris bertanda duplikat <strong>tetap akan tersimpan</strong> bila dilanjutkan — dua
                pembayaran identik pada hari yang sama adalah hal yang nyata.
              </p>
            )}
          </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0' }}>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ padding: '8px 16px', minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)' }}
        >
          Batal
        </button>
        <button
          type="button"
          onClick={() => void kirim(true)}
          disabled={!file || busy}
          className="inline-flex items-center gap-2 rounded-full text-xs font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ padding: '8px 16px', minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-primary)' }}
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Pratinjau
        </button>
        <button
          type="button"
          onClick={() => void kirim(false)}
          disabled={!file || busy || !pratinjau}
          title={!pratinjau ? 'Lihat pratinjaunya dulu.' : undefined}
          className="inline-flex items-center gap-2 rounded-full text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ padding: '8px 18px', minHeight: 34, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
        >
          <Upload className="w-3.5 h-3.5" /> Impor {pratinjau ? `${pratinjau.terbaca} baris` : ''}
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

const input: React.CSSProperties = {
  width: '100%',
  minHeight: 34,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  padding: '6px 10px',
  fontSize: 12.5,
  color: 'var(--color-text-primary)',
  background: 'white',
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
}

const sel: React.CSSProperties = {
  padding: '7px 10px',
  color: 'var(--color-text-primary)',
  verticalAlign: 'top',
}

const peringatan: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--color-accent-secondary) 35%, white)',
  color: 'var(--color-text-primary)',
}
