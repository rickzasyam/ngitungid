'use client'

// Panel Pindah Buku di grid (D59, MP §5.G S9). Semua angkanya DATANG JADI dari
// `GET /api/cash-mutations/pindah-buku` (S5): saldo akun Pindah Buku s.d. akhir
// periode, baris yang belum berpasangan, dan pasangan tunggal yang diusulkan.
// Panel ini tidak menjumlahkan apa pun — saldo yang dihitung di dua tempat
// adalah dua jawaban yang bisa berbeda.
//
// Usulan pasangan diteruskan ke grid sebagai usulan akun lawan (lilac) untuk
// baris yang ADA di grid ini; seberangnya ada di tab akun kas lain dan
// diterapkan di sana.

import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useRupiah } from '@/lib/preferences-context'
import { fmtTanggal } from '@/lib/ymd'
import type { Periode } from '@/lib/mutasi-draf'

type BarisPB = {
  id: string
  tanggal: string
  akunKasId: string
  akunKasKode: string
  akunKasNama: string
  keterangan: string | null
  masuk: string
  keluar: string
}

type DataPB = {
  akunPindahBuku: { id: string; kode: string; nama: string } | null
  saldo: string
  belumBerpasangan: BarisPB[]
  lintasPeriode: { keluar: BarisPB; masuk: BarisPB; selisihHari: number }[]
  usulan: { keluar: BarisPB; masuk: BarisPB; selisihHari: number }[]
  ganda: { id: string }[]
}

export type UsulanPindahBuku = Map<string, { akunId: string; seberang: string }>

type Props = {
  clientId: string
  periode: Periode
  /** Naik setiap Simpan berhasil — memuat ulang panel. */
  versi: number
  onUsulan: (u: UsulanPindahBuku) => void
}

export function PanelPindahBuku({ clientId, periode, versi, onUsulan }: Props) {
  const { rupiahPersis } = useRupiah()
  const [data, setData] = useState<DataPB | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [buka, setBuka] = useState(false)

  useEffect(() => {
    let batal = false
    void (async () => {
      try {
        const qs = new URLSearchParams({ clientId, periodStart: periode.mulai, periodEnd: periode.akhir })
        const res = await fetch(`/api/cash-mutations/pindah-buku?${qs}`)
        const d = (await res.json().catch(() => null)) as (DataPB & { error?: string }) | null
        if (batal) return
        if (!res.ok || !d) {
          setGalat(d?.error ?? 'Gagal memuat panel Pindah Buku.')
          setData(null)
          onUsulan(new Map())
          return
        }
        setGalat(null)
        setData(d)
        const peta: UsulanPindahBuku = new Map()
        if (d.akunPindahBuku) {
          for (const p of d.usulan) {
            peta.set(p.keluar.id, { akunId: d.akunPindahBuku.id, seberang: `${p.masuk.akunKasNama} ${fmtTanggal(p.masuk.tanggal)}` })
            peta.set(p.masuk.id, { akunId: d.akunPindahBuku.id, seberang: `${p.keluar.akunKasNama} ${fmtTanggal(p.keluar.tanggal)}` })
          }
        }
        onUsulan(peta)
      } catch {
        if (!batal) setGalat('Gagal menghubungi server.')
      }
    })()
    return () => {
      batal = true
    }
  }, [clientId, periode.mulai, periode.akhir, versi, onUsulan])

  if (galat) {
    return (
      <p role="alert" className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {galat}
      </p>
    )
  }
  if (!data) {
    return (
      <p className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat Pindah Buku…
      </p>
    )
  }
  if (!data.akunPindahBuku) {
    return (
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Akun Pindah Buku belum diatur — Settings › Pembukuan.
      </p>
    )
  }

  const saldoNol = Number(data.saldo) === 0
  return (
    <section aria-label="Pindah Buku" className="rounded-2xl" style={{ background: 'white', border: '1px solid var(--color-muted-bg)' }}>
      <button
        type="button"
        onClick={() => setBuka(b => !b)}
        aria-expanded={buka}
        className="w-full flex items-center gap-2 text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
        style={{ padding: '8px 12px', minHeight: 36, fontSize: 12.5 }}
      >
        {buka ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <ArrowLeftRight className="w-4 h-4" />
        <span className="font-semibold">Pindah Buku</span>
        <span style={{ color: 'var(--color-text-muted)' }}>
          {data.akunPindahBuku.kode} · saldo s.d. {fmtTanggal(periode.akhir)}:{' '}
          <strong style={{ color: saldoNol ? 'var(--color-text-primary)' : 'color-mix(in srgb, var(--color-accent-critical) 55%, black)' }}>
            {rupiahPersis(data.saldo)}
          </strong>
          {' · '}
          {data.usulan.length} usulan pasangan · {data.belumBerpasangan.length} belum berpasangan
        </span>
      </button>
      {buka && (
        <div className="px-3 pb-3 flex flex-col gap-2" style={{ fontSize: 12 }}>
          {!saldoNol && (
            <p role="note" className="flex items-start gap-1.5 rounded-2xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--color-accent-critical) 8%, white)' }}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Saldo Pindah Buku semestinya nol: setiap uang keluar dari satu rekening masuk ke rekening lain. Periksa baris yang
              belum berpasangan di bawah.
            </p>
          )}
          {data.usulan.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Usulan pasangan (tampil lilac di grid akun masing-masing)</p>
              <ul className="flex flex-col gap-1">
                {data.usulan.map(p => (
                  <li key={`${p.keluar.id}-${p.masuk.id}`} style={{ color: 'var(--color-text-muted)' }}>
                    {p.keluar.akunKasNama} {fmtTanggal(p.keluar.tanggal)} keluar {rupiahPersis(p.keluar.keluar)} → {p.masuk.akunKasNama}{' '}
                    {fmtTanggal(p.masuk.tanggal)} masuk ({p.selisihHari} hari)
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.ganda.length > 0 && (
            <p style={{ color: 'var(--color-text-muted)' }}>
              {data.ganda.length} baris punya lebih dari satu kemungkinan pasangan dengan nominal sama — tidak diusulkan otomatis.
            </p>
          )}
          {data.belumBerpasangan.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Belum berpasangan</p>
              <ul className="flex flex-col gap-1">
                {data.belumBerpasangan.map(b => (
                  <li key={b.id} style={{ color: 'var(--color-text-muted)' }}>
                    {fmtTanggal(b.tanggal)} · {b.akunKasNama} · {b.keterangan ?? '—'} ·{' '}
                    {Number(b.masuk) > 0 ? `masuk ${rupiahPersis(b.masuk)}` : `keluar ${rupiahPersis(b.keluar)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.lintasPeriode.length > 0 && (
            <p style={{ color: 'var(--color-text-muted)' }}>
              {data.lintasPeriode.length} pasangan menyeberang akhir periode — wajar, bukan galat.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
