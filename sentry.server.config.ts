import * as Sentry from '@sentry/nextjs'

// Init Sentry untuk runtime Node (route handler, server component, server action).
// Di-load lewat instrumentation.ts → register().
//
// DSN dibaca dari env (NEXT_PUBLIC_SENTRY_DSN), TIDAK PERNAH di-hardcode.
// Kalau env-nya kosong, Sentry.init() otomatis non-aktif — jadi kontributor
// atau CI tanpa DSN tetap bisa build & menjalankan app tanpa error.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Sengaja TIDAK digate ke production saja: app-nya belum di-deploy, jadi gate
  // seperti itu berarti Sentry tak pernah terbukti jalan sampai hari deploy.
  // Sebagai gantinya event ditandai environment-nya, biar `development` gampang
  // difilter/di-mute di dashboard.
  environment: process.env.NODE_ENV,
  // Free tier 5k error/bulan — jangan bakar kuota untuk trace performa.
  // Error capture tidak bergantung ke ini. Naikkan kalau perlu APM nanti.
  tracesSampleRate: 0,
  // Body request memuat data keuangan klien — jangan pernah ikut terkirim.
  sendDefaultPii: false,
})
