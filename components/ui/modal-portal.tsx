'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Merender overlay modal langsung ke <body>.
 *
 * WAJIB untuk setiap dialog di app ini, bukan sekadar kerapian. `position: fixed`
 * TIDAK selalu relatif ke viewport: begitu ada leluhur ber-`transform` non-none,
 * leluhur itu jadi containing block-nya. Animasi di sini memakai
 * `animation-fill-mode: both` (lihat globals.css) sehingga menyisakan
 * `transform: translateY(0)` SELAMANYA setelah animasi selesai — jadi hampir
 * setiap card (`.animate-slide-up`, `.ng-rise`) diam-diam menjadi containing
 * block.
 *
 * Gejalanya persis yang ditemukan 2026-07-28 pada form Tambah Akun COA: overlay
 * `fixed inset-0` menyusut jadi seukuran SettingsCard (718×132), dialog setinggi
 * 656px dipusatkan di dalamnya lalu meluber ke atas sampai y = −58 — judul dan
 * baris Kode ada di DOM tapi berada di luar layar, sehingga terlihat seperti
 * "field-nya hilang". Ini kerabat dekat bug stacking-context yang sama-sama
 * berasal dari transform sisa fill-mode.
 *
 * Portal ke <body> membuat dialog kebal terhadap apa pun yang dilakukan leluhur
 * render-nya.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  // Portal baru boleh dipasang setelah mount — `document` tidak ada saat SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}

/**
 * Backdrop + kotak pemusat untuk dialog.
 *
 * Backdrop menutupi SELURUH viewport (`inset-0`) supaya seluruh app terblokir,
 * termasuk sidebar. Kotak pemusatnya sendiri dimulai dari `--app-content-left`
 * sehingga dialog duduk di tengah AREA KONTEN — lihat globals.css untuk alasan
 * variabel itu berbasis CSS dan kenapa ia tidak bisa basi saat sidebar dilipat
 * atau viewport diubah.
 */
export function ModalShell({
  children,
  onDismiss,
  labelledBy,
  label,
  className = 'max-w-lg',
}: {
  children: React.ReactNode
  /** null = tidak bisa ditutup lewat klik backdrop / Esc (mis. sedang menyimpan). */
  onDismiss: (() => void) | null
  /** id elemen judul di dalam dialog. Pakai ini kalau judulnya memang tampil. */
  labelledBy?: string
  /** Alternatif `labelledBy` saat label yang berguna lebih spesifik daripada
   *  judul yang tampil — mis. judul "Edit Klien" tapi label "Edit klien Rasyuka". */
  label?: string
  /** kelas lebar untuk kotak dialog, mis. 'max-w-2xl'. */
  className?: string
}) {
  // Esc ditangani DI SINI, bukan di tiap dialog. Sebelumnya tiap pemanggil
  // memasang listener sendiri (dan yang lupa, tidak dapat Esc sama sekali).
  // `onDismiss === null` berarti sedang sibuk menyimpan → Esc ikut nonaktif,
  // konsisten dengan klik backdrop.
  useEffect(() => {
    if (!onDismiss) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 animate-fade-in"
        style={{ background: 'rgba(26,26,26,0.45)' }}
        role="presentation"
        onClick={e => {
          if (e.target === e.currentTarget) onDismiss?.()
        }}
      >
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center p-4"
          style={{
            left: 'var(--app-content-left, 0px)',
            // Sidebar melebar/menyempit dengan transisi 300ms; samakan supaya
            // dialog ikut bergeser mulus, bukan meloncat.
            transition: 'left 300ms ease-in-out',
          }}
          role="presentation"
          onClick={e => {
            if (e.target === e.currentTarget) onDismiss?.()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
            className={`w-full ${className} max-h-[85vh] flex flex-col rounded-3xl overflow-hidden`}
            style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)' }}
          >
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
