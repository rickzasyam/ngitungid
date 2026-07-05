'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'

export interface ClientInfo {
  id: string
  name: string
  type: string
}

const STORAGE_KEY = 'ngitungid-active-client-id'

interface ClientContextValue {
  clients: ClientInfo[]
  activeClient: ClientInfo | null
  setActiveClient: (client: ClientInfo | null) => void
  refreshClients: () => Promise<ClientInfo[]>
  isLoaded: boolean
  role: 'admin' | 'user'
  storageMap: Record<string, number>
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined)

// "storage used" masih placeholder (nilai asli: Phase 2.6). Deterministik dari
// id supaya bar di sidebar tetap bervariasi antar klien & stabil antar render,
// bukan angka acak.
function pseudoStorage(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return 25 + (h % 65) // 25..89
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [activeClient, setActiveClientState] = useState<ClientInfo | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const role: 'admin' | 'user' = session?.user?.role ?? 'user'
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
      if (role === 'admin') {
        if (client) localStorage.setItem(STORAGE_KEY, client.id)
        else localStorage.removeItem(STORAGE_KEY)
      }
    },
    [role]
  )

  // Dipanggil setelah bikin klien baru. Refresh daftar tanpa mengganggu
  // activeClient (pakai versi terbaru objek klien kalau masih ada).
  const refreshClients = useCallback(async (): Promise<ClientInfo[]> => {
    const list = await fetchClients()
    setClients(list)
    setActiveClientState(prev => (prev ? (list.find(c => c.id === prev.id) ?? prev) : prev))
    return list
  }, [fetchClients])

  const storageMap = useMemo(
    () => Object.fromEntries(clients.map(c => [c.id, pseudoStorage(c.id)])),
    [clients]
  )

  return (
    <ClientContext.Provider
      value={{ clients, activeClient, setActiveClient, refreshClients, isLoaded, role, storageMap }}
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
