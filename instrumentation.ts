import * as Sentry from '@sentry/nextjs'

// Hook instrumentation Next.js — dipanggil sekali saat server start, per runtime.
// Config-nya di-import dinamis supaya SDK Node tidak ikut ter-bundle ke edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// WAJIB untuk App Router: tanpa ini, error yang dilempar di dalam route handler /
// server component TIDAK sampai ke Sentry — Next menangkapnya sendiri dan hanya
// merender error page, sehingga handler global tak pernah melihatnya.
export const onRequestError = Sentry.captureRequestError
