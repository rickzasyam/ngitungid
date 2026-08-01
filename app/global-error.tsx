'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

// Error boundary paling luar App Router. Tanpa ini, error saat RENDER komponen
// React ditangkap Next dan hanya jadi error page — Sentry tak pernah melihatnya
// (handler global window.onerror cuma menangkap error di luar render React).
//
// global-error menggantikan root layout saat aktif, jadi ia HARUS merender
// <html> dan <body> sendiri.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="id">
      <body style={{ margin: 0, background: '#222124', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div
            style={{
              background: 'white',
              borderRadius: 24,
              padding: 32,
              maxWidth: 420,
              textAlign: 'center',
              boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
            }}
          >
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1f2430', margin: '0 0 8px' }}>
              Ada yang bermasalah
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Error-nya sudah otomatis dilaporkan ke tim. Coba muat ulang halaman ini —
              kalau terus berulang, hubungi admin.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                border: 'none',
                borderRadius: 999,
                padding: '10px 22px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: '#daf163',
                color: '#1a1a1a',
              }}
            >
              Coba lagi
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
