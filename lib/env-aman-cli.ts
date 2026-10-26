import { readFileSync } from 'node:fs'
import { ringkasEnv } from './env-aman'

// `pnpm env:cek [berkas]` — bawaan .env.local. Berkasnya dibaca sebagai teks,
// tidak dimuat ke process.env.
for (const baris of ringkasEnv(readFileSync(process.argv[2] ?? '.env.local', 'utf8'))) console.log(baris)
