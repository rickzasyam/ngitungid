'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  isOwner as roleIsOwner, isInternal as roleIsInternal, canDoAccounting as roleCanDoAccounting,
  type Role,
} from '@/lib/roles'
import { parseRecent, pruneRecent, pushRecent } from '@/lib/client-switcher'

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
const RECENT_STORAGE_KEY = 'ngitungid-recent-client-ids'

interface ClientContextValue {
  clients: ClientInfo[]
  activeClient: ClientInfo | null
  setActiveClient: (client: ClientInfo | null) => void
  refreshClients: () => Promise<ClientInfo[]>
  /**
   * Id klien yang terakhir dibuka, terbaru di depan — bahan pintasan di modal
   * pemilih klien.
   *
   * Disimpan di localStorage dengan pola yang sama persis dengan
   * `ngitungid-active-client-id` di file ini — bertahan melewati reload, tapi
   * TERIKAT SATU PERANGKAT & SATU BROWSER. Kalau kelak riwayat ini perlu
   * mengikuti seseorang antar perangkat, tempatnya kolom di `users`; itu
   * belum sepadan dengan sebuah migrasi untuk daftar pintasan.
   *
   * Dibaca DEFENSIF (lihat parseRecent): isi localStorage adalah input tak
   * terpercaya, dan satu JSON.parse yang melempar di sini akan mematikan
   * seluruh app saat provider ini render.
   */
  recentClientIds: string[]
  isLoaded: boolean
  role: Role
  /** Orang dalam NgitungID — boleh pindah klien, lihat kartu workspace. */
  isInternal: boolean
  /** Boleh mengerjakan pekerjaan akunting (upload/review/mapping/Master COA). */
  canDoAccounting: boolean
  /** Owner saja — boleh buat akun & assign akunting ke klien. */
  isOwner: boolean
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined)

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [activeClient, setActiveClientState] = useState<ClientInfo | null>(null)
  const [recentClientIds, setRecentClientIds] = useState<string[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Default 'user' (paling sempit) kalau sesi belum ke-resolve — jangan pernah
  // menganggap staf sebelum terbukti.
  const role: Role = session?.user?.role ?? 'user'
  const isInternal = roleIsInternal(role)
  const canDoAccounting = roleCanDoAccounting(role)
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

      // Riwayat pintasan dibaca DI SINI, di tempat yang sama dengan klien
      // aktif — dan DIPANGKAS terhadap daftar yang barusan di-fetch, supaya
      // klien yang sudah dihapus tidak pernah jadi baris mati di modal dan
      // tidak memakan slot pintasan selamanya.
      setRecentClientIds(pruneRecent(parseRecent(localStorage.getItem(RECENT_STORAGE_KEY)), list))

      setIsLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [status, role, userClientId, fetchClients])

  // Riwayat "terakhir dibuka" dicatat DI SINI, bukan di sidebar, karena SETIAP
  // perpindahan klien lewat setActiveClient — termasuk dari kartu Admin
  // Overview. Kalau dicatat di komponen switcher-nya saja, klien yang dipilih
  // dari Admin Overview tidak akan pernah muncul di pintasan.
  const setActiveClient = useCallback(
    (client: ClientInfo | null) => {
      setActiveClientState(client)
      if (client) setRecentClientIds(prev => pushRecent(prev, client.id))
      if (isInternal) {
        if (client) localStorage.setItem(STORAGE_KEY, client.id)
        else localStorage.removeItem(STORAGE_KEY)
      }
    },
    [isInternal]
  )

  // Tulis balik riwayat ke localStorage setiap kali ia berubah.
  //
  // DIGERBANGI isLoaded, dan itu bukan kehati-hatian berlebihan: efek ini juga
  // jalan pada mount pertama, saat state-nya masih [] sementara efek pemuatan
  // di atas BELUM selesai membaca storage (ia async). Tanpa gerbang ini, mount
  // pertama menimpa storage dengan array kosong sebelum sempat dibaca —
  // riwayatnya akan hilang di SETIAP reload, yang persis meniadakan fiturnya.
  //
  // Menulis dari STATE (yang sudah dipangkas saat dibaca), bukan dari isi
  // storage lama, jadi id klien yang sudah dihapus tidak pernah masuk kembali.
  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentClientIds))
    } catch {
      // Kuota penuh / mode privat: pintasan boleh gagal diam-diam — ia
      // kenyamanan, bukan data.
    }
  }, [recentClientIds, isLoaded])

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
      value={{ clients, activeClient, setActiveClient, refreshClients, recentClientIds, isLoaded, role, isInternal, canDoAccounting, isOwner }}
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
