# NgitungID BI

Financial Business Intelligence untuk UMKM Indonesia. Tim akunting NgitungID (admin)
mengunggah laporan keuangan klien (PDF), sistem mengekstrak angkanya dengan AI,
memetakannya ke Master COA per klien, lalu menghasilkan Dashboard & Analytics
otomatis.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS v4 · Drizzle ORM ·
PostgreSQL (Neon) · NextAuth v5 · Gemini API.

Roadmap & status ada di [`ROADMAP.md`](ROADMAP.md); panduan kerja untuk Claude Code
ada di [`CLAUDE.md`](CLAUDE.md).

## Setup lokal

1. `pnpm install`
2. Salin `.env.example` → `.env.local`, isi nilainya (lihat komentar tiap variabel).
   - `DATABASE_URL` harus menunjuk ke **branch Neon `dev`** (lihat bagian di bawah).
3. `pnpm dev` → http://localhost:3000

Akun di-provision internal lewat `pnpm db:seed` (admin pertama dari env var) — belum
ada halaman register publik.

## Database environments (dev vs produksi)

> **PENTING — baca sebelum menjalankan perintah `db:*` atau throwaway script apa pun.**

Data berada di [Neon](https://neon.tech) dengan **dua branch**:

| Branch | Untuk | Aturan |
|--------|-------|--------|
| `main` | **PRODUKSI** — data klien nyata | JANGAN dipakai untuk testing, seed, `db:push`, atau throwaway script. Hanya deploy produksi (Vercel) & migrasi skema yang disengaja. |
| `dev`  | Kerja harian, testing, `db:seed:dev`, klien throwaway | Ini yang ditunjuk `DATABASE_URL` di `.env.local` selama development. |

> **Kondisi sekarang (SEBELUM deploy ke Vercel).** Selama app cuma jalan di
> `localhost`, **localhost = branch `dev`** (karena `.env.local` menunjuk ke situ).
> Jadi apa pun yang di-upload/dibuat lewat `localhost` masuk ke **`dev`**, BUKAN
> `main`. Branch `main` untuk sekarang berperan sebagai **snapshot/cadangan** —
> dan akan menjadi produksi begitu app di-deploy ke Vercel nanti (Vercel memakai
> `DATABASE_URL`-nya sendiri yang menunjuk `main`, di-set di dashboard Vercel,
> bukan dari file ini). Konsekuensinya: data klien nyata untuk produksi nanti
> di-input lewat app yang sudah live di Vercel, bukan lewat localhost.

### Kenapa ini penting

`DATABASE_URL` adalah **satu-satunya sakelar**. SEMUA hal membacanya dari `.env.local`:

- app runtime — [`lib/db/index.ts`](lib/db/index.ts)
- semua perintah drizzle-kit (`db:generate` / `db:migrate` / `db:push` / `db:studio`) — via [`drizzle.config.ts`](drizzle.config.ts)
- `db:seed` dan `db:seed:dev` — via `tsx --env-file=.env.local`
- semua throwaway/one-off script `tsx --env-file=.env.local ...`

Tidak ada pemisahan otomatis per-perintah. Yang menentukan aman atau tidaknya sebuah
perintah hanyalah **branch mana yang ditunjuk `DATABASE_URL` saat itu**. Maka:

- Selama development, `.env.local` → **`dev`**. Titik.
- **Jangan pernah** menjalankan ini terhadap `main` (produksi):
  - `pnpm db:seed:dev` — **destruktif**: menghapus reports/COA klien seed
  - `pnpm db:seed` — menulis akun/klien seed
  - `pnpm db:push` — mengubah skema tanpa file migrasi yang di-review
  - throwaway/one-off script apa pun
- Produksi (Vercel) memakai `DATABASE_URL` **sendiri** yang menunjuk **`main`**,
  di-set di dashboard Vercel — BUKAN dari `.env.local`.

### Migrasi skema ke produksi

Iterasi cepat di `dev` boleh pakai `pnpm db:push`. Perubahan skema ke **produksi**
lewat jalur yang di-review:

1. `pnpm db:generate` → buat file SQL migrasi, commit ke git
2. Arahkan `DATABASE_URL` ke branch `main` **secara sadar & sengaja**
3. `pnpm db:migrate` → terapkan migrasi yang sudah di-review
4. Kembalikan `.env.local` ke `dev`

## Backup & restore (branch `main`)

Neon free tier cuma punya window restore **6 jam**. Karena itu ada backup
independen di luar Neon: workflow [`backup.yml`](.github/workflows/backup.yml)
jalan **tiap hari 01:00 WIB**, dan bisa dijalankan kapan saja lewat tombol
**Run workflow** di tab Actions.

Tiap run: `pg_dump` branch `main` → **restore ke Postgres throwaway** →
bandingkan row count sumber vs hasil restore → baru dump-nya diunggah sebagai
artifact. Artinya tiap backup sudah **terbukti** bisa di-restore, bukan cuma
diasumsikan valid. Kalau row count tidak cocok, workflow-nya merah.

- **Yang di-backup:** schema `public` + `drizzle` (data aplikasi + state migrasi).
  Schema `neon_auth` sengaja dikecualikan — itu dikelola Neon, bukan data
  aplikasi (auth kita ada di `public.users`), dan mengikutkannya bikin dump tidak
  portabel ke Postgres biasa.
- **Secret:** `DATABASE_URL_MAIN` — connection string **direct/unpooled** branch
  `main`. `pg_dump` tidak bisa lewat endpoint `-pooler` (PgBouncer), jadi
  workflow-nya sengaja gagal cepat kalau secret-nya masih pooled.
- **Retensi:** artifact disimpan **30 hari** lalu hangus otomatis. DB sekarang
  ~10 MB → dump terkompresi cuma beberapa MB, jauh di bawah kuota artifact
  GitHub Free (500 MB). Kalau data membesar (terutama PDF di
  `financial_reports.source_pdf`), pantau Settings → Billing dan turunkan
  `retention-days` bila perlu.

> GitHub menonaktifkan workflow terjadwal kalau repo tidak ada aktivitas 60 hari.
> Kalau repo sempat lama diam, cek tab Actions dan aktifkan lagi.

### Cara restore (langkah manual)

1. **Ambil dump-nya.** GitHub → tab **Actions** → workflow **Backup DB (branch
   main)** → pilih run tanggal yang diinginkan → panel **Artifacts** → download
   `db-backup-main-<stamp>` (berupa `.zip`).
2. **Unzip** → dapat `ngitungid-main-<stamp>.dump` (format custom `pg_dump`).
3. **Siapkan target.** Bikin **branch/project Neon baru** dulu — JANGAN langsung
   menimpa `main` sebelum hasil restore-nya diperiksa. Salin connection string
   **direct/unpooled** milik target itu.
4. **Pasang PostgreSQL client 18** (Neon jalan di PG18; `pg_restore` harus ≥
   versi server). macOS: `brew install postgresql@18`. Windows: installer EDB.
   Linux: paket `postgresql-client-18` dari repo PGDG.
5. **Restore:**
   ```bash
   pg_restore --dbname="<CONNECTION_STRING_TARGET>" \
     --no-owner --no-privileges --exit-on-error \
     ngitungid-main-<stamp>.dump
   ```
6. **Verifikasi row count-nya:**
   ```bash
   psql "<CONNECTION_STRING_TARGET>" -At -F'|' -f .github/scripts/row-counts.sql
   ```
   Bandingkan dengan output step **"Bandingkan sumber vs hasil restore"** di run
   backup yang dump-nya kamu pakai (angkanya tercetak di log run tersebut).
7. **Arahkan app ke target baru** kalau ini memang recovery sungguhan: update
   `DATABASE_URL` di dashboard Vercel (produksi) dan/atau `.env.local` (lokal).
   Baru setelah yakin, `main` lama boleh diganti/dibuang.

> Format dump-nya **custom** (`-Fc`), jadi bisa restore selektif juga — mis. satu
> tabel saja:
> `pg_restore --dbname="<TARGET>" --table=financial_reports ngitungid-main-<stamp>.dump`

## Scripts

| Perintah | Fungsi |
|----------|--------|
| `pnpm dev` | Dev server |
| `pnpm build` | Build produksi (type-check di-enforce) |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate file migrasi dari perubahan schema |
| `pnpm db:migrate` | Terapkan migrasi (jalur produksi) |
| `pnpm db:push` | Push schema langsung (**dev saja**) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Seed 3 klien + admin pertama (idempotent) |
| `pnpm db:seed:dev` | ⚠️ Fixture dev — **DESTRUKTIF** untuk 3 klien seed |
