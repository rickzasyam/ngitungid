'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'

export function useRequireClient() {
  const { activeClient, isLoaded, isInternal } = useClient()
  const router = useRouter()

  useEffect(() => {
    // Orang dalam tanpa klien aktif → Admin Overview untuk memilih. Pakai
    // isInternal (bukan canDoAccounting): memilih klien bukan pekerjaan akunting.
    // Role 'user' dipin ke kliennya sendiri, jadi tidak pernah dibounce ke sini.
    if (isLoaded && isInternal && !activeClient) {
      router.push('/admin-overview')
    }
  }, [isLoaded, isInternal, activeClient, router])

  return { activeClient, isLoaded }
}
