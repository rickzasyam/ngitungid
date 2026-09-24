'use client'

// Halaman Buku Besar — mutasi satu akun beserta saldo berjalannya, plus neraca
// saldo ringkas seluruh akun. Tata letaknya mengikuti /jurnal (shell tiga lapis,
// tabel di dalamnya): isinya jurnal yang sama, dibaca dari sudut lain, jadi
// tidak ada alasan terlihat seperti halaman jenis lain.
//
// Akses: owner + akunting (D3 — '/buku-besar' ada di ACCOUNTING_ONLY_PREFIXES,
// ditegakkan proxy; API-nya requireAkunting).
//
// ══ TIDAK ADA SATU PUN ANGKA YANG DIHITUNG DI SINI ════════════════════════
// Saldo awal, saldo berjalan, dan saldo akhir datang JADI dari server, yang
// menghitungnya di sen bulat lewat lib/ledger.ts. Halaman ini tidak pernah
// menjumlahkan debit dan kredit sendiri — dua tempat yang menghitung saldo
// berarti dua jawaban yang bisa berbeda, dan yang di layar yang akan dipercaya.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Inbox, Loader2, RotateCw, Scale } from 'lucide-react'
import { useRequireClient } from '@/lib/use-require-client'
import { useRupiah } from '@/lib/preferences-context'
import { StyledSelect, type StyledOption } from '@/components/ui/styled-select'
import { DateRangePicker } from '@/components/date-range-picker'
import { localDateToYmd, ymdToLocalDate, todayYmd } from '@/lib/ymd'
import { TANPA_NO_BUKTI } from '@/lib/journal'
import type { CoaOption } from '@/components/jurnal/journal-form-modal'
import {
  JournalDetail,
  fmtTanggal,
  type JournalDetailData,
} from '@/components/jurnal/journal-detail'

interface LedgerRow {
  id: string
  journalId: string
  tanggal: string
  noBukti: string | null
  keterangan: string | null
  debit: string
  kredit: string
  saldo: string
  /** Mitigasi (c) D42 — diturunkan dari riwayat, tidak disimpan. */
  diubahSetelahPosting?: boolean
}

interface LedgerResponse {
  account: { id: string; kode: string; nama: string; posisi: string }
  opening: string
  closing: string
  rows: LedgerRow[]
}

interface SummaryAccount {
  id: string
  kode: string
  nama: string
  posisi: string
  debit: string
  kredit: string
  saldo: string
}

interface SummaryResponse {
  periodEnd: string
  totalDebit: string
  totalKredit: string
  seimbang: boolean
  accounts: SummaryAccount[]
}

type Tab = 'akun' | 'neraca'

