'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/api/preferences'
import { formatRupiah, formatRupiahPersis, formatRupiahShort, formatRupiahPlain } from '@/lib/format'

// Preferensi tampilan per-user, di-fetch SEKALI per load aplikasi — pola sama
// dengan ClientProvider yang mem-fetch /api/clients sekali.
//
// SENGAJA BUKAN lewat JWT/sesi NextAuth. Menaruhnya di token memang nol-request,
// tapi token hanya di-refresh saat login/update sehingga nilainya basi setelah
// user mengubah setelan — dan basinya tidak kelihatan, cuma "kok belum berubah".
// Satu fetch per load jauh lebih mudah dinalar daripada token yang kadang benar.

interface PreferencesContextValue {
  preferences: Preferences
  /** false selama fetch pertama — konsumen boleh menunda render kalau perlu. */
  isLoaded: boolean
  /** Simpan ke server. Optimistic: state lokal berubah dulu, dan dikembalikan
   *  ke nilai sebelumnya kalau request gagal, supaya UI tidak berbohong. */
  savePreferences: (next: Preferences) => Promise<void>
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [fetched, setFetched] = useState(false)

  // isLoaded DITURUNKAN, bukan disimpan: untuk sesi yang belum/tidak login tidak
  // ada apa pun yang perlu ditunggu, jadi menuliskannya lewat setState di dalam
  // efek hanya memicu render berantai tanpa menambah informasi.
  //   loading         → false (sesi belum jelas)
  //   unauthenticated → true  (tidak akan ada fetch; default sudah final)
  //   authenticated   → menunggu fetch selesai
  const isLoaded = status === 'authenticated' ? fetched : status !== 'loading'

  useEffect(() => {
    // Hanya fetch kalau memang sudah login. Di /login request ini cuma akan
    // dibalas redirect oleh proxy.
    if (status !== 'authenticated') return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/account/preferences')
        if (res.ok) {
          const data = (await res.json()) as { preferences?: Preferences }
          if (!cancelled && data.preferences) setPreferences(data.preferences)
        }
      } catch {
        // Diam — default sudah dipakai. Preferensi tampilan tidak pernah layak
        // membuat halaman gagal dirender.
      } finally {
        if (!cancelled) setFetched(true)
      }
    })()
    return () => { cancelled = true }
  }, [status])

  const savePreferences = useCallback(async (next: Preferences) => {
    let previous: Preferences = DEFAULT_PREFERENCES
    setPreferences(prev => { previous = prev; return next })
    try {
      const res = await fetch('/api/account/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Gagal menyimpan preferensi.')
      }
    } catch (err) {
      setPreferences(previous) // rollback
      throw err instanceof Error ? err : new Error('Gagal menyimpan preferensi.')
    }
  }, [])

  return (
    <PreferencesContext.Provider value={{ preferences, isLoaded, savePreferences }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}

/**
 * Formatter Rupiah yang SUDAH terikat ke preferensi user — pemakaiannya:
 *   const { rupiah, rupiahShort, rupiahPlain } = useRupiah()
 *
 * Ada di sini, bukan di lib/format.ts, supaya lib/format.ts tetap murni dan
 * bebas React: modul itu bisa diuji langsung dan tidak menyeret context ke
 * mana pun ia di-import. Di sini hanya pengikatannya.
 */
export function useRupiah() {
  const { preferences } = usePreferences()
  const f = preferences.currencyFormat
  return useMemo(
    () => ({
      /** "Rp 1.234.567" — nominal penuh dengan simbol. */
      rupiah: (v: number) => formatRupiah(v, f),
      /** "Rp 1,2M" — ringkas, untuk kartu & sumbu grafik. */
      rupiahShort: (v: number) => formatRupiahShort(v, f),
      /** "1.234.567" — digit saja, tanpa simbol. */
      rupiahPlain: (v: number) => formatRupiahPlain(v, f),
      /** "Rp 0,01" — PERSIS, tanpa pembulatan. Untuk selisih rekonsiliasi. */
      rupiahPersis: (v: string) => formatRupiahPersis(v, f),
    }),
    [f]
  )
}
