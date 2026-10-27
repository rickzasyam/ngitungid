# Serah terima — dua stream paralel (2026-10-27)

Dokumen ini untuk dua sesi cloud yang bekerja sejajar: **Stream A — Grid Mutasi Kas** (`feat/grid-mutasi`) dan
**Stream B — Ekstraksi PDF rekening koran** (`feat/pdf-rekening-koran`). Baca juga, sebelum menulis apa pun:
`CLAUDE.md` (aturan proyek, gotcha, aturan rahasia), `ROADMAP.md` (sumber kebenaran status), dan master plan
`docs/plans/2026-09-15-master-plan-mesin-akuntansi-semua-fase.md` **§5.G** (rancangan rinci kedua modul).

## 1. Status proyek

**Di produksi** (`ngid.vercel.app`, Neon main **21 migrasi**, `main` = rilis terakhir):
- Phase 1–3 (frontend, backend, AI laporan) dan Kontrak.
- **Phase 5 Fase 1 + Fase 2** — jurnal manual & posting, buku besar, Master COA bertipe, supplier, pembelian,
  mutasi kas/bank + alokasi ke invoice, monitoring hutang & rekonsiliasi. Dirilis 2026-10-23.
- **Kunci Periode** (§5.9, D17/D26) — kunci = akunting/owner, buka = owner + alasan ≥ 10 karakter; ditegakkan di
  14 jalur tulis (409 `{ error, lockedUntil }`). Dirilis 2026-10-27.

**Yang tersisa** (rincian & urutan di ROADMAP §5.10–5.14 dan MP):
- **§5.14 Modul A — Grid Mutasi Kas (S0–S11)** → Stream A.
- **§5.14 Modul B — Ekstraksi PDF rekening koran (X0–X8)** → Stream B (X1–X5; X0, X6, X7 bukan pekerjaan sesi cloud — lihat §3).
- §5.10 Marketplace / Kas kecil — menunggu D20–D23. §5.11 Saldo awal & laporan dari jurnal — menunggu D16, D18, D19.
  **Bukan bagian kedua stream.**

**Keputusan penting** (tabel lengkap di ROADMAP §5.12; alasan di MP §3.6):

| # | Isi singkat |
|---|---|
| D17 | `period_locks`; kunci = akunting, buka = owner + alasan — **dirilis** |
| D26 | Kunci periode dimajukan sebelum Fase 3 — **dirilis** |
| D46 | Library grid `react-data-grid` 7.0.0-beta.63 (MIT) dipin persis lewat spike S0; cadangan TanStack Virtual; library final dipilih Ricko di CP-19 |
| D47 | Wizard CSV dilebur jadi pintu masuk berkas ke grid; `POST …/import` dihapus; tidak ada simpan sebagian |
| D48 | Satu jalur tulis `POST /api/cash-mutations/batch` + `rencanakanSimpanMutasi`; route lama jadi pembungkus tipis |
| D49 | Migrasi **0021**, seluruhnya tambah: `cash_mutations.urutan` + `catatan`, `client_accounting_settings.akun_pindah_buku_id`, `cash_mutation_rules` |
| D50 | Saldo putus menahan Simpan; jalan keluar = kosongkan sel Saldo — **terlihat di grid** dan **tercatat di riwayat** (`saldo_dikosongkan`) |
| D51 | Draf: peringatan sebelum meninggalkan halaman + cadangan IndexedDB per (klien, akun kas), dihapus setelah Simpan berhasil, tawaran "Pulihkan draf" |
| D52 | Satu Simpan = satu akun-bulan: 10.000 baru · 2.000 ubah · 2.000 hapus (final dari uji beban S7) |
| D53 | Kunci Periode selesai sebelum S7 — **terpenuhi**, S7 tidak lagi terhalang |
| D54 | Penyedia AI ekstraksi dipilih dari uji banding X6; wajib berbayar, tanpa pelatihan, tanpa free tier, tanpa DeepSeek/Z.ai first-party |
| D55 | Ditutup — Gemini paid tier aktif di Production |
| D56 | PDF rekening koran tidak disimpan; teks diekstrak di browser |
| D57 | Aturan akun lawan `cash_mutation_rules` (uraian mengandung X → akun Y, tanpa RegExp); usulan masuk lewat "Terapkan usulan" |
| D58 | Jurnal ringkasan per (akun kas, akun lawan, tanggal); alokasi hutang tetap per mutasi |
| D59 | Pindah Buku: akun = setelan per klien; pasangan nominal sama, ≤ 3 hari, akun kas berbeda, hanya tunggal |
| D60 | Baris tanpa tanggal wajib diisi (+ aksi "Isi tanggal akhir periode"); di luar periode = galat |
| D61 | Saldo awal tidak dimajukan untuk grid — jangkar rantai = fakta dokumen |
| D62 | Class CF baku 4 nilai; "Operating Balance" = akun kas/bank |

