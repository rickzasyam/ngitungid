'use client'

// Panel Rekonsiliasi hutang supplier — bagian dari halaman /hutang (D44).
//
// ══ SELISIH DITAMPILKAN APA ADANYA (instruksi Ricko 2026-09-23) ══════════
// Seluruh nominal di panel ini memakai `rupiahPersis`, BUKAN `rupiah`.
// `rupiah` membulatkan ke rupiah utuh — selisih Rp 0,01 akan tampil "Rp 0" dan
// terbaca cocok, dan dua total yang berbeda beberapa sen akan tampil sama
// sementara selisihnya tidak nol. Negatif memakai kurung (tanda tidak hilang),
// dan arahnya dijelaskan dengan kalimat, bukan cuma warna.
//
// ══ TANGGAL PEMBANDING WAJIB MENONJOL ════════════════════════════════════
// Kedua sisi dipotong di tanggal neraca terbaru ≤ tanggal acuan. Tanpa tanggal
// itu di depan mata, "invoice saya tidak ikut" akan terbaca sebagai bug —
// padahal invoice sesudah tanggal neraca memang belum ada di neraca itu.
//
// ══ TIDAK ADA ANGKA YANG DIHITUNG DI SINI ═════════════════════════════════
// Semuanya datang jadi dari /api/hutang/reconciliation, yang menurunkannya lewat
// lib/hutang-reconciliation.ts.

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Scale } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { fmtTanggal } from '@/components/jurnal/journal-detail'

interface PenjelasRow {
  journalId: string
  noBukti: string | null
  tanggal: string
  keterangan: string | null
  akunKode: string
  akunNama: string
  supplierId: string | null
  supplierNama: string | null
  efek: string
}

interface RekonResponse {
  asOf: string
  tanggalPembanding: string
  neraca: { reportId: string; periodStart: string; periodEnd: string } | null
  rows: { supplierId: string; supplierNama: string; sisa: string }[]
  totalSupplier: string
  totalNeraca: string | null
  selisih: string | null
  penjelas: {
    berSupplier: { total: string; rows: PenjelasRow[] }
    tanpaSupplier: { total: string; rows: PenjelasRow[] }
  }
}

/** Arah selisih dengan KATA — warna saja tidak cukup, dan tidak terbaca pembaca layar. */
function arahSelisih(selisih: string): { teks: string; nol: boolean } {
  const neg = selisih.trim().startsWith('-')
  const nol = Number(selisih) === 0
  if (nol) return { teks: 'Cocok — sisa hutang per supplier sama persis dengan hutang usaha di neraca.', nol: true }
  if (neg) {
    return {
      teks: 'Neraca mencatat hutang LEBIH KECIL dari modul — ada hutang di modul yang tidak diakui neraca.',
      nol: false,
    }
  }
  return {
    teks: 'Neraca mencatat hutang LEBIH BESAR dari modul — ada hutang di neraca yang belum tercatat sebagai invoice.',
    nol: false,
  }
}

