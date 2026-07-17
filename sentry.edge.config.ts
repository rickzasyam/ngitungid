import * as Sentry from '@sentry/nextjs'

// Init Sentry untuk runtime Edge — di project ini itu `proxy.ts` (route
// protection NextAuth). Semua route API kita `runtime = 'nodejs'`, tapi proxy
// tetap jalan di edge, jadi tanpa file ini error di sana tidak tertangkap.
// Opsinya sengaja disamakan dengan sentry.server.config.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
})
