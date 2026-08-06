import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import { isOwner, canDoAccounting } from '@/lib/roles'

// Helper auth untuk route handler. Pola pemakaian:
//   const g = await requireAkunting()
//   if ('error' in g) return g.error
//   const user = g.user   // <- terjamin ada & role-nya cukup
// Return union (bukan throw) supaya handler tetap eksplisit soal status code.
//
// Hirarki role (lihat userRoleEnum di lib/db/schema.ts):
//   owner    ⊃ akunting ⊃ (baca saja)
//   owner    : + buat akun, + assign akunting ke klien
//   akunting : upload/review/mapping/kelola klien, semua klien
//   user     : klien, read-only
// Owner SENGAJA mewarisi semua kemampuan akunting — jadi requireAkunting
// meloloskan owner juga. Kalau tidak, owner malah tidak bisa mengerjakan
// pekerjaan sehari-hari.

type Guarded = { user: Session['user']; error?: never } | { error: NextResponse; user?: never }

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

/** Butuh sesi login apa pun (owner / akunting / user). */
export async function requireUser(): Promise<Guarded> {
  const session = await auth()
  if (!session?.user) return { error: unauthorized() }
  return { user: session.user }
}

/**
 * Butuh role 'akunting' ATAU 'owner'. Ini adalah surface kerja harian
 * (upload, ekstraksi, mapping, kelola klien) — dulu bernama requireAdmin.
 */
export async function requireAkunting(): Promise<Guarded> {
  const session = await auth()
  if (!session?.user) return { error: unauthorized() }
  if (!canDoAccounting(session.user.role)) return { error: forbidden() }
  return { user: session.user }
}

/**
 * Butuh role 'owner' SAJA. Dipakai untuk kemampuan tingkat tertinggi yang
 * TIDAK boleh dimiliki akunting: membuat akun baru & assign akunting ke klien.
 */
export async function requireOwner(): Promise<Guarded> {
  const session = await auth()
  if (!session?.user) return { error: unauthorized() }
  if (!isOwner(session.user.role)) return { error: forbidden() }
  return { user: session.user }
}
