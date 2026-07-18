import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/roles'
import { isPathAllowedForRole, USER_HOME } from '@/lib/route-access'
import { isLoginLocked, recordFailedLogin, clearLoginAttempts } from '@/lib/login-rate-limit-store'

// IP klien best-effort untuk log/Sentry. Di Vercel x-forwarded-for berisi
// rantai proxy; entri pertama = IP asli klien. IP TIDAK dipakai sebagai kunci
// lockout (email yang jadi kunci) — hanya informatif.
function clientIp(request: Request | undefined): string | null {
  if (!request) return null
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string') return null

        const ip = clientIp(request as Request | undefined)

        // Rate limit: kalau email ini sedang terkunci, tolak TANPA cek password
        // dan TANPA menambah hitungan — biar percobaan berulang saat terkunci
        // tidak memperpanjang lock. Semua jalur gagal (terkunci / email tak ada
        // / password salah) mengembalikan null → NextAuth memancarkan error
        // 'CredentialsSignin' yang sama → UI menampilkan satu pesan generik.
        // Tidak ada cara membedakan kasusnya dari sisi klien (anti enumeration).
        if (await isLoginLocked(email)) return null

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user) {
          await recordFailedLogin(email, ip)
          return null
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash)
        if (!passwordMatches) {
          await recordFailedLogin(email, ip)
          return null
        }

        // Sukses → reset counter untuk email ini.
        await clearLoginAttempts(email)

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
    // Dipakai proxy.ts (export { auth as proxy }) — INI lapisan route protection
    // yang jalan di middleware SEBELUM page render (tidak ada flash konten).
    // next-auth memanggil callback ini di handleAuth dan menghormati Response
    // yang dikembalikan (redirect) — lihat node_modules/next-auth/lib/index.js.
    authorized: ({ request, auth }) => {
      // Belum login → false: handleAuth otomatis redirect ke pages.signIn
      // dengan ?callbackUrl= terisi (perilaku lama, tidak berubah).
      if (!auth?.user) return false
      // Role 'user' (klien) = read-only Dashboard + Analytics. Blokir akses ke
      // surface kerja staf DI LAPISAN PROXY (bukan cuma sembunyikan menu di UI).
      // owner & akunting selalu lolos.
      if (!isPathAllowedForRole(auth.user.role as Role, request.nextUrl.pathname)) {
        return NextResponse.redirect(new URL(USER_HOME, request.nextUrl))
      }
      return true
    },
  },
})
