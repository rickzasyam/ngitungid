import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { cekEnvMain, ringkasEnv } from './env-aman'

// `pnpm env:cek [berkas]` — bawaan .env.local. Berkasnya dibaca sebagai teks,
// tidak dimuat ke process.env.
//
// `pnpm env:cek .env.main` — mode PRODUKSI: hanya endpoint, dan keluar dengan
// kode 1 bila bukan main. `pnpm db:migrate:main` memanggilnya lebih dulu.
const berkas = process.argv[2] ?? '.env.local'
if (!existsSync(berkas)) {
  console.error(`${berkas} tidak ada.${basename(berkas) === '.env.main' ? ' Ricko yang mengisinya.' : ''}`)
  process.exit(1)
}
const teks = readFileSync(berkas, 'utf8')
if (basename(berkas) === '.env.main') {
  const { ok, pesan } = cekEnvMain(teks)
  console.log(pesan)
  if (!ok) process.exit(1)
} else {
  for (const baris of ringkasEnv(teks)) console.log(baris)
}
