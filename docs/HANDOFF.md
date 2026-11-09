# Serah terima — satu sesi (diperbarui 2026-11-04)

Sejak 2026-11-04 sesi **Stream B** (ekstraksi PDF rekening koran) berhenti permanen. **Satu sesi memegang semua
pekerjaan, satu per satu.** Dokumen ini menggantikan versi 2026-10-27 untuk dua stream paralel. Baca juga, sebelum
menulis apa pun: `CLAUDE.md` (aturan proyek, gotcha, aturan rahasia), `ROADMAP.md` (sumber kebenaran status), dan master
plan `docs/plans/2026-09-15-master-plan-mesin-akuntansi-semua-fase.md` **§5.G** (rancangan rinci Modul A & B).

## 1. Status proyek

**Di produksi** (`ngid.vercel.app`, Neon main **21 migrasi**, `main` = rilis terakhir):
- Phase 1–3 (frontend, backend, AI laporan) dan Kontrak.
- **Phase 5 Fase 1 + Fase 2** — jurnal manual & posting, buku besar, Master COA bertipe, supplier, pembelian,
  mutasi kas/bank + alokasi ke invoice, monitoring hutang & rekonsiliasi. Dirilis 2026-10-23.
- **Kunci Periode** (§5.9, D17/D26). Dirilis 2026-10-27.
- Sudah di `main` tanpa rilis tersendiri: PR #3 (riwayat supplier), PR #5 (a11y `date-range-picker`), PR #6
  (`components/date-picker.tsx` satu tanggal + `components/kalender-panel.tsx` bersama).

**Pull request terbuka:**

| PR | Branch | Isi | Keadaan |
|---|---|---|---|
| #1 | `feat/grid-mutasi` | §5.G Modul A, S0–S9 + S11, masukan uji grid (D63–D66), kolom Ref (D64), sel Tanggal memakai `DatePicker` | Draft · CP-20 diuji klik agen 2026-11-07 (1–16 lolos; NVDA perlu Ricko) · S11 ✅ · migrasi **0021 + 0022** hanya di dev · **menunggu rilis Ricko** |
| #2 | `feat/pdf-rekening-koran` | §5.G Modul B, X1–X4 + harness uji banding sintetis | Draft · aturan cakupan penjaga (a–c) disetujui Ricko 2026-11-04 · langkah 6 (Unggah PDF ke grid) menunggu PR #1 di `main` |

**Keputusan penting** (tabel lengkap di ROADMAP §5.12; alasan di MP §3.6):

| # | Isi singkat |
|---|---|
| D17 / D26 | `period_locks`; kunci = akunting, buka = owner + alasan — **dirilis** |
| D46 | Library grid `react-data-grid` 7.0.0-beta.63 (MIT) dipin persis |
| D47 | Wizard CSV dilebur jadi pintu masuk berkas ke grid; `POST …/import` dihapus |
| D48 | Satu jalur tulis `POST /api/cash-mutations/batch` + `rencanakanSimpanMutasi` |
| D49 | Migrasi **0021**, seluruhnya tambah (urutan, catatan, akun Pindah Buku, `cash_mutation_rules`) |
| D50 | Saldo putus menahan Simpan; jalan keluar = kosongkan sel Saldo (terlihat & tercatat) |
| D51 | Draf: peringatan sebelum pergi + cadangan IndexedDB per (klien, akun kas) |
| D52 | Satu Simpan = satu akun-bulan: 10.000 baru · 2.000 ubah · 2.000 hapus |
| D54 | Penyedia AI ekstraksi dipilih dari uji banding X6 (rekening koran nyata, sesudah X0); wajib berbayar, tanpa pelatihan |
| D56 | PDF rekening koran tidak disimpan; teks diekstrak di browser |
| D57–D62 | Aturan akun lawan · jurnal ringkasan harian · Pindah Buku · tanggal wajib · jangkar saldo · Class CF |
| D63–D66 | Kolom & label grid (Debet = masuk) · Ref + Catatan (Ref = `cash_mutations.ref`, 0022) · Konfirmasi diabaikan · aturan tanggal grid |

