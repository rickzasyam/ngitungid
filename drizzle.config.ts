import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// dotenv/config default-nya cuma baca ".env" — ".env.local" adalah
// konvensi Next.js, harus di-load eksplisit di sini.
config({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env.local and fill in your Neon connection string')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
