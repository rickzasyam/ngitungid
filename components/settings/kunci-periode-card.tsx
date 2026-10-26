'use client'

// Kunci Periode — bagian dari tab Settings › Pembukuan (K4, MP §7.B).
//
// Layar ini TIDAK menegakkan apa pun: setiap jalur tulis sudah ditolak server
// (K2), dan route kunci/buka memeriksa ulang semua aturannya (K3). Yang
// dilakukan di sini hanya menyebut akibatnya sebelum tombolnya ditekan — dan
// memakai aturan murni yang SAMA (`validateLockInput`, `validateUnlockReason`)
// supaya pesan di layar tidak pernah berbeda dari jawaban server.
//
// Hak akses (D17): mengunci = akunting/owner; membuka = owner saja, dengan
// alasan wajib yang tercatat di riwayat. Finance melihat statusnya saja.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Lock, LockOpen } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'
import { fmtTanggal, fmtWaktu } from '@/components/jurnal/journal-detail'
import { ALASAN_BUKA_MIN, validateLockInput, validateUnlockReason } from '@/lib/period-lock'
import { hariIniJakarta } from '@/lib/ymd'

type Kunci = { id: string; terkunciSampai: string; dikunciOleh: string; createdAt: string }

/** Akhir bulan lalu menurut WIB — tanggal yang paling sering dikunci (tutup buku bulanan). */
function akhirBulanLalu(hariIni: string): string {
  const [y, m] = hariIni.split('-').map(Number)
  const ty = m === 1 ? y - 1 : y
  const tm = m === 1 ? 12 : m - 1
  const kabisat = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0
  const hari = [31, kabisat ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][tm - 1]
  return `${ty}-${String(tm).padStart(2, '0')}-${String(hari).padStart(2, '0')}`
}

