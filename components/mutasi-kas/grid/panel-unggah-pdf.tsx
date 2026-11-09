'use client'

// Panel "Unggah PDF rekening koran" (MP §5.G X5). PDF dibaca DI BROWSER (D56 —
// berkasnya tidak pernah dikirim atau disimpan); tiap halaman dikirim sebagai
// teks bertata letak, atau gambar PNG bila tanpa lapisan teks, ke route X4
// SATU PER SATU, berurutan: progres per halaman, bisa dibatalkan, halaman yang
// gagal bisa diulang sendiri. Hasilnya masuk grid sebagai SATU blok DRAF
// (`rencanaPdf` → `tempelBlok` sumber 'pdf') — tidak pernah tersimpan tanpa Simpan.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, RotateCw, X } from 'lucide-react'
import { kolomSebelumnyaBerposisi, rangkumDokumen, type JudulTercetak } from '@/lib/bank-statement/dokumen'
import { halamanTersusun, peringatanHalaman, tafsirJawaban, type HasilHalaman, type TafsiranJawaban } from '@/lib/bank-statement/hasil-halaman'
import type { DokumenPdf } from '@/lib/bank-statement/baca-pdf'
import { rencanaPdf } from '@/lib/mutasi-grid-turunan'
import type { HasilBacaBlok, Periode } from '@/lib/mutasi-draf'
import { bacaRingkasanBank, bandingkanRingkasan, type BarisBanding, type RingkasanBank } from '@/lib/bank-statement/ringkasan-bank'
import { fromMinorUnits } from '@/lib/journal'
import { useRupiah } from '@/lib/preferences-context'

const URL_EKSTRAK = '/api/cash-mutations/ekstrak-halaman'
// Body route dibatasi 4 MB; PNG halaman scan dikecilkan sampai muat.
const BATAS_PNG = 3_500_000
const SKALA_GAMBAR = [2, 1.5, 1]

type Konteks = {
  doc: DokumenPdf
  /** Judul tercetak per halaman yang sudah tersusun — `kolomSebelumnya` halaman sesudahnya. */
  judul: Map<number, JudulTercetak>
  clientId: string
  akunKasId: string
  sinyal: AbortSignal
}

/** Judul tercetak terakhir SEBELUM halaman `n` (halaman lanjutan tanpa judul memakainya). */
function judulSebelum(judul: Map<number, JudulTercetak>, n: number): JudulTercetak | null {
  let k = 0
  for (const h of judul.keys()) if (h < n && h > k) k = h
  return judul.get(k) ?? null
}

/** Hasil route + ringkasan bank di halaman itu, dibaca KODE dari teksnya (null untuk halaman gambar). */
async function ekstrakSatu(n: number, k: Konteks): Promise<TafsiranJawaban & { ringkasan: RingkasanBank | null }> {
  const t = await k.doc.bacaHalaman(n)
  const asal = judulSebelum(k.judul, n)
  const baris = t.baris.map(b => b.teks)
  let body: Record<string, unknown>
  if (t.perluGambar) {
    let png = ''
    for (const skala of SKALA_GAMBAR) {
      png = await k.doc.gambarHalaman(n, skala)
      if (png.length <= BATAS_PNG) break
    }
    body = { clientId: k.clientId, akunKasId: k.akunKasId, halaman: n, gambarPng: png, kolomSebelumnya: asal?.kolom ?? [] }
  } else {
    body = { clientId: k.clientId, akunKasId: k.akunKasId, halaman: n, baris, kolomSebelumnya: kolomSebelumnyaBerposisi(asal, t.grid) }
  }
  let res: Response
  try {
    res = await fetch(URL_EKSTRAK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: k.sinyal })
  } catch (e) {
    if (k.sinyal.aborted) throw e
    return { hasil: { halaman: n, status: 'gagal', pesan: `Halaman ${n}: koneksi terputus — ulangi halaman ini.`, bisaUlang: true }, henti: null, ringkasan: null }
  }
  const json: unknown = await res.json().catch(() => null)
  const r = tafsirJawaban(n, res.status, json, h => res.headers.get(h), t.perluGambar)
  if (r.hasil.status === 'ok' && !t.perluGambar && r.hasil.data.kolom.length > 0) {
    k.judul.set(n, { kolom: r.hasil.data.kolom, baris, grid: t.grid })
  }
  return { ...r, ringkasan: t.perluGambar ? null : bacaRingkasanBank(baris) }
}

