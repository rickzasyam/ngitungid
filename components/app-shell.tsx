'use client'

import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ClientProvider } from '@/lib/client-context'
import { PreferencesProvider } from '@/lib/preferences-context'
import { Sidebar } from '@/components/sidebar'

// /login tidak butuh sidebar app (belum login, nav-nya juga akan
// memantul balik ke /login lewat proxy.ts kalau diklik sebelum auth).
//
// Urutan provider: PreferencesProvider ada DI DALAM SessionProvider (ia butuh
// useSession untuk tahu kapan boleh fetch, dan agar tidak menembak endpoint saat
// belum login) dan MEMBUNGKUS seluruh halaman, supaya formatter bisa membacanya
// dari mana saja tanpa request tambahan per halaman.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  return (
    <SessionProvider>
      <PreferencesProvider>
        <ClientProvider>
          {isLoginPage ? (
            children
          ) : (
            <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
              <Sidebar />
              {/* pl-12 di mobile menyisakan ruang untuk tombol hamburger yang
                  `fixed` di pojok kiri-atas — tanpa ini ia menutupi judul halaman.
                  Di md+ sidebar tampil normal dan hamburger hilang, jadi pl-0. */}
              <div className="flex-1 min-w-0 flex pl-12 md:pl-0">
                {children}
              </div>
            </div>
          )}
        </ClientProvider>
      </PreferencesProvider>
    </SessionProvider>
  )
}
