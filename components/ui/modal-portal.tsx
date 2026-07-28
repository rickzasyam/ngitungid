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
