// .env.local di-load via flag `tsx --env-file=.env.local` di package.json
// (db:seed script) — bukan lewat dotenv di sini. import statement selalu
// di-hoist di atas kode biasa, jadi memanggil dotenv.config() di file ini
// tetap kalah cepat dari eager-evaluation `import { db } from './index'`
// di bawah (yang punya guard throw-if-missing sendiri).
import bcrypt from 'bcryptjs'
import { db } from './index'
import { clients, users } from './schema'

// UUID tetap (bukan random) supaya seed idempotent & deterministik — aman
// dijalankan ulang berkali-kali (onConflictDoNothing target id). Sejak Phase
// 2.3 klien ini adalah data asli yang dipakai app; bridge MOCK_CLIENTS di
// lib/client-context.tsx sudah dihapus (klien di-fetch dari GET /api/clients).
const SEED_CLIENTS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Rasyuka', type: 'E-commerce' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Graphicook', type: 'Jasa Kreatif' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'PT Nusantara Group', type: 'Manufaktur' },
]

async function seedClients() {
  await db.insert(clients).values(SEED_CLIENTS).onConflictDoNothing({ target: clients.id })
  console.log(`✓ ${SEED_CLIENTS.length} clients seeded (or already present)`)
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  const name = process.env.SEED_ADMIN_NAME

  if (!email || !password || !name) {
    throw new Error(
      'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME belum diisi di .env.local'
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db
    .insert(users)
    .values({ email, passwordHash, name, role: 'admin', clientId: null })
    .onConflictDoNothing({ target: users.email })

  console.log(`✓ Admin user "${email}" seeded (or already present)`)
}

async function main() {
  await seedClients()
  await seedAdmin()
  console.log('Seed selesai.')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed gagal:', err)
    process.exit(1)
  })

// Untuk nambah user staff/klien lain sementara (sebelum UI Account
// management dibangun): pakai `pnpm db:studio`, hash password dulu via:
//   node -e "console.log(require('bcryptjs').hashSync('password-kamu', 12))"
// lalu paste hasil hash-nya ke kolom password_hash.
