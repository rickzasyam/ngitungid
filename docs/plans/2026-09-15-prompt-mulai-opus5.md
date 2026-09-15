# Prompt awal — sesi Opus 5, Phase 5 (Mesin Akuntansi & Jurnal Manual)

Untuk Ricko: salin semua yang ada **di bawah garis** ke sesi Claude Code baru (model Opus 5) di repo ini.
Ganti `<TOKEN>` dengan token `ngpk_` **baru** dari halaman API keys NgodingPakeAI — dua token lama sudah
lewat transkrip sesi dan sebaiknya dicabut. Prompt ini sengaja tidak mengulang isi plan; ia hanya
memaksa urutan baca, verifikasi lingkungan, dan disiplin berhenti.

---

Kamu agen pelaksana untuk **Phase 5 — Mesin Akuntansi & Jurnal Manual** di repo NgitungID BI (branch
`main`, Next.js 16 + Drizzle/Neon + NextAuth v5). Plan teknisnya sudah disusun dan sebagian disetujui
Ricko; tugasmu **mengeksekusi Fase 1 sesuai plan**, bukan merancang ulang.

## 1. Baca dulu — jangan sentuh kode (urutan wajib)

1. `CLAUDE.md` seluruhnya.
2. `ROADMAP.md` → bagian `## Phase 5 — Mesin Akuntansi & Jurnal Manual` **seluruhnya** (5.0 protokol
   sampai 5.10), lalu blok `### Phase 5` di Current Status, lalu baris-baris `2026-09-15` di tabel
   Decisions & Notes.
3. `docs/plans/2026-09-15-master-plan-mesin-akuntansi-semua-fase.md` (selanjutnya **MP**): §0, §1, §2, §3
   **seluruhnya** (§3.3 R1–R11 mengalahkan §4–§8 bila bertentangan), lalu §4 (Fase 1) penuh, §8.1–8.4
   (skema Fase 1), §8.15, §9, §10, §11, §12. §5–§7 cukup dibaca sekilas — fasenya belum disetujui.
4. `docs/plans/ngodingpakeai-tasks-214.md` (**katalog**): pengantar + tabel F01 (Jurnal Umum) dan F15
   (Master Data Supplier). Ini sumber pemetaan task vendor → langkah MP; kolom "Catatan" mengalahkan judul task.
5. `.ngodingpakeai/summaries.json`: ringkasan 247 berkas. Sebelum membuka berkas sumber, baca ringkasannya.

Setelah selesai membaca, **lapor ≤15 baris**: urutan langkah Fase 1 yang akan kamu jalankan (A1…A9 lalu
B1…B6), checkpoint yang kamu kenali (CP-1…CP-4), keputusan yang mengikat (D0–D10, R4), dan task vendor
pertama yang kamu terima (bagian 2). **Tunggu "lanjut" dari Ricko** sebelum bagian 3.

## 2. Verifikasi lingkungan (boleh sambil membaca; hanya perintah baca/cek)

- `pnpm install --frozen-lockfile` — **pnpm, bukan npm.**
- Baseline: `npx tsc --noEmit -p tsconfig.json` bersih · `npx vitest run` hijau ·
  `node_modules\.bin\eslint .` → **0 error, tepat 24 warning**. Catat angkanya; tidak boleh naik.
- `.env.local`: `DATABASE_URL` harus menunjuk branch Neon **dev** (endpoint `ep-rapid-hat-aos7vlb0`), BUKAN
  `main`/produksi (`ep-small-mode-ao8ouvtp`). Periksa dengan `grep -c "ep-rapid-hat" .env.local` —
  **jangan cetak isi berkasnya.** Bukan dev → berhenti, lapor.
- NgodingPakeAI (izin `Bash(npx --yes ngodingpakeai:*)` sudah ada di `.claude/settings.local.json`):
  `npx --yes ngodingpakeai login --token <TOKEN>` → `npx --yes ngodingpakeai status` →
  `npx --yes ngodingpakeai task next --plan e2cbb3a7-5976-43dd-937a-5bec14f6c35c --json`.
  Tampilkan `ref`, `feature`, `title`, `layer`, `phase` task pertama. **Jangan `task start` dulu.**

## 3. Cara kerja (setelah "lanjut")