/** Awal & akhir bulan berjalan, sebagai string — tanpa objek Date (P2). */
function bulanBerjalan(): { start: string; end: string } {
  const [y, m] = todayYmd().split('-').map(Number)
  const akhir = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(akhir).padStart(2, '0')}` }
}

export default function BukuBesarPage() {
  const { activeClient, isLoaded } = useRequireClient()
  const { rupiahPersis } = useRupiah()

  const awal = useMemo(() => bulanBerjalan(), [])
  const [periode, setPeriode] = useState<{ start: string; end: string }>(awal)
  const [tab, setTab] = useState<Tab>('akun')

  const [accounts, setAccounts] = useState<CoaOption[]>([])
  const [akunId, setAkunId] = useState('')

  const [ledger, setLedger] = useState<LedgerResponse | null>(null)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<JournalDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const clientId = activeClient?.id ?? null

  // Master COA per klien. Tidak memilih akun otomatis: yang pertama menurut
  // kode belum tentu yang dicari, dan buku besar yang membuka dirinya sendiri
  // di akun sembarang membuat orang membaca angka akun yang salah sekejap.
  useEffect(() => {
    if (!clientId) return
    let batal = false
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/coa`)
        const payload = (await res.json().catch(() => null)) as { accounts?: CoaOption[] } | null
        if (!batal) setAccounts(payload?.accounts ?? [])
      } catch {
        if (!batal) setAccounts([])
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId])

  // Ganti klien = akun lama tidak berlaku lagi. DITURUNKAN, bukan dibereskan
  // efek yang memanggil setState: akun yang tidak ada di daftar klien aktif
  // dianggap belum terpilih. Bentuk efek-lalu-reset akan melanggar
  // react-hooks/set-state-in-effect, dan lebih buruk: ada satu render di mana
  // id akun klien LAMA masih terpasang bersama daftar akun klien BARU.
  const akunValid = useMemo(
    () => (akunId && accounts.some(a => a.id === akunId) ? akunId : ''),
    [akunId, accounts]
  )

  const muat = useCallback(async () => {
    if (!clientId) return
    try {
      if (tab === 'neraca') {
        const qs = new URLSearchParams({ clientId, periodEnd: periode.end })
        const res = await fetch(`/api/ledger/summary?${qs}`)
        const payload = (await res.json().catch(() => null)) as
          | (SummaryResponse & { error?: string })
          | null
        if (!res.ok) {
          setLoadError(payload?.error ?? 'Gagal memuat neraca saldo.')
          setSummary(null)
          return
        }
        setLoadError(null)
        setSummary(payload)
        return
      }

      if (!akunValid) {
        setLedger(null)
        setLoadError(null)
        return
      }
      const qs = new URLSearchParams({
        clientId,
        masterCoaId: akunValid,
        periodStart: periode.start,
        periodEnd: periode.end,
      })
      const res = await fetch(`/api/ledger?${qs}`)
      const payload = (await res.json().catch(() => null)) as
        | (LedgerResponse & { error?: string })
        | null
      if (!res.ok) {
        setLoadError(payload?.error ?? 'Gagal memuat buku besar.')
        setLedger(null)
        return
      }
      setLoadError(null)
      setLedger(payload)
    } catch {
      setLoadError('Gagal menghubungi server.')
    } finally {
      setLoading(false)
    }
  }, [clientId, akunValid, tab, periode.start, periode.end])

  useEffect(() => {
    void (async () => {
      await muat()
    })()
  }, [muat])

  async function toggleDetail(journalId: string) {
    if (expanded === journalId) {
      setExpanded(null)
      return
    }
    setExpanded(journalId)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/journals/${journalId}`)
      const payload = (await res.json().catch(() => null)) as JournalDetailData | null
      setDetail(res.ok ? payload : null)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const opsiAkun: StyledOption[] = useMemo(
    () =>
      accounts.map(a => ({
        value: a.id,
        label: a.nama,
        badge: a.kode,
        group: a.kelompok,
      })),
    [accounts]
  )

  if (!isLoaded || !activeClient) {
    return (
      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl flex items-center justify-center gap-2"
          style={{ background: 'white', color: 'var(--color-text-muted)' }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Memuat…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 flex-wrap"
          style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1f2430', margin: 0 }}>Buku Besar</h1>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {activeClient.name} · hanya jurnal yang sudah diposting
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              role="tablist"
              aria-label="Tampilan buku besar"
              className="inline-flex items-center gap-1 rounded-full"
              style={{ background: 'var(--color-muted-bg)', padding: 3 }}
            >
              {(
                [
                  ['akun', 'Per Akun'],
                  ['neraca', 'Neraca Saldo'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setLoading(true)
                    setExpanded(null)
                    setTab(id)
                  }}
                  className="rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{
                    padding: '6px 14px',
                    fontSize: 12,
                    minHeight: 32,
                    border: 'none',
                    cursor: 'pointer',
                    background: tab === id ? 'white' : 'transparent',
                    color: tab === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ width: 260 }}>
              <DateRangePicker
                value={{ from: ymdToLocalDate(periode.start), to: ymdToLocalDate(periode.end) }}
                onChange={r => {
                  if (!r?.from) return
                  setLoading(true)
                  setExpanded(null)
                  setPeriode({
                    start: localDateToYmd(r.from),
                    end: localDateToYmd(r.to ?? r.from),
                  })
                }}
                placeholder="Filter periode"
              />
            </div>
            <button
              onClick={() => { setLoading(true); void muat() }}
              disabled={loading}
              aria-label="Muat ulang buku besar"
              className="inline-flex items-center gap-2 rounded-full font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{
                padding: '8px 14px',
                fontSize: 12.5,
                minHeight: 34,
                border: '1px solid #e5e7eb',
                background: 'white',
                color: 'var(--color-text-muted)',
              }}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
            </button>
          </div>
        </div>

        {/* Pemilih akun — hanya relevan di tampilan per akun */}
        {tab === 'akun' && (
          <div
            className="flex-shrink-0 flex items-center gap-3 flex-wrap"
            style={{ padding: '12px 24px', borderBottom: '1px solid #f0f0f0' }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>
              Akun
            </span>
            <div style={{ minWidth: 320, flex: '1 1 320px', maxWidth: 520 }}>
              <StyledSelect
                options={opsiAkun}
                value={akunValid}
                onChange={v => {
                  setLoading(true)
                  setExpanded(null)
                  setAkunId(v)
                }}
                placeholder={
                  accounts.length === 0
                    ? 'Master COA klien ini masih kosong'
                    : 'Pilih akun untuk melihat mutasinya…'
                }
                disabled={accounts.length === 0}
                searchable
                searchPlaceholder="Cari kode atau nama akun…"
                ariaLabel="Akun buku besar"
              />
            </div>
          </div>
        )}

        {/* Body */}
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          {loadError && (
            <div
              role="alert"
              className="mx-4 mt-4 px-3.5 py-2.5 rounded-2xl flex items-start gap-2"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)',
                border: '1px solid color-mix(in srgb, var(--color-accent-critical) 35%, white)',
              }}
            >
              <AlertTriangle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: 'color-mix(in srgb, var(--color-accent-critical) 45%, black)' }}
              />
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>{loadError}</p>
            </div>
          )}

          {loading ? (
            <div
              className="flex items-center justify-center gap-2 h-full"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Memuat…</span>
            </div>
          ) : tab === 'neraca' ? (
            <NeracaSaldo data={summary} rupiahPersis={rupiahPersis} periodEnd={periode.end} />
          ) : !akunValid ? (
            <Kosong
              judul="Pilih akun dulu"
              pesan="Buku besar menampilkan mutasi satu akun beserta saldo berjalannya."
            />
          ) : !ledger ? (
            <Kosong judul="Tidak ada data" pesan="Coba muat ulang atau ganti periodenya." />
          ) : (
            <div className="px-4 py-4">
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1px solid #f0f0f0' }}
              >
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <caption className="sr-only">
                    Buku besar akun {ledger.account.kode} {ledger.account.nama} periode{' '}
                    {fmtTanggal(periode.start)} sampai {fmtTanggal(periode.end)}
                  </caption>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th scope="col" style={th}>Tanggal</th>
                      <th scope="col" style={th}>No. Bukti</th>
                      <th scope="col" style={th}>Keterangan</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Debit</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Kredit</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Saldo awal SELALU ditampilkan, termasuk saat nol —
                        baris yang hilang membuat "memang nol" tidak bisa
                        dibedakan dari "belum dihitung". */}
                    <tr style={{ background: '#fbfbfb' }}>
                      <th scope="row" colSpan={5} style={{ ...td, fontWeight: 600 }}>
                        Saldo awal per {fmtTanggal(periode.start)}
                      </th>
                      <td style={angka}>{rupiahPersis(ledger.opening)}</td>
                    </tr>
                    {ledger.rows.length === 0 ? (
                      <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                        <td colSpan={6} style={{ ...td, color: 'var(--color-text-muted)' }}>
                          Tidak ada mutasi terposting pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      ledger.rows.map(r => (
                        <Fragment key={r.id}>
                          <tr style={{ borderTop: '1px solid #f5f5f5' }}>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTanggal(r.tanggal)}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => void toggleDetail(r.journalId)}
                                aria-expanded={expanded === r.journalId}
                                aria-label={`${expanded === r.journalId ? 'Tutup' : 'Buka'} rincian jurnal ${r.noBukti ?? TANPA_NO_BUKTI}`}
                                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                                style={{
                                  padding: '4px 10px',
                                  minHeight: 32,
                                  border: '1px solid #e5e7eb',
                                  background: 'white',
                                  fontSize: 12,
                                  fontWeight: r.noBukti ? 600 : 400,
                                  color: r.noBukti ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                  cursor: 'pointer',
                                }}
                              >
                                {r.noBukti ?? '—'}
                              </button>
                              {/* Mitigasi (c) D42 — angka di buku besar yang
                                  pernah berbeda harus terlihat begitu, tanpa
                                  membuka riwayat lebih dulu. */}
                              {r.diubahSetelahPosting && (
                                <span
                                  className="ml-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                  style={{
                                    background: 'color-mix(in srgb, var(--color-accent-critical) 16%, white)',
                                    color: 'color-mix(in srgb, var(--color-accent-critical) 55%, black)',
                                  }}
                                  title="Jurnal ini diubah SESUDAH diposting."
                                >
                                  diubah
                                </span>
                              )}
                            </td>
                            <td
                              style={{
                                ...td,
                                maxWidth: 320,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={r.keterangan ?? undefined}
                            >
                              {r.keterangan ?? '—'}
                            </td>
                            <td style={angka}>
                              {Number(r.debit) > 0 ? rupiahPersis(r.debit) : '—'}
                            </td>
                            <td style={angka}>
                              {Number(r.kredit) > 0 ? rupiahPersis(r.kredit) : '—'}
                            </td>
                            <td style={{ ...angka, fontWeight: 600 }}>{rupiahPersis(r.saldo)}</td>
                          </tr>
                          {expanded === r.journalId && (
                            <tr>
                              <td colSpan={6} style={{ background: '#fbfbfb', padding: 0 }}>
                                <JournalDetail detail={detail} loading={detailLoading} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
                      <th scope="row" colSpan={5} style={{ ...td, fontWeight: 700 }}>
                        Saldo akhir per {fmtTanggal(periode.end)}
                      </th>
                      <td style={{ ...angka, fontWeight: 700 }}>{rupiahPersis(ledger.closing)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] mt-2 px-1" style={{ color: 'var(--color-text-muted)' }}>
                Saldo berarah normal balance akun ini ({ledger.account.posisi}), jadi akun yang wajar
                selalu bernilai positif.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function NeracaSaldo({
  data,
  rupiahPersis,
  periodEnd,
}: {
  data: SummaryResponse | null
  rupiahPersis: (v: string) => string
  periodEnd: string
}) {
  if (!data) {
    return <Kosong judul="Tidak ada data" pesan="Coba muat ulang atau ganti tanggalnya." />
  }

  return (
    <div className="px-4 py-4">
      <div
        className="rounded-2xl mb-3 px-4 py-3 flex items-center gap-2 flex-wrap"
        style={{
          background: data.seimbang
            ? 'color-mix(in srgb, var(--color-accent-primary) 18%, white)'
            : 'color-mix(in srgb, var(--color-accent-critical) 10%, white)',
          border: `1px solid ${
            data.seimbang
              ? 'color-mix(in srgb, var(--color-accent-primary) 45%, white)'
              : 'color-mix(in srgb, var(--color-accent-critical) 35%, white)'
          }`,
        }}
      >
        <Scale className="w-4 h-4" style={{ color: 'var(--color-text-primary)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
          Per {fmtTanggal(periodEnd)} · total debit{' '}
          <strong>{rupiahPersis(data.totalDebit)}</strong> · total kredit{' '}
          <strong>{rupiahPersis(data.totalKredit)}</strong> ·{' '}
          <strong>{data.seimbang ? 'seimbang' : 'TIDAK seimbang'}</strong>
        </p>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'white', border: '1px solid #f0f0f0' }}
      >
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <caption className="sr-only">Neraca saldo per {fmtTanggal(periodEnd)}</caption>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th scope="col" style={th}>Kode</th>
              <th scope="col" style={th}>Akun</th>
              <th scope="col" style={th}>Posisi</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Debit</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Kredit</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map(a => (
              <tr key={a.id} style={{ borderTop: '1px solid #f5f5f5' }}>
                <td style={{ ...td, fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}>
                  {a.kode}
                </td>
                <td style={td}>{a.nama}</td>
                <td style={{ ...td, color: 'var(--color-text-muted)' }}>{a.posisi}</td>
                <td style={angka}>{Number(a.debit) > 0 ? rupiahPersis(a.debit) : '—'}</td>
                <td style={angka}>{Number(a.kredit) > 0 ? rupiahPersis(a.kredit) : '—'}</td>
                <td style={{ ...angka, fontWeight: 600 }}>{rupiahPersis(a.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
              <th scope="row" colSpan={3} style={{ ...td, fontWeight: 700 }}>
                Total
              </th>
              <td style={{ ...angka, fontWeight: 700 }}>{rupiahPersis(data.totalDebit)}</td>
              <td style={{ ...angka, fontWeight: 700 }}>{rupiahPersis(data.totalKredit)}</td>
              <td style={td} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Kosong({ judul, pesan }: { judul: string; pesan: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
      <Inbox className="w-10 h-10" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {judul}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {pesan}
        </p>
      </div>
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

const angka: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}
