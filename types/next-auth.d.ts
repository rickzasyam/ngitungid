import type { DefaultSession } from 'next-auth'

// Harus sinkron dengan userRoleEnum di lib/db/schema.ts.
// owner > akunting > user (owner mewarisi semua kemampuan akunting).
type Role = 'owner' | 'akunting' | 'user' | 'finance'

declare module 'next-auth' {
  interface User {
    role: Role
    clientId: string | null
  }

  interface Session {
    user: DefaultSession['user'] & {
      role: Role
      clientId: string | null
    }
  }
}

// Catatan: augmentasi 'next-auth/jwt' atau '@auth/core/jwt' TIDAK di-merge di
// project ini karena @auth/core ada di pnpm virtual store (nested, bukan
// top-level dependency) — lib/auth.ts pakai type assertion eksplisit
// di callback session() sebagai gantinya, bukan bergantung ke sini.
