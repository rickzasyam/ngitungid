'use client'

import { useEffect, useRef, useState } from 'react'

// Pemasang mesin terrain di React. Komponen ini SELALU dimuat lewat
// next/dynamic({ ssr: false }) dari ./index.tsx — jangan pernah meng-import-nya
// langsung, karena itu akan menarik three ke dalam bundel awal halaman login.
//
// Tiga hal yang TIDAK dimiliki prototipe dan ditambahkan di sini:
//   1. Probe WebGL + fallback. `new WebGLRenderer()` MELEMPAR saat konteks
//      gagal dibuat (sesi RDP, driver di-blocklist, WebGL dimatikan). Prototipe
//      tidak punya satu guard pun; di React itu berarti error tak tertangkap
//      dan halaman login rusak. Di sini konteks diuji DULU, dan mesinnya baru
//      di-import setelah lolos — jadi mesin tanpa WebGL tidak ikut mengunduh
//      three sama sekali.
//   2. Pembongkaran. Lihat dispose() di engine/main.js.
//   3. Isolasi muat. Lihat ./index.tsx.
//
// Saat WebGL tidak ada, ATAU konteksnya hilang di tengah jalan, komponen ini
// merender `null` — panel kirinya tetap menampilkan kisi titik CSS
// (.ng-login-dots) yang memang sudah jadi latarnya. Tidak pernah kosong,
// tidak pernah melempar.

/** Uji konteks WebGL tanpa menyentuh three. Tidak pernah melempar. */
function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Diagnosis: `?fps` di URL menampilkan pembacaan frame rate. */
function wantsFpsReadout(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('fps')
}

export default function TerrainCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLDivElement>(null)
  const [showFps] = useState(wantsFpsReadout)
  // Lazy initializer, BUKAN efek: ssr:false menjamin komponen ini hanya pernah
  // dievaluasi di browser, jadi document dijamin ada — dan tidak ada setState
  // di dalam efek (baseline 24 warning tidak bertambah).
  const [supported] = useState(hasWebGL)
  const [lost, setLost] = useState(false)

  useEffect(() => {
    if (!supported) return
    const host = hostRef.current
    if (!host) return

    // StrictMode dev me-mount → unmount → mount. `cancelled` mencegah import
    // yang selesai SETELAH unmount membangun mesin kedua di node yang sudah
    // terlepas — itulah bentuk kebocoran rAF yang khas di sini.
    let cancelled = false
    let dispose: (() => void) | null = null

    void import('./engine/main.js')
      .then(({ createTerrain }) => {
        if (cancelled) return
        try {
          dispose = createTerrain(host, {
            onContextLost: () => setLost(true),
            // Ditulis langsung ke node DOM, BUKAN lewat setState: me-render
            // ulang React dua kali per detik demi satu angka akan ikut
            // mengotori pengukuran yang sedang dilakukan.
            onFps: showFps
              ? (fps: number) => {
                  if (fpsRef.current) fpsRef.current.textContent = `${Math.round(fps)} fps`
                }
              : undefined,
          })
        } catch {
          // Probe lolos tapi konstruksi tetap gagal (atribut konteks berbeda:
          // antialias / powerPreference high-performance ditolak driver).
          setLost(true)
        }
      })
      .catch(() => {
        // Chunk mesin gagal dimuat — jaringan putus, cache basi. Form tetap
        // hidup; latarnya cukup kisi titik.
        if (!cancelled) setLost(true)
      })

    return () => {
      cancelled = true
      dispose?.()
      dispose = null
    }
  }, [supported, showFps])

  if (!supported || lost) return null

  // aria-hidden: murni dekoratif, tidak ada informasi di dalamnya.
  return (
    <>
      <div ref={hostRef} aria-hidden="true" className="absolute inset-0" />
      {showFps && (
        <div
          ref={fpsRef}
          aria-hidden="true"
          className="absolute rounded-lg font-mono"
          style={{
            top: 12,
            left: 12,
            zIndex: 20,
            padding: '4px 10px',
            fontSize: 12,
            background: 'rgba(0,0,0,0.55)',
            color: 'var(--color-accent-primary)',
          }}
        >
          — fps
        </div>
      )}
    </>
  )
}
