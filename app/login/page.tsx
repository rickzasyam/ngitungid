'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/upload'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <div
      className="flex items-center justify-center min-h-screen w-screen p-4"
      style={{ background: 'var(--color-bg-main)' }}
    >
      <div
        className="w-full rounded-3xl p-8 sm:p-10 animate-scale-in"
        style={{ maxWidth: 400, background: 'white', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-accent-primary)' }}
          >
            <span className="font-bold text-lg" style={{ color: 'var(--color-bg-sidebar)' }}>N</span>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight" style={{ color: 'var(--color-text-primary)' }}>NgitungID BI</div>
            <div className="text-xs leading-tight" style={{ color: 'var(--color-text-muted)' }}>Financial Analytics</div>
          </div>
        </div>

        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Masuk</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Masuk dengan akun yang sudah didaftarkan admin
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ background: 'var(--color-muted-bg)', border: '1.5px solid var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
                placeholder="nama@perusahaan.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ background: 'var(--color-muted-bg)', border: '1.5px solid var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in"
              style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#dc2626' }} />
              <span className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:shadow-[0_4px_16px_rgba(218,241,99,0.4)] disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{
              background: isSubmitting ? 'var(--color-muted-dark)' : 'var(--color-accent-primary)',
              color: isSubmitting ? 'var(--color-text-muted)' : 'var(--color-accent-primary-fg)',
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
      </div>
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
