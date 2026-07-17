'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'

export function useRequireClient() {
  const { activeClient, isLoaded, isStaff } = useClient()
  const router = useRouter()

  useEffect(() => {
    // Staf (owner/akunting) tanpa klien aktif → Admin Overview untuk memilih.
    // Role 'user' dipin ke kliennya sendiri, jadi tidak pernah dibounce ke sini.
    if (isLoaded && isStaff && !activeClient) {
      router.push('/admin-overview')
    }
  }, [isLoaded, isStaff, activeClient, router])

  return { activeClient, isLoaded }
}