**Aturan rahasia** — `CLAUDE.md` § "Rahasia & kredensial" berlaku penuh. Rahasia **produksi** tidak pernah tampil di
percakapan; migrasi ke main hanya lewat `.env.main` + `pnpm db:migrate:main` dalam proses rilis Ricko.

**Fitur AI & aturan data**
- Fitur AI lama: sakelar `aiFeaturesEnabled(fitur)` (`lib/ai-features.ts`), env `AI_FEATURES_ENABLED`.
- Ekstraksi rekening koran (PR #2) punya **sakelar sendiri** `AI_EKSTRAKSI_REKENING_KORAN`, bawaan **mati** —
  `AI_FEATURES_ENABLED="true"` saja tidak menyalakannya (keputusan Ricko langkah 5 Stream B). Peringatan lama
  "kunci fitur baru langsung menyala di Production" tidak berlaku lagi.
- **Data klien nyata hanya diproses AI di Production** (kunci berbayar). Dev dan Preview memakai kunci free tier —
  **hanya data karangan**. Di dev, fitur AI hanya dipakai pada klien dummy **"PT Uji Coba"**.
- **Modul B sebelum gerbang X0: hanya PDF SINTETIS**, juga di dev.

**Sync NgodingPakeAI dilewati** — langganan workspace tidak aktif (2026-10-26). Jangan menjalankan langkah sync vendor
sampai Ricko mengaktifkannya lagi.

## 2. Cara kerja satu sesi

- **Pembagian kepemilikan berkas Stream A / Stream B tidak berlaku lagi.** Sesi ini boleh mengubah berkas mana pun yang
  dibutuhkan tugasnya — termasuk `lib/db/schema.ts`, migrasi (dev saja), `ROADMAP.md`, MP, dan `CLAUDE.md` — dengan
  aturan `CLAUDE.md` tetap berlaku. Usulan perubahan dokumen tidak perlu lagi dititipkan lewat deskripsi PR.
- **Tetap hanya atas persetujuan Ricko:** `lib/mutasi-kas/kontrak-baris-mentah.ts` (kontrak PDF → grid).
- **Branch yang sudah punya PR tidak di-rebase lagi** (keputusan Ricko 2026-11-04). Untuk mengikuti `main`:
  `git merge origin/main`, lalu push biasa — **tanpa force**. Konflik `pnpm-lock.yaml`: jangan digabung manual,
  jalankan `pnpm install`.
- **Bekerja di branch lain:** pakai `git worktree` di luar folder kerja (`CLAUDE.md` gotcha #10 — jangan pindah branch di
  folder yang dev server-nya jalan). Worktree di folder Temp tidak bisa menjalankan dev server; untuk menjalankan
  aplikasi, kerjakan di folder kerja utama atau minta Ricko mematikan dev server-nya dulu.
- Tidak ada yang push atau merge ke `main` kecuali Ricko lewat proses rilis (**main = produksi**).
- Data uji diberi awalan: grid `UJI-A-`, PDF `UJI-B-`. Dibersihkan sesudah uji klik, kecuali yang sengaja ditinggal
  untuk uji Ricko (disebut di checklist-nya).
- Log progres tetap per area: `docs/progress/stream-a-grid.md` (grid, di PR #1) dan `docs/progress/stream-b-pdf.md`
  (PDF, di PR #2).

**Kadens kerja:** satu langkah = gerbang hijau (`tsc --noEmit`, `vitest run`, `eslint .` tanpa error baru, `pnpm build`
+ cek keyframes bila UI berubah) + sabotase yang membuktikan test-nya menjaga + uji klik dev bila menyentuh UI + satu
commit + satu baris log progres. Berhenti di setiap ⏸ CP dan tunggu Ricko — memilih di antara opsi bukan berarti boleh
lanjut.

## 3. Pekerjaan tersisa

**Antrean Ricko** (urut; jangan dikerjakan sebelum diminta):
1. ~~Uji klik CP-20~~ (agen, 2026-11-07; NVDA tetap Ricko) → ~~S11~~ → **rilis grid 0021 + 0022** oleh Ricko, langkah demi
   langkah (checklist di ROADMAP § "Checklist rilis Grid Mutasi Kas"; prasyaratnya sudah dicocokkan 2026-11-07).
2. **PR #2 langkah 6 / X5 — "Unggah PDF" ke grid**, sesudah grid ada di `main`. Catatan yang sudah diputuskan (log
   Stream B § "Catatan untuk langkah 6"): label Debet/Kredit/Nama Akun di pratinjau (Debet = uang MASUK; "DB" bank =
   keluar, jadi arah tetap dari kesinambungan saldo, bukan dari judul/penanda); nomor referensi bank → kolom `ref`;
   model per halaman dari header `X-Model-Ekstraksi` (+ `X-Ekstraksi-Diulang`); 422 `inputManual: true` tampil sebagai
   "isi manual", bukan tombol ulangi; `gabungLintasHalaman` dipanggil sebelum blok diserahkan ke grid.
3. **Modul Data Induk** (Bagan Akun, Kas & Bank, Dimensi) — brief menyusul dari Ricko.

**Sisa Stream B yang ikut dipegang sesi ini:**
- Aturan cakupan penjaga X3 (usul a–c, disetujui 2026-11-04) — dikerjakan di PR #2; lihat log Stream B.
- Sesudah pemeriksa saldo S3 ada di `main`: ganti `lib/bank-statement/uji-banding/kesinambungan-sementara.ts` lewat port
  `PemeriksaKesinambungan`, lalu hapus berkasnya (keputusan Ricko 2026-10-27 #2).
- **Saat PR #2 di-merge** (dokumen yang baru benar sesudah kodenya ada di `main`): ROADMAP A5 (±baris 263 & 675) — path
  `lib/gemini/suggest-journal-account.ts` menjadi `lib/ai/saran-akun-jurnal.ts`; `CLAUDE.md` — aturan fitur AI baru:
  "anggota `FiturBaru` dengan sakelar sendiri di `SAKELAR_SENDIRI` (`lib/ai-features.ts`), bawaan mati, pasangan env
  sendiri `AI_PROVIDER_<FITUR>`/`AI_MODEL_<FITUR>`; fitur lama tidak berubah".
- **Bukan pekerjaan sesi cloud:** X0 (gerbang akun berbayar), X6 (uji banding rekening koran nyata, skrip lokal di luar
  repo), X7 (aktivasi Production) — semuanya Ricko, sesudah X0 dan D54.

**Lain-lain:** S10 Class CF (D62) belum dikerjakan; §5.10 Marketplace / Kas kecil menunggu D20–D23; §5.11 Saldo awal &
laporan dari jurnal menunggu D16, D18, D19. Branch cadangan `claude/quirky-allen-bpbo5a` (salinan `fc6d4a5`) tidak bisa
dihapus dari sesi cloud (proxy git menolak) — boleh dihapus Ricko di GitHub.

## 4. Catatan lingkungan (sesi cloud)

- Rahasia **dev** tersedia sebagai variabel lingkungan proses, bukan `.env.local` (`pnpm env:cek` → ".env.local tidak
  ada"): `DATABASE_URL` (branch dev `ep-rapid-hat` — periksa endpoint sebelum memakai), `AUTH_SECRET`, `GEMINI_API_KEY`
  (dev free tier), dan akun uji per peran `DEV_TEST_*`. Kunci Claude/OpenAI tidak ada.
- Kuota free tier kunci dev (catatan Stream B 2026-10-28): `gemini-3.5-flash` ±20 permintaan/hari; `gemini-3.5-flash-lite`
  bertahan ±240 permintaan. Reset tengah malam waktu Pasifik. Perintah harness ada di kepala
  `lib/bank-statement/uji-banding/cli.ts` (branch PR #2).
- Chromium + Playwright terpasang di kontainer; uji klik memakai dev server lokal `pnpm dev` milik sesi (bukan dev server
  Ricko) dan dimatikan sebelum `pnpm build`. `graphify` tidak terpasang di kontainer.
