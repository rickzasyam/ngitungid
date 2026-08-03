'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { isOwner as roleIsOwner, isStaff as roleIsStaff, type Role } from '@/lib/roles'

export interface ClientInfo {
  id: string
  name: string
  type: string
  hasLogo: boolean
  // ISO string dari clients.updatedAt — dipakai sebagai cache-buster URL logo.
  updatedAt: string
  /** Bulan yang punya laporan + berapa jenis (maks 3) — bahan indikator progres
   *  di kartu sidebar. Ikut dalam response GET /api/clients yang sudah di-fetch
   *  sekali oleh provider ini, jadi tidak ada request tambahan. */
  months: { m: string; types: number }[]
}

const STORAGE_KEY = 'ngitungid-active-client-id'

interface ClientContextValue {
  clients: ClientInfo[]
  activeClient: ClientInfo | null
  setActiveClient: (client: ClientInfo | null) => void
  refreshClients: () => Promise<ClientInfo[]>
  isLoaded: boolean
  role: Role
  /** Staf internal (owner ATAU akunting) — boleh switch klien & kelola data. */
  isStaff: boolean
  /** Owner saja — boleh buat akun & assign akunting ke klien. */
  isOwner: boolean
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined)

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [activeClient, setActiveClientState] = useState<ClientInfo | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Default 'user' (paling sempit) kalau sesi belum ke-resolve — jangan pernah
  // menganggap staf sebelum terbukti.
  const role: Role = session?.user?.role ?? 'user'
  const isStaff = roleIsStaff(role)
  const isOwner = roleIsOwner(role)
  const userClientId = session?.user?.clientId ?? null

  const fetchClients = useCallback(async (): Promise<ClientInfo[]> => {
    try {
      const res = await fetch('/api/clients')
      if (!res.ok) return []
      return (await res.json()) as ClientInfo[]
    } catch {
      return []
    }
  }, [])

  // Load awal: tunggu sesi → fetch daftar klien → resolve activeClient → BARU
  // set isLoaded=true. Urutan ini penting: useRequireClient mem-bounce admin ke
  // /admin-overview saat (isLoaded && !activeClient). Kalau isLoaded true sebelum
  // activeClient ke-resolve dari localStorage, admin ke-redirect keliru.
  useEffect(() => {
    if (status === 'loading') return
    let cancelled = false

    void (async () => {
      const list = await fetchClients()
      if (cancelled) return
      setClients(list)

      if (role === 'user') {
        setActiveClientState(list.find(c => c.id === userClientId) ?? null)
      } else {
        const storedId = localStorage.getItem(STORAGE_KEY)
        setActiveClientState(storedId ? (list.find(c => c.id === storedId) ?? null) : null)
      }
      setIsLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [status, role, userClientId, fetchClients])

  const setActiveClient = useCallback(
    (client: ClientInfo | null) => {
      setActiveClientState(client)
      if (isStaff) {
        if (client) localStorage.setItem(STORAGE_KEY, client.id)
        else localStorage.removeItem(STORAGE_KEY)
      }
    },
    [isStaff]
  )

  // Dipanggil setelah bikin klien baru. Refresh daftar tanpa mengganggu
  // activeClient (pakai versi terbaru objek klien kalau masih ada).
  const refreshClients = useCallback(async (): Promise<ClientInfo[]> => {
    const list = await fetchClients()
    setClients(list)
    setActiveClientState(prev => (prev ? (list.find(c => c.id === prev.id) ?? prev) : prev))
    return list
  }, [fetchClients])

  return (
    <ClientContext.Provider
      value={{ clients, activeClient, setActiveClient, refreshClients, isLoaded, role, isStaff, isOwner }}
    >
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useClient must be used within ClientProvider')
  return ctx
}
