// Promosikan akun admin pertama (SEED_ADMIN_EMAIL) menjadi 'owner'.
// Jalankan: pnpm db:promote-owner   (baca .env.local, jadi ikut DATABASE_URL)
//
// KENAPA script terpisah, bukan bagian migrasi 0003?
//   Postgres melarang MEMAKAI nilai enum yang baru di-ADD di transaksi yang
//   sama. Migrasi 0003 menambahkan 'owner', jadi UPDATE ... SET role='owner'
//   harus di transaksi lain.
//
// KENAPA bukan lewat db:seed?
//   seedAdmin() pakai onConflictDoNothing(target: email) → akun yang SUDAH ADA
//   dilewati diam-diam, jadi ia tidak akan pernah mempromosikan siapa pun.
//   Lagipula db:seed ikut memasukkan 3 klien demo, sehingga terlarang dijalankan
//   terhadap branch main (produksi).
//
// Script ini AMAN dijalankan terhadap main secara sengaja: idempoten, tidak
// menghapus apa pun, dan hanya menyentuh SATU akun yang emailnya sudah diketahui.
//
// Dibungkus main() (bukan top-level await) mengikuti pola lib/db/seed.ts:
// package.json tidak punya "type": "module", jadi file .ts dijalankan sebagai
// CJS oleh tsx dan top-level await bikin TransformError.
import { eq } from 'drizzle-orm'
import { db } from './index'
import { users } from './schema'

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL belum diisi di .env.local — tidak tahu akun mana yang dipromosikan.')
  }

  const [before] = await db
    .select({ email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!before) {
    throw new Error(
      `Akun "${email}" tidak ada di database yang ditunjuk DATABASE_URL. ` +
        'Pastikan .env.local menunjuk branch yang benar.'
    )
  }

  console.log(`Sebelum : ${before.email} → role="${before.role}"`)

  if (before.role === 'owner') {
    console.log('Sudah owner — tidak ada yang diubah (idempoten).')
    return
  }

  await db.update(users).set({ role: 'owner', updatedAt: new Date() }).where(eq(users.email, email))

  // Baca ULANG dari DB — jangan percaya update-nya berhasil begitu saja.
  const [after] = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  console.log(`Sesudah : ${after.email} → role="${after.role}"`)
  if (after.role !== 'owner') throw new Error('GAGAL: role tidak berubah menjadi owner.')
  console.log('✅ Promosi berhasil & terverifikasi ulang dari database.')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Promote owner gagal:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
