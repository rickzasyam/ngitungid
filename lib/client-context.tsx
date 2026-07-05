'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

export interface ClientInfo {
  id: string
  name: string
  type: string
}

// TODO(2.3): ganti seluruh MOCK_CLIENTS ini dengan fetch GET /api/clients.
// Sengaja belum diganti di Phase 2.2 (Authentication) — role & clientId
// sekarang sudah asli dari session, tapi daftar+detail klien masih mock.
export const MOCK_CLIENTS: ClientInfo[] = [
  { id: 'client-1', name: 'Rasyuka', type: 'E-commerce' },
  { id: 'client-2', name: 'Graphicook', type: 'Jasa Kreatif' },
  { id: 'client-3', name: 'PT Nusantara Group', type: 'Manufaktur' },
]

// Jembatan sementara: users.clientId di database asli (UUID tetap, lihat
// lib/db/seed.ts) -> id mock 'client-N' di atas. Hilang begitu 2.3 selesai.
const SEED_CLIENT_UUID_TO_MOCK_ID: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': 'client-1',
  '22222222-2222-2222-2222-222222222222': 'client-2',
  '33333333-3333-3333-3333-333333333333': 'client-3',
}

const STORAGE_KEY = 'ngitungid-active-client-id'

interface ClientContextValue {
  activeClient: ClientInfo | null
  setActiveClient: (client: ClientInfo | null) => void
  isLoaded: boolean
  role: 'admin' | 'user'
  storageMap: Record<string, number>
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined)

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [activeClient, setActiveClientState] = useState<ClientInfo | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const role: 'admin' | 'user' = session?.user?.role ?? 'user'

  const storageMap: Record<string, number> = {
    'client-1': 67,
    'client-2': 34,
    'client-3': 89,
  }

  useEffect(() => {
    if (status === 'loading') return

    if (role === 'user') {
      const mockId = session?.user?.clientId
        ? SEED_CLIENT_UUID_TO_MOCK_ID[session.user.clientId]
        : undefined
      setActiveClientState(MOCK_CLIENTS.find(c => c.id === mockId) ?? null)
      setIsLoaded(true)
      return
    }

    const storedId = localStorage.getItem(STORAGE_KEY)
    if (storedId) {
      const found = MOCK_CLIENTS.find(c => c.id === storedId)
      if (found) setActiveClientState(found)
    }
    setIsLoaded(true)
  }, [status, role, session?.user?.clientId])

  const setActiveClient = useCallback((client: ClientInfo | null) => {
    setActiveClientState(client)
    if (role === 'admin') {
      if (client) {
        localStorage.setItem(STORAGE_KEY, client.id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [role])

  return (
    <ClientContext.Provider value={{ activeClient, setActiveClient, isLoaded, role, storageMap }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useClient must be used within ClientProvider')
  return ctx
}
