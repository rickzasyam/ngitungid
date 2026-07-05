'use client'

import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ClientProvider } from '@/lib/client-context'
import { Sidebar } from '@/components/sidebar'

// /login tidak butuh sidebar app (belum login, nav-nya juga akan
// memantul balik ke /login lewat proxy.ts kalau diklik sebelum auth).
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  return (
    <SessionProvider>
      <ClientProvider>
        {isLoginPage ? (
          children
        ) : (
          <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
            <Sidebar />
            {children}
          </div>
        )}
      </ClientProvider>
    </SessionProvider>
  )
}