**Aturan rahasia** — `CLAUDE.md` § "Rahasia & kredensial" berlaku penuh. Ringkasnya: rahasia **produksi** (connection
string main `ep-small-mode-ao8ouvtp`, `AUTH_SECRET` & `GEMINI_API_KEY` Production) tidak pernah tampil di percakapan;
migrasi ke main hanya lewat `.env.main` + `pnpm db:migrate:main`, dijalankan dalam proses rilis Ricko; isi `.env.local`
diperiksa hanya dengan `pnpm env:cek`.

**Fitur AI & aturan data**
- Sakelar per fitur `aiFeaturesEnabled(fitur)` (`lib/ai-features.ts`) adalah satu-satunya gerbang. Env
  `AI_FEATURES_ENABLED`: `"true"` → **semua** fitur menyala; kosong → hanya `saranCoa` & `ekstraksiLaporan` (D55);
  nilai lain → semua mati. Production saat ini `"true"`.
  ⚠️ **Untuk Stream B:** karena itu, kunci fitur baru `ekstraksiRekeningKoran` akan **langsung menyala di Production**
  begitu kodenya dirilis — sebelum X0 dan D54. Usulkan pagarnya di PR (mis. env tersendiri yang hanya diisi di X7);
  jangan diputuskan sendiri.
- **Data klien nyata hanya diproses AI di Production** (kunci berbayar). Dev dan Preview memakai kunci free tier —
  **hanya data karangan**.
- **Di dev, fitur AI hanya dipakai pada klien dummy "PT Uji Coba"** (25 akun Master COA contoh, 3 akun kas).
- **Modul B sebelum gerbang X0: hanya PDF SINTETIS**, juga di dev. Tidak ada rekening koran nyata ke penyedia mana pun.
- Akun uji dev per peran (owner, akunting, finance, client) ada di DB dev; kredensialnya di `.env.local` lokal Ricko
  (`DEV_TEST_*`), tidak ikut repo.

**Sync NgodingPakeAI dilewati** — langganan workspace tidak aktif ("Workspace requires an active subscription",
2026-10-26). Jangan menjalankan langkah sync vendor di kedua stream sampai Ricko mengaktifkannya lagi.

## 2. Stream A — Grid Mutasi Kas (`feat/grid-mutasi`)

**Cakupan:** MP §5.G Modul A, **S0–S11**, urut sesuai MP: `S0 → ⏸CP-19 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → ⏸CP-20 → S11`; S10 boleh kapan saja.
S0 (spike library) di **branch sendiri yang TIDAK di-merge** — mis. `spike/grid-library` dari `feat/grid-mutasi`.
Stream A juga **membaca** kontrak baris mentah (`lib/mutasi-kas/kontrak-baris-mentah.ts`) di S2: `BarisMentah` dari
PDF masuk lewat jalur yang sama dengan tempelan.

**Berkas milik Stream A** (Stream B tidak mengubahnya):
- `lib/db/schema.ts`, `lib/db/migrations/**` — satu-satunya yang menjalankan `db:generate` / `db:migrate` (dev saja)
- `ROADMAP.md`, master plan `docs/plans/2026-09-15-master-plan-mesin-akuntansi-semua-fase.md`, `CLAUDE.md`
- Baru: `lib/mutasi-draf.ts`, `lib/saldo-berantai.ts`, `lib/aturan-mutasi.ts`, `lib/pindah-buku.ts`,
  `lib/mutasi-grid-state.ts`, `lib/coa/class-cf.ts` (+ test masing-masing)
- Yang sudah ada: `lib/cash-mutation.ts`, `lib/csv/mutasi-kas.ts`, `lib/api/cash-mutation-queries.ts`,
  `lib/coa/replace-plan.ts`, `lib/coa/classification-health.ts`, `lib/settings-tabs.ts`
- `app/api/cash-mutations/**` **kecuali** `ekstrak-halaman/`
- `app/mutasi-kas/**`, `components/mutasi-kas/**` **kecuali** `components/mutasi-kas/pdf/`
- `app/settings/page.tsx`, `components/settings/**` (tab "Aturan Mutasi", aksi Operating Balance)
- `docs/progress/stream-a-grid.md`