export function KunciPeriodeCard({
  clientId,
  bolehKunci,
  bolehBuka,
}: {
  clientId: string
  /** akunting/owner (canDoAccounting). */
  bolehKunci: boolean
  /** owner saja. */
  bolehBuka: boolean
}) {
  const [kunci, setKunci] = useState<Kunci[]>([])
  const [terkunciSampai, setTerkunciSampai] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tanggal, setTanggal] = useState('')
  const [konfirmasi, setKonfirmasi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bukaTerbuka, setBukaTerbuka] = useState(false)
  const [alasan, setAlasan] = useState('')
  const [alasanSalah, setAlasanSalah] = useState<string | null>(null)

  const hariIni = hariIniJakarta()

  const muat = useCallback(async () => {
    const res = await fetch(`/api/period-locks?clientId=${clientId}`)
    const data = (await res.json().catch(() => null)) as
      | { terkunciSampai?: string | null; kunci?: Kunci[]; error?: string }
      | null
    if (!res.ok) throw new Error(data?.error ?? 'Gagal memuat kunci periode.')
    setKunci(data?.kunci ?? [])
    setTerkunciSampai(data?.terkunciSampai ?? null)
    return data?.terkunciSampai ?? null
  }, [clientId])

  // `loading` lahir TRUE; komponen di-mount ulang tiap ganti klien (key di
  // pemanggil), jadi tidak ada setLoading(true) sinkron di badan efek.
  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const berlaku = await muat()
        if (batal) return
        const usul = akhirBulanLalu(hariIni)
        setTanggal(berlaku === null || usul > berlaku ? usul : '')
      } catch (e) {
        if (!batal) setError(e instanceof Error ? e.message : 'Gagal memuat.')
      } finally {
        if (!batal) setLoading(false)
      }
    })()
    return () => {
      batal = true
    }
  }, [muat, hariIni])

  const latest = terkunciSampai ? { terkunciSampai } : null
  const cekKunci = validateLockInput({ terkunciSampai: tanggal }, { latest, hariIni })

  async function kunciSekarang() {
    if (!cekKunci.ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/period-locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, terkunciSampai: cekKunci.value.terkunciSampai }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? 'Gagal mengunci periode.')
      setKonfirmasi(false)
      setTanggal('')
      await muat()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunci periode.')
    } finally {
      setBusy(false)
    }
  }

  async function bukaSekarang() {
    const cek = validateUnlockReason(alasan)
    if (!cek.ok) {
      setAlasanSalah(cek.error)
      return
    }
    const terbaru = kunci[0]
    if (!terbaru) return
    setBusy(true)
    setAlasanSalah(null)
    try {
      const res = await fetch(`/api/period-locks/${terbaru.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alasan: cek.value }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? 'Gagal membuka kunci.')
      setBukaTerbuka(false)
      setAlasan('')
      await muat()
    } catch (e) {
      setAlasanSalah(e instanceof Error ? e.message : 'Gagal membuka kunci.')
    } finally {
      setBusy(false)
    }
  }

  const tombol =
    'inline-flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)'

  return (
    <div>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: terkunciSampai ? 'var(--color-accent-secondary)' : 'var(--color-muted-bg)' }}
          aria-hidden
        >
          <Lock className="w-4 h-4" style={{ color: 'var(--color-text-primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Kunci Periode
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }} aria-live="polite">
            {loading
              ? 'Memuat…'
              : terkunciSampai
                ? (
                    <>
                      Terkunci sampai <strong style={{ color: 'var(--color-text-primary)' }}>{fmtTanggal(terkunciSampai)}</strong>.
                      Jurnal, invoice pembelian, dan mutasi kas bertanggal sampai hari itu tidak bisa dibuat,
                      diubah, diposting, atau dihapus — juga lewat setelan &quot;posting bisa diedit&quot;.
                    </>
                  )
                : 'Belum ada periode yang dikunci untuk klien ini.'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs mt-3" style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>
          {error}
        </p>
      )}

      {!loading && bolehKunci && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="kunci-periode-tanggal" className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Kunci sampai tanggal
            </label>
            {/* type="date" memberi & menerima 'YYYY-MM-DD' apa adanya (P2); batas
                atasnya hari ini menurut WIB, sama dengan yang dinilai server. */}
            <input
              id="kunci-periode-tanggal"
              type="date"
              value={tanggal}
              max={hariIni}
              min={terkunciSampai ?? undefined}
              onChange={e => {
                setTanggal(e.target.value)
                setKonfirmasi(false)
              }}
              aria-describedby="kunci-periode-cek"
              className="rounded-2xl px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ border: '1px solid #e5e5e5', minHeight: 36, background: 'white', color: 'var(--color-text-primary)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setKonfirmasi(true)}
            disabled={busy || !cekKunci.ok}
            className={tombol}
            style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', minHeight: 36 }}
          >
            <Lock className="w-3.5 h-3.5" /> Kunci
          </button>
          <p id="kunci-periode-cek" className="w-full text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {tanggal !== '' && !cekKunci.ok ? cekKunci.error : 'Kunci baru harus sesudah kunci yang berlaku dan tidak melewati hari ini (WIB).'}
          </p>
        </div>
      )}

      {konfirmasi && cekKunci.ok && (
        <div className="mt-3 rounded-2xl px-3.5 py-3" style={{ background: 'var(--color-muted-bg)', border: '1px solid #e5e5e5' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
            Kunci pembukuan klien ini sampai <strong>{fmtTanggal(cekKunci.value.terkunciSampai)}</strong>? Sesudahnya
            tidak ada yang bisa mengubah transaksi bertanggal sampai hari itu.{' '}
            {bolehBuka ? 'Membukanya kembali butuh alasan yang tercatat.' : 'Hanya owner yang bisa membukanya kembali.'}
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => void kunciSekarang()}
              disabled={busy}
              className={tombol}
              style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', minHeight: 34 }}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Ya, kunci
            </button>
            <button
              type="button"
              onClick={() => setKonfirmasi(false)}
              disabled={busy}
              className={tombol}
              style={{ background: 'white', border: '1px solid #e5e5e5', color: 'var(--color-text-muted)', minHeight: 34 }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {!loading && bolehBuka && kunci.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setBukaTerbuka(true)
            setAlasanSalah(null)
          }}
          disabled={busy}
          className={`${tombol} mt-3`}
          style={{ background: 'white', border: '1px solid color-mix(in srgb, var(--color-accent-critical) 45%, white)', color: 'var(--color-text-primary)', minHeight: 34 }}
        >
          <LockOpen className="w-3.5 h-3.5" /> Buka kunci terakhir
        </button>
      )}

      {kunci.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            Riwayat kunci yang berlaku
          </p>
          <ul className="mt-1.5 space-y-1">
            {kunci.slice(0, 5).map(k => (
              <li key={k.id} className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                s.d. <strong>{fmtTanggal(k.terkunciSampai)}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}> · {k.dikunciOleh} · {fmtWaktu(k.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bukaTerbuka && kunci[0] && (
        <ModalShell labelledBy="buka-kunci-judul" className="max-w-md" onDismiss={busy ? null : () => setBukaTerbuka(false)}>
          <div className="px-5 sm:px-6 py-5">
            <h2 id="buka-kunci-judul" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Buka kunci sampai {fmtTanggal(kunci[0].terkunciSampai)}?
            </h2>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {kunci[1]
                ? `Kunci sebelumnya (sampai ${fmtTanggal(kunci[1].terkunciSampai)}) berlaku lagi.`
                : 'Sesudahnya tidak ada periode yang terkunci.'}{' '}
              Alasannya tercatat di riwayat dan tidak bisa dihapus.
            </p>
            <label htmlFor="buka-kunci-alasan" className="block text-xs font-semibold mt-4 mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Alasan membuka (minimal {ALASAN_BUKA_MIN} karakter)
            </label>
            <textarea
              id="buka-kunci-alasan"
              value={alasan}
              onChange={e => {
                setAlasan(e.target.value)
                setAlasanSalah(null)
              }}
              rows={3}
              aria-invalid={alasanSalah !== null}
              aria-describedby={alasanSalah ? 'buka-kunci-galat' : undefined}
              className="w-full rounded-2xl px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ border: `1px solid ${alasanSalah ? 'var(--color-accent-critical)' : '#e5e5e5'}`, color: 'var(--color-text-primary)' }}
            />
            {alasanSalah && (
              <p id="buka-kunci-galat" role="alert" className="text-xs mt-1.5" style={{ color: 'var(--color-accent-critical-fg, #be185d)' }}>
                {alasanSalah}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t" style={{ borderColor: '#f0f0f0', background: 'white' }}>
            <button
              type="button"
              onClick={() => setBukaTerbuka(false)}
              disabled={busy}
              className={tombol}
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)', minHeight: 34 }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void bukaSekarang()}
              disabled={busy}
              className={tombol}
              style={{ background: 'var(--color-accent-critical)', color: 'white', minHeight: 34 }}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LockOpen className="w-3.5 h-3.5" />} Buka kunci
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