- Urutan eksekusi = MP §1: **§4.A (A1→A9) lalu §4.B (B1→B6)**. Engine dulu: skema → modul murni + test
  → route → UI (D0, disetujui). Vendor menyajikan task frontend dulu — itu **tidak** mengubah urutanmu.
  Irisan vendor yang terbuka sekarang = fase 1 / **frontend** (13 task); task lain 423 Locked.
  Task frontend di-`task start` saat langkah UI-nya (A7 / B4) dimulai dan `task complete` saat UI di atas
  data nyata selesai (superset dari "(mock)"). Task backend fase 1 terbuka setelah layer frontend
  selesai → verifikasi (test/route ada dan hijau) → `task complete`. Task
  `…/bangun-halaman-rekonsiliasi-hutang-supplier` → `task fail` dengan alasan di MP B5 (D5).
- Satu langkah MP = satu unit kerja. Setelah tiap langkah: `tsc` / `vitest` / `eslint` (24 warning) ·
  `graphify update .` · **satu baris log faktual** di tabel Decisions & Notes ROADMAP (tanpa kata
  "approved"/"disetujui" atas nama Ricko) · ⏳→✅ di ROADMAP 5.1/5.2.
- Migrasi: `pnpm db:generate` lalu **baca SQL-nya** (enum baru lewat `ALTER TYPE … ADD VALUE` tulis tangan
  bila perlu — preseden migrasi 0003/0007), `pnpm db:migrate` **hanya ke dev**. Migrasi ke main = Ricko.
- **Berhenti** di setiap ⏸ checkpoint MP §10 (CP-1 setelah A2, CP-2 setelah A3, CP-3 setelah A7, CP-4
  setelah B4) dan di checkpoint vendor (`layer` berganti / `phase.current` naik): sebutkan apa yang bisa
  Ricko periksa, tunggu "lanjut".
- Task yang tidak ada di katalog / tidak cocok ke langkah mana pun / meminta hal yang MP §12 nyatakan
  tidak dikerjakan → **berhenti, tanya.** Jangan mengarang langkah.
- Sync NgodingPakeAI hanya **setelah Ricko commit**: `npx --yes ngodingpakeai sync --if-changed --plan`
  (metadata, aman) → tulis ringkasan berkas di `.ngodingpakeai/pending.json` ke `summaries.json`
  (Bahasa Indonesia, 10–2000 karakter, sebut simbol/route/tabel; tanpa kutip kode, rahasia, host DB).
  **Jangan** jalankan `sync` final (tanpa `--plan`) — itu menutup siklus plan; hanya bila Ricko meminta.

## 4. Batasan keras

- **Hanya Ricko yang menyetujui.** Jangan menarasikan persetujuan; laporkan fakta.
- Jangan `git commit` / `push` tanpa diminta; tanyakan kadens commit di CP-1. Pesan commit Bahasa
  Indonesia, gaya `feat(jurnal): …` / `feat(supplier): …`.
- Jangan sentuh `lib/auth.ts`, `proxy.ts`, `app/login/page.tsx`, `lib/login-rate-limit*.ts`,
  `app/api/account/password/route.ts`. Sesi tidak memuat `user.id` — `created_by` lewat lookup email (D6).
- Jangan hapus/rombak komponen di luar cakupan langkah tanpa konfirmasi.
- Tidak ada `db:push`, seed, atau skrip sekali pakai ke main. Tidak ada tabel snapshot/saldo; satu
  agregator: `lib/financial-agg.ts` (P4, P5).
- Uang = string `numeric(18,2)`, penjumlahan dalam sen bulat; tanggal = string `YYYY-MM-DD` ujung ke
  ujung, tak pernah `new Date(string)` (P1, P2). Status diturunkan, bukan disimpan (P3).
- Warna hanya token `app/globals.css`; `#c0ff33` / `#1a1a1a` / `#a78bfa` dilarang; pola kedalaman tiga
  lapis di halaman baru; a11y wajib (CLAUDE.md gotcha 3–5); `@keyframes` di level atas `globals.css`.
- Jangan bangun ulang fitur F09–F14 (autentikasi, klien, PDF, pemetaan COA, dashboard, master data) —
  sudah ada; task-nya di fase 4 vendor dan terkunci.

Mulai dari bagian 1.
