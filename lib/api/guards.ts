import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

// Helper auth untuk route handler. Pola pemakaian:
//   const g = await requireAdmin()
//   if ('error' in g) return g.error
//   const user = g.user   // <- terjamin ada & role admin
// Return union (bukan throw) supaya handler tetap eksplisit soal status code.

type Guarded = { user: Session['user']; error?: never } | { error: NextResponse; user?: never }

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

/** Butuh sesi login apa pun (admin atau user). */
export async function requireUser(): Promise<Guarded> {
  const session = await auth()
  if (!session?.user) return { error: unauthorized() }
  return { user: session.user }
}

/** Butuh sesi login DAN role 'admin'. */
export async function requireAdmin(): Promise<Guarded> {
  const session = await auth()
  if (!session?.user) return { error: unauthorized() }
  if (session.user.role !== 'admin') return { error: forbidden() }
  return { user: session.user }
}
