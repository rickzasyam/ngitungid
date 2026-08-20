'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Mail, Lock, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'

// Halaman Login — PENGGANTIAN VISUAL. Logika autentikasinya tidak ditulis
// ulang: markup baru membungkus perilaku yang sudah ada.
//
// ══ YANG TIDAK BOLEH BERUBAH (dan kenapa) ══════════════════════════════════
//  * signIn('credentials', { email, password, redirect: false }) — persis sama.
//  * `email` dikirim MENTAH, tanpa trim/lowercase. Pencocokan user di
//    lib/auth.ts memakai eq(users.email, email) yang case-sensitive; menormalkan
//    di sini akan membuat akun ber-huruf besar gagal login. Normalisasi untuk
//    RATE LIMIT dilakukan server-side (normalizeEmail di login-rate-limit-store).
//  * Satu pesan error generik untuk SEMUA kegagalan. Terkunci, email tidak ada,
//    dan password salah sama-sama mengembalikan null di authorize() → NextAuth
//    memancarkan 'CredentialsSignin' yang sama. Membedakannya di UI akan
//    membocorkan email mana yang terdaftar (account enumeration) DAN memberi
//    tahu penyerang bahwa lockout-nya sedang aktif.
//  * Rate limit (tabel login_attempts: 5 gagal / 15 menit → kunci 15 menit)
//    hidup SEPENUHNYA di server, di authorize(). Halaman ini tidak punya satu
//    baris pun yang menyentuhnya — justru itu yang membuatnya tidak bisa hilang
//    saat markup diganti. Tabel yang sama dipakai POST /api/account/password.
//  * Redirect setelah sukses: router.push(callbackUrl) + router.refresh().
//    Redirect PER-ROLE bukan urusan halaman ini — proxy.ts (callback authorized
//    di lib/auth.ts) memantulkan role yang tidak boleh membuka callbackUrl ke
//    USER_HOME. Menambahkan logika role di sini akan menduplikasi kebijakan itu.
//
// ══ PERMUKAAN GELAP, BUKAN DARK MODE ═══════════════════════════════════════
// Satu halaman memilih palet kanvas (#222124 + lime #daf163). Blok
// prefers-color-scheme tetap tidak ada di globals.css dan tidak boleh kembali.
// Setiap warna teks di bawah diset EKSPLISIT.
//
// ══ LATAR TITIK-TITIK ══════════════════════════════════════════════════════
// Desain di docs/login-design/ memakai MESIN PARTIKEL WebGL Three.js (21 modul,
// import map ke three@0.180.0 + tweakpane dari CDN). Itu dependensi baru, jadi
// TIDAK dipakai. Penggantinya: kisi titik statis murni CSS (.ng-login-dots di
// globals.css) — nol JavaScript, nol byte tambahan, nol frame per detik.

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/upload'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Email atau password salah')
      setIsSubmitting(false)
      return
    }

    router.push(callbackUrl)
    router.refresh()
  }

  const labelStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.08em',
  }
  const fieldWrap: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
  }
  const fieldInput: React.CSSProperties = {
    background: 'transparent',
    color: '#ffffff',
    border: 'none',
    outline: 'none',
  }

  return (
    <div className="min-h-screen w-full flex" style={{ background: 'var(--color-bg-main)' }}>

      {/* ── KIRI: panel merek. Disembunyikan di bawah lg supaya form dapat
             seluruh layar di ponsel. Isinya teks merek saja — tidak ada kontrol
             di dalamnya, jadi tidak ada yang hilang saat ia disembunyikan. ── */}
      <section
        className="hidden lg:flex lg:w-[56%] relative flex-col justify-center ng-login-dots"
        style={{ padding: '0 72px', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="animate-slide-up" style={{ maxWidth: 560 }}>
          <div className="flex items-center gap-4" style={{ marginBottom: 44 }}>
            {/* Wordmark "N" yang sama dengan sidebar — BUKAN ikon terminal dari
                template: pengguna app ini akuntan, bukan developer. */}
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--color-accent-primary)' }}
            >
              <span className="font-bold" style={{ fontSize: 28, color: 'var(--color-bg-sidebar)' }}>N</span>
            </div>
            <div>
              <span
                className="block text-xs font-semibold uppercase"
                style={{ color: 'var(--color-accent-primary)', letterSpacing: '0.34em' }}
              >
                NGITUNG ID
              </span>
              <span
                className="block text-[11px] font-medium uppercase"
                style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.2em', marginTop: 4 }}
              >
                Business Intelligence
              </span>
            </div>
          </div>

          <h1
            className="font-bold"
            style={{ fontSize: 46, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#ffffff', marginBottom: 22 }}
          >
            Laporan Keuangan,{' '}
            <span style={{ color: 'var(--color-accent-primary)' }}>Terbaca Sekejap</span>
          </h1>

          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'rgba(255,255,255,0.7)', maxWidth: 440 }}>
            Dari PDF ke dashboard dan analisis rasio. Satu tempat untuk semua laporan klien Anda.
          </p>
        </div>
      </section>

      {/* ── KANAN: form ────────────────────────────────────────────────── */}
      <section
        className="w-full lg:w-[44%] flex flex-col justify-center relative"
        style={{ padding: '48px 24px' }}
      >
        <div className="w-full mx-auto animate-slide-up" style={{ maxWidth: 400 }}>

          {/* Wordmark versi ponsel — panel kiri tidak dirender di lebar ini. */}
          <div className="flex lg:hidden items-center gap-3" style={{ marginBottom: 36 }}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--color-accent-primary)' }}
            >
              <span className="font-bold text-lg" style={{ color: 'var(--color-bg-sidebar)' }}>N</span>
            </div>
            <div>
              <div className="font-bold text-sm leading-tight" style={{ color: '#ffffff' }}>NgitungID BI</div>
              <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>Business Intelligence</div>
            </div>
          </div>

          <h2 className="font-bold" style={{ fontSize: 30, letterSpacing: '-0.01em', color: '#ffffff', marginBottom: 8 }}>
            Masuk
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 32 }}>
            Masuk dengan akun yang sudah didaftarkan admin
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-[10px] font-semibold mb-2 uppercase" style={labelStyle}>
                Email
              </label>
              <div className="ng-login-field flex items-center rounded-2xl" style={fieldWrap}>
                <Mail className="w-4 h-4 flex-shrink-0" style={{ marginLeft: 14, color: 'rgba(255,255,255,0.5)' }} />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full text-sm rounded-2xl focus-visible:outline-none"
                  style={{ ...fieldInput, padding: '13px 14px 13px 10px' }}
                  placeholder="nama@perusahaan.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[10px] font-semibold mb-2 uppercase" style={labelStyle}>
                Password
              </label>
              <div className="ng-login-field flex items-center rounded-2xl" style={fieldWrap}>
                <Lock className="w-4 h-4 flex-shrink-0" style={{ marginLeft: 14, color: 'rgba(255,255,255,0.5)' }} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full text-sm focus-visible:outline-none"
                  style={{ ...fieldInput, padding: '13px 6px 13px 10px' }}
                  placeholder="••••••••"
                />
                {/* <button> native: role, tabIndex, dan Enter/Space sudah bawaan,
                    jadi tidak perlu ditambahkan manual. 36×36 = di atas ambang
                    32-36px. */}
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="ng-login-icon-btn flex items-center justify-center flex-shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{ width: 36, height: 36, marginRight: 6, background: 'transparent', color: 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in"
                style={{ background: 'rgba(244,114,182,0.10)', border: '1px solid rgba(244,114,182,0.35)' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-accent-critical)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-accent-critical)' }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="ng-login-submit w-full flex items-center justify-center gap-2 rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                minHeight: 48,
                padding: '13px 20px',
                border: 'none',
                background: isSubmitting ? 'rgba(255,255,255,0.14)' : 'var(--color-accent-primary)',
                color: isSubmitting ? 'rgba(255,255,255,0.7)' : 'var(--color-bg-sidebar)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          {/* Akun HANYA dibuat Owner lewat Settings → Kelola Akun. Pendaftaran
              mandiri tidak akan pernah ada, jadi ini TEKS MATI — bukan link,
              bukan tombol. Kontrol yang bisa diklik tapi tidak melakukan apa pun
              terbaca sebagai app rusak. */}
          <p className="text-center" style={{ marginTop: 32, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Belum punya akun? Hubungi admin.
          </p>
        </div>
      </section>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
