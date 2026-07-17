import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/roles'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string') return null

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user) return null

        const passwordMatches = await bcrypt.compare(password, user.passwordHash)
        if (!passwordMatches) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clientId: user.clientId,
        }
      },
    }),
  ],
  callbacks: {
    // NextAuth cuma bawa id/name/email/image ke token secara default —
    // role & clientId harus disalin manual di sini saat sign-in pertama.
    jwt: ({ token, user }) => {
      if (user) {
        token.role = user.role
        token.clientId = user.clientId
      }
      return token
    },
    session: ({ session, token }) => {
      // Ambient augmentation untuk JWT (@auth/core/jwt) tidak ke-merge
      // karena package itu nested di pnpm virtual store, bukan top-level —
      // cast eksplisit di sini lebih robust daripada bergantung ke situ.
      session.user.role = token.role as Role
      session.user.clientId = token.clientId as string | null
      return session
    },
    // Dipakai proxy.ts (export { auth as proxy }) — tanpa ini, auth cuma
    // menempel req.auth tanpa pernah redirect siapapun ke /login. Return
    // false otomatis redirect ke pages.signIn dengan ?callbackUrl= terisi.
    authorized: ({ auth }) => !!auth,
  },
})