type Props = {
  file: File
  clientId: string
  akunKasId: string
  periode: Periode
  onMasukkan: (hasil: Extract<HasilBacaBlok, { ok: true }>, catatan: string[]) => void
  onTutup: () => void
  /** Grid belum punya jangkar saldo (tanpa saldo tersimpan): SALDO AWAL ringkasan bank boleh ditawarkan. */
  tawarkanJangkar?: boolean
  /** Isi "Saldo awal rekening koran" grid dengan teks ini. */
  onSaldoAwal?: (teks: string) => void
}

export function PanelUnggahPdf({ file, clientId, akunKasId, periode, onMasukkan, onTutup, tawarkanJangkar = false, onSaldoAwal }: Props) {
  const { rupiahPersis } = useRupiah()
  const docRef = useRef<DokumenPdf | null>(null)
  const judulRef = useRef(new Map<number, JudulTercetak>())
  const abortRef = useRef<AbortController | null>(null)
  const [jumlah, setJumlah] = useState<number | null>(null)
  const [hasil, setHasil] = useState<Record<number, HasilHalaman>>({})
  const [sedang, setSedang] = useState<number | null>(null)
  const [henti, setHenti] = useState<string | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  // Ringkasan bank dari halaman BERNOMOR TERBESAR yang mencetaknya (biasanya halaman terakhir).
  const [ringkasan, setRingkasan] = useState<{ halaman: number; data: RingkasanBank } | null>(null)
  const [jangkarDipakai, setJangkarDipakai] = useState(false)

  // Satu jalur untuk proses awal, "Lanjutkan", dan "Ulangi" per halaman.
  async function jalankan(daftar: number[]) {
    const doc = docRef.current
    if (!doc || abortRef.current) return
    const ac = new AbortController()
    abortRef.current = ac
    setHenti(null)
    setGalat(null)
    try {
      for (const n of daftar) {
        setSedang(n)
        const r = await ekstrakSatu(n, { doc, judul: judulRef.current, clientId, akunKasId, sinyal: ac.signal })
        setHasil(h => ({ ...h, [n]: r.hasil }))
        const rb = r.ringkasan
        if (rb) setRingkasan(lama => (lama && lama.halaman > n ? lama : { halaman: n, data: rb }))
        if (r.henti) {
          setHenti(r.henti)
          break
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) setGalat(e instanceof Error ? `Gagal membaca PDF: ${e.message}` : 'Gagal membaca PDF.')
    } finally {
      abortRef.current = null
      setSedang(null)
    }
  }

  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        // pdf.js (unpdf) dimuat malas — hanya saat tombol dipakai.
        const { bukaPdf } = await import('@/lib/bank-statement/baca-pdf')
        const doc = await bukaPdf(new Uint8Array(await file.arrayBuffer()))
        if (batal) {
          await doc.tutup()
          return
        }
        docRef.current = doc
        setJumlah(doc.jumlahHalaman)
        await jalankan(Array.from({ length: doc.jumlahHalaman }, (_, i) => i + 1))
      } catch {
        if (!batal) setGalat('PDF tidak bisa dibuka — pastikan berkasnya PDF utuh dan tidak dilindungi kata sandi.')
      }
    })()
    return () => {
      batal = true
      abortRef.current?.abort()
      void docRef.current?.tutup()
      docRef.current = null
    }
    // Satu panel = satu berkas; panel dipasang ulang (key) untuk berkas lain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const berjalan = sedang !== null
  const daftarHasil = Object.values(hasil)
  const belum = jumlah === null ? [] : Array.from({ length: jumlah }, (_, i) => i + 1).filter(n => !hasil[n])
  const manual = daftarHasil.filter(h => h.status === 'manual').map(h => h.halaman)
  // Blok yang AKAN masuk grid — dihitung sekali per perubahan hasil, bukan per render.
  const { tersusun, rencana, rangkuman } = useMemo(() => {
    const t = halamanTersusun(Object.values(hasil))
    if (berjalan || jumlah === null || t.length === 0) return { tersusun: t, rencana: null, rangkuman: null }
    return { tersusun: t, rencana: rencanaPdf(t, periode), rangkuman: rangkumDokumen(t, jumlah) }
  }, [hasil, berjalan, jumlah, periode])
  const transaksi = rencana?.jenis === 'blok' ? rencana.hasil.baris.length : 0
  // Pemeriksa kedua: angka ringkasan bank (dibaca kode) vs blok yang akan masuk grid.
  const banding: BarisBanding[] = useMemo(
    () => (ringkasan && rencana?.jenis === 'blok' ? bandingkanRingkasan(ringkasan.data, rencana.hasil) : []),
    [ringkasan, rencana]
  )
  const tidakCocok = banding.filter(b => !b.cocok)
  const tanpaSaldoAwalBlok = rencana?.jenis === 'blok' && !rencana.hasil.titikSaldo.some(t => t.setelah === 0)
  const teksJangkar = tawarkanJangkar && tanpaSaldoAwalBlok ? (ringkasan?.data.saldoAwalTeks ?? null) : null
  const tampil = (b: BarisBanding, v: number | null) =>
    v === null ? '—' : b.jenis === 'jumlah' ? v.toLocaleString('id-ID') : rupiahPersis(fromMinorUnits(v))

  function masukkan() {
    if (rencana?.jenis !== 'blok') return
    const catatan = [
      ...(manual.length > 0 ? [`Isi manual halaman ${manual.join(', ')} — AI tidak bisa menyusunnya dengan yakin.`] : []),
      ...daftarHasil.flatMap(h => peringatanHalaman(h) ?? []),
      ...(tidakCocok.length > 0 ? [`Tidak cocok dengan ringkasan bank: ${tidakCocok.map(b => b.label.toLowerCase()).join(', ')}.`] : []),
      ...(rangkuman?.peringatan ?? []),
    ]
    onMasukkan(rencana.hasil, catatan)
  }

  const tombol =
    'inline-flex items-center gap-1.5 rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)'
  const gayaTombol: React.CSSProperties = { padding: '6px 12px', fontSize: 12, minHeight: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-primary)' }

  return (
    <section
      aria-label={`Unggah PDF rekening koran ${file.name}`}
      className="rounded-2xl px-3.5 py-3 text-xs flex flex-col gap-2"
      style={{ background: 'color-mix(in srgb, var(--color-accent-secondary) 14%, white)', border: '1px solid color-mix(in srgb, var(--color-accent-secondary) 55%, white)' }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="w-4 h-4" aria-hidden="true" />
        <strong className="font-semibold">{file.name}</strong>
        <span role="status" aria-live="polite" style={{ color: 'var(--color-text-muted)' }}>
          {jumlah === null && !galat
            ? 'Membuka PDF…'
            : berjalan
              ? `Menyusun halaman ${sedang} dari ${jumlah}…`
              : `${tersusun.length} dari ${jumlah ?? 0} halaman tersusun${rencana?.jenis === 'blok' ? ` · ${transaksi.toLocaleString('id-ID')} transaksi` : ''}`}
        </span>
        <span className="flex-1" />
        {berjalan ? (
          <button type="button" className={tombol} style={gayaTombol} onClick={() => abortRef.current?.abort()}>
            <X className="w-3.5 h-3.5" /> Batalkan
          </button>
        ) : (
          <>
            {belum.length > 0 && jumlah !== null && (
              <button type="button" className={tombol} style={gayaTombol} onClick={() => void jalankan(belum)}>
                <RotateCw className="w-3.5 h-3.5" /> Lanjutkan {belum.length} halaman
              </button>
            )}
            <button
              type="button"
              className={`${tombol} font-semibold`}
              style={{ ...gayaTombol, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
              disabled={rencana?.jenis !== 'blok'}
              onClick={masukkan}
            >
              Masukkan {transaksi.toLocaleString('id-ID')} transaksi ke grid
            </button>
            <button type="button" className={tombol} style={gayaTombol} onClick={onTutup}>
              Tutup
            </button>
          </>
        )}
      </div>

      {(galat || henti || rencana?.jenis === 'galat') && (
        <p role="alert" style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>
          {galat ?? henti ?? (rencana?.jenis === 'galat' ? rencana.pesan : '')}
        </p>
      )}

      {jumlah !== null && (
        <ol className="flex flex-col gap-0.5" aria-label="Status per halaman">
          {Array.from({ length: jumlah }, (_, i) => i + 1).map(n => {
            const h = hasil[n]
            return (
              <li key={n} className="flex items-center gap-2 flex-wrap" style={{ minHeight: 24 }}>
                <span className="font-mono" style={{ width: 52 }}>
                  Hal. {n}
                </span>
                {sedang === n ? (
                  <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> sedang disusun…
                  </span>
                ) : !h ? (
                  <span style={{ color: 'var(--color-text-muted)' }}>belum diproses</span>
                ) : h.status === 'ok' && peringatanHalaman(h) ? (
                  <>
                    <span style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>
                      ⚠ {peringatanHalaman(h)}
                      {h.model ? ` (${h.model})` : ''}
                    </span>
                    {!berjalan && (
                      <button type="button" className={tombol} style={{ ...gayaTombol, minHeight: 32, padding: '4px 10px' }} onClick={() => void jalankan([n])}>
                        <RotateCw className="w-3 h-3" /> Ulangi halaman {n}
                      </button>
                    )}
                  </>
                ) : h.status === 'ok' ? (
                  <span>
                    ✓ {h.data.baris.length.toLocaleString('id-ID')} baris
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {h.model ? ` · ${h.model}` : ''}
                      {h.diulang ? ' (diulang)' : ''}
                      {h.dariGambar ? ' · dibaca dari gambar' : ''}
                    </span>
                  </span>
                ) : h.status === 'manual' ? (
                  <span style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>isi manual — {h.pesan}</span>
                ) : (
                  <>
                    <span style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>{h.pesan}</span>
                    {h.bisaUlang && !berjalan && (
                      <button type="button" className={tombol} style={{ ...gayaTombol, minHeight: 32, padding: '4px 10px' }} onClick={() => void jalankan([n])}>
                        <RotateCw className="w-3 h-3" /> Ulangi halaman {n}
                      </button>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {banding.length > 0 && ringkasan && (
        <div className="flex flex-col gap-1" aria-label="Ringkasan bank dibanding hasil ekstraksi">
          <p
            role={tidakCocok.length > 0 ? 'alert' : 'status'}
            className="font-semibold"
            style={{ color: tidakCocok.length > 0 ? 'var(--color-accent-critical-fg, #be185d)' : 'var(--color-accent-primary-text)' }}
          >
            {tidakCocok.length > 0
              ? `✗ Tidak cocok dengan ringkasan bank (hal. ${ringkasan.halaman}) — periksa halaman yang gagal/isi manual atau baris yang hilang sebelum Simpan.`
              : `✓ Cocok dengan ringkasan bank (hal. ${ringkasan.halaman}): jumlah transaksi, total, dan saldo sama.`}
          </p>
          <table className="text-[11px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="text-left font-medium pr-3">Ringkasan bank</th>
                <th className="text-right font-medium pr-3">Bank</th>
                <th className="text-right font-medium pr-3">Hasil ekstraksi</th>
                <th className="text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {banding.map(b => (
                <tr key={b.label}>
                  <td className="pr-3">{b.label}</td>
                  <td className="text-right pr-3 font-mono">{tampil(b, b.bank)}</td>
                  <td className="text-right pr-3 font-mono">{tampil(b, b.ekstraksi)}</td>
                  <td style={{ color: b.cocok ? 'var(--color-accent-primary-text)' : 'var(--color-accent-critical-fg, #be185d)' }}>
                    {b.cocok ? '✓ cocok' : '✗ tidak cocok'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {teksJangkar && onSaldoAwal && (
            <div className="flex items-center gap-2 flex-wrap">
              <span>Grid belum punya jangkar saldo dan PDF ini tanpa baris SALDO AWAL.</span>
              <button
                type="button"
                className={tombol}
                style={{ ...gayaTombol, minHeight: 32, padding: '4px 10px' }}
                disabled={jangkarDipakai}
                onClick={() => {
                  onSaldoAwal(teksJangkar)
                  setJangkarDipakai(true)
                }}
              >
                {jangkarDipakai ? '✓ Dipakai' : `Pakai SALDO AWAL ringkasan (${teksJangkar}) sebagai "Saldo awal rekening koran"`}
              </button>
            </div>
          )}
        </div>
      )}

      {rangkuman && rangkuman.peringatan.length > 0 && (
        <ul className="flex flex-col gap-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {rangkuman.peringatan.map(p => (
            <li key={p}>⚠ {p}</li>
          ))}
        </ul>
      )}
      <p style={{ color: 'var(--color-text-muted)' }}>
        Hasil AI masuk sebagai DRAF berpenanda lilac. Periksa dulu — arah Debet/Kredit diputuskan dari kesinambungan saldo,
        bukan dari judul kolom bank. PDF tidak disimpan.
      </p>
    </section>
  )
}
