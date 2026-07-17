import * as Sentry from '@sentry/nextjs'

// Init Sentry di browser. Next.js (15.3+) memuat file ini otomatis di client —
// tidak perlu di-import dari mana pun.
//
// DSN dibaca dari NEXT_PUBLIC_SENTRY_DSN. Prefix NEXT_PUBLIC_ memang wajib di
// sisi client, dan DSN aman dipublikasikan: ia hanya bisa MENGIRIM event, bukan
// membaca data project. Kalau kosong → SDK non-aktif, app tetap normal.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  // Jangan rekam sesi/replay: hemat kuota, dan layar app ini penuh angka
  // keuangan klien yang tak perlu dikirim ke pihak ketiga.
  sendDefaultPii: false,
})

// Melaporkan error navigasi App Router ke Sentry.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
