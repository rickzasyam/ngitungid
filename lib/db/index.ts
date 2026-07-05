import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env.local and fill in your Neon connection string')
}

const sql = neon(process.env.DATABASE_URL)

export const db = drizzle(sql, { schema })