## 3. Stream B — Ekstraksi PDF rekening koran (`feat/pdf-rekening-koran`)

**Cakupan:** MP §5.G Modul B, **X1 → X2 → X3 → X4 → X5**, dikembangkan dengan **PDF sintetis**.
**Bukan pekerjaan sesi ini:** X0 (gerbang — keputusan & akun berbayar Ricko), X6 (uji banding dengan rekening koran
nyata, skrip lokal di luar repo), X7 (aktivasi Production), keduanya sesudah X0 dan D54.

**Berkas milik Stream B** (Stream A tidak mengubahnya):
- Baru: `lib/ai/**` (lapisan penyedia; X1 **memindahkan** `lib/gemini/client.ts` dan kawan-kawan tanpa mengubah perilaku),
  `lib/pdf/**` (mis. `lib/pdf/susun-baris.ts`), `lib/mutasi-pdf.ts`, `app/api/cash-mutations/ekstrak-halaman/**`,
  `components/mutasi-kas/pdf/**` (komponen X5)
- Yang sudah ada: `lib/gemini/**`, `lib/ai-features.ts` (menambah kunci fitur `ekstraksiRekeningKoran` — lihat ⚠️ §1),
  dan **hanya baris impor** di route AI yang terdampak pemindahan X1 (`app/api/journals/suggest-account/`,
  `app/api/reports/[id]/suggest-ai/`, `app/api/upload/`, `app/api/reports/[id]/retry-extract/`)
- `docs/progress/stream-b-pdf.md`

**Titik temu dengan Stream A:** komponen X5 di `components/mutasi-kas/pdf/` menyerahkan `HalamanMentah[]` (plus nama
berkas) lewat prop; ia **tidak** mengubah halaman grid. Pemasangan tombolnya di `/mutasi-kas` dikerjakan sesudah S9
masuk, sebagai PR kecil yang disetujui Ricko.

## 4. Bersama — tidak dimiliki siapa pun

- **`lib/mutasi-kas/kontrak-baris-mentah.ts`** — kontrak PDF→grid. **Hanya diubah atas persetujuan Ricko.**
- `package.json`, `pnpm-lock.yaml` — keduanya mungkin menambah dependensi (A: library grid; B: `pdfjs-dist`/`unpdf`).
- Modul yang dipakai ulang kedua stream dan tidak diubah tanpa alasan: `lib/nominal.ts`, `lib/contracts.ts`,
  `lib/ymd.ts`, `lib/journal.ts`. Perubahan di sini → catat di log progres stream dan sebut di deskripsi PR.

## 5. Aturan bersama

- Tidak ada yang push atau merge ke `main` kecuali Ricko lewat proses rilis (**main = produksi**).
- Hanya Stream A yang menjalankan `db:generate`/`db:migrate` (ke dev saja). Stream B tidak mengubah `schema.ts` maupun
  folder migrasi; kalau butuh, minta lewat Ricko.
- Hanya Stream A yang mengubah `ROADMAP.md`, master plan, dan `CLAUDE.md`. Stream B mencatat di
  `docs/progress/stream-b-pdf.md` dan mengusulkan perubahan dokumen di deskripsi PR.
- Kontrak baris mentah hanya diubah atas persetujuan Ricko.
- Konflik `pnpm-lock.yaml`: jangan digabung manual; jalankan `pnpm install` setelah rebase.
- Data uji diberi awalan: Stream A `UJI-A-`, Stream B `UJI-B-`.
- Fitur AI di dev hanya memakai klien dummy "PT Uji Coba".
- Tidak ada akses rahasia, Neon main, maupun Vercel Production.

**Kadens kerja (sama dengan sesi sebelumnya):** satu langkah = gerbang hijau (`tsc --noEmit`, `vitest run`,
`eslint .` tanpa error baru) + sabotase yang membuktikan test-nya menjaga + satu commit + satu baris log progres.
Berhenti di setiap ⏸ CP dan tunggu Ricko — memilih di antara opsi bukan berarti boleh lanjut.

> ⚠️ **Perlu keputusan Ricko:** `db:migrate` ke dev butuh `DATABASE_URL` dev. Kalau "tidak ada akses rahasia" juga
> berarti sesi cloud tidak diberi rahasia dev, Stream A cukup `pnpm db:generate` (tidak butuh database) + membaca SQL-nya
> (gotcha #8), lalu Ricko yang menerapkannya ke dev.
