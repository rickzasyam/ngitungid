'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface ClientInfo {
  id: string
  name: string
  type: string
}

export const MOCK_CLIENTS: ClientInfo[] = [
  { id: 'client-1', name: 'Rasyuka', type: 'E-commerce' },
  { id: 'client-2', name: 'Graphicook', type: 'Jasa Kreatif' },
  { id: 'client-3', name: 'PT Nusantara Group', type: 'Manufaktur' },
]

export const MOCK_ROLE: 'admin' | 'user' = 'admin'
export const MOCK_USER_CLIENT: ClientInfo = { id: 'client-1', name: 'Rasyuka', type: 'E-commerce' }

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
  const [activeClient, setActiveClientState] = useState<ClientInfo | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const storageMap: Record<string, number> = {
    'client-1': 67,
    'client-2': 34,
    'client-3': 89,
  }

  useEffect(() => {
    if (MOCK_ROLE === 'user') {
      setActiveClientState(MOCK_USER_CLIENT)
      setIsLoaded(true)
      return
    }
    const storedId = localStorage.getItem(STORAGE_KEY)
    if (storedId) {
      const found = MOCK_CLIENTS.find(c => c.id === storedId)
      if (found) setActiveClientState(found)
    }
    setIsLoaded(true)
  }, [])

  const setActiveClient = useCallback((client: ClientInfo | null) => {
    setActiveClientState(client)
    if (MOCK_ROLE === 'admin') {
      if (client) {
        localStorage.setItem(STORAGE_KEY, client.id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  return (
    <ClientContext.Provider value={{ activeClient, setActiveClient, isLoaded, role: MOCK_ROLE, storageMap }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useClient must be used within ClientProvider')
  return ctx
}