export function ReconciliationPanel({ clientId, asOf }: { clientId: string; asOf: string }) {
  const { rupiahPersis } = useRupiah()
  const [data, setData] = useState<RekonResponse | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState<string | null>(null)

  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const qs = new URLSearchParams({ clientId, asOf })
        const res = await fetch(`/api/hutang/reconciliation?${qs}`)
        const payload = (await res.json().catch(() => null)) as (RekonResponse & { error?: string }) | null
        if (batal) return
        if (!res.ok) {
          setGalat(payload?.error ?? 'Gagal memuat rekonsiliasi.')
          setData(null)
          return
        }
        setGalat(null)
        setData(payload)
      } catch {
        if (!batal) setGalat('Gagal menghubungi server.')
      } finally {
        if (!batal) setMemuat(false)
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId, asOf])

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #f0f0f0' }}>
        <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          <Scale className="w-4 h-4" /> Rekonsiliasi hutang supplier
        </h2>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Sisa hutang per supplier dibandingkan dengan hutang usaha di neraca
        </p>
      </div>

      {memuat ? (
        <div className="flex items-center gap-2 px-4 py-6" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Memuat rekonsiliasi…</span>
        </div>
      ) : galat || !data ? (
        <p role="alert" className="px-4 py-6 text-xs" style={{ color: 'var(--color-accent-critical)' }}>
          {galat ?? 'Rekonsiliasi tidak bisa dimuat.'}
        </p>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {/* ── Tanggal pembanding — MENONJOL ── */}
          <div
            role="note"
            className="rounded-2xl px-3.5 py-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-accent-secondary) 16%, white)',
              border: '1px solid color-mix(in srgb, var(--color-accent-secondary) 45%, white)',
            }}
          >
            {data.neraca ? (
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                Dibandingkan per <strong>{fmtTanggal(data.tanggalPembanding)}</strong> — tanggal neraca terbaru
                sampai {fmtTanggal(data.asOf)}. Invoice dan pembayaran <strong>sesudah</strong> tanggal itu tidak
                ikut dihitung, karena neraca tersebut belum mencatatnya.
              </p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                <strong>Belum ada laporan neraca</strong> sampai {fmtTanggal(data.asOf)} — rekonsiliasi belum bisa
                dibandingkan. Sisa per supplier di bawah dihitung per {fmtTanggal(data.tanggalPembanding)}.
              </p>
            )}
          </div>

          {/* ── Tiga angka ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl p-3.5" style={{ border: '1px solid #f0f0f0' }}>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Sisa hutang per supplier</p>
              <p className="text-base font-bold mt-1" style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {rupiahPersis(data.totalSupplier)}
              </p>
            </div>
            <div className="rounded-2xl p-3.5" style={{ border: '1px solid #f0f0f0' }}>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Hutang usaha di neraca</p>
              <p className="text-base font-bold mt-1" style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {data.totalNeraca === null ? '—' : rupiahPersis(data.totalNeraca)}
              </p>
            </div>
            {(() => {
              if (data.selisih === null) {
                return (
                  <div className="rounded-2xl p-3.5" style={{ border: '1px solid #f0f0f0' }}>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Selisih (neraca − supplier)</p>
                    <p className="text-base font-bold mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      belum bisa dihitung
                    </p>
                  </div>
                )
              }
              const arah = arahSelisih(data.selisih)
              return (
                <div
                  className="rounded-2xl p-3.5"
                  style={{
                    border: arah.nol
                      ? '1px solid #cbe8c6'
                      : '1px solid color-mix(in srgb, var(--color-accent-critical) 40%, white)',
                    background: arah.nol ? '#f4fbf3' : 'color-mix(in srgb, var(--color-accent-critical) 6%, white)',
                  }}
                >
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Selisih (neraca − supplier)</p>
                  <p
                    className="text-base font-bold mt-1 flex items-center gap-1.5"
                    style={{
                      color: arah.nol ? '#2f6d2a' : 'color-mix(in srgb, var(--color-accent-critical) 60%, black)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {arah.nol ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {rupiahPersis(data.selisih)}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-primary)' }}>
                    {arah.teks}
                  </p>
                </div>
              )
            })()}
          </div>

          {/* ── Sisa per supplier ── */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <caption className="sr-only">Sisa hutang per supplier per tanggal pembanding</caption>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th scope="col" style={th}>Supplier</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>Sisa hutang</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ ...td, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      Tidak ada hutang supplier per {fmtTanggal(data.tanggalPembanding)}.
                    </td>
                  </tr>
                ) : (
                  data.rows.map(r => (
                    <tr key={r.supplierId} style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={td}>{r.supplierNama}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {rupiahPersis(r.sisa)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Penjelas ── */}
          <div>
            <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Kemungkinan penjelas selisih
            </h3>
            <p className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Jurnal manual terposting ke akun hutang supplier. <strong>Tidak dikurangkan dari selisih</strong> — ia
              kemungkinan sebab, dan yang memutuskan apakah ia menjelaskan adalah pembacanya.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(
                [
                  ['Bersupplier', data.penjelas.berSupplier],
                  ['Tanpa supplier', data.penjelas.tanpaSupplier],
                ] as const
              ).map(([judul, kelompok]) => (
                <div key={judul} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #f0f0f0' }}>
                  <div
                    className="px-3.5 py-2 flex items-center justify-between"
                    style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}
                  >
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {judul} · {kelompok.rows.length} baris
                    </span>
                    <span className="text-[11px] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {rupiahPersis(kelompok.total)}
                    </span>
                  </div>
                  {kelompok.rows.length === 0 ? (
                    <p className="px-3.5 py-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      Tidak ada.
                    </p>
                  ) : (
                    <ul className="flex flex-col" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {kelompok.rows.map((b, i) => (
                        <li
                          key={`${b.journalId}-${i}`}
                          className="px-3.5 py-2 text-[11px] flex items-start justify-between gap-3"
                          style={{ borderTop: i > 0 ? '1px solid #f5f5f5' : 'none' }}
                        >
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                              {fmtTanggal(b.tanggal)}
                            </span>
                            {' · '}
                            {b.noBukti ?? '(tanpa no. bukti)'} · {b.akunKode} {b.akunNama}
                            {b.supplierNama && ` · ${b.supplierNama}`}
                            {b.keterangan && ` · ${b.keterangan}`}
                          </span>
                          <span
                            className="flex-shrink-0 font-semibold"
                            style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}
                            title="Efek pada saldo hutang: positif menambah, dalam kurung mengurangi"
                          >
                            {rupiahPersis(b.efek)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
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
