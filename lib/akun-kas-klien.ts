// SATU pintu daftar akun kas/bank klien di BROWSER — tab rekening grid
// /mutasi-kas dan pemilih akun Pindah Buku di Settings memakai fungsi ini,
// bukan fetch sendiri-sendiri.
//
// Aturannya sendiri hidup di server: `GET /api/clients/[id]/coa?kas=1`
// menyaring dengan `resolveIsKas` (lib/coa/account-type.ts — `is_kas`
// eksplisit ATAU turunan nama + Sub Kelompok, D62). Kelak sumbernya pindah ke
// tabel Kas & Bank (modul Data Induk); yang perlu diganti hanya badan fungsi
// ini, pemanggilnya tidak.

import type { AccountType } from '@/lib/coa/account-type'

export type AkunKasKlien = {
  id: string
  kode: string
  nama: string
  kelompok: string
  resolvedType?: AccountType | null
}

/** Akun kas/bank klien, urut kode. Gagal jaringan/HTTP → melempar (pemanggil yang memutuskan tampilannya). */
export async function muatAkunKas(clientId: string): Promise<AkunKasKlien[]> {
  const res = await fetch(`/api/clients/${clientId}/coa?kas=1`)
  const data = (await res.json().catch(() => null)) as { accounts?: AkunKasKlien[]; error?: string } | null
  if (!res.ok) throw new Error(data?.error ?? 'Gagal memuat akun kas/bank.')
  return data?.accounts ?? []
}
