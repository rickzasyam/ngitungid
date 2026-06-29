'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'

export function useRequireClient() {
  const { activeClient, isLoaded, role } = useClient()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && role === 'admin' && !activeClient) {
      router.push('/admin-overview')
    }
  }, [isLoaded, role, activeClient, router])

  return { activeClient, isLoaded }
}
