# Master Plan — Mesin Akuntansi & Jurnal Manual (Fase 1–4, seluruh cakupan)

| | |
|---|---|
| Plan NgodingPakeAI | `e2cbb3a7-5976-43dd-937a-5bec14f6c35c` — "Mesin Akuntansi & Jurnal Manual" |
| Workspace | `a3bbf493-5431-4bef-8065-e48c37e9a752` |
| Disusun | 2026-09-15, dari PRD server (seluruh fase) + 13 task fase-1 yang terlihat + pembacaan penuh basis kode (247 ringkasan) |
| Status | **D1–D15 + R2, R4 DISETUJUI.** Fase 1 (§4.A, §4.B) dan §5.A langkah C1–C4 **sudah ter-commit** (migrasi 0010–0014 di dev). D16–D26 dan R1, R3, R5–R11 masih menunggu. **SELURUH D27–D45 DISETUJUI Ricko 2026-09-20** (D32 dan D40 dengan tambahan; D42 bawaan `false`; D43 dengan syarat jendela rilis). Lihat §3.4. |
| Revisi besar | **2026-09-19 — perubahan konsep dari Ricko: tiga modul baru (Laporan Pembelian, Mutasi Kas/Bank, Monitoring Hutang) + perubahan pada yang sudah ada.** Ia MENGGANTIKAN §5.C lama dan **§6.A seluruhnya**. Baca **§3.4 (keputusan baru), §3.5 (apa yang dibatalkan), §5.D–§5.F (modul baru)** sebelum melanjutkan pekerjaan Fase 2 apa pun. |
| Revisi 2026-10-26 | **Grid Mutasi Kas (Modul A) & ekstraksi PDF rekening koran (Modul B)**, direvisi hari yang sama dengan temuan template akuntan Rasyuka April 2026 — keputusan baru **D46–D62 di §3.6** (D55 sudah dijawab), rancangan di **§5.G**, checkpoint CP-19–CP-22. ⏳ Menunggu Ricko; belum ada kode. |
| Pelaksana | Sesi agen terpisah (Opus 5). Plan ini harus cukup tanpa konteks sesi penyusunnya. |
| Menggantikan | `docs/plans/2026-09-15-master-plan-fase-1-jurnal-umum-dan-supplier.md` (kini hanya penunjuk ke berkas ini) |

---

## 0. Protokol pelaksana — baca seluruhnya sebelum menyentuh apa pun

1. **Urutan baca wajib:** `ROADMAP.md` (sumber kebenaran keputusan; CLAUDE.md mewajibkannya — bagian "Mesin Akuntansi" di sana adalah pintu masuk ke plan ini), `CLAUDE.md` (konvensi, warna terkunci, jebakan), lalu plan ini **seluruhnya** sebelum fase mana pun dimulai. `.ngodingpakeai/summaries.json` = ringkasan 247 berkas; baca ringkasan sebuah berkas sebelum membukanya.
2. **Batasan yang berlaku terus:**
   - `npx tsc --noEmit -p tsconfig.json` bersih · `npx vitest run` hijau · `node_modules\.bin\eslint .` = 0 error, **tepat 24 warning** (jangan tambah; aturan `react-hooks/set-state-in-effect` — pakai lazy initializer/callback).
   - **pnpm, bukan npm.**
   - `.env.local` bisa menunjuk **dev atau main (produksi)**. Cek sebelum `db:*` apa pun. Tidak pernah `db:push`/seed/skrip sekali pakai ke main. **Migrasi ke main = Ricko sendiri.**
   - Warna hanya token `app/globals.css`; `#c0ff33`/`#1a1a1a`/`#a78bfa` dilarang di kode baru; pola kedalaman tiga lapis di halaman baru.
   - **Jangan sentuh:** `lib/auth.ts`, `proxy.ts`, `app/login/page.tsx`, `lib/login-rate-limit*.ts`, `app/api/account/password/route.ts`.
   - Jangan hapus/rombak komponen di luar cakupan langkah tanpa konfirmasi.
   - **Hanya Ricko yang menyetujui.** Jangan menarasikan persetujuan. Berhenti di setiap checkpoint (§10).
   - Jangan `git commit`/`push` tanpa diminta; tanyakan kadens commit di checkpoint pertama. Gaya pesan: `feat(jurnal): …`, Bahasa Indonesia.
3. **Alur task vendor.** Tiap langkah menyebut `ref` task yang ia penuhi. `task start <ref>` → kerjakan → `task complete <ref>`; ke-block → `task fail <ref> "alasan"`. **Irisan yang terbuka hanya satu fase × satu layer** (saat ini fase 1 / frontend — 13 task); task di luar irisan mengembalikan 423 Locked, jadi `task start` hanya untuk task di irisan yang terbuka — langkah lain tetap dibangun sesuai urutan plan, task-nya diselesaikan saat irisannya terbuka. Setelah tiap langkah **yang sudah di-commit Ricko**: `npx --yes ngodingpakeai sync --if-changed --plan` (metadata saja — aman) → tulis ringkasan berkas di `pending.json` ke `summaries.json` (Bahasa Indonesia, 10–2000 karakter, sebut simbol/route/tabel, tanpa kutip kode/rahasia/host DB). **JANGAN jalankan `sync` final (unggah ringkasan) di tengah siklus** — aturan keras 6 skill vendor: hanya saat semua task plan selesai, atau Ricko memintanya secara eksplisit.
4. **Fase vendor sejajar dengan fase PRD** (diverifikasi dari tracker 2026-09-15): fase 1 = Jurnal Umum + Supplier (27 task), fase 2 = Buku Besar + COA Bertipe (28), fase 3 = Impor Bank + Marketplace + Kas Kecil (40), fase 4 = Saldo Awal & Kunci Periode + Laporan dari Jurnal (29) **+ 90 task fitur yang sudah ada (F09–F14)**. Satu-satunya selisih: Supplier di fase 1 vendor (PRD: Fase 2). Tetap **petakan task lewat `feature` + `title`** (§9, katalog), bukan nomor. Task di fase yang belum terbuka mengembalikan **423 Locked** — langkah yang plan ini majukan (K1–K5, D26) dibangun dulu, task-nya diselesaikan saat fasenya terbuka. Checkpoint vendor (ganti `layer` / naik `phase.current`) tetap dihormati: jangan `task start`, lapor, tunggu "lanjut".
5. **Plan ini MENGURUTKAN ULANG task vendor, dengan sengaja (D0, disetujui).** Vendor: "frontend dulu di atas data tiruan". Repo ini tidak punya jalur mock; pola yang terbukti: **modul murni + test → route → UI di atas data nyata** (`lib/contracts.ts` → `app/api/contracts/*` → `app/kontrak/page.tsx`). UI di atas data nyata memenuhi task "(mock)" sebagai superset. Task backend vendor yang muncul belakangan sering sudah beres — cek, lalu `task complete`.
6. **214 task — katalog lengkap ada di `docs/plans/ngodingpakeai-tasks-214.md`** (ekspor web UI 2026-09-15): tiap task dipetakan ke langkah di plan ini; **90 di antaranya (fitur F09–F14) adalah fitur yang SUDAH ADA** dan hanya perlu diverifikasi lalu `task complete` — jangan membangun ulang. Kolom "Catatan" di katalog mengalahkan judul task. Bila sebuah task tidak ada di katalog, **berhenti dan tanyakan**, jangan mengarang langkah. Revisi yang lahir dari ekspor itu ada di §3.3.

---

## 1. Peta fase, fitur, ketergantungan

| PRD Fase | Fitur | Prioritas | Bergantung pada | Bagian | Migrasi | Status |
|---|---|---|---|---|---|---|
| 1 | Jurnal Umum | high | — | §4.A | 0010–0011 | ✅ selesai (dev) |
| 1 (vendor) / 2 (PRD) | Master Data Supplier (tanpa rekonsiliasi) | medium | — | §4.B | 0012–0013 | ✅ selesai (dev) |
| 2 | Buku Besar & Posting | high | Jurnal Umum | §5.A | 0014 | ✅ C1–C4 ter-commit; C5 sisa |
| 2 | Master COA Bertipe | high | — (memperkaya derivasi D1) | §5.B | **0015** | berikutnya |
| 2 | **Laporan Pembelian** 🆕 | high | Supplier, Posting, `is_kas` tidak wajib | **§5.D** | **0016–0017** | menunggu D27–D34 |
| 2 | **Mutasi Kas/Bank** 🆕 | high | **COA Bertipe (`is_kas`)**, Pembelian | **§5.E** | **0018** | menunggu D35–D38 |
| 2 | **Monitoring Hutang** 🆕 | high | Pembelian + Mutasi | **§5.F** | — (turunan) | menunggu D39–D40 |
| 2 | Rekonsiliasi Hutang Supplier — **DIRANCANG ULANG** | medium | Modul 1 + 2 + Neraca | §5.C | — (turunan) | menunggu D41 |
| 2+ | **Grid Mutasi Kas** 🆕 (Modul A) | high | §5.E, Kunci Periode (D53) | **§5.G** | **0021** | ✅ disetujui 2026-10-26 |
| 2+ | **Ekstraksi PDF rekening koran** 🆕 (Modul B) | high | Modul A, AI berbayar (X0) | **§5.G** | — | disetujui 2026-10-26; menunggu gerbang X0 |
| 3 | ~~Impor Mutasi Kas/Bank~~ | — | — | ~~§6.A~~ | — | ❌ **DIBATALKAN — diserap §5.E** (§3.5) |
| 3 | Transaksi Marketplace | medium | Jurnal Umum | §6.B | 0022 | menunggu D20 |
| 3 | Kas Kecil | low | Jurnal Umum, Posting | §6.C | 0023 | menunggu D21/R3 |
| 4 | Saldo Awal & Kunci Periode | medium | Posting | §7.A, §7.B | 0020, 0024 | menunggu D16, D17 |
| 4 | Laporan dari Jurnal | high | Posting, COA Bertipe, Saldo Awal | §7.C | — | menunggu D18, D19 |

**Urutan eksekusi — DISETUJUI Ricko 2026-09-19:**

> **C5 → §5.B (E1–E5) → §5.D Pembelian (M1–M7) → §5.E Mutasi Kas/Bank (N1–N6) → §5.F Monitoring Hutang (U1–U5) → §5.C Rekonsiliasi rancang ulang (F1–F5).**

Sesudah itu urutan lama berlaku lagi: §7.B (kunci periode, D26) → §6.B → §6.C → §7.A → §7.C.

**Kenapa E1–E5 harus lebih dulu, dan ini bukan preferensi:** §5.E memilih akun kas dari COA bertanda `is_kas`, dan `is_kas` baru lahir di migrasi 0015 (E1). Tanpa itu daftar akun kas jadi daftar tulis-tangan — persis bentuk yang akan basi diam-diam begitu klien menambah rekening bank baru.

---

## 2. Prinsip lintas-fase — berlaku di SETIAP langkah

| # | Prinsip | Acuan di repo |
|---|---|---|
| P1 | Uang = `numeric(18,2)`, driver mengembalikan **string**; validasi lewat `normalizeNominal`; **penjumlahan dalam sen bulat**, bukan float | `lib/contracts.ts`, `schema.ts` (`contracts.nominal`) |
| P2 | Tanggal kalender = string `YYYY-MM-DD` ujung ke ujung; `isValidYmd`, `hariAntara`, `todayYmd`; tak pernah `new Date(string)`/`toISOString` | kepala `lib/contracts.ts`, `lib/ymd.ts` |
| P3 | **Status diturunkan bila mungkin.** Yang disimpan hanya keputusan manusia (`draft`/`posted`), bukan fungsi tanggal/data ("sudah dibalik", "terkunci", "seimbang" = diturunkan) | `lib/contracts.ts` `contractStatus` |
| P4 | **Tidak ada tabel snapshot/saldo.** Buku besar, saldo berjalan, rekonsiliasi, laporan = dihitung saat diminta dari baris terposting | ROADMAP 2026-07-02; `app/api/dashboard/[clientId]/route.ts` |
| P5 | **Satu mesin agregasi**: `lib/financial-agg.ts`. Tidak ada agregator kedua, kapan pun | `lib/neraca-compare.ts` (contoh menurunkan dari sana) |
| P6 | Modul murni + test **sebelum** route; route sebelum UI | `lib/contracts.ts` → `app/api/contracts/*` → `app/kontrak/page.tsx` |
| P7 | Guard: tulis = `requireAkunting` (`canDoAccounting`); baca = `requireUser` + `canAccessClientData`; **buka kunci periode = `requireOwner`**. Ambil baris DULU, cek klien dari `row.clientId` | `lib/api/guards.ts`, `app/api/contracts/[id]/route.ts` |
| P8 | Enum: nilai baru = **`ADD VALUE` tulis tangan** (preseden 0003, 0007); nilai baru tak boleh dipakai di transaksi migrasi yang sama | `lib/db/migrations/0007_role_finance.sql` |
| P9 | **Timestamp di tabel BARU = `timestamp(..., { withTimezone: true })`** (D24) | `docs/deferred/0006_timestamptz.sql` |
| P10 | Setiap mutasi jurnal = **satu `db.batch`** (atomik di neon-http) **+ satu baris `audit_events`** di dalam batch yang SAMA (berlaku sejak 0014; R2) | `app/api/contracts/route.ts` POST |
| P11 | **Immutabilitas:** `posted` tak bisa diubah/dihapus — hanya dibalik. Ditegakkan sejak Fase 1 lewat `canEditJournal` | — |
| P12 | UI: tata letak tabel `/laporan`; `ModalShell` untuk semua dialog; `StyledSelect` (`badge=kode`) untuk akun; `useRupiah`; `DateRangePicker` + `localDateToYmd`; a11y CLAUDE.md | `components/ui/*`, `app/laporan/page.tsx` |
| P13 | Nav, akses halaman, tab Settings = **data + test** (`NAV_ITEMS`, `ACCOUNTING_ONLY_PREFIXES`, `SETTINGS_TABS`); ikon di `NAV_ICONS` (tsc menagih) | `lib/nav-items.ts`, `lib/route-access.ts`, `lib/settings-tabs.ts`, `components/sidebar.tsx` |
| P14 | Ganti-massal/hapus-baris COA harus **sadar setiap tabel baru yang merujuk `master_coa`** (D4) — perluas `buildReplacePlan` tiap kali tabel perujuk baru ditambah | `lib/coa/replace-plan.ts` |
| P15 | Test route berbasis pembacaan sumber untuk mengunci guard & urutan cek | `lib/contracts-api.test.ts` |
| P16 | Setelah tiap langkah: ROADMAP (baris log faktual, tanpa "approved") + `graphify update .` + sync NgodingPakeAI | CLAUDE.md |

Tabel "pakai ulang" lengkap (simbol per kebutuhan) ada di §4.0.

---

## 3. Keputusan

### 3.1 DISETUJUI Ricko 2026-09-15 — mengikat untuk Fase 1

| | Keputusan |
|---|---|
| D0 | Urutan eksekusi: skema → modul murni + test → route → UI (bukan frontend-dulu-mock). |
| D1 | Tidak ada sistem tipe akun baru di Fase 1; turunkan dari `posisi` (normal balance) + `classifyBs`/`classifyPnl`. |
| D2 | Skema `journal_entries`/`journal_lines` §8. **D2a** `no_bukti` unik per klien. **D2b** enum `journal_status` = `draft`,`posted` sejak awal; `journal_source` = `manual` saja. |
| D3 | `/jurnal` **staf saja** (`ACCOUNTING_ONLY_PREFIXES`); tulis = `canDoAccounting`. |
| D4 | Ganti-massal/hapus-baris COA menyambung ulang `journal_lines` by kode; **tolak 409** bila ada baris jurnal yang kodenya hilang/ambigu; `master_supplier.akun_hutang_default_id` disambung ulang / di-null-kan. |
| D5 | Rekonsiliasi hutang supplier **ditunda** ke Fase 2 (`task fail` dengan alasan). |
| D6 | `created_by` via lookup `users` by email sesi; `lib/auth.ts` tidak disentuh. |
| D7 | Supplier = tab Settings, tidak terlihat finance & klien. |
| D8 | Impor supplier = **upsert by nama**. |
| D9 | Hapus supplier Fase 1 = hard delete; Fase 2 mengubahnya (D15). |
| D10 | Saran AI = satu pasang akun D/K dari keterangan, tombol eksplisit, tak pernah otomatis. |

### 3.2 MENUNGGU Ricko — Fase 2–4 (rekomendasi disertakan; jawab sebelum fase terkait dimulai)

| | Keputusan | Rekomendasi & alasan |
|---|---|---|
| D11 | Buku besar & saldo berjalan **diturunkan saat diminta** dari `journal_lines` terposting; tanpa tabel saldo | Konsisten P4. Volume klien UMKM kecil; kalau kelak lambat, tambah index, bukan snapshot. |
| D12 ✅ | Riwayat perubahan append-only — **bentuk finalnya `audit_events` generik (R2 diambil 2026-09-18), bukan `journal_events`**. Teks asli dipertahankan sebagai riwayat keputusan: tabel **`journal_events`** append-only (`created`, `updated`, `posted`, `reversed`, `unlocked`, …) | Satu tabel untuk "kapan & oleh siapa" semua fase termasuk buka-kunci Fase 4. `event` bertipe **text** + daftar konstanta di lib (daftarnya tumbuh per fase; enum butuh migrasi tiap kali — pola `currency_format`). |
| D13 | Jurnal balik = **entri baru** dengan `reversal_of_id` → jurnal asli; baris D/K ditukar; dibuat sebagai `draft` lalu diposting lewat jalur posting biasa; jurnal asli **tetap `posted`**; "sudah dibalik" **diturunkan** (ada pembalik yang `posted`) | P3. Satu jalur posting; tidak ada nilai enum `reversed`. Jurnal yang sudah dibalik tak bisa dibalik lagi (predikat murni). |
| D14 | **Master COA Bertipe = SATU kolom baru `tipe_akun`** (enum `account_type`: `asset`,`liability`,`equity`,`revenue`,`expense`, **nullable**) **+ `is_kas boolean`**. **`posisi` sudah = normal balance; `class_cf` sudah = klasifikasi arus kas — JANGAN duplikasi kolom.** Resolusi: eksplisit `??` turunan (`classifyBs`/`classifyPnl`) | PRD menyiratkan tiga kolom baru; dua di antaranya sudah ada di skema sejak awal. `is_kas` dibutuhkan arus kas dari jurnal (§7.C) dan **Mutasi Kas/Bank (§5.E)** — dulu tertulis §6.A, yang sudah diserap. |
| D15 | `journal_lines.supplier_id` **nullable** → `master_supplier` (ON DELETE **restrict**), diisi pada baris akun hutang; DELETE supplier menolak 409 bila dirujuk | Satu-satunya cara rekonsiliasi per supplier tanpa buku pembantu terpisah. |
| D16 | **Saldo awal = jurnal** ber-`sumber='opening_balance'`, tanggal = sehari sebelum periode pertama, satu baris per akun, wajib seimbang lewat `validateJournalInput` yang sama | Tidak ada tabel baru; buku besar & laporan otomatis memperhitungkannya. |
| D17 ✅ **disetujui Ricko 2026-10-26** | Kunci periode = tabel `period_locks` per klien (`terkunci_sampai date`); predikat murni `isDateLocked`; **kunci = `canDoAccounting`, buka = `requireOwner` + alasan wajib → `audit_events{entity_type:'period_lock'}`** | PRD: "buka kunci terbatas oleh peran tertentu dengan catatan alasan". |
| D18 | Sumber laporan diputuskan **server** per (klien, periode): ada jurnal `posted` di periode → dari jurnal, else PDF; respons membawa `source`; UI menampilkan lencana | Jalur PDF **tidak disentuh** (regresi). |
| D19 | Arus kas dari jurnal = **metode langsung**: mutasi akun `is_kas`, diklasifikasi dari `class_cf` akun lawan; transfer antar akun kas dinetralkan | **Butuh review tim akunting Ricko** sebelum dipakai untuk klien nyata. |
| D20 | Marketplace: perlakuan `pajak` (beban vs pajak dibayar dimuka) dan `fee` (beban) = **keputusan akuntansi Ricko**; plan menyediakan akun yang dipilih pengguna per settlement, bukan aturan tetap | Ini kebijakan pembukuan, bukan teknis. |
| D21 | Kas kecil = **sistem imprest** (dana tetap): pengeluaran dicatat di buku pembantu, jurnal lahir saat **pengisian kembali** (D: akun beban…, K: bank) | Praktik baku UMKM; jurnal per pengeluaran kecil membanjiri buku besar. |
| D22 | Impor bank: parser alias header (pola `coa-import`) + **pemetaan kolom manual** bila deteksi gagal; aturan pemetaan hanya `contains`/`startsWith` (**bukan regex** — ReDoS dari input pengguna); dedupe via fingerprint `tanggal|nominal|keterangan-ternormalisasi` per akun kas | Format mutasi bank sangat beragam. |
| D23 | `journal_source` bertambah per fase lewat `ADD VALUE` tulis tangan: `import_bank` (0014), `marketplace` (0015), `kas_kecil` (0016), `opening_balance` (0017) | P8. |
| D24 | Semua kolom timestamp di **tabel baru** memakai `withTimezone: true`; tabel lama tidak disentuh (tetap urusan `docs/deferred/0006_timestamptz.sql`) | Mengurangi utang timestamptz alih-alih menambahnya. Drizzle menormalkan keduanya; test `login-rate-limit` sudah mengunci kedua bentuk. |
| D25 | Halaman baru & aksesnya: `/buku-besar` (staf), ~~`/impor-bank`~~ ❌ (dibatalkan), `/marketplace` (staf), `/kas-kecil` (staf), 🆕 `/pembelian` · `/mutasi-kas` · `/hutang` (**internal** — D45, bukan staf-saja); saldo awal & kunci periode sebagai **tab Settings** ("Pembukuan"); Laporan-dari-jurnal tidak menambah halaman (lencana di Dashboard/Analytics) | Konsisten D3/D7. |
| D26 ✅ **disetujui Ricko 2026-10-26** | Menggeser Kunci Periode (§7.B) ke **sebelum Fase 3** | Lihat §1. |

### 3.3 Revisi setelah ekspor lengkap 214 task (2026-09-15) — berlaku di atas §4–§8

Ekspor spesifikasi per fitur ("Selesai bila") mengoreksi beberapa asumsi plan. **R4 sudah dijawab Ricko 2026-09-15: finance boleh LIHAT saja** (D7 tetap untuk tulis); sisanya melengkapi keputusan yang masih menunggu.

| | Revisi | Mengubah |
|---|---|---|
| **R1** (D10a) | Saran AI mengembalikan **hingga 3 pasangan** D/K berperingkat keyakinan, ditampilkan sebagai **daftar pilihan** (F01: "daftar pilihan yang bisa langsung dipakai"); pengguna memilih satu → Terapkan. Prompt, ambang 60, tombol eksplisit tetap. | A5, A7 |
| **R2** (D12') | `journal_events` → **`audit_events`** generik: `client_id`, `entity_type` text (`journal`, `master_coa`, `period_lock`, `supplier`), `entity_id` uuid NULL, `event` text, `user_id`, `catatan`, `at`. Satu tabel memenuhi F02-14 (riwayat jurnal), F03-14 (riwayat keterangan akun), F07-8/11 (log buka kunci). Konstanta event per entitas di lib masing-masing. | §5.0, §8.5, C2, E3, K3 |
| **R3** (D21') | Kas kecil = **fluctuating fund, jurnal per transaksi** (F06: "semua transaksi kas kecil tercatat sebagai jurnal"): tiap pengeluaran → draf jurnal `sumber='kas_kecil'` (D akun beban / K akun kas kecil); pengisian → draf jurnal (D kas kecil / K bank); **sisa dana = saldo akun kas kecil** dari jurnal (terposting; draf ditampilkan terpisah); pengeluaran yang membuat sisa < 0 ditolak. **`petty_cash_expenses` DIHAPUS dari skema**; `petty_cash_funds` tinggal `client_id`, `nama`, `akun_kas_kecil_id`, `dana_tetap` (batas), `aktif`. Rekap = jurnal `kas_kecil` per periode dikelompokkan akun beban. `lib/petty-cash.ts` menyusut: validasi + `availableBalance(ledgerBalance)` + `buildExpenseJournal` + `buildReplenishmentJournal` + `summarizeUsage(journals)`. | §6.C, §8.10–8.11 |
| **R4** (D7a) ✅ | **Jawaban Ricko 2026-09-15: "finance boleh lihat" — baca saja.** Baca (`GET` daftar, `export`) = **`requireInternal`** (owner/akunting/finance; klien tetap tidak — bukan `requireUser`, agar akun klien tidak bisa menarik daftar supplier lewat API). Tulis (`POST`/`PATCH`/`DELETE`/`import`) = **`requireAkunting`** (D7 tetap). Tab Supplier masuk **`FINANCE_VISIBLE_TABS`** (tidak `USER_VISIBLE_TABS`) dan dirender **read-only** untuk finance lewat prop `readOnly={!canDoAccounting}` seperti `MasterCoaTab` — tombol Tambah/Sunting/Hapus/Impor disembunyikan, Ekspor tetap (baca). Spesifikasi F15-9 "owner/akunting/finance" dipenuhi dalam arti *melihat*; F15 tidak menuntut finance menulis. | B3, B4, `settings-tabs` |
| **R5** (§7.C) | Halaman baru **`/laporan-keuangan`** dengan tab **Laba Rugi · Neraca · Arus Kas** (F08-1..5), merender dari `AggLine[]` lewat `financial-agg` **apa pun sumbernya** (satu renderer → format identik terjamin), lencana sumber, penanda selisih neraca dari `checkBalance`, format `useRupiah`. Satu endpoint **`GET /api/reports/statements?clientId&periodStart&periodEnd` → `{ source, labaRugi, neraca, balance, arusKas, unclassified }`** (F08-7..10). Akses seperti `/laporan` (klien read-only) — D25 direvisi untuk halaman ini. Lencana di Dashboard/Analytics (L4 lama) tetap. Nav `laporan-keuangan` setelah `laporan`. | L3, L4, D25 |
| **R6** (D16 tetap) | F07-10 "tabel opening_balances" **dipenuhi jurnal `opening_balance`** — tidak ada tabel baru; F07-11 "period_unlock_log" dipenuhi `audit_events`. Saat task itu disajikan: `task complete` dengan catatan desain. | J1, J2, K3 |
| **R7** (K4) | UI kunci periode merender **daftar bulan** (F07-5) dengan status terkunci/terbuka **diturunkan**: bulan terkunci ⇔ akhir bulan ≤ `terkunci_sampai`. Model tetap satu tanggal monotonik per klien — mustahil Januari terbuka sementara Februari terkunci. | K4 |
| **R8** (B3, E3) | F15-10 "endpoint daftar akun hutang" dan F03-8 "filter keterangan" dipenuhi parameter **`?tipe=`** pada `GET /api/clients/[id]/coa` (respons sudah memuat `resolvedType`, `isKas`), bukan endpoint baru. Pemilih akun hutang memakai `?tipe=liability`. | B3, E3, B4 |
| **R9** (G4) | F04-4 "berdampingan dengan berkas sumber": untuk xlsx/CSV tidak ada PDF — sisi kiri = tabel baris **mentah** hasil parse (read-only, nomor baris asli), sisi kanan = baris terpetakan; bukan iframe. | G4 |
| **R10** (H4) | F05-2 "pemilih klien": klien = klien aktif sidebar (konvensi seluruh app, `useRequireClient`); halaman hanya memilih periode. | H4 |
| **R11** (F09–F14) | 90 task fitur yang sudah ada: verifikasi bukti di katalog → `task complete` menyebut berkasnya. ⚠️ = dipenuhi dengan cara berbeda **yang disengaja** (keputusan ROADMAP) — selesaikan dengan catatan, **jangan** "melengkapi" ke arah judul task (khususnya F09-2: durasi lockout sengaja tidak ditampilkan; F09-4: tidak ada halaman "ditolak"; F10-11: penugasan tidak menyaring akses; F11-9: unggah ulang mengganti). ❌ = celah kecil, laporkan saja. Paling efisien: Ricko menandai keenam fitur selesai di web UI. | §9 |

Perubahan skema akibat R2/R3 dirangkum: `audit_events` menggantikan `journal_events` (§8.5); `petty_cash_expenses` (§8.11) dihapus. §8.15 daftar perujuk `master_coa`: `petty_cash_expenses.akun_beban_id` dicoret, sisanya tetap.

### 3.4 Perubahan konsep 2026-09-19 — keputusan BARU yang menunggu Ricko (D27–D45)

**Tujuan bisnisnya satu kalimat:** melacak hutang usaha ke supplier dari pembelian sampai lunas, dengan jurnal yang terbentuk otomatis sehingga akunting tidak menginput dua kali.

Tiga modul baru lahir dari itu: **Laporan Pembelian** (§5.D), **Mutasi Kas/Bank** (§5.E), **Monitoring Hutang** (§5.F). Keputusan di bawah adalah hal-hal yang **tidak bisa disimpulkan dari brief** — masing-masing mengubah bentuk tabel, bentuk jurnal, atau perilaku yang sudah jalan. **✅ SELURUHNYA DIJAWAB Ricko 2026-09-20** — §5.D–§5.F boleh dimulai sesudah §5.B. Empat di antaranya dijawab dengan tambahan atau syarat: **D32** (wajib ada tautan "Koreksi di …"), **D40** (FIFO + penimpaan manual), **D42** (bawaan `false`, ketiadaan baris = `false` dan dikunci test), **D43** (0015–0019 satu jendela rilis, atau ditunda bersama).

#### Modul 1 — Laporan Pembelian

| | Keputusan | Rekomendasi & alasan |
|---|---|---|
| **D27** ✅ **2026-09-20** | `purchase_invoices` + `purchase_invoice_lines` (§8.16, §8.17). **Total invoice TIDAK disimpan** — diturunkan dari Σ subtotal baris + PPN (P3/P4). | Total tersimpan adalah sumber kebenaran kedua yang kalah begitu ada satu jalur tulis yang lupa memperbaruinya — pola yang sama yang membuat D11 menolak tabel saldo. |
| **D28** ✅ **2026-09-20** | **`subtotal` per baris DISIMPAN**, bukan diturunkan dari `qty × harga_satuan`. `qty numeric(18,4)`, `harga_satuan numeric(18,2)`, `subtotal numeric(18,2)`. | Ini pengecualian sadar atas D27, dan alasannya aritmetika: qty boleh pecahan (2,5 kg), jadi `qty × harga` punya pembulatan yang hasilnya bergantung urutan operasi. **Rupiah baris itulah faktanya**; qty dan harga adalah keterangan. Jurnal dibangun dari `subtotal`, tidak pernah dari perkalian ulang. |
| **D29** ✅ **2026-09-20** | `no_invoice` (dari vendor) **nullable**, unik per `(client_id, supplier_id)` **hanya bila terisi**. Kosong disimpan **NULL, bukan `''`**. | Pelajaran `no_bukti` Fase 1 diulang persis: `''` adalah satu nilai konkret, jadi invoice kedua tanpa nomor akan bentrok dengan yang pertama. NULL tidak pernah bentrok dengan NULL. |
| **D30** ✅ **2026-09-20** | Invoice **menyimpan akun yang dipakainya**: `akun_hutang_id`, `akun_ppn_masukan_id`, `akun_tujuan_id`, `akun_kas_id` — **snapshot saat invoice dibuat**, bukan dibaca ulang dari `master_supplier`/setelan klien saat pembayaran. | **Ini yang paling mahal kalau salah.** Kalau supplier mengganti akun hutang defaultnya setelah ada invoice, jurnal pembayaran akan men-DEBIT akun yang berbeda dari yang di-KREDIT invoice — selisihnya mengendap permanen di dua akun dan tidak pernah melempar galat. Snapshot menutup itu sepenuhnya. |
| **D31** ✅ **2026-09-20** | Jurnal otomatis lahir **`draft`**, satu jurnal per invoice, `sumber='pembelian'`, ditaut lewat `purchase_invoices.journal_id`. Invoice diubah → jurnalnya ikut diperbarui; invoice dihapus → jurnalnya ikut terhapus **di dalam `db.batch` yang sama**. | Draf, bukan langsung posted: akunting yang memutuskan kapan sesuatu masuk buku (P11, D3). Satu batch: invoice tanpa jurnal, atau jurnal tanpa invoice, dua-duanya adalah pembukuan yang salah dan tidak ada FK yang bisa menangkapnya sendiri. |
| **D32** ✅ **2026-09-20 — dengan tambahan** | **Jurnal bersumber modul (`pembelian`, `mutasi_kas`) TIDAK bisa diubah/dihapus langsung dari `/jurnal`** — koreksinya lewat dokumen asalnya. `canEditJournal` menerima `sumber`. **Tambahan Ricko: `/jurnal` WAJIB memberi jalan keluar, bukan sekadar menyembunyikan tombol** — tautan/tombol **"Koreksi di Pembelian"** / **"Koreksi di Mutasi Kas"** yang membuka dokumen asalnya. | Tanpa aturan ini ada dua penulis untuk satu jurnal, dan yang kedua tidak pernah tahu dokumen asalnya berubah; sinkronisasi dua arah adalah kelas bug yang tidak selesai-selesai. **Tombol yang hilang tanpa penjelasan adalah kebuntuan**: akunting melihat jurnal yang salah, tahu ia salah, dan tidak diberi tahu ke mana harus pergi — persis keadaan yang membuat orang mencari jalan pintas lewat SQL. |

> **Konsekuensi teknis D32 yang mudah terlewat — arah tautannya terbalik dari arah FK.** `purchase_invoices.journal_id` dan `cash_mutations.journal_id` menunjuk **ke** jurnal; dari jurnal tidak ada kolom yang menunjuk balik. Jadi tautan "Koreksi di …" butuh **pencarian mundur** (`… WHERE journal_id = ?`), dan indeks `(journal_id)` di kedua tabel (§8.16, §8.18) memang untuk itu — bukan hiasan.
>
> **Jangan menambah kolom balik di `journal_entries`.** Ia akan jadi kolom polimorfik kedua (invoice? mutasi? kelak marketplace?), dan kita sudah membayar harga satu kolom polimorfik tanpa FK di `audit_events`. Pencarian mundur lewat indeks lebih murah daripada kolom yang harus dijaga konsisten dari dua sisi.
| **D33** ✅ **2026-09-20** | **Akun PPN Masukan = setelan per klien**, di tabel baru `client_accounting_settings` (§8.20). PPN diisi tapi setelan kosong → **tolak 409 dengan pesan yang menyebut Settings**, jangan diam-diam pilih akun. | Tabel setelan sendiri, bukan kolom di `clients`: ia akan segera menampung setelan "posting bisa diedit" (D37) dan setelan pembukuan berikutnya. Menolak alih-alih menebak, karena akun PPN yang salah baru ketahuan saat SPT. |
| **D34** ✅ **2026-09-20** | **Jadwal termin DITURUNKAN, tidak disimpan** (`lib/termin.ts`, §5.D M2). Bagi rata **mundur dari `jatuh_tempo_akhir`**, sisa sen ke cicilan **TERAKHIR**. Termin 1× = satu cicilan di tanggal jatuh tempo. Tanggal dihitung sebagai **string `YYYY-MM-DD`** (P2). | Konsisten P3/P4. Sisa sen di cicilan terakhir supaya Σ cicilan **persis** sama dengan total invoice — bukan mendekati. Penyesuaian tanggal per cicilan (permintaan Ricko "sediakan kemungkinannya") **tidak dibangun sekarang**: tabel `purchase_invoice_installments` berisi **hanya baris override** bisa ditambahkan belakangan sebagai migrasi murni-tambah, dan sampai ia ada jadwalnya tetap turunan penuh. Yang WAJIB sekarang hanyalah `lib/termin.ts` menerima daftar override opsional sebagai parameter sejak hari pertama. |

#### Modul 2 — Mutasi Kas/Bank

| | Keputusan | Rekomendasi & alasan |
|---|---|---|
| **D35** ✅ **2026-09-20** | `cash_mutations` + `cash_mutation_imports` + `cash_mutation_allocations` (§8.18, §8.19, §8.21). **Menggantikan `bank_imports`/`bank_import_rows`/`bank_mapping_rules` (§8.6–§8.8) yang dibatalkan.** | §6.A dan modul ini adalah fitur yang sama; membangun keduanya berarti dua tabel mutasi bank dan dua jalur "jadikan jurnal". Lihat §3.5. |
| **D36** ✅ **2026-09-20** | Baris mutasi memakai **`debit`/`kredit`** seperti `journal_lines`, dengan CHECK yang sama (kedua sisi ≥ 0, **tepat satu** sisi terisi). Untuk akun kas: **debit = uang masuk**. | Rekening koran memang berbentuk dua kolom; memaksanya jadi satu kolom bertanda menambah satu konversi yang bisa salah arah, dan arah yang terbalik di kas tidak melempar — ia cuma membuat saldo salah. |
| **D37** ✅ **2026-09-20** | Satu mutasi boleh dialokasikan ke **beberapa** invoice, dan alokasi **sebagian** diperbolehkan. Sisa alokasi = `nominal − Σ alokasi`, **diturunkan**. Status baris (`belum dijurnal` / `sebagian` / `selesai`) **diturunkan**, tidak disimpan (P3). | Pembayaran nyata jarang persis sebesar termin — itu justru alasan modul ini ada. |
| **D38** ✅ **2026-09-20** | Deteksi duplikat impor CSV = `fingerprint` (`tanggal\|nominal\|keterangan-ternormalisasi`) per akun kas, sebagai **PERINGATAN**, bukan unique constraint. | Dua pembayaran identik pada hari yang sama adalah kejadian nyata. Constraint keras akan menolak data yang benar; peringatan menyerahkan keputusan ke orang yang tahu. D22 tetap berlaku untuk pemetaan kolom & larangan regex. |

#### Modul 3 — Monitoring Hutang & rekonsiliasi

| | Keputusan | Rekomendasi & alasan |
|---|---|---|
| **D39** ✅ **2026-09-20** | Menu **`/hutang`** sejajar Jurnal & Buku Besar, **bukan** di Settings. Seluruh angkanya **diturunkan** dari invoice + alokasi; tanpa tabel saldo, tanpa kolom status (P3/P4). | Permintaan eksplisit Ricko. Settings adalah data induk; hutang adalah keadaan yang berubah tiap hari. |
| **D40** ✅ **2026-09-20 — dengan tambahan** | **FIFO sebagai BAWAAN** (cicilan jatuh tempo terlama dulu), **tetapi akunting bisa MENIMPA pencocokan secara manual** saat mengalokasikan pembayaran. Alokasi tetap disimpan per **invoice**; penimpaan diwujudkan kolom **`cash_mutation_allocations.termin_urutan integer NULL`** — `NULL` = ikut FIFO, terisi = **dipaku** ke cicilan ke-N. | Alokasi per cicilan yang WAJIB dipilih akan menuntut akunting memilih tiap kali membayar — beban input yang tidak diminta siapa pun; FIFO menutup kasus lazimnya. Tapi FIFO adalah **konvensi, bukan fakta**: supplier bisa menerapkan urutan lain, dan tanpa jalan menimpa, umur hutang kita akan salah **dan tidak bisa dibetulkan**. Kolom nullable membuat penimpaan jadi pengecualian yang dicatat, bukan bentuk baku — dan bawaannya tetap nol input. |

> **Rincian penimpaan manual (D40) — aturan yang harus ditulis di test, bukan ditebak saat implementasi:**
> 1. **Alokasi berpaku diterapkan LEBIH DULU**, baru sisanya FIFO. Kalau tidak, FIFO akan menyerap cicilan yang sudah dipaku orang lain dan hasilnya bergantung urutan baca.
> 2. **Luberan.** Alokasi berpaku yang nominalnya melebihi cicilan tujuannya **meluber ke cicilan berikutnya secara FIFO** — bukan ditolak. Pembayaran yang kebetulan lebih besar adalah kejadian normal, dan menolaknya memaksa akunting memecah satu pembayaran nyata jadi dua baris palsu.
> 3. **Paku yang jadi yatim.** `jumlah_termin` atau `jatuh_tempo_akhir` invoice bisa diubah setelah alokasi dibuat, sehingga `termin_urutan` menunjuk cicilan yang tidak ada lagi. Aturan: **jatuh kembali ke FIFO dan tandai barisnya** ("paku cicilan ke-4 tidak berlaku lagi") — jangan melempar, dan jangan diam-diam menganggapnya cicilan terakhir.
> 4. **CHECK** `termin_urutan >= 1`. Batas atasnya tidak bisa jadi CHECK (ia lintas-tabel, tergantung `jumlah_termin` invoice) — ditegakkan route dan dikunci test.
| **D41** ✅ **2026-09-20** | **F1–F4 dirancang ulang** (§5.C): rekonsiliasi = **sisa hutang per supplier** (dari invoice − alokasi) dibanding **saldo akun hutang di Neraca** (lewat `lib/financial-agg.ts`, P5). `journal_lines.supplier_id` (D15) **dipertahankan tapi turun pangkat**: ia kini penjelas selisih untuk jurnal manual yang menyentuh akun hutang di luar modul pembelian. | Sumber datanya berpindah total, jadi rancangan F2 lama (saldo per supplier dari `journal_lines.supplier_id`) tidak lagi menjawab pertanyaan yang benar. Kolomnya tetap berguna justru untuk yang TIDAK lewat modul. |

#### Perubahan pada yang sudah jalan

| | Keputusan | Rekomendasi & alasan |
|---|---|---|
| **D42** ✅ **2026-09-20 — bawaan `FALSE`** | Setelan per klien **"posting bisa diedit"**, **bawaan `false` (posting permanen)**, dinyalakan **per klien** saat memang dibutuhkan. Bila menyala: jurnal `posted` boleh diubah/dihapus, **tapi setiap perubahan wajib menulis `audit_events` dengan `nilai_sebelum` + `nilai_sesudah`** (kolom `jsonb` baru, §8.5). **Kunci periode MENGALAHKAN setelan ini.** Ketiga mitigasi di kotak bawah **wajib menyertai, bukan opsional**. **Tambahan Ricko: ketiadaan baris setelan BERARTI `false`, dan itu dikunci test** — bukan sekadar ditulis di komentar. | **Alasan Ricko, 2026-09-20: angka yang sudah diserahkan ke klien tidak boleh berubah diam-diam.** Bawaan `false` membuat keadaan amannya jadi keadaan bawaannya: klien yang tidak pernah disentuh setelannya tidak pernah bisa kehilangan jejak. Menyalakannya jadi tindakan sadar per klien, bukan sesuatu yang diwarisi begitu saja. |
| **D43** ✅ **2026-09-20** | `master_supplier`: **DROP `termin_pembayaran`** (pindah ke invoice), **ADD `bank_nama`, `bank_rekening`, `bank_atas_nama`**. | Termin melekat pada transaksi, bukan pada rekanan — supplier yang sama bisa memberi 3× untuk satu invoice dan tunai untuk yang lain. Ini **satu-satunya migrasi non-aditif** di seluruh perubahan ini; lihat §8.14 dan §12. |
| **D44** ✅ **2026-09-20** | Tab Settings "Supplier" tetap **data induk saja**. Saldo hutang & detail transaksi pindah ke `/hutang`. | Konsisten D39. |
| **D45** ✅ **2026-09-20** | `/pembelian`, `/mutasi-kas`, `/hutang` masuk **`INTERNAL_ONLY_PREFIXES`**, bukan `ACCOUNTING_ONLY_PREFIXES`; `NAV_ITEMS` dapat flag baru **`internalOnly`**. Baca = `requireInternal`, tulis = `requireAkunting`. | Permintaan Ricko: finance membaca & mengunduh, klien tidak melihat sama sekali. **Konsekuensi yang perlu disadari: finance bisa membuka `/hutang` tapi TIDAK `/jurnal` maupun `/buku-besar`** (keduanya `requireAkunting`, keputusan A4 dan Fase 2 #3). Itu koheren — finance melihat kewajiban, bukan pembukuannya — tapi kalau Ricko menginginkan finance juga membaca buku besar, itu keputusan terpisah yang mengubah A4. |

> #### ⚠️ Konsekuensi D42 — **DIPUTUSKAN 2026-09-20: bawaan `false`**
>
> Ricko memilih bawaan **`false`** (posting permanen), dinyalakan per klien bila memang dibutuhkan, dengan alasan yang dicatat apa adanya: **angka yang sudah diserahkan ke klien tidak boleh berubah diam-diam.** Ketiga mitigasi di nomor 3 **tetap wajib dibangun** — ia melindungi klien yang setelannya dinyalakan, dan tanpa mitigasi itu setelan tersebut tidak boleh dinyalakan sama sekali.
>
> 1. **Saat menyala, ia melunakkan P11 dan mengubah arti D13.** Sampai hari ini "terposting" berarti *tidak bisa diubah, hanya dibalik* — itu yang membuat buku besar bisa dipercaya. Dengan setelan menyala, jurnal balik berhenti menjadi **satu-satunya** jalur koreksi dan menjadi **salah satu** jalur. Dengan bawaan `false`, P11 tetap berlaku penuh untuk klien yang setelannya tidak disentuh.
> 2. **Angka yang sudah diserahkan ke klien bisa berubah tanpa ada yang menyentuhnya.** Mengubah jurnal terposting bulan lalu langsung menggeser buku besar, neraca saldo, dan (setelah §7.C) laporan bulan itu. Tidak ada satu pun galat yang muncul.
> 3. **Mitigasinya ada tiga, dan ketiganya wajib menyertai D42, bukan opsional:** (a) `audit_events` dengan `nilai_sebelum`/`nilai_sesudah` — riwayat yang bisa membuktikan apa yang berubah; (b) **kunci periode (§7.B, D17) menjadi jauh lebih mendesak** — ia satu-satunya rem untuk periode yang sudah dilaporkan, dan D26 sudah memajukannya; (c) lencana **"diubah setelah posting"** di `/jurnal` dan `/buku-besar`, supaya pembacanya tahu tanpa harus membuka riwayat.
> 4. **Satu larangan tetap berlaku walau setelannya menyala:** jurnal yang **sudah punya pembalik terposting** tidak boleh diubah. Ia sudah dikoreksi lewat jalur lain; mengubahnya membuat pasangan asli↔pembalik tidak lagi berjumlah nol.
> 5. **Ketiadaan baris setelan = `false`, DIKUNCI TEST** (tambahan Ricko 2026-09-20). Baris `client_accounting_settings` dibuat *lazily*, jadi mayoritas klien tidak akan punya barisnya sama sekali — dan justru merekalah yang paling perlu dilindungi. Bentuk yang salah dan gampang tertulis: `settings?.postingBisaDiedit ?? true` (mengira "belum disetel" = "belum dibatasi"). Predikatnya wajib berbentuk `settings?.postingBisaDiedit === true`, dan **testnya menguji ketiganya: baris tidak ada · baris ada bernilai `false` · baris ada bernilai `true`** — dua yang pertama harus menghasilkan jawaban yang **sama persis**. Selebihnya D42 tidak mengubah apa pun pada kode yang sudah jalan: `canEditJournal` hari ini sudah menolak `posted`, jadi klien tanpa setelan berperilaku persis seperti sekarang.
> 6. **Urutan pembangunan yang mengikat:** mitigasi (a) `nilai_sebelum`/`nilai_sesudah` dan (c) lencana "diubah setelah posting" dibangun **bersamaan** dengan sakelarnya, bukan menyusul. Sakelar tanpa jejak adalah bentuk paling berbahaya dari fitur ini, dan "nanti ditambahkan" adalah cara ia sampai ke produksi tanpa jejak.

### 3.5 Yang DIBATALKAN atau DIGANTI oleh perubahan 2026-09-19 — ✅ **disetujui Ricko 2026-09-20**

| Rencana lama | Nasib | Alasan |
|---|---|---|
| **§6.A Impor Mutasi Kas/Bank (G1–G5)** | ❌ **DIBATALKAN seluruhnya — diserap §5.E** | Fitur yang sama: unggah CSV rekening koran, pemetaan kolom, deteksi duplikat, jadikan jurnal. §5.E menambahkan alokasi ke invoice hutang di atasnya. Membangun keduanya = dua tabel mutasi bank dan dua jalur "jadikan jurnal" yang harus dijaga tetap sama. |
| `bank_imports`, `bank_import_rows`, `bank_mapping_rules` (§8.6–§8.8) | ❌ dibatalkan | Digantikan `cash_mutation_imports`, `cash_mutations`, `cash_mutation_allocations`. |
| **Aturan pemetaan otomatis** (`bank_mapping_rules`, `contains`/`startsWith`) | ⏸ ditunda → ✅ **dihidupkan kembali 2026-10-26 sebagai `cash_mutation_rules` (§5.G S4, D57)** | Berguna, tapi bukan syarat tujuan bisnisnya. Ditambahkan sebagai tabel baru murni-tambah setelah pola keterangan bank klien nyata terlihat. D22 (larangan regex) tetap mengikat saat itu tiba. |
| **D22** (alias header + pemetaan kolom manual + fingerprint dedupe) | ✅ **tetap berlaku**, pindah rumah ke §5.E | Keputusannya benar; yang berubah hanya tabel tujuannya. |
| **§5.C F1–F5 lama** (rekonsiliasi dari `journal_lines.supplier_id`) | 🔄 **dirancang ulang** (D41) | Sumber datanya kini invoice + alokasi. |
| **F1 lama** (pemilih supplier per baris jurnal) | ⬇️ **turun prioritas**, tetap dibangun | Setelah modul pembelian ada, sebagian besar baris hutang lahir dari invoice yang sudah membawa supplier. Yang tersisa: jurnal manual yang menyentuh akun hutang. |
| **`master_supplier.termin_pembayaran`** (§8.4) | ❌ dihapus (D43) | Pindah ke invoice. |
| **P11 / `canEditJournal`** | 🔄 diperlunak oleh D42, **dan diperketat** oleh D32 | Terposting boleh diubah bila setelan klien mengizinkan; jurnal bersumber modul tidak boleh diubah dari `/jurnal` sama sekali. |
| **Nomor migrasi 0014–0017 di §8.6–§8.12** | 🔄 bergeser | 0014 sudah terpakai (posting/events/supplier_id). Urutan baru di §8.14. |

### 3.6 Grid Mutasi Kas & ekstraksi PDF rekening koran — keputusan BARU 2026-10-26 (D46–D62) — ✅ DISETUJUI Ricko 2026-10-26 (D50 & D51 dengan perubahan, D62 dikonfirmasi)

**Asalnya:** feedback pengguna sesudah rilis Phase 5 — input mutasi satu per satu lewat form terlalu lambat, dan alur unduh-templat → isi → unggah CSV tidak ramah bagi admin awam. **Direvisi di hari yang sama** dengan temuan Ricko dari template laporan keuangan akuntan (**Rasyuka, April 2026**). Rancangan lengkapnya di **§5.G**. Keputusan di bawah mengubah bentuk tabel, jalur tulis, atau perilaku yang sudah jalan — **pelaksana tidak boleh menyimpulkannya sendiri**. Tidak ada task vendor untuk pekerjaan ini (di luar plan `e2cbb3a7`); jangan `task start` apa pun untuknya.

**Prinsip pengikat dari brief Ricko — bukan keputusan terbuka: SATU JALUR TINJAU.** Ketik langsung, tempel (paste), berkas CSV, dan PDF **semuanya** berakhir di grid yang sama sebagai **DRAF**, lalu disimpan lewat **satu route** dengan **satu perencana aturan**. Tidak ada jalur simpan kedua dengan aturan berbeda.

**Ditetapkan Ricko 2026-10-26 (arahan, bukan pilihan terbuka):**
- **ARAH UANG TIDAK PERNAH DITENTUKAN DARI JUDUL KOLOM** — menjawab pertanyaan N7 yang menggantung sejak 2026-09-22. Sheet kas template akuntan memakai **Debet = uang MASUK** (sudut pandang perusahaan); rekening koran bank asli memakai **Debet = uang KELUAR**, dan BCA menandai **DB/CR** di uraian. Kata "Debet" di judul kolom karenanya ambigu. Grid memakai **Masuk/Keluar**; arah sebuah blok tempelan/berkas/PDF ditentukan **kesinambungan saldo** (S3), dengan penanda DB/CR sebagai **petunjuk tambahan**; **tanpa kolom saldo, pengguna WAJIB memilih arah secara eksplisit** di pratinjau. Alias header impor CSV yang sekarang ("Debet" = keluar, N3) berhenti menentukan arah.
- **Target kinerja: 10.000 baris per akun kas per bulan** (Kas Shopee 1 = 5.187 baris di April 2026).
- **Aturan akun lawan otomatis** "uraian mengandung X → akun Y", per klien, **tanpa regex** (D22) — `bank_mapping_rules` yang ditunda (§3.5) **dihidupkan kembali**. Aturan menghasilkan **usulan yang bisa ditimpa**, bukan keputusan final.
- **Pindah Buku:** peringatan bila saldo akun Pindah Buku ≠ 0 di akhir periode + bantuan mencocokkan pasangan transfer antar akun kas.
- Kolom akun lawan menerima **kode ATAU nama akun persis**; kolom **catatan** opsional (template: "Konfirmasi/Reff").
- Tanggal: terima `DD/MM/YYYY`, `DD/Mon/YYYY`, `D-Mon-YYYY`; **periode yang dipilih menentukan makna tanggal ambigu**.
- **Class CF** (Operating Balance/Operating/Investing/Funding) sebagai bahan Cash Flow metode langsung dari mutasi kas — kolomnya sekarang, laporannya nanti.
- Catatan untuk L1: kelompok "Pendapatan & Biaya Lain-lain" di template **ber-posisi Kredit** dan biayanya tampil **negatif** (§7.C).

| | Keputusan | Rekomendasi & alasan |
|---|---|---|
| **D46** ✅ **disetujui Ricko 2026-10-26** | **Library grid** | **`react-data-grid` dipin PERSIS `7.0.0-beta.63`** (tanpa `^`), dibuktikan dulu di spike S0 dengan **20.000 baris** (2× target); **cadangan: `@tanstack/react-virtual`** + grid tulis sendiri. Kandidat & lisensinya di tabel bawah. |
| **D47** ✅ **disetujui Ricko 2026-10-26** | **Nasib wizard impor CSV (N6)** | **DILEBUR menjadi pintu masuk berkas.** Wizard tetap memilih berkas, pemisah, pemetaan kolom (bila header tak dikenali), menolak berkas MM/DD, dan kini **menampilkan langkah arah** (otomatis dari saldo, atau **pilihan wajib** bila tanpa saldo) — langkah terakhirnya **"Masukkan ke grid"**, bukan "Simpan". Parsing pindah ke browser (`lib/csv/mutasi-kas.ts` sudah murni); **`POST /api/cash-mutations/import` dihapus** — dugaan duplikatnya digantikan `dryRun` route batch (D48). Ditolak: wizard tetap menulis sendiri — itu jalur simpan kedua. **Perubahan perilaku:** hari ini impor menyimpan baris terbaca dan **melewati** baris bermasalah (simpan sebagian); sesudah D47, baris bermasalah tampil merah dan **menahan Simpan**. |
| **D48** ✅ **disetujui Ricko 2026-10-26** | **Satu jalur tulis** | **`POST /api/cash-mutations/batch`** `{ baru[], ubah[], hapus[], dryRun }` + perencana `rencanakanSimpanMutasi` (`lib/api/cash-mutation-batch.ts`). Logika POST/PATCH/DELETE yang sekarang **DIPINDAH** ke perencana itu (bukan ditulis ulang), dan ketiga route lama jadi **pembungkus tipis** — form satu-satu (HP) tetap jalan dengan aturan identik. Alokasi tetap route-nya sendiri. **Semua-atau-tidak-sama-sekali: satu `db.batch`** (boleh banyak statement di dalamnya — lihat D52). Pencatatan per sumber TIDAK berubah: baris dari berkas → satu `cash_mutation_imports` per berkas tanpa event per baris (N4); baris ketik/tempel → event `created` per baris; ubah → `updated` dengan `nilai_sebelum/sesudah`; hapus → aturan DELETE yang sekarang. |
| **D49** ✅ **disetujui Ricko 2026-10-26** | **Skema Modul A — migrasi 0021, seluruhnya tambah** | (1) `cash_mutations.urutan integer NULL` (CHECK ≥ 1): urutan baris dalam satu hari **hilang** sesudah disimpan (insert massal → `created_at` sama, `id` acak), padahal kesinambungan saldo di mode sunting dan rekonsiliasi bank kelak butuh urutan rekening koran; urutan baku `tanggal, created_at, urutan, id`. (2) `cash_mutations.catatan text NULL` (≤ 500, **tidak** ikut fingerprint). (3) `client_accounting_settings.akun_pindah_buku_id` → `master_coa` **set null** (pola D33; D59). (4) tabel **`cash_mutation_rules`** (D57, §8.22). **Saldo TIDAK butuh kolom baru** dan **Class CF juga tidak** — keduanya sudah ada (kotak P4 & D62). |
| **D50** ✅ **disetujui Ricko 2026-10-26** | **Saldo putus menahan Simpan?** | **Ya.** Ia pengaman utama terhadap salah baca AI dan arah terbalik; peringatan yang bisa diabaikan tidak menjaga apa pun di 10.000 baris. Jalan keluar jujur bila rekening korannya sendiri tidak konsisten: **kosongkan sel Saldo** baris itu — rantai lalu diperiksa antar baris yang masih bersaldo. Halaman yang hilang tidak bisa diakali dengan itu, dan memang tidak boleh. **→ Keputusan Ricko 2026-10-26 (diubah):** Pengosongan sel saldo **terlihat jelas di grid** (penanda "saldo dikosongkan" + saldo aslinya tetap tampil) dan **tercatat di riwayat mutasi**: tiap baris itu menulis event `saldo_dikosongkan` dengan `nilai_sebelum: { saldo: <asli> }` — juga untuk baris dari berkas yang biasanya tanpa event per baris. Bukan jalan pintas diam-diam. |
| **D51** ✅ **disetujui Ricko 2026-10-26** | **Di mana draf hidup** | **Di memori browser saja** + penjaga "ada perubahan belum disimpan". **Tidak** `localStorage` (rekening koran di komputer bersama), **tidak** tabel draf di server. Harga: tab yang crash kehilangan draf. **→ Keputusan Ricko 2026-10-26 (diubah):** Bukan hanya memori: **peringatan sebelum meninggalkan halaman** + **cadangan draf di IndexedDB per (klien, akun kas)**, **dihapus otomatis setelah Simpan berhasil**, dan tawaran **"Pulihkan draf"** (atau buang) saat halaman dibuka lagi. Ditulis berkala saat draf kotor; IndexedDB tak tersedia (mode privat, diblokir) → hanya peringatan, tanpa galat. |
| **D52** ✅ **disetujui Ricko 2026-10-26** | **Batas per Simpan** | **Satu Simpan harus muat satu akun-bulan: 10.000 baru** · 2.000 ubah · 2.000 hapus — angka final dari **uji beban S7**. Dua batas teknis yang sudah pasti: **65.535 parameter per statement** Postgres (10.000 baris × ±12 kolom harus dipecah jadi beberapa `INSERT` — **di dalam `db.batch` yang sama**, tetap atomik) dan **body fungsi Vercel ±4,5 MB** (diukur; bila 10.000 baris uraian panjang melampauinya, Simpan dibagi per rentang tanggal **secara terlihat**). **Tidak pernah dipecah diam-diam.** |
| **D53** ✅ **disetujui Ricko 2026-10-26** | **Urutan kerja vs Kunci Periode** | **K1–K5 SEBELUM S7** (route batch). Grid adalah jalur sunting massal; tanpa `isDateLocked` sejak hari pertama, satu tempelan bisa menulis ulang bulan yang sudah dilaporkan. S0–S6 (spike + modul murni + aturan + Pindah Buku, tanpa jalur tulis mutasi massal) boleh lebih dulu. **Butuh D17 & D26.** |
| **D54** ✅ **disetujui Ricko 2026-10-26** | **Penyedia AI Modul B** | **Dipilih dari uji banding X6.** Kandidat: Gemini Flash-Lite, Claude Haiku, GPT mini (atau penerus setaranya). **Syarat mengikat:** berbayar; data API **tidak dipakai melatih model**; **free tier dilarang**; API first-party **DeepSeek/Z.ai tidak dipakai untuk data klien**. Ukuran utama: **% dokumen lolos kesinambungan saldo tanpa koreksi** + perkiraan biaya per dokumen. |
| **D55** ✅ **dijawab Ricko 2026-10-26: opsi (b)** | **Fitur AI lain & sakelar** | Saran COA Mapping dan ekstraksi PDF laporan di `/upload` **tetap menyala sementara** sambil Gemini paid tier diurus dengan NPWP kantor. Sakelar diperluas ke keduanya (commit tersendiri) dengan **bawaan MENYALA** selama `AI_FEATURES_ENABLED` tidak diisi; saran akun jurnal tetap mati. ~~Batas waktu 9 November 2026~~ → **✅ paid tier aktif 2026-10-26**: Production memakai kunci berbayar dan `AI_FEATURES_ENABLED="true"`; dev & Preview memakai project free tier terpisah, **hanya untuk data karangan**. |
| **D56** ✅ **disetujui Ricko 2026-10-26** | **PDF rekening koran disimpan?** | **Tidak.** Teks diekstrak **di browser**; server hanya meneruskan teks/gambar halaman ke penyedia, **tidak menulis ke DB/berkas/log**. Jejak: nama berkas + jumlah baris di `cash_mutation_imports`. |
| **D57** ✅ **disetujui Ricko 2026-10-26** | **Aturan akun lawan** | Tabel **`cash_mutation_rules`** (menghidupkan §8.8 `bank_mapping_rules`, dinamai ulang mengikuti D35): per klien, `pola` (teks), `arah` (masuk/keluar/keduanya), `akun_lawan_id`, `akun_kas_id` opsional, `prioritas`, `aktif`. Cocok = `normalizeKeterangan(uraian).includes(normalizeKeterangan(pola))` — **tanpa RegExp**. Banyak yang cocok → prioritas tertinggi, lalu pola terpanjang; seri → **tanpa usulan** + tanda "aturan bentrok". **Usulan tidak masuk nilai sel sampai "Terapkan usulan"** ditekan (untuk baris terpilih atau semua) — sejalan dengan D10 ("tidak ada yang masuk ke baris sampai Terapkan"), satu klik untuk 5.000 baris. Kelola di tab Settings **"Aturan Mutasi"** (owner/akunting tulis, finance baca) + "Buat aturan dari baris ini" di grid. `akun_lawan_id` NOT NULL → **blokir 409** di `buildReplacePlan` bila kodenya hilang (§8.15). |
| **D58** ✅ **disetujui Ricko 2026-10-26** | **Jurnal per baris vs jurnal RINGKASAN** | **Rekomendasi: jurnal ringkasan per (akun kas, akun lawan, tanggal) untuk mutasi berakun-lawan (kasus b); mutasi beralokasi ke invoice TETAP jurnal per mutasi.** Rincian baris tetap di `cash_mutations` (banyak mutasi → satu `journal_id`; kolomnya tidak unik, jadi **tanpa migrasi**). Analisis opsi & dampaknya di §5.G kotak D58. |
| **D59** ✅ **disetujui Ricko 2026-10-26** | **Pindah Buku** | Akun Pindah Buku = **setelan per klien** `client_accounting_settings.akun_pindah_buku_id` (pola PPN Masukan D33). Peringatan akhir periode = **Σ(masuk − keluar) mutasi berakun-lawan Pindah Buku di seluruh akun kas klien, s.d. akhir periode ≠ 0** — turunan dari mutasi (P3/P4), mencakup yang belum diposting. Pencocok pasangan: keluar di akun kas A ↔ masuk di akun kas B, **nominal sama persis, selisih tanggal ≤ 3 hari** (`hariAntara`), hanya pasangan **tunggal** yang diusulkan; ganda → ditampilkan sebagai kandidat. Pasangan **tidak disimpan** — hasilnya hanya usulan akun lawan Pindah Buku di kedua baris (lewat "Terapkan", D57). Transfer lintas periode wajar → **peringatan, bukan galat**. |
| **D60** ✅ **disetujui Ricko 2026-10-26** | **Tanggal: baris tanpa tanggal & di luar periode** | Dua opsi yang Ricko minta: **(a) wajib diisi** — sel merah, menahan Simpan; **(b) otomatis tanggal akhir periode** dengan penanda "tanggal diisi otomatis". **Rekomendasi: (a), ditambah aksi eksplisit "Isi tanggal akhir periode" untuk baris terpilih** — kemudahan (b) tanpa tanggal karangan yang masuk diam-diam (tanggal menentukan periode, kunci periode, dan urutan rantai saldo). Baris bertanggal **di luar periode yang dipilih → galat** (jalan keluar: perlebar periode) — rekening koran bulanan yang memuat tanggal di luar bulannya hampir selalu salah baca. |
| **D61** ✅ **disetujui Ricko 2026-10-26** | **Saldo awal: majukan Fase 4 §7.A?** | **Tidak untuk grid.** Rantai saldo membandingkan saldo BANK dengan saldo BANK, jadi jangkarnya fakta dokumen: baris **SALDO AWAL** di tempelan/PDF → saldo baris tersimpan sebelum rentang → isian **"saldo awal rekening koran"** di bilah grid (tidak disimpan). **Saldo awal BUKU (jurnal `opening_balance`, D16) dimajukan terbatas akun kas BERSAMAAN dengan laporan Cash Flow dari mutasi** (fase sesudah grid), karena di sanalah ia dibutuhkan: saldo kas awal laporan dan cek "saldo buku = saldo bank". Bila Ricko ingin cek itu ada sejak grid rilis, J1–J3 khusus akun kas bisa disisipkan sesudah S9 — butuh D16. |
| **D62** ✅ **disetujui Ricko 2026-10-26** | **Class CF** | **Kolomnya SUDAH ADA** (`master_coa.class_cf text NULL`, sejak 0000) dan Master COA nyata sudah memakai keempat nilai — di dev: Operating 148, Funding 16, Investing 11, **Operating Balance 22**. Yang kurang adalah **kosakatanya**: (1) baku empat nilai `Operating Balance` · `Operating` · `Investing` · `Funding`, dinormalkan saat impor/sunting COA (tetap `text`, **tanpa migrasi**); (2) `classification-health` kini menandai "Operating Balance" sebagai *tidak dikenali* — **peringatan palsu** untuk 22 akun; (3) **"Operating Balance" = akun kas/bank** (22 akun di dev: Bank BCA, Kas Shopee 1, OVO, Paypal, Sinarmas, …) **tapi `is_kas` belum tersetel pada satu pun**, dan `deriveIsKas` (nama memuat "kas"/"bank") **tidak mengenali OVO, Paypal, Sinarmas** — tab grid mereka tidak akan muncul. Rekomendasi: aksi Settings **"Tandai akun Operating Balance sebagai akun kas"** (eksplisit, ditinjau) — **bukan** mengubah `deriveIsKas`, karena predikatnya dikunci sama dengan "Kas & Setara Kas" di Dashboard. Ricko mohon mengonfirmasi makna "Operating Balance" = akun kas/bank. ✅ **Dikonfirmasi Ricko 2026-10-26: Operating Balance = akun kas/bank** (sesuai master data template Rasyuka). |

**Kandidat library grid (D46) — lisensi & versi diverifikasi dari registry npm 2026-10-26:**

| Kandidat | Versi | Lisensi | React 19 | Catatan |
|---|---|---|---|---|
| **`react-data-grid`** (adazzle) | 7.0.0-beta.63 | **MIT** | ✅ peer `^19.2` | Berbasis DOM; virtualisasi bawaan (`enableVirtualization`), `role="grid"` + `aria-*`, navigasi keyboard, editor per kolom (`renderEditCell` → **`NominalInput` N9 dipakai ulang langsung**), seleksi baris, `onCellCopy`/`onCellPaste` per sel (tempel multi-baris tetap kode kita). Risiko: rilis "beta" bertahun-tahun → pin persis, bungkus di satu komponen. |
| **`@tanstack/react-virtual`** (+ opsional `@tanstack/react-table` 9.3.1) | 3.14.22 | **MIT** | ✅ | Headless: hanya virtualisasi. Pola grid ARIA, navigasi, seleksi, editor kita tulis sendiri — kendali penuh, kode & risiko a11y terbanyak. |
| `@glideapps/glide-data-grid` | 6.0.3 | MIT | ❌ peer `react ≤18` | Canvas: sel kustom harus digambar di canvas (N9 tidak bisa dipakai ulang); README-nya mengakui pengembang utamanya tidak memakai pembaca layar. |
| ~~Handsontable~~ | 18.1.2 | `SEE LICENSE IN LICENSE.txt` | — | **Dikeluarkan:** proprietary, gratis hanya non-komersial/evaluasi. |
| ~~AG Grid~~ | 36.2.0 | Community MIT · Enterprise **Commercial** | — | **Dikeluarkan:** fitur Clipboard (copy/paste) adalah fitur **Enterprise** menurut dokumentasinya. |
| ~~MUI X Data Grid~~ | 9.16.0 | MIT · Premium berlisensi | — | **Dikeluarkan:** "Clipboard paste" berlencana **Premium**; versi MIT menyeret `@mui/material` + emotion yang asing bagi Tailwind v4. |

---

## 4. Fase 1 — Jurnal Umum + Master Data Supplier (D1–D10 mengikat)

### 4.0 Pakai ulang — jangan bangun kembar

| Kebutuhan | Pakai yang sudah ada | Berkas |
|---|---|---|
| Validasi tanggal, selisih hari | `isValidYmd`, `hariAntara`, `todayYmd`, `localDateToYmd` | `lib/contracts.ts`, `lib/ymd.ts` |
| Nominal → string 2 desimal | `normalizeNominal` | `lib/contracts.ts` |
| Tipe akun turunan | `classifyBs`, `classifyPnl` | `lib/financial-agg.ts` |
| Guard | `requireAkunting`, `requireUser` + `canAccessClientData` | `lib/api/guards.ts`, `lib/roles.ts` |
| Galat DB → 409/500 | `isUniqueViolation`, `isFkViolation`, `dbWriteErrorResponse` | `lib/api/db-errors.ts` |
| Header + baris atomik | `randomUUID()` + `db.batch` | `app/api/contracts/route.ts` POST |
| Ganti himpunan baris anak | delete + insert dalam batch | `app/api/contracts/[id]/route.ts` PATCH |
| Cegah id akun lintas-klien | `inArray` + bandingkan `found.length` | `app/api/reports/[id]/mapping/route.ts` |
| Ambil baris dulu, cek klien | pola | `app/api/contracts/[id]/route.ts` GET |
| Id user dari sesi | lookup by email | `app/api/account/password/route.ts` |
| Saran AI | `generateContentWithRetry`, bentuk `suggestCoaWithGemini`, `AI_MIN_CONFIDENCE`, 429/400/502 | `lib/gemini/*`, `app/api/reports/[id]/suggest-ai/route.ts` |
| Pemilih akun | `StyledSelect` (`badge`, `group`, `searchable`) | `components/ui/styled-select.tsx` |
| Dialog | `ModalShell` | `components/ui/modal-portal.tsx` |
| Periode | `DateRangePicker` | `components/date-range-picker.tsx` |
| Rupiah | `useRupiah()` | `lib/preferences-context.tsx` |
| Klien aktif | `useRequireClient`, `useClient` | `lib/use-require-client.ts`, `lib/client-context.tsx` |
| Tata letak tabel | `/laporan`, `/kontrak` | `app/laporan/page.tsx` |
| Impor/ekspor xlsx + round-trip | `parseCoaWorkbook`, `HEADER_ALIASES`, `buildCoaWorkbook` + test | `lib/coa-import.ts`, `lib/coa-export.ts(.test.ts)` |
| Relink saat COA diganti | `buildReplacePlan`, `LineRelink` | `lib/coa/replace-plan.ts` |
| Nav/akses/tab + test | `NAV_ITEMS`, `ACCOUNTING_ONLY_PREFIXES`, `SETTINGS_TABS` | `lib/nav-items.ts`, `lib/route-access.ts`, `lib/settings-tabs.ts` |
| Migrasi enum tulis tangan | preseden | `migrations/0003_*.sql`, `0007_*.sql` |
| Test route baca-sumber | pola | `lib/contracts-api.test.ts` |

### 4.A Jurnal Umum

Skema: §8.1–8.3. Migrasi **0010** (dua enum, dua tabel).

**A1 — Skema + migrasi 0010.** `lib/db/schema.ts` (tambah saja) + relations; `pnpm db:generate` dengan `.env.local`→dev; tinjau SQL; `db:migrate` dev. Verifikasi: tsc; `git diff schema.ts` hanya penambahan.

**A2 — `lib/journal.ts` + test  ⏸ CP-1.** Isi wajib: `JOURNAL_STATUS`, `JOURNAL_SOURCE`, label; `MIN_LINES=2`, `NO_BUKTI_MAX=80`; `toMinorUnits(str)`; `computeTotals(lines) → { debit, kredit, selisih, sisiLebih }` (sen); `isBalanced`; `validateJournalInput` (kumpulkan **semua** galat: tanggal `isValidYmd`; noBukti 1..80; keterangan ≥1; ≥2 baris; tiap baris: `masterCoaId` UUID, D/K via `normalizeNominal`, **tepat satu sisi > 0**, keterangan opsional→null; Σ D = Σ K); `canEditJournal(status)`. Test: seimbang/tidak; satu baris; dua sisi; nol-nol; 31 Feb; negatif; sen tidak drift; canEdit. Task: `…/validasi-keseimbangan-debit-kredit-di-form-dengan` (inti).

**A3 — COA sadar jurnal (D4)  ⏸ CP-2.** `buildReplacePlan` menerima **opsional** `journalLines: {id, journalId, noBukti, masterCoaId}[]` + `suppliers: {id, nama, akunHutangDefaultId}[]`; keluaran: `journalRelinkedCount`, `journalBlocked: {journalId, noBukti, kode}[]`, `supplierRelinkedCount`, `supplierUnlinkedCount`; `relinks.journalRelinks`, `relinks.supplierRelinks`. Kode ambigu → blocked. Route `coa` POST & `coa/rows/[coaId]` DELETE: ambil baris jurnal (join header) + supplier klien **sebelum** menulis; `journalBlocked.length > 0` → **409 sebelum batch** (juga di `dryRun.impact`); kalau lolos, satu `UPDATE … FROM (VALUES …)` untuk `journal_lines` + update supplier, di batch yang sama. Dialog dampak menampilkan blokir merah + nomor bukti, tombol simpan nonaktif. Test: relink; hilang → blocked; ambigu → blocked; supplier; **input tanpa `journalLines` berperilaku persis seperti sebelumnya** — test lama tak diubah.

**A4 — Route jurnal.** Semua `runtime='nodejs'`.
- `GET /api/journals?clientId&periodStart&periodEnd` — `requireUser`+`canAccessClientData`; UUID+YMD; `tanggal BETWEEN`; urut `tanggal DESC, no_bukti`; header + `totalDebit` (string) + `lineCount` + `createdByName` (join users). Tanpa baris.
- `GET /api/journals/[id]` — ambil baris DULU → `canAccessClientData(row.clientId)`; header + `lines` (join kode, nama) urut `line_order`.
- `POST /api/journals` — `requireAkunting`; `validateJournalInput`; klien ada; semua akun milik klien; `created_by` lookup email; `randomUUID` + batch; 409 nomor bukti; 201 bentuk = detail.
- `PATCH /api/journals/[id]` — `requireAkunting`; `canEditJournal` gagal → 409; batch: update header + delete lines + insert lines.
- `DELETE /api/journals/[id]` — `requireAkunting`; draft saja → 409; cascade.
Test `lib/journals-api.test.ts` (baca sumber): tulis hanya `requireAkunting`; detail ambil baris sebelum cek klien; PATCH/DELETE memanggil `canEditJournal`.

**A5 — Saran akun AI (D10).** `lib/gemini/suggest-journal-account.ts`: `suggestJournalAccounts(keterangan, choices) → { debitKode, kreditKode, confidence, reason } | null`; satu `generateContentWithRetry`, schema JSON, `temperature: 0`; prompt: makna akuntansi, hormati posisi normal, `""` bila tak yakin. Route `POST /api/journals/suggest-account { clientId, keterangan }`: `requireAkunting`+`canAccessClientData`; muat `master_coa` klien; kode→`{id,kode,nama}`; buang `< AI_MIN_CONFIDENCE`; salin penanganan `GEMINI_API_KEY` 400 / kuota 429 / lainnya 502; `maxDuration=60`. Task: `…/buat-ui-saran-akun-ai-dari-keterangan-transaksi-mo` (UI di A7).

**A6 — Nav, akses, ikon.** `NavItemId` += `'jurnal'`; `{ id:'jurnal', label:'Jurnal', staffOnly:true }` **tepat setelah `upload`**; **perbarui keempat daftar di `nav-items.test.ts`** (urutan diuji); `ACCOUNTING_ONLY_PREFIXES` += `'/jurnal'` + test; `NAV_ICONS.jurnal = BookOpen`.

**A7 — Halaman `/jurnal`  ⏸ CP-3.** `app/jurnal/page.tsx` + `components/jurnal/journal-form-modal.tsx` + `components/jurnal/journal-detail.tsx` (pecah bila > ~400 baris). Isi: `useRequireClient`; `DateRangePicker` (default bulan berjalan); tabel Tanggal · No Bukti · Keterangan (truncate + `title`) · Total · Status (pill) · **Dibuat oleh** · Aksi (Ubah/Hapus hanya `canDoAccounting` ∧ `canEditJournal`); baris expand → detail baris + total + pembuat + `created_at`; **form** `ModalShell max-w-3xl`: Tanggal, No Bukti, Keterangan, tombol **"Sarankan akun (AI)"** → dua chip D/K + `reason` + **Terapkan** (mengisi dua baris kosong pertama; tak pernah otomatis); baris: `StyledSelect` akun (`badge=kode`, `group=kelompok`, `searchable`, opsi dari `GET /api/clients/[id]/coa`), Debit, Kredit (saling mengosongkan), Keterangan, hapus; tambah baris; **validasi hidup** via `computeTotals` → panel D/K/Selisih berwarna, pesan "Selisih Rp X — sisi debit lebih besar", Simpan nonaktif bila tak valid; galat 409 inline; hapus draf dengan konfirmasi ringkas; keadaan kosong + tombol Jurnal Baru (gerbang `canDoAccounting` ∧ klien aktif). A11y CLAUDE.md. Task: `…/bangun-halaman-utama-jurnal-umum-dengan-data-tirua`, `…/buat-daftar-jurnal-per-klien-dan-periode-mock`, `…/buat-tampilan-detail-jurnal-dan-barisnya-mock`, `…/buat-form-input-jurnal-manual-dengan-baris-debit-k`, `…/validasi-keseimbangan-debit-kredit-di-form-dengan`, `…/buat-ui-saran-akun-ai-dari-keterangan-transaksi-mo`, `…/tampilkan-jejak-pembuat-di-daftar-dan-detail-jurna`. Agen tidak bisa login → daftar klik untuk Ricko di CP-3.

**A8 — Fixture dev (opsional).** `seed-dev.ts`: 2–3 jurnal seimbang per klien seed; `created_by` = user owner pertama (lookup). Dev saja.

**A9 — ROADMAP + sync.**

### 4.B Master Data Supplier (tanpa rekonsiliasi)

Skema §8.4. Migrasi **0011**.

**B1 — Skema + migrasi 0011.**
**B2 — Murni + impor/ekspor + test.** `lib/supplier.ts`: `validateSupplierInput` (nama 2..120; kontak/npwp → null; termin 0..365|null; akun UUID|null), `isHutangAccount(subKelompok) = classifyBs(...) === 'hutang'`. `lib/supplier-import.ts`: `parseSupplierWorkbook` + `HEADER_ALIASES` (nama/nama supplier/supplier/vendor; kontak/pic; npwp; termin/termin pembayaran/termin (hari); akun hutang/kode akun hutang — berisi **kode**, resolve di route, tak dikenal → warning). `lib/supplier-export.ts`: `buildSupplierWorkbook`, `supplierExportFilename`, **kontrak round-trip** + test.
**B3 — Route** `app/api/clients/[id]/suppliers/`: `GET` (**`requireInternal`**+`canAccessClientData` — R4: finance boleh lihat, klien tidak; join kode/nama akun); `POST` (`requireAkunting`; akun milik klien ∧ `isHutangAccount`; 409 nama); `[supplierId]` `PATCH` partial, `DELETE` hard (D9); `import` `POST` multipart `{file, dryRun?}` upsert by nama (D8), `dryRun → {toInsert, toUpdate, warnings}`; `export` `GET` xlsx (**`requireInternal`** — R4; header RFC 5987, `no-store`).
**B4 — Tab Settings "Supplier"  ⏸ CP-4.** `SettingsTabId` += `'supplier'`; `SETTINGS_TABS` setelah `coa`; **masuk `FINANCE_VISIBLE_TABS`** (R4: finance lihat saja), **tidak** di `USER_VISIBLE_TABS` (D7: klien tidak); **perbarui `settings-tabs.test.ts`** (finance melihat `supplier`, user tidak); `settings/page.tsx` label "Supplier", ikon `Truck`, dirender `<SupplierTab readOnly={!canDoAccounting} />` mengikuti pola `MasterCoaTab`; `components/settings/supplier-manager.tsx`: tabel; Tambah/Impor/Ekspor (Tambah/Sunting/Hapus/Impor disembunyikan bila `readOnly`, Ekspor tetap); form (`ModalShell`) dengan pemilih akun hutang = `StyledSelect` disaring `isHutangAccount`, `badge=kode`, `group=subKelompok`, placeholder "— tanpa akun default —"; hapus konfirmasi ringkas; impor `dryRun` → ringkasan → commit. Task: `…/bangun-halaman-daftar-supplier-per-klien`, `…/buat-form-tambah-dan-sunting-supplier`, `…/tambah-aksi-hapus-supplier-dengan-konfirmasi`, `…/buat-pemilih-akun-hutang-default-supplier`, `…/bangun-halaman-impor-dan-ekspor-supplier`.
**B5 — Rekonsiliasi: `task fail`** `mesin-akuntansi-jurnal-manual/master-data-supplier/bangun-halaman-rekonsiliasi-hutang-supplier` dengan alasan: "Belum ada sumber saldo hutang per supplier di Fase 1: butuh posting (Fase 2) dan `journal_lines.supplier_id` (D15). Dikerjakan di §5.C." (D5)
**B6 — ROADMAP + sync.**

---

## 5. Fase 2 — Buku Besar & Posting · Master COA Bertipe · Rekonsiliasi Supplier

### 5.0 Migrasi
- ✅ **0014_posting_events_supplier_link** (nomor nyata; §5.0 semula menulis 0012): `journal_entries` + `posted_at timestamptz NULL`, `posted_by uuid NULL → users restrict`, `reversal_of_id uuid NULL → journal_entries restrict`; tabel **`audit_events`** (§8.5, R2); `journal_lines` + `supplier_id uuid NULL → master_supplier restrict` + index. Semua `ADD COLUMN` nullable / `CREATE` → non-destruktif.
- **0013_coa_account_type**: `CREATE TYPE account_type`; `master_coa` + `tipe_akun account_type NULL`, `is_kas boolean NOT NULL DEFAULT false`. Non-destruktif.

### 5.A Buku Besar & Posting

**C1 — `lib/journal.ts` (perluasan) + `lib/ledger.ts` + test  ⏸ CP-5.**
- `lib/journal.ts` tambah: `canPost(entry, { isLocked }) → { ok } | { ok:false, reason }` (harus `draft`; baris seimbang; `!isLocked(tanggal)` — Fase 2 mengoper `() => false`); `canReverse(entry, existingReversal)` (harus `posted`; belum ada pembalik `posted`); `buildReversalLines(lines)` (tukar D/K, pertahankan akun & keterangan, `line_order` sama); `JOURNAL_EVENTS = ['created','updated','deleted','posted','reversal_created', …] as const` (text di DB, D12).
- `lib/ledger.ts` (murni): `normalSign(posisi) → +1|-1`; `computeRunningBalance({ lines, posisi, openingLines }) → { opening, rows: [{ …line, saldo }], closing }` — urut `(tanggal, no_bukti, line_order)`, saldo dalam **sen bulat** berarah normal balance (Debit-normal: `D−K` menambah; Kredit-normal: `K−D`); `summarizeByAccount(lines, accounts)` untuk daftar saldo semua akun (neraca saldo ringkas).
- Test: posting draf lolos, posted ditolak, terkunci ditolak; reversal dua kali ditolak; `buildReversalLines` menukar; saldo berjalan Debit vs Kredit-normal; opening dari baris sebelum periode; urutan stabil.

**C2 — Route posting, balik, riwayat, buku besar.**
- `POST /api/journals/[id]/post` — `requireAkunting`; ambil header+lines; `canPost` (isLocked stub Fase 2 → §7.B menggantinya); batch: update `status='posted', posted_at=now(), posted_by`; insert `audit_events{entity_type:'journal', event:'posted'}`. 409 bila gagal predikat dengan `reason`.
- `POST /api/journals/[id]/reverse` body `{ tanggal, noBukti, keterangan? }` — `requireAkunting`; ambil asli; `canReverse` (cek pembalik existing: `select … where reversal_of_id = id and status='posted'`); buat entri **draft** baru `sumber='manual'`, `reversal_of_id=id`, baris dari `buildReversalLines`; batch + event `reversal_created` pada asli **dan** `created` pada baru. Default `noBukti` disarankan UI: `REV-<asli>`.
- `GET /api/journals/[id]` (perluasan) — tambah `events[]` (join users.name) dan `reversedBy: { id, noBukti } | null`, `reversalOf: {…} | null`.
- **Semua mutasi jurnal Fase 1** (POST/PATCH/DELETE) kini juga menulis `audit_events` (P10) — perbarui A4. ✅ selesai di C2.
- `GET /api/ledger?clientId&masterCoaId&periodStart&periodEnd` — `requireUser`+`canAccessClientData`; akun milik klien; ambil `journal_lines` **terposting** akun itu ≤ `periodEnd` (join header untuk tanggal/no_bukti/keterangan/journalId); pisahkan `< periodStart` sebagai opening; `computeRunningBalance`. Respons: `{ account, opening, rows, closing }` (string sen→ desimal di route).
- `GET /api/ledger/summary?clientId&periodEnd` — saldo semua akun (neraca saldo) via `summarizeByAccount`.
- Test baca-sumber: post/reverse hanya `requireAkunting`; ledger hanya baris `posted`.

**C3 — Nav/akses.** `'buku-besar'` setelah `'jurnal'`, `staffOnly`; `ACCOUNTING_ONLY_PREFIXES` += `'/buku-besar'`; ikon `BookOpenCheck`/`Scale`; perbarui test urutan.

**C4 — UI  ⏸ CP-6.**
- `/jurnal`: tombol **Posting** (draf, `canDoAccounting`) dengan konfirmasi "Setelah diposting jurnal tidak bisa diubah, hanya dibalik"; tombol **Balik** (posted & belum dibalik) → modal tanggal/no bukti/keterangan → membuat draf pembalik lalu membuka detailnya; lencana "Dibalik oleh REV-…" / "Pembalik dari …"; panel **Riwayat** di detail (events, nama, waktu).
- `/buku-besar` (`app/buku-besar/page.tsx`): `StyledSelect` akun (`badge=kode`, `group=kelompok`, searchable) + `DateRangePicker`; tabel Tanggal · No Bukti · Keterangan · Debit · Kredit · **Saldo** (berjalan), baris Saldo Awal di atas, Saldo Akhir di bawah; klik no bukti → detail jurnal; ringkasan semua akun (neraca saldo) sebagai tampilan kedua/tab.
- Task vendor: fitur "Buku Besar & Posting" (Posting Jurnal, Buku Besar per Akun, Koreksi Jurnal Balik, Riwayat Perubahan) — petakan judul ke C1–C4.

**C5 — ROADMAP + sync.**

### 5.B Master COA Bertipe (D14)

**E1 — Migrasi 0013** (§5.0).
**E2 — `lib/coa/account-type.ts` + test.** `ACCOUNT_TYPES`, label; `deriveAccountType({kelompok, subKelompok}) → AccountType|null` memakai `classifyBs` (aktiva* → `asset`; `hutang` → `liability`; `modal` → `equity`) dan `classifyPnl` (`revenue`/`lainLain`→`revenue`; `hpp`/`varCost`/`fixedCost`/`pajak` → `expense`); `resolveAccountType(row) = row.tipeAkun ?? derive(row)`; `deriveIsKas(row)` = aktiva lancar ∧ nama memuat kas/bank (predikat yang sama dengan `aggregateBalanceSheet`); `resolveIsKas(row)`; `normalBalanceOf(row) = row.posisi` (tak ada kolom baru); `cashflowClassOf(row) = row.classCf` (tak ada kolom baru); `explicitVsDerivedDiff(rows)` → daftar akun yang eksplisitnya berbeda dari turunan (bahan pratinjau dampak). Test lengkap termasuk akun kontra (akumulasi penyusutan = `asset` walau `posisi` Kredit).
**E3 — Impor/ekspor & route.** `HEADER_ALIASES` + `Tipe Akun` (asset/liability/…, juga alias Indonesia aset/liabilitas/ekuitas/pendapatan/beban), `Kas?` (ya/tidak/true/false) — **opsional**; `buildCoaWorkbook` menulis keduanya (round-trip test diperluas). Route baru **non-destruktif** `POST /api/clients/[id]/coa/types` multipart `{file, dryRun?}`: hanya `UPDATE tipe_akun, is_kas` **by kode**; tidak menghapus/menyisipkan; `dryRun → { updated: [{kode, before, after}], unknownKode, unchanged }`. `parseCoaRowInput` menerima `tipeAkun`, `isKas` opsional → PATCH/POST baris ikut. `GET /coa` mengembalikan `tipeAkun`, `isKas`, dan `resolvedType` (turunan bila null).
**E4 — UI  ⏸ CP-7.** Form baris COA: field Tipe Akun (`StyledSelect`, placeholder "— otomatis: {turunan} —"), toggle Kas; kolom tabel Master COA menampilkan tipe (eksplisit tebal, turunan redup) — peringatan bila eksplisit ≠ turunan (perluas `classificationWarnings` di `lib/coa/classification-health.ts`: field `tipeAkun`). Tombol **"Isi tipe dari berkas"** → `dryRun` → dialog dampak (kode, sebelum→sesudah, tak dikenal) → commit. Pratinjau Dampak (task PRD) = dialog itu + baris "Akun ini pindah dari bagian X ke Y di laporan".
**E5 — ROADMAP + sync.** Task vendor: fitur "Master COA Bertipe" — **Normal Balance & Klasifikasi Arus Kas dipenuhi oleh `posisi`/`class_cf` yang sudah ada + validasi UI** (catat saat `task complete`).

### 5.C Rekonsiliasi Hutang Supplier — **DIRANCANG ULANG 2026-09-19** (D41)

> **Dikerjakan TERAKHIR** di Fase 2, sesudah §5.D–§5.F. Ia membandingkan dua angka yang dua-duanya baru ada setelah modul pembelian & mutasi jalan.

Rancangan lama (saldo per supplier dari `journal_lines.supplier_id`) **tidak lagi menjawab pertanyaan yang benar**: sejak Modul 1, hutang lahir dari invoice, bukan dari baris jurnal yang kebetulan ditandai supplier. Yang tersisa dari rancangan lama adalah perannya sebagai **penjelas selisih**.

**F1 — `supplier_id` di `journal_lines`** (kolomnya sudah ada sejak migrasi **0014**). `validateJournalInput` menerima `supplierId?` per baris; route POST/PATCH memverifikasi supplier milik klien; **hanya boleh pada baris yang akunnya bertipe `liability`** (murni, test). DELETE supplier → 409 bila dirujuk (`isFkViolation` sebagai jaring). **Turun prioritas** (D41): sesudah Modul 1, sebagian besar baris hutang lahir dari invoice yang sudah membawa suppliernya; ini untuk jurnal manual yang menyentuh akun hutang di luar modul.

**F2 — `lib/hutang-reconciliation.ts` + test** (menggantikan `lib/supplier-reconciliation.ts` yang tidak jadi dibuat).
`reconcileHutang({ perSupplier, saldoNeracaHutang, jurnalManualHutang })` → `{ rows: [{ supplier, sisaHutang }], totalSupplier, totalNeraca, selisih, penjelas: { jurnalManualBerSupplier, jurnalManualTanpaSupplier } }`. Sen bulat (P1). `perSupplier` datang dari `lib/hutang.ts` (§5.F), **bukan** dihitung ulang di sini.

**F3 — Route** `GET /api/hutang/reconciliation?clientId&asOf` — **`requireInternal`** + `canAccessClientData` (R4/D45). `totalNeraca` diambil lewat **`lib/financial-agg.ts`** (P5 — tidak boleh ada agregator kedua): Fase 2 dari `aggregateBalanceSheet` atas laporan terbaru ≤ `asOf`; setelah §7.C lewat `resolveReportSource`.

**F4 — UI  ⏸ CP-8.** Bagian "Rekonsiliasi" di halaman **`/hutang`** (bukan lagi tab Supplier — D44): tanggal acuan; tabel sisa per supplier; total supplier vs total neraca; selisih berwarna; daftar penjelas (jurnal manual ke akun hutang, dipisah bersupplier vs tanpa supplier). Form jurnal: pemilih supplier muncul pada baris yang akunnya bertipe `liability`. Task vendor: `…/bangun-halaman-rekonsiliasi-hutang-supplier` — **buka kembali** dari `failed` bila perlu (`task reset` **hanya atas perintah Ricko**), lalu selesaikan.

**F5 — ROADMAP + sync.**

---

### 5.D Laporan Pembelian 🆕 (Modul 1 — D27–D34)

Halaman baru untuk mencatat invoice pembelian dari supplier. **Pintu masuk seluruh tujuan bisnisnya**: dari sinilah hutang lahir dan jurnal terbentuk tanpa input kedua.

**Bentuk data** — header + baris barang teks bebas (**bukan** master barang; master barang tidak ada di PRD dan tidak ditambahkan diam-diam). Rincian kolom di §8.16/§8.17.

**M1 — Migrasi 0016 (nilai enum) + 0017 (tabel pembelian).**
- **0016 hanya `ADD VALUE`** dan tidak boleh berisi apa pun lagi: `journal_source` += `pembelian`, `mutasi_kas`; `audit_entity_type` += `purchase_invoice`, `cash_mutation`. **P8: nilai enum yang baru di-ADD tidak boleh dipakai di transaksi yang sama** — karena itu ia migrasi tersendiri, dan urutannya tidak boleh ditukar.
- **0017**: `client_accounting_settings` (§8.20), `purchase_invoices` (§8.16), `purchase_invoice_lines` (§8.17), `audit_events += nilai_sebelum jsonb, nilai_sesudah jsonb` (§8.5), `master_supplier += bank_nama, bank_rekening, bank_atas_nama` (§8.4). Semuanya `CREATE`/`ADD COLUMN` nullable → non-destruktif.
- Penghapusan `master_supplier.termin_pembayaran` **TIDAK di sini** — migrasi 0019 tersendiri (D43, §8.14).

**M2 — `lib/termin.ts` murni + test  (D34).**
`buildTerminSchedule({ jatuhTempoAkhir, jumlahTermin, totalMinor, overrides? }) → { urutan, tanggal, nominalMinor }[]`.
- Bagi rata **mundur** dari `jatuhTempoAkhir`, langkah **satu bulan kalender**, sebagai **string** `YYYY-MM-DD` (P2 — tidak ada `new Date(string)`). Contoh brief: invoice 1 Okt, jatuh tempo 1 Jan 2027, 3× → `2026-11-01`, `2026-12-01`, `2027-01-01`.
- **Sisa sen ke cicilan TERAKHIR**, sehingga `Σ cicilan === totalMinor` **persis**. Test wajib: total ganjil (mis. 100.000,01 dibagi 3) tetap berjumlah sama.
- **Akhir bulan**: mundur satu bulan dari `2027-03-31` tidak boleh menghasilkan tanggal yang tidak ada. Aturan: **kepit ke hari terakhir bulan itu** (31 Mar → 28/29 Feb). Test wajib termasuk tahun kabisat.
- `overrides` diterima sejak hari pertama walau belum ada yang mengisinya (D34) — supaya penyesuaian tanggal per cicilan kelak tidak mengubah tanda tangan fungsi ini maupun pemanggilnya.
- `jumlahTermin = 1` → satu cicilan di `jatuhTempoAkhir`.

**M3 — `lib/purchase.ts` murni + test.**
- `validatePurchaseInvoice(input)` — mengumpulkan SEMUA galat (pola `validateJournalInput`): tanggal valid; supplier terisi; ≥1 baris; qty > 0; harga ≥ 0; subtotal ≥ 0; PPN ≥ 0; `cara_bayar='kredit'` ⇒ `jatuhTempoAkhir` valid & `jumlahTermin ≥ 1`; `'tunai'` ⇒ `akunKasId` terisi; PPN > 0 ⇒ akun PPN Masukan tersedia.
- `computeInvoiceTotals(lines, ppn)` → `{ subtotalMinor, ppnMinor, totalMinor }` — **sen bulat** (P1), dijumlahkan dari `subtotal` baris (D28), tidak pernah dari `qty × harga`.
- `buildPurchaseJournalLines({ komponen, caraBayar, akun… })` — **menerima DAFTAR KOMPONEN**, bukan field tetap. Hari ini komponennya `{ jenis:'barang', akunId, minor }` dan `{ jenis:'ppn', … }`; saat ongkir/diskon dipisah nanti (belum diputuskan), ia jadi **satu elemen tambahan**, bukan pembongkaran fungsi. Bentuk jurnalnya:
  - **Kredit:** D `akun_tujuan` = subtotal · D `akun_ppn_masukan` = ppn (bila > 0) · **K `akun_hutang` = total**
  - **Tunai:** D `akun_tujuan` = subtotal · D `akun_ppn_masukan` = ppn (bila > 0) · **K `akun_kas` = total**
  - Hasilnya WAJIB lolos `isBalanced` — test mengunci itu untuk kedua cara bayar, dengan dan tanpa PPN.

**M4 — Route.**
- `GET /api/purchase-invoices?clientId&periodStart&periodEnd[&supplierId]` — `requireInternal` + `canAccessClientData`. Respons membawa `totalMinor`→string, `sisa`, dan `status` **turunan** (`lunas`/`sebagian`/`belum dibayar`/`tunai`).
- `POST /api/purchase-invoices` — `requireAkunting`. Satu `db.batch`: insert invoice + baris + **insert jurnal draf & barisnya** + `audit_events{entity_type:'purchase_invoice', event:'created'}`. Akun di-snapshot (D30). Supplier tanpa `akun_hutang_default_id` → **409 dengan pesan yang menunjuk Settings**, sebelum satu statement pun jalan.
- `GET /api/purchase-invoices/[id]` — detail + baris + **jadwal termin turunan** + alokasi pembayaran yang sudah masuk.
- `PATCH /api/purchase-invoices/[id]` — `requireAkunting`; ganti seluruh baris (pola PATCH jurnal) + **perbarui jurnalnya di batch yang sama** + event `updated` dengan `nilai_sebelum`/`nilai_sesudah`. Tolak bila jurnalnya sudah `posted` **dan** setelan "posting bisa diedit" = `false` (D42). **Baru diterapkan 2026-10-26** lewat `syncInvoiceJournal` + `nasibJurnalModul` — sebelumnya PATCH menulis ulang jurnal terposting tanpa pemeriksaan.
- `DELETE /api/purchase-invoices/[id]` — `requireAkunting`; **hapus invoice + baris + jurnalnya + purge `audit_events` invoice, satu batch** (pola DELETE jurnal C2). **Sebelum menghapus**, tulis event penghapusan… → lihat catatan di bawah.
- Tolak DELETE bila invoice sudah punya alokasi pembayaran (409) — hapus alokasinya dulu, supaya pembayaran nyata tidak kehilangan lawannya.

> **Jejak penghapusan invoice — beda dari jurnal.** Brief meminta penghapusan invoice tercatat di `audit_events` **beserta isi invoice sebelum dihapus**. Itu tidak bisa memakai pola jurnal (yang mem-purge event bersama barisnya), karena event-nya justru harus **hidup lebih lama** dari barisnya. Bentuk yang dipakai: event `deleted` ditulis dengan `entity_type='purchase_invoice'`, `entity_id` = id invoice yang baru dihapus, dan `nilai_sebelum` = snapshot JSON header+baris. **Konsekuensinya `entity_id` menunjuk baris yang sudah tidak ada** — itu disengaja dan harus ditulis di komentar tabelnya, karena ia melanggar kebiasaan yang dipasang C2 untuk jurnal. CHECK `audit_events` yang ada **tidak menghalangi** ini (ia hanya mewajibkan `entity_id` untuk `entity_type='journal'`).

**M5 — `buildReplacePlan` diperluas  (P14 — WAJIB, jangan ditunda).**
Empat kolom baru merujuk `master_coa`: `purchase_invoices.akun_tujuan_id` (NOT NULL → **blokir 409**), `akun_hutang_id`, `akun_ppn_masukan_id`, `akun_kas_id` (nullable → **set null** + dihitung di dampak), dan `client_accounting_settings.akun_ppn_masukan_id` (nullable → set null). Test regresi "input lama menghasilkan keluaran yang sama persis" wajib ikut.

**M6 — Nav + akses.** `NAV_ITEMS` += `pembelian` (label "Pembelian") sesudah `buku-besar`, flag baru **`internalOnly`** (D45); `INTERNAL_ONLY_PREFIXES` += `/pembelian`; ikon `ShoppingCart` di `NAV_ICONS`; test urutan & akses diperbarui (termasuk indeks keras di regresi kapsul sidebar).

**M7 — UI `/pembelian` + jalan keluar di `/jurnal` (D32).**
Daftar per periode (pola `/jurnal`): tanggal · supplier · no. invoice · cara bayar · total · sisa · status turunan. Form modal: header + tabel baris barang yang bisa ditambah/hapus, subtotal per baris dihitung hidup, panel total (subtotal + PPN = total), **pratinjau jadwal termin** dan **pratinjau jurnal** sebelum simpan. Rincian baris ter-expand menampilkan barang, jadwal termin, jurnal tertaut, dan pembayaran yang sudah teralokasi. Warna/bentuk: token `globals.css`, `rounded-3xl`/`rounded-full`, tiga lapis, a11y (P12, CLAUDE.md).

**Dan di `/jurnal` (D32, tambahan Ricko 2026-09-20):** jurnal ber-`sumber='pembelian'` **tidak** cuma kehilangan tombol Ubah/Hapus — ia mendapat **tombol "Koreksi di Pembelian"** yang membuka invoice asalnya, plus lencana sumber di barisnya. Idnya dari pencarian mundur `purchase_invoices WHERE journal_id = ?` (lihat kotak D32). Bila pencarian itu **tidak menemukan apa pun** — jurnal mengaku bersumber pembelian tapi invoicenya hilang — yang tampil adalah keterangan jujur ("dokumen asalnya tidak ditemukan"), **bukan tombol yang menuju halaman kosong**.

**M8 — Setelan "posting bisa diedit" + jejak perubahannya (D42)  ⏸ CP-16.**
Sakelar dan mitigasinya dibangun **bersamaan**, tidak menyusul (kotak §3.4 nomor 6):
- `lib/accounting-settings.ts` murni + test: `bolehEditPosting(settings | null)` → **`settings?.postingBisaDiedit === true`**. **Test wajib menguji tiga keadaan** — baris tidak ada · `false` · `true` — dan dua yang pertama **harus menghasilkan jawaban yang sama persis**.
- `canEditJournal` menerima `{ sumber, bolehEditPosting, isLocked }`; **kunci periode mengalahkan sakelarnya**, dan D32 mengalahkan keduanya (jurnal bersumber modul tetap tidak bisa diubah dari `/jurnal` walau sakelarnya menyala).
- Route PATCH/DELETE jurnal membaca setelan klien lalu menulis `audit_events{event:'updated'}` dengan **`nilai_sebelum` + `nilai_sesudah`** saat yang diubah berstatus `posted`. Test baca-sumber per handler (P15) — **satu jalur tulis yang lupa membacanya mengizinkan pengeditan pada klien yang seharusnya permanen.**
- Larangan yang tetap berlaku walau sakelarnya menyala: jurnal yang **sudah punya pembalik terposting** tidak boleh diubah.
- UI: lencana **"diubah setelah posting"** di `/jurnal` dan `/buku-besar` (diturunkan dari adanya event `updated` sesudah event `posted`); toggle di tab Settings "Pembukuan" — tab yang sama yang kelak menampung kunci periode (K4), jadi buat tabnya di sini dan K4 menambahkan isinya.

**M9 — ROADMAP + sync.**

---

### 5.E Mutasi Kas/Bank 🆕 (Modul 2 — D35–D38) — **menggantikan §6.A**

Mutasi tiap akun kas: kas bank, kas marketplace, kas kecil, kas besar, dan lainnya. **Daftar akunnya dari COA bertanda `is_kas`** (E1–E3), **bukan daftar tulis tangan** — itulah kenapa §5.B wajib lebih dulu.

**N1 — Migrasi 0018.** `cash_mutation_imports` (§8.19), `cash_mutations` (§8.18), `cash_mutation_allocations` (§8.21). Seluruhnya `CREATE` → non-destruktif. Nilai enum `journal_source='mutasi_kas'` sudah ada sejak 0016 (M1).

**N2 — `lib/cash-mutation.ts` murni + test.**
- `validateCashMutation(input)` — tanggal valid; akun kas terisi; **tepat satu sisi D/K terisi dan keduanya ≥ 0** (D36, cermin CHECK DB).
- `fingerprintMutasi({ tanggal, debit, kredit, keterangan })` — normalisasi keterangan (huruf kecil, spasi tunggal, buang tanda baca) lalu gabung. **Dipakai untuk PERINGATAN duplikat, bukan penolakan** (D38).
- `allocationRemaining(mutasi, alokasi[])` → sisa dalam sen; `mutationStatus(...)` → `'belum dijurnal' | 'sebagian' | 'selesai'` — **diturunkan** (D37, P3).
- `buildMutationJournalLines(...)` untuk dua kasus:
  - **(a) Alokasi ke invoice:** D `akun_hutang` **milik invoice** (snapshot D30 — bukan dibaca ulang dari supplier) per alokasi · K `akun_kas` sebesar total alokasi. Beberapa invoice → beberapa baris debit, satu baris kredit.
  - **(b) COA lawan bebas:** arah mengikuti sisi mutasinya — uang keluar (kredit kas) → D `akun_lawan` / K `akun_kas`; uang masuk → kebalikannya.
  - Keduanya WAJIB lolos `isBalanced` (test).

**N3 — `lib/csv/mutasi-kas.ts` murni + test  (D22 pindah rumah).**
Alias header (pola `lib/coa/coa-import.ts`) + **pemetaan kolom manual** bila deteksi gagal; **tanpa regex** dari input pengguna (D22 — ReDoS). Keluaran: baris mentah bernomor + baris terpetakan + daftar baris yang tidak terbaca. MVP **CSV saja**; PDF rekening koran menyusul (aturan proyek: CSV/Excel lebih dulu karena akurasinya tidak ditebak). **→ 2026-10-26: digantikan §5.G Modul B.**

**N4 — Route.**
- `GET /api/cash-mutations?clientId&akunKasId&periodStart&periodEnd` — `requireInternal`; membawa sisa alokasi & status turunan.
- `POST /api/cash-mutations` (manual), `PATCH`/`DELETE /api/cash-mutations/[id]` — `requireAkunting`; setiap perubahan yang menyentuh jurnal dilakukan **di batch yang sama** + `audit_events{entity_type:'cash_mutation'}`.
- `POST /api/cash-mutations/import` — multipart CSV + `mapping` + **`dryRun`** (pola impor supplier/COA): mengembalikan baris terbaca, dugaan duplikat (fingerprint), dan baris bermasalah — **tanpa menulis apa pun** sampai dikonfirmasi.
- `POST /api/cash-mutations/[id]/allocations` + `DELETE …/allocations/[allocId]` — `requireAkunting`. Body menerima **`terminUrutan?`** (D40): kosong = FIFO, terisi = paku ke cicilan itu. Menolak alokasi yang membuat **Σ alokasi > nominal mutasi** ATAU **> sisa invoice**, dan **`terminUrutan > jumlah_termin` invoice**; ketiga batas diperiksa server, bukan hanya di layar.
- `GET /api/clients/[id]/coa?kas=1` — daftar akun kas, memperluas parameter `?tipe=` (R8) alih-alih endpoint baru.

**N5 — Nav + akses + `buildReplacePlan`.** `NAV_ITEMS` += `mutasi-kas` ("Mutasi Kas") sesudah `pembelian`, `internalOnly`; `INTERNAL_ONLY_PREFIXES` += `/mutasi-kas`; ikon `Landmark`. `buildReplacePlan` (P14) += `cash_mutations.akun_kas_id` (NOT NULL → blokir 409), `cash_mutations.akun_lawan_id` (nullable → set null), `cash_mutation_imports.akun_kas_id` (NOT NULL → blokir).

**N6 — UI `/mutasi-kas`  ⏸ CP-17.**
Pemilih akun kas (dari `is_kas`) + rentang tanggal; tabel mutasi dengan kolom sisa alokasi dan **status "belum dijurnal" yang menonjol** (permintaan eksplisit Ricko — baris yang belum dijurnal tidak boleh terlihat sama dengan yang sudah); tambah manual; **wizard impor CSV** (pilih berkas → pemetaan kolom → pratinjau `dryRun` + tanda duplikat → commit); panel alokasi: pilih invoice bersisa, isi nominal, beberapa invoice per mutasi, sisa terlihat terus. **Pemilih cicilan opsional per alokasi** (D40): bawaannya "Otomatis (FIFO)" dengan cicilan yang akan tertutup ditampilkan sebagai pratinjau, dan akunting boleh menggantinya ke cicilan tertentu — pilihan manual diberi tanda supaya terlihat bahwa ia menyimpang dari FIFO.

**Dan di `/jurnal` (D32):** jurnal ber-`sumber='mutasi_kas'` mendapat tombol **"Koreksi di Mutasi Kas"** yang membuka barisnya, dengan aturan yang sama seperti M7 — pencarian mundur `cash_mutations WHERE journal_id = ?`, dan keterangan jujur bila dokumennya tidak ditemukan.

**N7 — ROADMAP + sync.**

---

### 5.F Monitoring Hutang 🆕 (Modul 3 — D39, D40)

Menu **`/hutang`**, sejajar Jurnal & Buku Besar. **Semua angkanya turunan** — tidak ada tabel saldo, tidak ada kolom status (P3/P4, D39).

**U1 — `lib/hutang.ts` murni + test.**
- `invoiceOutstanding(invoice, alokasi[])` → sisa dalam sen.
- `applyPayments(jadwalTermin, alokasi[])` → cicilan + berapa yang sudah tertutup. **FIFO sebagai bawaan, dengan penimpaan manual** (D40 ✅): alokasi ber-`termin_urutan` **diterapkan lebih dulu** ke cicilan yang dipakunya, baru sisanya FIFO cicilan terlama dulu.
  **Test wajib:** pembayaran sebagian menutup cicilan pertama lebih dulu · pembayaran berlebih meluber ke cicilan berikutnya · **alokasi berpaku tidak diserobot FIFO** walau urutan bacanya ditukar (uji permutasi masukan, pola yang sama dengan `compareLedgerLines`) · **luberan alokasi berpaku** jatuh ke cicilan sesudahnya secara FIFO · **paku yatim** (`termin_urutan > jumlah_termin` setelah invoice diubah) jatuh kembali ke FIFO **dan ditandai**, tidak melempar · total tertutup tidak pernah melebihi total invoice.
- `ageBuckets(cicilanBelumLunas, asOf)` → `{ belumJatuhTempo, telat1_30, telat31_60, telat61_90, telatLebih90 }` — memakai `hariAntara` atas **string tanggal** (P2), batas hari **inklusif** dan ditulis di test supaya tidak bergeser diam-diam.
- `supplierSummary(...)` → `{ supplier, totalHutang, sudahDibayar, sisa }` per supplier.
- Seluruhnya **sen bulat** (P1).

**U2 — Route** (semuanya `requireInternal` + `canAccessClientData`, D45):
`GET /api/hutang/aging?clientId&asOf` · `GET /api/hutang/suppliers?clientId&asOf` · `GET /api/hutang/suppliers/[supplierId]?clientId&asOf` (detail invoice + pembayaran teralokasi) · `GET /api/hutang/jatuh-tempo?clientId&asOf&dalamHari=30` (daftar cicilan mendekati jatuh tempo — **per cicilan, bukan hanya tanggal akhir**).

**U3 — Nav + akses.** `NAV_ITEMS` += `hutang` ("Hutang") sesudah `mutasi-kas`, `internalOnly`; `INTERNAL_ONLY_PREFIXES` += `/hutang`; ikon `Receipt`.

**U4 — UI `/hutang`  ⏸ CP-18.**
Kartu ringkasan umur hutang (belum jatuh tempo · 1–30 · 31–60 · 61–90 · >90) dengan warna dari token; daftar **mendekati jatuh tempo per cicilan**; tabel per supplier (total · dibayar · sisa) yang bisa dibuka ke detail invoice + pembayaran; bagian **Rekonsiliasi** (F4) menyusul di §5.C. Unduh (ekspor) tersedia untuk finance — sesuai D45 finance membaca **dan** mengunduh.

**U5 — ROADMAP + sync.**

### 5.G Grid Mutasi Kas (Modul A) & Ekstraksi PDF Rekening Koran (Modul B) 🆕 2026-10-26 — ✅ D46–D62 disetujui Ricko 2026-10-26

**Tujuan:** `/mutasi-kas` terasa seperti sheet kas di spreadsheet — admin menempelkan ratusan sampai **10.000 baris per akun per bulan**, menyunting di tempat, dan menyimpan sekaligus; PDF rekening koran diekstrak AI ke grid yang sama. Keputusan di §3.6. **Modul A dulu, Modul B sesudahnya.** Ini langkah pertama "tiap akun kas punya sheet sendiri" dari catatan Ricko 2026-09-22 — sumber laporan Cash Flow tetap keputusan fase tersendiri, tapi bahannya (Class CF, D62) disiapkan di sini.

**Revisi dari template akuntan Rasyuka April 2026:** arah uang tidak lagi dari judul kolom (kotak di bawah), target 10.000 baris, aturan akun lawan (D57), jurnal ringkasan (D58), Pindah Buku (D59), kolom catatan, akun lawan kode-atau-nama, tanggal & periode (D60), jangkar saldo (D61), Class CF (D62). **Catatan untuk §6.B:** template mencatat Kas Shopee **per baris** (5.187 baris April) — sebelum §6.B (settlement-level) dikerjakan, tinjau ulang apakah mutasi Kas Shopee + aturan akun lawan + jurnal ringkasan sudah menutup kebutuhannya.

#### 5.G.0 Pakai ulang — jangan membuat aturan kedua

| Kebutuhan | Yang sudah ada | Dipakai untuk |
|---|---|---|
| Nominal format Indonesia | `lib/nominal.ts` `bacaNominal`, `pesanGalatNominal`, `pemisahDesimal` | sel Masuk/Keluar/Saldo, tempelan, hasil AI |
| Input terformat saat mengetik | `components/ui/nominal-input.tsx` + `lib/nominal-input.ts` (N9) | editor sel uang |
| Pembelah teks bertabel | `lib/csv/mutasi-kas.ts` `parseCsv` (pemisah `'\t'` untuk tempelan), `detectHeader`, `mapRows`, alias header | tempelan TSV, berkas CSV, tabel hasil AI — **alias Debet/Kredit TIDAK lagi menentukan arah** |
| Tanggal & penolakan MM/DD | `parseTanggalCell` (sudah membaca `05/Apr/2026` dan `5-Apr-2026`; `BULAN_ID` Indonesia + Inggris), `deteksiTanggalMMDD` (tingkat BLOK) | sel tanggal, blok tempelan/berkas/PDF |
| Selisih hari | `hariAntara` (`lib/contracts.ts`) | pasangan Pindah Buku |
| Normalisasi teks | `normalizeKeterangan` (`lib/cash-mutation.ts`, tanpa RegExp) | pencocokan aturan akun lawan |
| Validasi satu mutasi | `validateCashMutation` (cermin CHECK D36, mengumpulkan semua galat) | setiap baris draf, di browser DAN server |
| Duplikat | `fingerprintMutasi` + pola pencarian fingerprint route impor (D38: peringatan) | `dryRun` route batch |
| Jurnal mutasi | `syncMutationJournal`, `buildAllocationJournalLines`, `buildCounterAccountJournalLines` | diperluas ke jurnal ringkasan (D58) |
| Penjaga sunting | PATCH: nominal & akun kas terkunci bila ada alokasi; DELETE: terposting menahan | dipindah ke `kunciMutasi` (S7) |
| Setelan akun per klien | `client_accounting_settings` + `akun_ppn_masukan_id` (D33) + `buildReplacePlan` "boleh diputus" | `akun_pindah_buku_id` (D59) |
| Klasifikasi COA | `class_cf` (sudah ada), `lib/coa/classification-health.ts`, `resolveIsKas` | D62 |
| Status & sisa turunan | `mutationStatus`, `allocationRemaining` (D37) | kolom baca-saja |
| UI | `StyledSelect` (`badge=kode`), `ModalShell`, `useRupiah`/`rupiahPersis`, `DateRangePicker`, token `globals.css` | editor akun lawan, dialog, total |

**Dilarang:** `new Date(string)` untuk tanggal (P2), float untuk uang (P1 — sen bulat lewat `toMinorUnits`), RegExp di modul pembaca/pencocok baru (D22, dikunci test pemindai sumber), status/saldo hitungan yang disimpan (P3/P4).

> **Kenapa `cash_mutations.saldo` tidak melanggar P4 ("tidak ada tabel saldo").** P4 melarang menyimpan saldo **hasil hitungan kita** — angka yang bisa diturunkan dari baris terposting dan basi begitu satu baris berubah. Kolom `saldo` bukan hitungan kita: ia angka yang **dicetak bank** di rekening koran, fakta dokumen yang statusnya sama dengan `tanggal` dan `keterangan`. Ia tidak pernah dibaca untuk menghitung saldo buku besar, tidak diperbarui saat mutasi lain berubah, dan berfungsi sebagai **pembanding independen** terhadap hitungan kita — kebalikan dari cache. **Kolomnya SUDAH ADA sejak 0018** (`numeric(18,2)` nullable, di produksi sejak 2026-10-23) dan impor CSV sudah mengisinya. Disiapkan untuk nanti, **tidak dibangun sekarang**: saldo awal/akhir di cash flow, pencocokan neraca, rekonsiliasi bank — ketiganya cukup membaca baris bersaldo terakhir per periode dengan urutan baku (D49).

> **Arah uang tidak pernah dari judul kolom (ditetapkan Ricko 2026-10-26).** Template akuntan: Debet = **masuk**. Rekening koran bank: Debet = **keluar** (BCA: penanda DB/CR). Judul "Debet/Kredit" hanya berarti "ada dua kolom nominal". Per **blok** (satu tempelan, satu berkas, satu PDF) arahnya diputuskan berurutan: **(1) kesinambungan saldo** — rantai diuji dengan kedua orientasi; tepat satu yang utuh → itulah arahnya, tanpa bertanya. **(2) Tanpa kolom saldo, atau kedua orientasi putus** → arah **wajib dipilih eksplisit** di pratinjau ("Kolom ‹Debet› = Uang masuk / Uang keluar"), Simpan tertahan sampai dipilih; pilihan **diisi awal** dari petunjuk, tapi tetap harus dikonfirmasi. **Petunjuk** (tidak pernah memutuskan sendirian): penanda **DB/CR** sebagai token utuh di uraian atau sel nominal (DB = keluar dari rekening), dan judul yang tak ambigu ("Masuk/Keluar", "Penerimaan/Pengeluaran"). Kolom nominal tunggal + penanda DB/CR per baris → arah per baris dari penandanya, lalu diverifikasi rantai saldo. **Impor CSV produksi hari ini masih memakai alias lama "Debet = keluar"** — berkas dari sheet template akuntan akan masuk **terbalik** sampai S2 dirilis (risiko 2).

#### Modul A — Grid Mutasi Kas (S0–S11)

**S0 — Spike library (branch sendiri, TIDAK di-merge)  ⏸ CP-19.** `react-data-grid@7.0.0-beta.63` di halaman uji dengan data sintetis. Kriteria lulus, diukur dan dilaporkan dengan angka: (1) **20.000 baris** (2× target) digulir halus; (2) editor sel `NominalInput` — ketik `1000000` tampil `1.000.000`, kursor tidak meloncat; (3) panah, Tab/Shift+Tab, Enter, Esc; (4) tempel **10.000 baris** TSV (Excel & Google Sheets) **< 2 detik** sampai tampil + tervalidasi; (5) NVDA membaca nama kolom + nilai sel + status galat; (6) tambahan bundle `/mutasi-kas`. Gagal yang tak bisa diatasi → ulangi dengan `@tanstack/react-virtual`. Ricko memilih (D46).

**S1 — Migrasi 0021 (dev), seluruhnya tambah (D49).** `cash_mutations.urutan integer` + CHECK; `cash_mutations.catatan text`; `client_accounting_settings.akun_pindah_buku_id` → `master_coa` set null; `CREATE TABLE cash_mutation_rules` (§8.22). Komentar skema `saldo` diperbarui ("fakta dokumen"). **`buildReplacePlan` (P14) += dua perujuk**: `akun_pindah_buku_id` diperlakukan seperti `akun_ppn_masukan_id` (boleh diputus); `cash_mutation_rules.akun_lawan_id`/`akun_kas_id` disambung by kode, **blokir 409** bila hilang (§8.15) — test regresi per kolom + sabotase. **Gotcha #8:** baca SQL `db:generate` sebelum `db:migrate`. Nomornya = nomor bebas berikutnya saat dikerjakan: **0021 bila `period_locks` (K1) sudah 0020**; bila S1 lebih dulu, S1 = 0020 dan `period_locks` = 0021 — perbarui §8.14 saat itu juga.

**S2 — `lib/mutasi-draf.ts` murni + test.** Satu pintu dari teks bertabel ke baris draf, untuk tempelan, berkas CSV, dan tabel hasil AI:
- `bacaBlok({ baris: string[][], jangkarKolom, sumber, periode })`. Baris pertama dikenali `detectHeader` → pemetaan dari judul (kolom tambahan seperti No. Ref/Cabang tidak menggeser apa pun); judul Debet/Kredit dipetakan ke **dua kolom nominal tanpa arah** (kotak Arah). Tidak dikenali → posisional dari kolom jangkar (urutan grid: Tanggal · Uraian · Masuk · Keluar · Saldo · Akun lawan · Catatan).
- **Akun lawan:** `cocokkanAkun(teks, coa)` — **kode persis dulu, lalu nama persis** (trim, abaikan huruf besar/kecil); nama yang dipakai > 1 akun → galat "nama ganda, pakai kode"; tak dikenal → galat.
- **Catatan:** alias judul "Konfirmasi", "Reff", "Ref", "Catatan" → kolom catatan.
- `kelasBaris(...)` → `transaksi` | dilewati: `kosong` · `judul` (header berulang tiap halaman) · `saldo` (SALDO AWAL/AKHIR: tanpa nominal, bersaldo — **saldonya jadi jangkar rantai**) · `ringkasan` (TOTAL/SUBTOTAL/MUTASI DEBET-KREDIT tanpa tanggal) · `lanjutan` (teks saja). Kata kunci: huruf kecil + `startsWith`/`includes`, **tanpa RegExp**. Baris dilewati dikembalikan sebagai daftar beralasan, bukan galat.
- **Tanggal:** `DD/MM/YYYY`, `DD/Mon/YYYY`, `D-Mon-YYYY`, `YYYY-MM-DD` (semuanya sudah dibaca `parseTanggalCell` — dikunci test baru); `tetapkanTahun(baris, periode)` untuk tanggal tanpa tahun (`26/10`), Des→Jan dinaikkan setahun secara deterministik. **Periode yang dipilih memutus makna tanggal ambigu:** blok yang seluruh tanggalnya ≤ 12/12 dibaca DD/MM bila bacaan itu jatuh di periode; bila justru bacaan MM/DD yang jatuh di periode dan DD/MM tidak → **bukti MM/DD → blok ditolak** (keputusan Ricko 2026-09-21 tetap). Baris tanpa tanggal & di luar periode → **D60**.
- `validasiBaris(draf)` → galat **per sel** (tanggal, uang lewat `bacaNominal`, "Masuk ATAU Keluar"), lalu `validateCashMutation` sebagai hakim terakhir.
- Test: tempelan Excel dengan sel berkutip + baris baru di dalam sel; sheet template akuntan (Debet=masuk) **dan** rekening koran BCA (Debet=keluar, DB/CR) memakai fikstur yang sama strukturnya; kode vs nama akun, nama ganda; lima kelas baris dilewati; tahun lintas Des→Jan; 29 Februari; blok MM/DD ditolak lewat periode; **pemindai sumber: nol RegExp**.

**S3 — `lib/saldo-berantai.ts` murni + test.** `periksaKesinambungan(baris, saldoJangkar?)`: untuk tiap baris bersaldo, `saldo = saldo bersaldo sebelumnya + Σ(masuk − keluar) baris di antaranya` — **dalam sen bulat**; keluaran: baris pertama yang putus + selisihnya. `tentukanArah(blok)` menjalankan rantai dengan **kedua orientasi** dan petunjuk DB/CR → `{ arah: 'normal' | 'tukar' | null, alasan }` (`null` = wajib dipilih, kotak Arah). Putus = **menahan Simpan** (D50). **Jangkar (D61):** baris kelas `saldo` di blok → saldo baris tersimpan sebelum rentang (S8) → isian "saldo awal rekening koran" di bilah grid (tidak disimpan); tanpa jangkar, baris bersaldo pertama tidak diverifikasi — dan itu terlihat. Test: rantai utuh; putus di tengah; orientasi terbalik terdeteksi tanpa bertanya; tanpa saldo → `null`; DB/CR bertentangan dengan rantai → rantai menang + peringatan; baris tanpa saldo di antara; saldo negatif (cerukan); nominal dekat batas sen aman; 10.000 baris.

**S4 — Aturan akun lawan (D57).** `lib/aturan-mutasi.ts` murni: `usulkanAkunLawan(baris, aturan[]) → { akunId, aturanId } | { bentrok: aturanId[] } | null` — cocok `normalizeKeterangan(uraian).includes(normalizeKeterangan(pola))`, saring `arah` & `akun_kas_id`, urut prioritas lalu panjang pola; nonaktif dilewati. Route `GET/POST /api/clients/[id]/cash-mutation-rules`, `PATCH/DELETE …/[ruleId]` — `requireInternal` baca, `requireAkunting` tulis, pola 2..100 karakter. Tab Settings **"Aturan Mutasi"** (`SETTINGS_TABS` + `FINANCE_VISIBLE_TABS` baca-saja, test P13): daftar, tambah/ubah/nonaktifkan, **uji pola terhadap mutasi 30 hari terakhir** (berapa baris yang akan kena). Test: nol RegExp; prioritas; seri → bentrok; arah; normalisasi spasi/tanda baca; 10.000 baris × 200 aturan < 200 ms.

**S5 — Pindah Buku (D59).** `lib/pindah-buku.ts` murni: `saldoPindahBuku(mutasi, akunPindahBukuId, sampai)` dalam sen; `cariPasangan(keluar[], masuk[], toleransiHari = 3)` → pasangan tunggal + kandidat ganda (A dan B **akun kas berbeda**, nominal persis sama). Setelan "Akun Pindah Buku" di tab Settings Pembukuan (memperluas `PATCH /api/clients/[id]/accounting-settings`, pola `akunPpnMasukanId`). `GET /api/cash-mutations/pindah-buku?clientId&periodEnd` → `{ saldo, belumBerpasangan, usulan }`, `requireInternal`. Test: pasangan tunggal; dua kandidat sama nominal → tidak diusulkan otomatis; batas 3/4 hari; lintas periode → peringatan bukan galat; akun kas sama tidak dipasangkan.

**S6 — `lib/mutasi-grid-state.ts` murni + test.** Reducer draf: `ubahSel`, `tempel` (satu aksi), `tambahBaris`, `hapusBaris`, `pilihArah(blok)`, `terapkanUsulan(kunci[])` (aturan & Pindah Buku), `isiAkunLawanMassal`, `isiTanggalAkhirPeriode(kunci[])` (D60), `kosongkanSaldo(kunci[])` (D50: menyimpan saldo aslinya di draf supaya terlihat dan bisa dicatat). **Undo/redo** (berbagi struktur), batas 100 aksi. Sel terkunci (`kunciMutasi`) ditolak reducer; baris yang dilewati aksi massal dilaporkan. `diffKeBatch(draf, snapshotServer)` → `{ baru, ubah (+updatedAt), hapus (+updatedAt) }`; Masuk/Keluar ↔ `debit`/`kredit` hanya di sini (D36). Test: undo setelah tempel 10.000 baris memulihkan keadaan persis; sel terkunci kebal tempel & aksi massal; usulan tidak masuk diff sebelum diterapkan; diff tidak memuat baris yang dikembalikan ke nilai semula.

**S7 — Satu jalur tulis server (D48) + jurnal ringkasan (D58) + uji beban.** *Wajib sesudah K1–K5 (D53).*
- `kunciMutasi({ jurnalStatus, jurnalDibalik, jumlahAlokasi, tanggal, tanggalBaru?, terkunciSampai })` (murni, `lib/cash-mutation.ts`) → alasan per kolom: **jurnal terposting & belum dibalik → seluruh baris terkunci** (`posting_bisa_diedit` D42 tidak membukanya); **jurnal terposting yang SUDAH dibalik (D13) → terbuka**, dan penyuntingannya melahirkan jurnal draf baru — memakai `nasibJurnalModul` + `loadNasibJurnalModul` yang sudah ada sejak 2026-10-26 (risiko 11 & 15); **ada alokasi → Masuk/Keluar terkunci**; **tanggal lama ATAU baru ≤ kunci periode → terkunci**. Dipakai **server dan grid** — satu aturan.
- **Jurnal ringkasan (D58):** `buildDailySummaryJournalLines({ akunKas, akunLawan, tanggal, mutasi[] })` murni — D kas Σmasuk / K lawan Σmasuk, D lawan Σkeluar / K kas Σkeluar, **bruto** (≤ 4 baris), wajib `isBalanced`. Perencana mengumpulkan **kunci (akun kas, akun lawan, tanggal) yang tersentuh** oleh baru/ubah/hapus (kunci lama DAN baru), lalu membangun ulang tiap kunci **sekali**: jurnal draf yang ada diganti; tidak ada draf → dibuat; kunci kosong → draf dihapus; kunci yang jurnalnya terposting → **draf kedua** untuk anggota baru. Mutasi beralokasi tetap jalur per mutasi (`buildAllocationJournalLines`).
- `rencanakanSimpanMutasi` (`lib/api/cash-mutation-batch.ts`): validasi → muat baris ubah/hapus, alokasi, status jurnal (+ pembalik), dan kunci periode **dalam kueri massal** (tanpa N+1) → `kunciMutasi` → **konkurensi**: `updatedAt` beda → 409 untuk seluruh batch dengan daftar barisnya → fingerprint (DB + dalam batch, **peringatan**) → **saldo yang dikosongkan (D50) → event `saldo_dikosongkan` per baris dengan `nilai_sebelum: { saldo }`**, juga untuk baris dari berkas → susun statement (INSERT dipecah ≤ 4.000 baris per statement karena batas 65.535 parameter) → **satu `db.batch`**.
- `POST /api/cash-mutations/batch` `requireAkunting`, `canAccessClientData`, `loadCashAccount`; **`dryRun` = jalur yang sama**; galat dikembalikan **per baris & per kolom**, nihil tertulis. POST/PATCH/DELETE lama → pembungkus perencana; `POST …/import` dihapus (D47).
- Test: baca-sumber (P15) — setiap route penulis mutasi lewat `rencanakanSimpanMutasi`, tidak ada `db.insert/update(cashMutations)` di luar perencana & alokasi, `isDateLocked` dipanggil; perilaku dengan guard/DB di-mock (pola `lib/ai-features.test.ts`) — satu baris galat → nol statement; **Σ jurnal ringkasan per akun = Σ jurnal per baris** untuk data yang sama (permutasi urutan baris); pembalikan membuka kunci.
- **Uji beban di dev** (skrip sekali pakai di pohon proyek, dihapus sesudahnya, **dev saja**): **10.000 baru** (separuh berakun lawan), 2.000 ubah, 2.000 hapus → waktu, ukuran body, jumlah statement, jumlah jurnal ringkasan yang lahir → **tetapkan angka D52**.

**S8 — `GET /api/cash-mutations` mode grid.** `urut=buku` → urutan baku naik + per baris `updatedAt`, `catatan`, `jurnalStatus`, `jurnalDibalik`, `jumlahAlokasi`, status & sisa + `saldoJangkar` + `terkunciSampai`. Memperluas `listCashMutations`. `requireInternal`. Halaman 10.000 baris dikirim dalam satu respons terkompresi (diukur di S7).

**S9 — UI `/mutasi-kas`  ⏸ CP-20.**
- **Tab sheet per akun kas** (`role="tablist"`, dari `?kas=1`); satu grid = satu akun kas; pindah tab dengan draf kotor → konfirmasi. Rentang tanggal = **periode** yang dipakai S2.
- **Grid = tampilan utama** (≥ `md`). Kolom: Tanggal · Uraian · Masuk · Keluar · Saldo · Akun lawan (`StyledSelect`; ketik kode **atau** nama) · Catatan · baca-saja: Status & info alokasi. Usulan aturan/Pindah Buku tampil **lilac samar** di sel akun lawan sampai "Terapkan usulan".
- **Arah:** banner per blok — "Arah ditentukan dari saldo" (otomatis), atau pemilih wajib "Kolom ‹judul› = Uang masuk / Uang keluar" yang menahan Simpan.
- Sel galat: border kritis + `aria-invalid` + `aria-describedby`; filter "baris bermasalah saja"; panel baris dilewati; banner saldo putus; lencana duplikat; sel terkunci (redup + gembok + alasan di tooltip **dan** `aria-description`, `aria-readonly`).
- Bilah alat: Simpan ("Simpan 5.187 perubahan", nonaktif selama ada galat/putus/arah belum dipilih), Batalkan semua, Undo/Redo, Terapkan usulan, Isi akun lawan, Isi tanggal akhir periode, Saldo awal rekening koran, Buka berkas CSV (D47), *(Modul B: Unggah PDF)*. Ringkasan: jumlah baru/diubah/dihapus, total Masuk/Keluar (`rupiahPersis`).
- **Panel Pindah Buku:** saldo akun Pindah Buku s.d. akhir periode (≠ 0 → peringatan), baris belum berpasangan, usulan pasangan.
- **Saldo dikosongkan (D50):** sel bertanda "saldo dikosongkan" + saldo aslinya tampil dicoret, dengan alasan di tooltip & `aria-description`; tidak bisa terjadi tanpa aksi eksplisit "Kosongkan saldo".
- **Draf (D51):** `beforeunload` + penjaga navigasi; cadangan IndexedDB per (klien, akun kas), ditulis berkala saat draf kotor, **dihapus otomatis setelah Simpan berhasil**; saat halaman dibuka dan cadangan ada → "Pulihkan draf" / "Buang". IndexedDB tidak tersedia → hanya peringatan. Semua akses dibungkus try/catch.
- **Form satu-satu tetap ada** dan tetap utama di **HP** (< `md`). Panel alokasi tetap per baris. Jurnal ringkasan: tautan dari baris ke jurnal kuncinya.
- a11y: `role="grid"`, `aria-rowcount` = total baris, `aria-colindex`, live region hasil tempel, `focus-visible:ring-2`, target sentuh ≥ 32–36 px, `prefers-reduced-motion`. Tiga lapis, `rounded-3xl`, `rounded-full`, token warna (galat = Critical Pink, usulan = Lilac).
- Test struktural: halaman tidak menghitung status/sisa/saldo Pindah Buku sendiri (pola CP-18); Simpan hanya ke route batch; Simpan terikat pada galat, putus, dan arah.

**S10 — Class CF (D62).** Kosakata baku `Operating Balance` · `Operating` · `Investing` · `Funding` (`lib/coa/class-cf.ts` murni: normalisasi "operasi"/"pendanaan"/huruf kecil → baku; nilai lain → galat di impor/sunting COA, kosong tetap NULL). `classification-health` mengenali "Operating Balance" (bucket `saldo`) — **tanpa mengubah `aggregateCashflow`**, yang memang mengecualikannya dari Operating. Aksi Settings › Master COA **"Tandai akun Operating Balance sebagai akun kas"** (pratinjau daftar → PATCH `is_kas = true`). Test: normalisasi, tak ada peringatan palsu untuk Operating Balance, `cashflowBucketOf` tetap cocok dengan `aggregateCashflow`. **Tanpa migrasi; tidak bergantung pada grid** — boleh dikerjakan lebih dulu bila D62 disetujui.

**S11 — ROADMAP + `graphify update .`.**

> **D58 — jurnal per baris vs jurnal ringkasan (keputusan baru, butuh persetujuan Ricko).**
> | Opsi | Jumlah jurnal (Kas Shopee 1, April: 5.187 baris) | Kelebihan | Kekurangan |
> |---|---|---|---|
> | A. Per baris (hari ini) | 5.187 | Jejak 1:1; posting & sunting per baris | `/jurnal` & buku besar banjir (±10.000 baris buku besar per akun kas per bulan); posting satu-satu mustahil; ribuan statement per Simpan |
> | **B. Ringkasan per (akun kas, akun lawan, tanggal)** ✅ rekomendasi | ≈ hari × akun lawan aktif — puluhan sampai ratusan (dihitung dari data nyata di S7) | Ritme harian rekening koran; buku besar terbaca; volume statement kecil | Kunci posting menelan satu hari × satu akun lawan; sunting satu baris membangun ulang jurnal kuncinya |
> | C. Ringkasan per (akun kas, akun lawan, bulan) | paling sedikit | Paling ringkas | Satu koreksi membangun ulang jurnal sebulan; posting = sebulan sekaligus; buku besar kehilangan ritme harian |
> | D. Mode per akun kas (A atau B) | campuran | Fleksibel | Dua jalur pembangun jurnal + setelan baru — hanya bila data nyata memaksa |
>
> **Dampak opsi B:**
> - **Bentuk jurnal:** satu jurnal draf `sumber='mutasi_kas'` per kunci; baris **bruto, tidak dinetokan** (D kas Σmasuk / K lawan; D lawan / K kas Σkeluar); keterangan "Ringkasan mutasi ‹akun kas› ‹tanggal› — ‹akun lawan› (N baris)". Rincian tiap baris tetap di `cash_mutations`.
> - **Alokasi hutang:** **tidak diringkas** — jurnal per mutasi (D hutang invoice snapshot D30 / K kas) seperti sekarang. Pembayaran supplier sedikit, dan meringkasnya akan mencampur akun hutang beberapa invoice di satu baris buku besar. Monitoring hutang tidak terpengaruh (turunan invoice − alokasi).
> - **D32 "Koreksi di Mutasi Kas":** dari jurnal ringkasan membuka `/mutasi-kas` tersaring (akun kas, tanggal, akun lawan); pencarian mundur `cash_mutations WHERE journal_id = ?` kini mengembalikan banyak baris, dan tombolnya menyebut jumlahnya.
> - **Posting:** memposting satu jurnal ringkasan mengunci **semua** anggotanya; anggota baru untuk kunci yang sudah terposting masuk **draf kedua** — yang terposting tidak pernah disentuh. Posting massal tetap di luar cakupan (≈ ratusan jurnal/bulan masih bisa satu-satu, tapi layak dipertimbangkan sesudahnya).
> - **Penyuntingan:** mengubah nominal/tanggal/akun lawan satu baris membangun ulang jurnal kunci **lama dan baru** di batch yang sama (P10); perencana membangun tiap kunci sekali per Simpan. Jurnal balik (D13) atas jurnal ringkasan membuka kembali seluruh anggotanya.
> - **Laporan:** buku besar & L1 menjumlah, jadi hasilnya sama dengan per baris (dikunci test). Cash Flow dari mutasi membaca **baris mutasi**, bukan jurnal — tidak terpengaruh.
> - **Data & skema:** jurnal per baris yang sudah ada tidak dimigrasi; baris lama yang disunting pindah ke jurnal ringkasan kuncinya. **Tanpa migrasi** (`journal_id` tidak unik; kunci diturunkan dari anggota).

#### Modul B — Ekstraksi PDF rekening koran (X0–X8)

**X0 — Gerbang (Ricko, bukan kode).** Akun **berbayar** di ≥ 1 kandidat; ketentuan data API diperiksa dan dicatat (tidak untuk pelatihan, retensi, lokasi pemrosesan); free tier dilarang; API first-party DeepSeek/Z.ai dikecualikan (D54). **Sebelum gerbang ini: hanya PDF SINTETIS** di dev — tidak ada rekening koran nyata ke penyedia mana pun, termasuk di dev.

**X1 — Lapisan penyedia `lib/ai/`.** `AiProvider { nama; mintaJson({ sistem, isi: (teks | gambarPng)[], timeoutMs }) }` + adaptor. `lib/ai/gemini.ts` **memindahkan** `getGeminiClient`/`generateContentWithRetry`; adaptor `anthropic` (`@anthropic-ai/sdk`, Apache-2.0) dan `openai` (`openai`, Apache-2.0) **hanya ditambahkan saat kandidatnya lolos X0**. Pemilihan lewat env `AI_PROVIDER` (+ model); sakelar per fitur `aiFeaturesEnabled(fitur)` tetap satu-satunya gerbang. `suggestJournalAccounts`, saran COA, dan ekstraksi laporan dipindah **tanpa perubahan perilaku**. Keluaran AI selalu lewat penjaga bentuk milik kita.

**X2 — Pembaca PDF di browser (D56).** `pdfjs-dist` (Apache-2.0) atau `unpdf` (MIT). Teks per halaman + posisi; `lib/pdf/susun-baris.ts` murni menyusun item teks jadi baris (kelompok y, urut x, celah kolom → tab) — diuji dengan fikstur. Halaman tanpa lapisan teks → render PNG di browser sebagai **cadangan OCR**, ditandai "dibaca dari gambar".

**X3 — Penyusun tabel `lib/mutasi-pdf.ts` + prompt.** Per halaman, AI **hanya menyusun struktur**: judul kolom **sebagaimana tercetak**, sel **sebagai teks apa adanya**, teks periode dari halaman pertama. **Arah (kotak Arah, S3), tanggal, nominal, tahun diputuskan kode kita** lewat jalur S2/S3 yang sama dengan tempelan — satu aturan untuk semua sumber, tanpa parser khusus per bank. Tiap baris membawa nomor halaman; tahun konsisten satu dokumen. Test: JSON rusak/kolom hilang → halaman **gagal terlihat**, tidak diam-diam kosong; header berulang dilewati; SALDO AWAL halaman berikut jadi jangkar; DB/CR BCA terbaca sebagai petunjuk; nol RegExp.

**X4 — `POST /api/cash-mutations/ekstrak-halaman`.** `{ clientId, akunKasId, halaman, teks | gambarPng }` → `{ kolom, baris, periodeTeks? }`. `requireAkunting`, **`aiFeaturesEnabled('ekstraksiRekeningKoran')` → 503 lebih dulu**, `canAccessClientData`, batas ukuran, `maxDuration`, 429/kuota. **Tidak menulis, tidak mencatat isi** (Sentry `sendDefaultPii: false`; pesan galat tanpa isi baris). Dipanggil **per halaman berurutan** — progres, ulangi per halaman, bisa dibatalkan.

**X5 — UI.** Tombol **"Unggah PDF rekening koran"** (tersembunyi bila sakelarnya mati) → progres per halaman → **satu blok DRAF** berlabel nama berkas, kolom baca-saja **Hal.**, penanda **lilac** sampai disentuh. **Tidak pernah tersimpan tanpa Simpan**; dialog Simpan menyebut "N baris berasal dari AI". Pengaman utama: kesinambungan saldo (D50). Dikembangkan dengan PDF sintetis.

**X6 — Uji banding penyedia (sesudah X0)  ⏸ CP-21.** 2–3 kandidat × **≥ 12 rekening koran nyata** (≥ 3 bank termasuk BCA, ≥ 1 dokumen ≥ 10 halaman, ≥ 1 scan, ≥ 1 lintas tahun). Skrip lokal (PDF dari folder di LUAR repo, tidak pernah di-commit) menjalankan X2→X3→S2→S3. **Ukuran utama: % dokumen lolos kesinambungan saldo tanpa koreksi.** Juga baris hilang/ganda, waktu per halaman, token × **harga resmi pada tanggal uji** → **biaya per dokumen**. Laporan hanya **agregat** di `docs/plans/hasil-uji-banding-ekstraksi-<tanggal>.md`. Ricko memilih (D54).

**X7 — Aktivasi produksi  ⏸ CP-22.** Kunci berbayar + `AI_PROVIDER` di Vercel **Production**, lalu sakelar ekstraksi rekening koran dinyalakan — **hanya sesudah X0 dan D54**. Redeploy; satu rekening koran nyata diuji bersama Ricko.

**X8 — ROADMAP + `graphify update .`.**

**Urutan:** `S10 (kapan saja sesudah D62)` · `S0 → ⏸CP-19 → S1 → S2 → S3 → S4 → S5 → S6 → [K1–K5 · D53] → S7 → S8 → S9 → ⏸CP-20 → S11` lalu `X1 → X2 → X3 → X4 → X5 → [gerbang X0] → X6 → ⏸CP-21 → X7 → ⏸CP-22 → X8`. **K1–K5 boleh berjalan sejajar S1–S6**; yang mengikat hanya: K selesai sebelum S7. X1 (adaptor Gemini saja) boleh kapan saja.

---

## 6. Fase 3 — Impor Mutasi Kas/Bank · Marketplace · Kas Kecil

Prasyarat: §5 selesai; §7.B (kunci periode) disarankan sudah ada (D26).

### 6.A ~~Impor Mutasi Kas/Bank~~ — ❌ **DIBATALKAN 2026-09-19, diserap §5.E** (D35, §3.5)

> **JANGAN KERJAKAN BAGIAN INI.** Fiturnya sama dengan Modul 2 (§5.E): unggah CSV rekening koran, pemetaan kolom, deteksi duplikat, jadikan jurnal. §5.E menambahkan alokasi ke invoice hutang di atasnya, dan membangun dua-duanya berarti dua tabel mutasi bank serta dua jalur "jadikan jurnal" yang harus dijaga tetap sama selamanya.
>
> **Yang PINDAH ke §5.E dan tetap mengikat:** alias header + pemetaan kolom manual, normalisasi tanggal ke `YYYY-MM-DD` tanpa `new Date` untuk keluaran, fingerprint duplikat, arah jurnal dari sisi debit/kredit mutasi, dan larangan regex atas input pengguna (D22).
> **Yang DITUNDA (bukan dibatalkan):** `bank_mapping_rules` — aturan pemetaan otomatis `contains`/`startsWith`. Ia tabel murni-tambah yang bisa menyusul setelah pola keterangan bank klien nyata terlihat. **→ 2026-10-26: dihidupkan kembali (§5.G S4, D57, §8.22).**
> **Yang HILANG:** `bank_imports`, `bank_import_rows` (§8.6–§8.7) — digantikan `cash_mutation_imports` + `cash_mutations`.
>
> Teks lama di bawah dipertahankan **sebagai bahan** untuk §5.E N3 (alias & normalisasi tanggal sudah dirinci di sana), bukan sebagai langkah yang dikerjakan.

**~~Migrasi 0014~~**: `bank_imports`, `bank_import_rows`, `bank_mapping_rules` (§8.6–8.8); `ALTER TYPE journal_source ADD VALUE 'import_bank'` (tulis tangan, boleh di berkas yang sama — DDL tabel tidak memakai nilainya).

**G1 — Murni + test.** `lib/bank-import/parse.ts`: `parseBankStatement(buffer, { columnMap? })` xlsx/CSV (papaparse) → `{ rows: [{ tanggal, keterangan, debit, kredit, saldo? }], errors, warnings, detectedColumns }`; `HEADER_ALIASES` (tanggal/date/tgl; keterangan/description/uraian/remark; debit/keluar/withdrawal/DB; kredit/masuk/deposit/CR; saldo/balance); tanggal dinormalkan ke YMD dari beberapa format umum (dd/mm/yyyy, yyyy-mm-dd, dd-MMM-yy) **tanpa `new Date` untuk output**; bila deteksi kolom gagal → `errors` + `detectedColumns` untuk UI pemetaan manual. `lib/bank-import/fingerprint.ts`: `fingerprint(row)` = hash stabil `tanggal|nominal-sen|keterangan-ternormalisasi` (reuse `normalizeName`). `lib/bank-import/rules.ts`: `applyRules(rows, rules)` — `contains`/`startsWith` case-insensitive, prioritas naik, aturan pertama yang cocok menang. `lib/bank-import/to-journal.ts`: `rowToJournalInput(row, { akunKasId, akunLawanId, noBuktiPrefix }) → JournalInput` (dua baris; arah dari debit/kredit mutasi: uang masuk → D kas / K lawan; keluar → D lawan / K kas) → divalidasi `validateJournalInput` yang sama.
**G2 — Route.** `POST /api/bank-imports` multipart `{ clientId, akunKasId, file, columnMap? }` → `requireAkunting`; akun `resolveIsKas` wajib true; parse; fingerprint; tandai `isDuplicate` (fingerprint pernah ada pada impor lain akun kas yang sama); `applyRules`; simpan header + rows (status `unmapped`/`mapped`/`duplicate`). `GET /api/bank-imports?clientId`, `GET /api/bank-imports/[id]` (rows). `PATCH /api/bank-imports/[id]/rows/[rowId]` `{ akunLawanId?, status? (skip) }`. `POST /api/bank-imports/[id]/journalize` `{ rowIds }` → tiap baris `mapped` → draf jurnal `sumber='import_bank'` (batch per 50), `row.journal_id` diisi, status `journaled`. `GET/POST/PATCH/DELETE /api/bank-mapping-rules?clientId` (`requireAkunting` tulis).
**G3 — Nav/akses.** `'impor-bank'` setelah `'buku-besar'`, staf.
**G4 — UI `/impor-bank`  ⏸ CP-9.** Langkah: pilih akun kas (`StyledSelect` disaring `isKas`) → unggah → bila deteksi gagal: pemetaan kolom manual (dropdown per kolom) → layar peninjauan: tabel baris dengan pemilih akun lawan inline (`StyledSelect`), lencana **Duplikat** (aturan: tampil, tidak dipilih default), filter status, aksi "Terapkan aturan" & "Simpan sebagai aturan" dari satu baris → tombol **Jadikan Jurnal** untuk baris terpilih → tautan ke `/jurnal`. Tab kecil "Aturan Pemetaan" (CRUD). Task vendor: fitur "Impor Mutasi Kas/Bank" (Unggah Berkas, Aturan Pemetaan, Peninjauan Baris, Jadikan Jurnal, Deteksi Duplikat).
**G5 — ROADMAP + sync.**

### 6.B Transaksi Marketplace (D20, D23)

> **⚠️ 2026-10-26:** template akuntan mencatat **Kas Shopee per baris** (5.187 baris April 2026) di sheet kas, bukan per settlement. Sebelum H1 dimulai, tinjau ulang apakah mutasi kas + aturan akun lawan (D57) + jurnal ringkasan (D58) sudah menutup kebutuhan ini (§5.G).

**Migrasi 0015**: `marketplace_settlements` (§8.9); `ADD VALUE 'marketplace'`.
**H1 — `lib/marketplace.ts` + test.** `validateSettlementInput` (platform 1..40; periode YMD; bruto, fee, pajak, net via `normalizeNominal`; **`net = bruto − fee − pajak`** dalam sen, wajib; akun: penjualan, fee, pajak, kas — UUID); `buildSettlementJournalLines(settlement) → JournalLineInput[]`: D kas (net), D beban fee (fee), D akun pajak (pajak — akun dipilih pengguna, D20), K penjualan (bruto); nol dilewati; hasil lolos `validateJournalInput`.
**H2 — Route** `GET/POST /api/marketplace-settlements?clientId`, `GET/PATCH/DELETE /[id]` (hanya bila `journal_id` null), `POST /[id]/journalize` → draf jurnal `sumber='marketplace'` + isi `journal_id`. `requireAkunting` tulis.
**H3 — Nav/akses** `'marketplace'`, staf.
**H4 — UI `/marketplace`  ⏸ CP-10.** Form settlement: platform (teks bebas + saran distinct — pola `clientTypeOptions`), periode, bruto/fee/pajak → **net dihitung** (tampil, read-only), empat pemilih akun (`StyledSelect` tersaring: penjualan → `resolveAccountType==='revenue'`; fee/pajak → `expense`; kas → `isKas`); **Pratinjau Jurnal** (tabel baris D/K + total, dari `buildSettlementJournalLines`) sebelum Simpan; daftar settlement + status "Belum dijurnal / Draf / Terposting". Task vendor: fitur "Transaksi Marketplace".
**H5 — ROADMAP + sync.**

### 6.C Kas Kecil (D21, D23)

**Migrasi 0016**: `petty_cash_funds`, `petty_cash_expenses` (§8.10–8.11); `ADD VALUE 'kas_kecil'`.
**I1 — `lib/petty-cash.ts` + test.** `validateFundInput`, `validateExpenseInput`; `availableBalance(fund, unreplenishedExpenses)` = `danaTetap − Σ nominal` (sen); `buildReplenishmentJournalLines(expenses, fund, akunBankId)` = D per akun beban (dikelompokkan, dijumlah), K bank (total) — lolos `validateJournalInput`; `summarizeUsage(expenses, periodStart, periodEnd)` per akun beban.
**I2 — Route** `GET/POST /api/petty-cash/funds?clientId`, `PATCH /[fundId]`; `GET/POST /api/petty-cash/funds/[fundId]/expenses`, `PATCH/DELETE /expenses/[id]` (hanya bila belum diisi ulang); `POST /api/petty-cash/funds/[fundId]/replenish { akunBankId, tanggal, noBukti }` → draf jurnal `sumber='kas_kecil'`, tandai pengeluaran `journal_id`; `GET /…/summary?periodStart&periodEnd`.
**I3 — Nav/akses** `'kas-kecil'`, staf.
**I4 — UI `/kas-kecil`  ⏸ CP-11.** Kartu dana (nama, akun kas kecil, dana tetap, **saldo tersedia** besar), tabel pengeluaran (tanggal, keterangan, akun beban, nominal, status), tombol Catat Pengeluaran (modal), tombol **Isi Kembali** (modal: akun bank, tanggal, no bukti → pratinjau jurnal → buat draf), tab Rekap per periode. Task vendor: fitur "Kas Kecil".
**I5 — ROADMAP + sync.**

---

## 7. Fase 4 — Saldo Awal & Kunci Periode · Laporan dari Jurnal

### 7.A Saldo Awal (D16, D23)

> **2026-10-26 (D61, menunggu Ricko):** grid mutasi kas **tidak** menunggu bagian ini — jangkar rantai saldo adalah fakta dokumen (§5.G S3). Saldo awal **buku** per akun kas dibutuhkan laporan Cash Flow dari mutasi dan cek "saldo buku = saldo bank"; usulannya J1–J3 dimajukan **terbatas akun kas** bersama laporan itu.

**Migrasi**: `ADD VALUE 'opening_balance'` (bagian dari 0017).
**J1 — `lib/journal.ts` (perluasan) + test.** `buildOpeningBalanceInput({ tanggal, rows: [{ masterCoaId, saldo, posisi }] }) → JournalInput`: tiap akun → satu baris pada sisi normal-nya (Debit-normal → D, Kredit-normal → K); kontra (saldo negatif) → sisi berlawanan; `no_bukti = 'SALDO-AWAL-<tahun>'`, `keterangan` baku; hasil **wajib** lolos `validateJournalInput` — bila tak seimbang, kembalikan `selisih` untuk ditampilkan (jangan menyeimbangkan diam-diam). Hanya boleh **satu** jurnal `opening_balance` per klien (predikat murni + unique parsial via cek route).
**J2 — Route** `POST /api/journals/opening-balance { clientId, tanggal, rows }` → `requireAkunting`; tolak bila sudah ada; simpan sebagai **draft** (diposting lewat jalur biasa, supaya masuk kunci periode & events). `GET /api/journals/opening-balance?clientId`.
**J3 — UI: tab Settings "Pembukuan" (D25)  ⏸ CP-12.** `SettingsTabId` += `'pembukuan'` (staf saja) + test; bagian **Saldo Awal**: tanggal, tabel semua akun Master COA (kode, nama, posisi, input saldo), total D/K hidup + selisih (reuse panel dari form jurnal), Simpan → membuat draf → tautan "Posting di /jurnal". Task vendor: "Input Saldo Awal", "Validasi Saldo Awal".

### 7.B Kunci Periode (D17) — **disarankan dieksekusi setelah §5.A (D26)**

**Migrasi 0017**: `period_locks` (§8.12) (+ `ADD VALUE 'opening_balance'` bila §7.A dikerjakan bersamaan; kalau §7.B maju, pisahkan ke migrasi sendiri).
**K1 — `lib/period-lock.ts` + test.** `isDateLocked(tanggal, locks)` (string YMD ≤ `terkunciSampai` aktif → true); `validateLockInput`; `latestLock(locks)`; `canUnlock(role) = isOwner(role)`.
**K2 — Integrasi (perbarui langkah lama).** ✅ **dikerjakan 2026-10-26** lewat `tolakBilaPeriodeTerkunci` (13 jalur, termasuk mutasi kas & impor CSV) + `periodLockChecker` sungguhan; jalur yang belum ada (marketplace, kas kecil, saldo awal) wajib ikut — pemindai `lib/period-lock-api.test.ts` menagihnya. `canPost` di §5.A menerima `isLocked` nyata; `POST/PATCH/DELETE /api/journals` dan `reverse`, `journalize` (bank/marketplace/kas kecil), `opening-balance` semuanya menolak **409 `{ error, lockedUntil }`** bila `isDateLocked(tanggal)`. Test baca-sumber: setiap route penulis jurnal memanggil `isDateLocked`.
**K3 — Route** `GET /api/period-locks?clientId`; `POST` `{ clientId, terkunciSampai }` `requireAkunting` → insert + `audit_events{entity_type:'period_lock', event:'period_locked'}` (`entity_id` = id kunci; CHECK hanya mewajibkannya untuk `journal`, §8.5); `DELETE /api/period-locks/[id]` body `{ alasan }` **`requireOwner`**, alasan wajib ≥ 10 karakter → hapus + event `period_unlocked` dengan `catatan=alasan`.
**K4 — UI  ⏸ CP-13.** ✅ **kode 2026-10-26** (`components/settings/kunci-periode-card.tsx`, peringatan form jurnal/Posting/impor); CP-13 diuji klik agen 2026-10-26 di dev (8/9 skenario di browser; skenario akunting hanya lewat test — rincian di log ROADMAP). Tab "Pembukuan" bagian **Kunci Periode**: status "Terkunci sampai …", tombol Kunci (pilih tanggal ≥ kunci sebelumnya), tombol Buka (owner saja; modal alasan wajib); **peringatan** di form jurnal, tombol Posting, dan halaman impor/marketplace/kas kecil bila tanggal ≤ kunci (UI membaca `GET /api/period-locks`; server tetap menegakkan). Task vendor: "Kunci Periode", "Buka Kunci Terbatas", "Peringatan Periode Terkunci".
**K5 — ROADMAP + sync.** ✅ 2026-10-26 — kode §7.B lengkap, **belum dirilis** (migrasi 0020 baru di dev; checklist rilis di ROADMAP). Sync vendor gagal (langganan workspace tidak aktif).

### 7.C Laporan dari Jurnal (D18, D19) — puncak seluruh roadmap

**L1 — `lib/reports/from-journal.ts` + test  ⏸ CP-14 (review akuntansi).**
- `journalLinesToAggLines({ lines(posted, join akun), accounts, periodStart, periodEnd, reportType }) → AggLine[]`, satu `AggLine` per akun, mengikuti kontrak `AggLine` di `lib/financial-agg.ts` (`nama`=nama akun, `displayName`=nama akun, `kelompok`, `subKelompok`, `classCf`, `isSubtotal=false`, `status='matched'`).
- **Aturan tanda — WAJIB persis begini**, karena `financial-agg` diasah pada tanda hasil ekstraksi PDF:

  | Kategori (turunan `classifyBs`/`classifyPnl` + `resolveAccountType`) | `amount` |
  |---|---|
  | Neraca: `aktivaLancar`, `aktivaTetap`, `aktivaTidakBerwujud`, `aktivaLainnya` | `Σdebit − Σkredit` (kontra-aset ber-`posisi` Kredit otomatis **negatif** — cocok PDF) |
  | Neraca: `hutang`, `modal` | `Σkredit − Σdebit` (prive/kontra-modal otomatis negatif) |
  | Laba Rugi: `revenue`, `lainLain` | `Σkredit − Σdebit` (retur/potongan otomatis negatif; lain-lain net bertanda) |
  | Laba Rugi: `hpp`, `varCost`, `fixedCost`, `pajak` | `Σdebit − Σkredit` (positif normal; `aggregatePnl` memakai `Math.abs`) |
  | `other` | `Σdebit − Σkredit` |

- **Periode:** Laba Rugi = baris dalam `[periodStart, periodEnd]`; **Neraca = kumulatif semua baris terposting ≤ `periodEnd`** (termasuk `opening_balance`); Arus Kas = baris dalam periode.
- **Arus kas (D19):** untuk tiap jurnal terposting dalam periode yang menyentuh akun `resolveIsKas`: mutasi kas = `D − K` pada baris kas; klasifikasi diambil dari `classCf` baris **lawan** (bila banyak lawan, bagi proporsional nominal); jurnal yang **semua** barisnya akun kas (transfer) dilewati; hasil = `AggLine` per (akun lawan) dengan `classCf` lawan dan `amount` bertanda → `aggregateCashflow`. Baris lawan tanpa `classCf` → dikumpulkan sebagai **"tak terklasifikasi"** dan dilaporkan (jangan diam-diam hilang).
- **Catatan template akuntan (Ricko 2026-10-26):** kelompok **"Pendapatan & Biaya Lain-lain"** ber-**posisi Kredit** untuk SEMUA akunnya, dan biayanya tampil **negatif**. Aturan `lainLain` = `Σkredit − Σdebit` di atas sudah menghasilkan itu — wajib masuk golden test. Jebakannya di tempat lain: `deriveAccountType` memakai `posisi` sebagai pemutus untuk pos lain-lain Laba Rugi (D1), jadi **akun biaya di kelompok itu diturunkan sebagai `revenue`** dan pemilih akun bertipe (mis. fee marketplace → `expense`) akan salah menyaring. Butuh `tipe_akun` eksplisit (E2) untuk akun-akun itu atau aturan turunan yang tidak bersandar pada `posisi` — putuskan di CP-14.
- **Pindah Buku (D59):** jurnal kas ↔ akun Pindah Buku adalah transfer internal — dikecualikan dari arus kas seperti jurnal yang semua barisnya akun kas. Sumber Cash Flow dari **mutasi kas** (catatan Ricko 2026-09-22) memakai `class_cf` akun lawan per baris mutasi (§5.G S10) — keputusannya tetap fase tersendiri.
- **Golden test:** ambil fixture `seed-dev` (line item hasil "ekstraksi") klien seed, susun jurnal yang ekuivalen, jalankan `aggregatePnl`/`aggregateBalanceSheet` pada keduanya → **identik**. Ini bukti "Konsistensi Format".

**L2 — `lib/reports/source.ts` + test.** `resolveReportSource({ postedCountInPeriod, hasPdfReport }) → 'journal' | 'pdf' | 'none'` (jurnal menang bila ada ≥1 terposting di periode; else PDF; else none). Murni.
**L3 — Route.** `app/api/dashboard/[clientId]`, `analytics/[clientId]/ratios`, `analytics/[clientId]/neraca-detail`: sebelum membaca `financial_reports`, panggil `resolveReportSource` per periode yang diminta; bila `journal` → `AggLine[]` dari L1 (dan `CompareLine[]` untuk neraca-detail), **jalur PDF yang ada tidak diubah**; respons + `source` (dan per-bulan bila campuran). `GET /api/reports/list` tidak berubah. Test baca-sumber: ketiga route memanggil `resolveReportSource`; tidak ada agregator baru (`grep` memastikan hanya `financial-agg` yang diimpor untuk agregasi).
**L4 — UI  ⏸ CP-15.** Lencana "Dari jurnal" / "Dari PDF" di header Dashboard & Analytics (tone `info`), tooltip menjelaskan aturan D18; bila campuran per bulan, lencana per titik data. Task vendor: "Pilih Sumber Laporan", "Laba Rugi", "Neraca", "Arus Kas", "Konsistensi Format".
**L5 — ROADMAP + sync.**

---

## 8. Skema kumulatif (semua fase)

Konvensi umum: uuid PK `defaultRandom()`; `client_id → clients.id cascade`; uang `numeric(18,2)`; tanggal `date`; **tabel baru: `timestamp(..., { withTimezone: true })`** (D24); `created_at`/`updated_at` `defaultNow()`.

> **Urutan baca:** §8.1–§8.13 lalu **§8.16–§8.21 (tabel baru 2026-09-19)**, baru **§8.14 (urutan migrasi)** dan **§8.15 (perujuk `master_coa`)** yang sengaja ditaruh terakhir karena keduanya merangkum seluruh tabel di atasnya. Nomornya tidak disusun ulang: §8.14/§8.15 sudah dirujuk dari P14, §5.D, dan ROADMAP.

### 8.1 Enum
| Enum | Nilai awal | Tambahan per fase (ADD VALUE tulis tangan) |
|---|---|---|
| `journal_status` | `draft`, `posted` | — |
| `journal_source` | `manual` (0010) | 🆕 `pembelian`, `mutasi_kas` (**0016**) · `marketplace` (0019) · `kas_kecil` (0020) · `opening_balance` (0021) · ~~`import_bank`~~ ❌ dibatalkan bersama §6.A |
| `audit_entity_type` | `journal`, `master_coa`, `period_lock`, `supplier` (0014) | 🆕 `purchase_invoice`, `cash_mutation` (**0016**) |
| `account_type` | `asset`, `liability`, `equity`, `revenue`, `expense` | — (**0015**, `CREATE TYPE`) |
| 🆕 `purchase_payment_method` | `kredit`, `tunai` | — (**0017**, `CREATE TYPE` — boleh satu berkas dengan tabelnya) |

**`ADD VALUE` vs `CREATE TYPE`:** enum yang **baru dibuat** boleh langsung dipakai di migrasi yang sama; nilai yang **ditambahkan ke enum yang sudah ada** tidak boleh (P8). Itu sebabnya 0016 berisi `ADD VALUE` saja.

### 8.2 `journal_entries` (0010; kolom Fase 2 di **0014**)
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | dibuat di JS |
| client_id | uuid NN → clients cascade | |
| tanggal | date NN | string YMD |
| no_bukti | text NN | 1–80; **unique(client_id, no_bukti)** |
| keterangan | text NN | |
| sumber | journal_source NN default manual | |
| status | journal_status NN default draft | |
| created_by | uuid NN → users **restrict** | lookup email |
| posted_at | timestamptz NULL | 0012 |
| posted_by | uuid NULL → users restrict | 0012 |
| reversal_of_id | uuid NULL → journal_entries **restrict** | 0012; self-FK |
| created_at, updated_at | timestamptz | |
Indeks: `(client_id, tanggal)`, `(client_id, status)`, `(reversal_of_id)`.

### 8.3 `journal_lines` (0010; `supplier_id` di **0014**)
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| journal_id | uuid NN → journal_entries cascade | |
| master_coa_id | uuid NN → master_coa **restrict** | D4 |
| supplier_id | uuid NULL → master_supplier **restrict** | 0012; hanya baris akun hutang |
| debit | numeric(18,2) NN default 0 | |
| kredit | numeric(18,2) NN default 0 | |
| keterangan | text NULL | |
| line_order | integer NN | |
Indeks: `(journal_id)`, `(master_coa_id)`, `(supplier_id)`. Opsional CHECK `((debit = 0) <> (kredit = 0))` tulis tangan.

### 8.4 `master_supplier` (0012–0013; `bank_*` di **0017**, DROP termin di **0019**)
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| client_id | uuid NN → clients cascade | |
| nama | text NN | **unique(client_id, lower(nama))** — migrasi 0013 |
| kontak | text NULL | |
| npwp | text NULL | |
| ~~termin_pembayaran~~ | ~~integer NULL~~ | ❌ **DIHAPUS di migrasi 0019** (D43) — termin melekat pada invoice, bukan pada rekanan |
| bank_nama | text NULL | 🆕 0017 (D43) |
| bank_rekening | text NULL | 🆕 0017 — **text, bukan angka**: nomor rekening bisa berawalan nol dan bukan sesuatu yang pernah dihitung |
| bank_atas_nama | text NULL | 🆕 0017 |
| akun_hutang_default_id | uuid NULL → master_coa **set null** | disambung ulang by kode (D4). **Di-snapshot ke invoice saat invoice dibuat** (D30) — mengubahnya tidak boleh memindahkan hutang yang sudah tercatat |
| created_at, updated_at | timestamptz | |

### 8.5 `audit_events` (0014 — **SUDAH ADA**; kolom `nilai_*` ditambah 0017)

> Menggantikan rancangan `journal_events` (R2, diambil Ricko 2026-09-18). Sudah terbangun dan berjalan sejak migrasi 0014.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| client_id | uuid NN → clients cascade | |
| entity_type | **enum `audit_entity_type`** NN | `journal`, `master_coa`, `period_lock`, `supplier` · 🆕 0016 `ADD VALUE`: `purchase_invoice`, `cash_mutation` |
| entity_id | uuid NULL | **tanpa FK** (polimorfik). CHECK: wajib terisi bila `entity_type='journal'` |
| event | text NN | daftar konstanta di lib masing-masing entitas; text bukan enum (D12) |
| user_id | uuid NULL → users set null | |
| catatan | text NULL | alasan buka kunci, dll |
| nilai_sebelum | **jsonb NULL** | 🆕 0017 (D42) — keadaan sebelum perubahan |
| nilai_sesudah | **jsonb NULL** | 🆕 0017 (D42) — keadaan sesudah |
| at | timestamptz NN default now | |

Indeks: `(entity_type, entity_id, at)`, `(client_id, at)`. **Append-only.**

**Kenapa jsonb dan bukan menumpang `catatan`:** `catatan` adalah prosa untuk dibaca manusia. Nilai sebelum/sesudah adalah **data** — ia dibandingkan, ditampilkan sebagai diff, dan kelak dicari. Menaruh JSON di kolom prosa berarti setiap pembaca harus menebak mana yang prosa dan mana yang bukan.

**Satu-satunya DELETE yang sah** atas tabel ini tetap pembersihan bersamaan dengan entitasnya di dalam `db.batch` yang sama (pengganti FK cascade). **Pengecualian yang disengaja:** event `deleted` untuk `purchase_invoice` sengaja **hidup lebih lama** dari invoicenya dan menyimpan snapshotnya di `nilai_sebelum` — lihat kotak di §5.D M4.

### ~~8.6 `bank_imports`~~ — ❌ **DIBATALKAN** (§3.5), digantikan §8.19 `cash_mutation_imports`
~~id · client_id · akun_kas_id → master_coa restrict · nama_berkas text · jumlah_baris int · diimpor_oleh → users restrict · created_at.~~

### ~~8.7 `bank_import_rows`~~ — ❌ **DIBATALKAN**, digantikan §8.18 `cash_mutations`
~~id · import_id → bank_imports cascade · tanggal date · keterangan text · debit numeric · kredit numeric · saldo numeric NULL · fingerprint text NN · is_duplicate boolean NN · akun_lawan_id → master_coa set null · status text NN · journal_id → journal_entries set null · line_order int.~~

### ~~8.8 `bank_mapping_rules`~~ — ⏸ **DITUNDA** (bukan dibatalkan — §3.5) → **dihidupkan kembali sebagai §8.22 `cash_mutation_rules` (2026-10-26)**
Aturan pemetaan otomatis `contains`/`startsWith`. Tabel murni-tambah; dibangun setelah pola keterangan bank klien nyata terlihat. Bentuk yang direncanakan bila tiba saatnya: id · client_id cascade · pola text NN · tipe_cocok text NN (`contains`/`startsWith`) · akun_id → master_coa restrict · prioritas int NN default 100 · aktif boolean NN default true · created_at. Indeks `(client_id, prioritas)`. **D22 (larangan regex) tetap mengikat.**

### 8.9 `marketplace_settlements` (**0022**)
id · client_id cascade · platform text NN · periode_mulai date · periode_akhir date · bruto, fee, pajak, net numeric NN · akun_penjualan_id, akun_fee_id, akun_pajak_id, akun_kas_id → master_coa restrict · journal_id → journal_entries set null · catatan text NULL · created_by → users restrict · created_at, updated_at. Indeks `(client_id, periode_mulai)`.

### 8.10 `petty_cash_funds` (**0023**)
id · client_id cascade · nama text NN · akun_kas_kecil_id → master_coa restrict · dana_tetap numeric NN · aktif boolean default true · created_at, updated_at. `unique(client_id, nama)`.

### 8.11 ~~`petty_cash_expenses`~~ — dihapus oleh R3
id · fund_id → petty_cash_funds cascade · tanggal date · keterangan text NN · nominal numeric NN · akun_beban_id → master_coa restrict · bukti text NULL · journal_id → journal_entries set null (diisi saat pengisian kembali) · created_by → users restrict · created_at. Indeks `(fund_id, tanggal)`, `(journal_id)`.

### 8.12 `period_locks` (**0020**, D26)
id · client_id cascade · terkunci_sampai date NN · dikunci_oleh → users restrict · created_at. Indeks `(client_id, terkunci_sampai)`. Membuka = menghapus baris + event (riwayat ada di `audit_events`).

### 8.13 `master_coa` (perubahan **0015**)
`+ tipe_akun account_type NULL` · `+ is_kas boolean NN default false`. **Tidak ada** kolom normal balance / arus kas baru (D14).

### 8.16 `purchase_invoices` (0017) 🆕
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | dibuat di JS (supaya header + baris + jurnal muat satu `db.batch`) |
| client_id | uuid NN → clients cascade | |
| supplier_id | uuid NN → master_supplier **restrict** | supplier yang dipakai invoice tidak boleh hilang |
| tanggal | date NN | string YMD |
| no_invoice | text **NULL** | nomor dari vendor. **unique(client_id, supplier_id, no_invoice) hanya bila terisi** — kosong = NULL, bukan `''` (D29) |
| cara_bayar | enum `purchase_payment_method` NN | `kredit`, `tunai`. **CREATE TYPE baru** (bukan ADD VALUE) → boleh satu berkas dengan tabelnya |
| akun_tujuan_id | uuid NN → master_coa **restrict** | SATU akun per invoice, **bebas akun apa pun** — persediaan, beban jasa, dll. Tidak dibatasi ke akun persediaan |
| akun_kas_id | uuid NULL → master_coa restrict | hanya `tunai` (snapshot, D30) |
| akun_hutang_id | uuid NULL → master_coa restrict | hanya `kredit` — **snapshot dari supplier saat invoice dibuat** (D30) |
| akun_ppn_masukan_id | uuid NULL → master_coa restrict | snapshot dari setelan klien bila `ppn > 0` (D30, D33) |
| ppn | numeric(18,2) NN default '0' | nominal, **terpisah dari subtotal** |
| jumlah_termin | integer NN default 1 | |
| jatuh_tempo_akhir | date NULL | hanya `kredit` |
| keterangan | text NULL | |
| journal_id | uuid NULL → journal_entries **set null** | jurnal draf otomatis (D31) |
| created_by | uuid NN → users restrict · created_at, updated_at | timestamptz (D24/P9) |

**CHECK** (jaring terakhir di DB, cermin `validatePurchaseInvoice`):
`cara_bayar='kredit' ⇒ akun_hutang_id IS NOT NULL AND jatuh_tempo_akhir IS NOT NULL` · `cara_bayar='tunai' ⇒ akun_kas_id IS NOT NULL` · `ppn > 0 ⇒ akun_ppn_masukan_id IS NOT NULL` · `ppn >= 0` · `jumlah_termin >= 1`.
**Indeks:** `(client_id, tanggal)`, `(supplier_id)`, `(journal_id)`.
**TIDAK ADA kolom `total`, `sisa`, maupun `status`** — ketiganya diturunkan (D27, P3/P4).

### 8.17 `purchase_invoice_lines` (0017) 🆕
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK · invoice_id uuid NN → purchase_invoices **cascade** | |
| nama_barang | text NN | teks bebas — **tidak ada master barang** |
| qty | numeric(18,4) NN | pecahan diizinkan (2,5 kg) |
| satuan | text NULL | |
| harga_satuan | numeric(18,2) NN | |
| subtotal | numeric(18,2) NN | **DISIMPAN** (D28) — rupiah baris adalah faktanya; qty × harga punya pembulatan |
| line_order | integer NN | urutan bermakna, sama seperti `journal_lines` |

**CHECK:** `qty > 0` · `harga_satuan >= 0` · `subtotal >= 0`. **Indeks:** `(invoice_id)`.
**Ongkir & diskon (belum diputuskan Ricko):** sementara **digabung netto** ke `subtotal` baris. Saat dipisah nanti, bentuknya = kolom `ongkir`/`diskon` nullable di header (murni-tambah) **plus satu elemen baru di daftar komponen** `buildPurchaseJournalLines` (§5.D M3) — tidak membongkar tabel dan tidak mengubah tanda tangan fungsi.

### 8.18 `cash_mutations` (0018) 🆕
id · client_id NN cascade · **akun_kas_id NN → master_coa restrict** · tanggal date NN · keterangan text NULL · **debit numeric(18,2) NN default '0'** · **kredit numeric(18,2) NN default '0'** · saldo numeric(18,2) NULL (saldo berjalan dari rekening koran, informatif) · fingerprint text NN · import_id uuid NULL → cash_mutation_imports **set null** (baris manual = NULL) · akun_lawan_id uuid NULL → master_coa **set null** · journal_id uuid NULL → journal_entries **set null** · created_by → users restrict · created_at, updated_at.
**CHECK** (sama persis dengan `journal_lines`): `debit >= 0 AND kredit >= 0 AND ((debit = 0) <> (kredit = 0))`. Untuk akun kas: **debit = uang masuk** (D36).
**Indeks:** `(client_id, tanggal)`, `(akun_kas_id, tanggal)`, `(fingerprint)`, `(journal_id)`.
**Fingerprint TIDAK unik** (D38) — dua pembayaran identik pada hari yang sama itu nyata; duplikat adalah peringatan, bukan penolakan. **Tidak ada kolom status** — diturunkan dari alokasi & `akun_lawan_id`/`journal_id` (D37).

**🆕 2026-10-26 (§5.G, D49):** `saldo` adalah **fakta dokumen** — angka yang dicetak bank — bukan saldo hitungan, jadi tidak melanggar P4 (kotak di §5.G). Ditambah **`urutan integer NULL`** (CHECK `urutan IS NULL OR urutan >= 1`, migrasi **0021**): posisi baris dalam satu Simpan; urutan baku `tanggal, created_at, urutan, id`. Baris lama = NULL. Ditambah juga **`catatan text NULL`** (≤ 500; template akuntan menamainya Konfirmasi/Reff; **tidak** ikut fingerprint). Banyak mutasi boleh berbagi satu `journal_id` (jurnal ringkasan, D58) — kolomnya memang tidak unik.

### 8.19 `cash_mutation_imports` (0018) 🆕
id · client_id NN cascade · akun_kas_id NN → master_coa **restrict** · nama_berkas text NN · jumlah_baris integer NN · diimpor_oleh → users restrict · created_at. Indeks `(client_id, created_at)`. *(Menggantikan `bank_imports`.)*

### 8.20 `client_accounting_settings` (0017) 🆕
| Kolom | Tipe | Catatan |
|---|---|---|
| client_id | uuid **PK** → clients cascade | satu baris per klien |
| akun_ppn_masukan_id | uuid NULL → master_coa **set null** | D33 — kosong + PPN diisi ⇒ route menolak 409 ke Settings |
| 🆕 akun_pindah_buku_id | uuid NULL → master_coa **set null** | D59 (2026-10-26, migrasi 0021) — akun Pindah Buku klien; kosong ⇒ panel Pindah Buku meminta disetel dulu di Settings. `buildReplacePlan` memperlakukannya seperti `akun_ppn_masukan_id` |
| posting_bisa_diedit | boolean NN default **`false`** | D42 ✅ 2026-09-20 — **posting permanen**, dinyalakan per klien bila dibutuhkan. Lihat kotak §3.4 |
| created_at, updated_at | timestamptz | |

Baris dibuat **lazily** (saat pertama disetel). Tidak ada backfill, tidak ada migrasi data.

**⚠️ Ketiadaan baris BERARTI `posting_bisa_diedit = false` — dan itu dikunci test** (tambahan Ricko 2026-09-20). Mayoritas klien tidak akan pernah punya barisnya, jadi jawaban untuk "baris tidak ada" adalah jawaban yang paling sering dipakai, bukan kasus pinggiran. Predikatnya wajib `settings?.postingBisaDiedit === true`; bentuk `?? true` akan membalik keputusannya untuk hampir semua klien sekaligus. Test di M8 menguji **tiga keadaan** (tidak ada · `false` · `true`) dan menuntut dua yang pertama menghasilkan jawaban yang sama persis.

### 8.21 `cash_mutation_allocations` (0018) 🆕
id · mutation_id NN → cash_mutations **cascade** · invoice_id NN → purchase_invoices **restrict** · nominal numeric(18,2) NN · **`termin_urutan` integer NULL** · created_by → users restrict · created_at.

**`termin_urutan` (D40 ✅ 2026-09-20):** `NULL` = pembayaran ini ikut **FIFO**; terisi = **dipaku** ke cicilan ke-N oleh akunting. Nullable, jadi bawaannya tetap nol input — penimpaan manual adalah pengecualian yang **tercatat**, bukan bentuk baku. Aturan penerapannya (berpaku dulu, luberan FIFO, paku yatim jatuh ke FIFO) ada di kotak D40 §3.4 dan wajib dikunci test di U1.

**CHECK:** `nominal > 0` · `termin_urutan IS NULL OR termin_urutan >= 1`.
**unique(mutation_id, invoice_id)** — satu mutasi menunjuk satu invoice paling banyak sekali; beberapa invoice per mutasi tetap boleh (D37). **Indeks:** `(invoice_id)`, `(mutation_id)`.
Batas "Σ alokasi ≤ nominal mutasi", "Σ alokasi ≤ sisa invoice", dan "`termin_urutan` ≤ `jumlah_termin` invoice" **tidak bisa** dijadikan CHECK (ketiganya lintas-baris/lintas-tabel) — ditegakkan di route dan dikunci test baca-sumber (P15).

### 8.22 `cash_mutation_rules` (0021) 🆕 2026-10-26 — menghidupkan §8.8 (D57)
id · client_id NN cascade · pola text NN (2..100, disimpan apa adanya; dicocokkan setelah `normalizeKeterangan`) · arah text NN default `'keduanya'` CHECK IN (`masuk`, `keluar`, `keduanya`) · akun_lawan_id NN → master_coa **restrict** · akun_kas_id NULL → master_coa **restrict** (NULL = semua akun kas) · prioritas integer NN default 0 · aktif boolean NN default true · created_by → users restrict · created_at, updated_at (timestamptz, D24). Indeks `(client_id, aktif)`. **Tanpa unique pada pola** — pola sama dengan arah berbeda itu sah. Pencocokan **tanpa RegExp** (D22). `buildReplacePlan`: kedua perujuk disambung by kode, **blokir 409** bila kodenya hilang (§8.15).

### 8.14 Urutan migrasi — **DIPERBARUI 2026-09-19**

**Sudah diterapkan ke dev (0010–0014), belum ke produksi:**
0010 journals → 0011 no_bukti opsional → 0012 master_supplier → 0013 nama supplier case-insensitive → 0014 posting/audit_events/supplier_id.

**Berikutnya, urutannya mengikat:**

| # | Isi | Sifat | Langkah |
|---|---|---|---|
| **0015** | `CREATE TYPE account_type`; `master_coa += tipe_akun, is_kas` | tambah | E1 |
| **0016** | **HANYA `ALTER TYPE … ADD VALUE`**: `journal_source` += `pembelian`, `mutasi_kas`; `audit_entity_type` += `purchase_invoice`, `cash_mutation` | tambah | M1 |
| **0017** | `client_accounting_settings`, `purchase_invoices`, `purchase_invoice_lines`, `audit_events += nilai_sebelum/nilai_sesudah`, `master_supplier += bank_*` | tambah | M1 |
| **0018** | `cash_mutation_imports`, `cash_mutations`, `cash_mutation_allocations` | tambah | N1 |
| **0019** | **`master_supplier` DROP `termin_pembayaran`** | ⚠️ **NON-ADITIF** | D43 |
| **0020** | `period_locks` (D26 — naik prioritas sejak D42) — ✅ **dev 2026-10-26** (`0020_period_locks.sql`), belum di main | tambah | K1 |
| **0021** 🆕 | `cash_mutations.urutan` + `catatan`, `client_accounting_settings.akun_pindah_buku_id`, `cash_mutation_rules` (D49, 2026-10-26 — hanya bila disetujui; tukar nomor dengan 0020 bila S1 lebih dulu dari K1) | tambah | §5.G S1 |
| **0022** | `marketplace_settlements` + `ADD VALUE marketplace` | tambah | §6.B |
| **0023** | `petty_cash_funds` + `ADD VALUE kas_kecil` | tambah | §6.C |
| **0024** | `ADD VALUE opening_balance` | tambah | §7.A |

**Kenapa 0016 berdiri sendiri:** P8 — nilai enum yang baru ditambah lewat `ADD VALUE` **tidak boleh dipakai di transaksi yang sama**. Menggabungkannya dengan 0017 membuat migrasi gagal di tengah, setelah sebagian objek terbuat. Preseden: `0007_role_finance.sql`.

**Kenapa 0019 dipisah dan ditaruh paling akhir:** ia satu-satunya yang membuang data. Dipisah supaya bisa ditinjau, ditunda, atau dibatalkan sendirian tanpa menahan 0015–0018.

**Syarat rilis 0019 — ✅ disetujui Ricko 2026-09-20:** **0015–0019 diterapkan dalam SATU jendela rilis, atau ditunda bersama.** Jangan pernah merilis 0017 (yang menghentikan pemakaian `termin_pembayaran`) tanpa 0019 menyusul di rilis yang sama. Rinciannya dan jalan keluarnya bila jendelanya terlanjur terbuka ada di §12.

**Gotcha #8 CLAUDE.md tetap berlaku:** snapshot drizzle 0006–0009 hilang. Setiap `db:generate` **harus dibaca SQL-nya** sebelum `db:migrate` — kalau ia menyebut tabel/enum yang sudah ada, berhenti.

### 8.15 Perujuk `master_coa` yang WAJIB disambung ulang oleh `buildReplacePlan` (P14)

| Kolom | Nullable? | Kebijakan | Langkah |
|---|---|---|---|
| `report_line_items.master_coa_id`, `.suggested_coa_id` | — | sudah ada | — |
| `coa_mapping_history` | — | sudah ada | — |
| `journal_lines.master_coa_id` | NOT NULL | blokir **409** | ✅ A3 |
| `master_supplier.akun_hutang_default_id` | NULL | set null + hitung dampak | ✅ A3/B3 |
| 🆕 `purchase_invoices.akun_tujuan_id` | NOT NULL | blokir **409** | ✅ M5 |
| 🆕 `purchase_invoices.akun_hutang_id` / `.akun_ppn_masukan_id` / `.akun_kas_id` | NULL **tapi diikat CHECK** | blokir **409** — lihat catatan di bawah | ✅ M5 |
| 🆕 `client_accounting_settings.akun_ppn_masukan_id` | NULL | set null | M5 |
| 🆕 `cash_mutations.akun_kas_id` | NOT NULL | blokir **409** | N5 |
| 🆕 `cash_mutations.akun_lawan_id` | NULL | set null + hitung dampak | N5 |
| 🆕 `cash_mutation_imports.akun_kas_id` | NOT NULL | blokir **409** | N5 |
| `marketplace_settlements.akun_*` · `petty_cash_funds.akun_kas_kecil_id` | — | fase berikutnya | §6.B, §6.C |
| ~~`bank_import_rows.akun_lawan_id`~~ · ~~`bank_mapping_rules.akun_id`~~ · ~~`bank_imports.akun_kas_id`~~ | — | ❌ dibatalkan (§3.5) | — |

**Setiap tabel baru yang merujuk `master_coa` menambah satu langkah "perluas replace-plan + test" di fasenya.** Perubahan 2026-09-19 menambah **enam** kolom sekaligus — ini bertambah dari 2 menjadi 8, dan §12 mencatatnya sebagai risiko tersendiri.

#### Catatan: "nullable" TIDAK otomatis berarti "set null" (keputusan Ricko 2026-09-21)

Ketiga kolom akun `purchase_invoices` di atas memang nullable, tapi **CHECK tabelnya
mewajibkan kolom itu terisi menurut cara bayar**: `akun_hutang_id` wajib saat Kredit,
`akun_kas_id` wajib saat Tunai, `akun_ppn_masukan_id` wajib saat PPN > 0. Menulis NULL
ke sana melanggar CHECK-nya, dan karena ganti-massal berjalan dalam satu `db.batch`,
**seluruh batch gagal dengan galat Postgres yang tidak menyebut satu invoice pun** —
akunting melihat "gagal menyimpan" tanpa tahu invoice mana yang harus dibereskan.

Keempat kolom akun invoice karena itu **MEMBLOKIR**, dengan daftar invoice penghalang
yang bisa dibaca di dialog dampak. Alasannya sama dengan `journal_lines`: **invoice
adalah dokumen yang SUDAH TERJADI, dan hutangnya tidak boleh kehilangan akun sandaran.**

`client_accounting_settings.akun_ppn_masukan_id` tetap **set null** dan itu bukan
inkonsistensi: ia pengisi awal formulir, bukan angka yang sudah jadi. Kehilangannya
membuat invoice ber-PPN berikutnya ditolak dengan pesan ke Settings — bukan membuat
angka yang sudah tercatat kehilangan sandaran.

**Aturan yang berlaku untuk perujuk baru sesudah ini** (berlaku juga di N5): yang
menentukan blokir-vs-set-null bukan nullability kolomnya, melainkan dua pertanyaan —
**(1)** apakah ada CHECK/aturan yang membuat NULL tidak sah, dan **(2)** apakah barisnya
mencatat sesuatu yang sudah terjadi (blokir) atau sekadar bawaan untuk pengisian
berikutnya (set null).

---

## 9. Pemetaan task vendor → langkah

### 9.1 Aturan pemetaan (untuk 201 task yang belum terlihat)
1. Baca `feature` di JSON `task next`. Cari bagian plan dengan nama fitur yang sama (§1 kolom "Bagian").
2. Baca `title`. Cocokkan ke sub-fitur PRD (§3.B PRD) → langkah plan yang menyebut sub-fitur itu.
3. `layer: frontend` → langkah UI (A7, B4, C4, E4, F4, G4, H4, I4, J3, K4, L4). `layer: backend` → langkah skema/murni/route (A1–A5, B1–B3, C1–C2, E1–E3, F1–F3, G1–G2, H1–H2, I1–I2, J1–J2, K1–K3, L1–L3).
4. Bila langkahnya **sudah dikerjakan** (karena plan mendahului urutan vendor): verifikasi cepat (test/route/UI ada dan hijau) → `task complete`.
5. Bila judul task **tidak cocok** ke sub-fitur mana pun, atau meminta hal yang §12 nyatakan tidak dikerjakan → **berhenti, tanyakan Ricko.** Jangan mengarang.
6. Judul yang memuat "(mock)"/"data tiruan" dipenuhi oleh UI di atas data nyata (D0).

### 9.2 Katalog lengkap 214 task — `docs/plans/ngodingpakeai-tasks-214.md`

Berkas itu memetakan **setiap** task (15 fitur) ke langkah plan ini, dan untuk 90 task fitur yang sudah ada (F09–F14) menyebut bukti berkasnya beserta status ✅/⚠️/❌. Tabel di bawah hanya 13 task pertama dengan `ref` persis (irisan fase-1 frontend vendor), sebagai contoh bentuk `ref`.
| Task (`ref` setelah `mesin-akuntansi-jurnal-manual/`) | Langkah |
|---|---|
| `master-data-supplier/bangun-halaman-daftar-supplier-per-klien` | B4 |
| `jurnal-umum/bangun-halaman-utama-jurnal-umum-dengan-data-tirua` | A7 |
| `master-data-supplier/buat-form-tambah-dan-sunting-supplier` | B4 |
| `jurnal-umum/buat-daftar-jurnal-per-klien-dan-periode-mock` | A7 |
| `master-data-supplier/tambah-aksi-hapus-supplier-dengan-konfirmasi` | B4 |
| `jurnal-umum/buat-tampilan-detail-jurnal-dan-barisnya-mock` | A7 |
| `jurnal-umum/buat-form-input-jurnal-manual-dengan-baris-debit-k` | A7 |
| `master-data-supplier/buat-pemilih-akun-hutang-default-supplier` | B4 |
| `master-data-supplier/bangun-halaman-rekonsiliasi-hutang-supplier` | **B5 `task fail`** → dikerjakan §5.C |
| `jurnal-umum/validasi-keseimbangan-debit-kredit-di-form-dengan` | A2 + A7 |
| `jurnal-umum/buat-ui-saran-akun-ai-dari-keterangan-transaksi-mo` | A5 + A7 |
| `master-data-supplier/bangun-halaman-impor-dan-ekspor-supplier` | B2 + B3 + B4 |
| `jurnal-umum/tampilkan-jejak-pembuat-di-daftar-dan-detail-jurna` | A4 + A7 |

`ref` task lain mengikuti pola yang sama — `mesin-akuntansi-jurnal-manual/<slug-fitur>/<slug-judul-dipotong-±50-karakter>` — tetapi `task next` selalu mengembalikan `ref` persisnya; **jangan menebak slug**.

---

## 10. Checkpoint — berhenti, lapor, tunggu "lanjut"

> **Nomor CP ≠ urutan eksekusi** (✅ disetujui Ricko 2026-09-20). CP-16–CP-18 lahir 2026-09-19 dan dikerjakan **sebelum** CP-8 dan CP-10–CP-15. Nomornya sengaja tidak disusun ulang: CP-5 dan CP-6 sudah tertulis di komentar kode, pesan commit, dan ROADMAP — menggeser nomornya akan membuat semua rujukan itu menunjuk hal yang berbeda. Urutan sebenarnya ada di kolom "Urutan".

| CP | Setelah | Urutan | Ricko memeriksa |
|---|---|---|---|
| CP-1 | A2 | ✅ | aturan pembukuan + test |
| CP-2 | A3 | ✅ | kebijakan blokir 409 COA; `dryRun` di Settings |
| CP-3 | A7 | ✅ | klik `/jurnal`: buat, ubah, hapus, saran AI, selisih, pembuat, periode |
| CP-4 | B4 | ✅ | tab Supplier: CRUD, pemilih akun hutang, impor `dryRun`, ekspor round-trip |
| CP-5 | C1 | ✅ | predikat posting/balik, saldo berjalan |
| CP-6 | C4 | ⏸ **sekarang** | posting, balik, riwayat, `/buku-besar` |
| CP-7 | E4 | 1 | tipe akun eksplisit vs turunan, isi dari berkas, dampak |
| **CP-16** 🆕 | **M8** | **2** | `/pembelian`: invoice kredit & tunai, PPN, pratinjau jadwal termin, jurnal draf yang terbentuk, ubah & hapus invoice beserta jurnalnya, blokir supplier tanpa akun hutang · **tombol "Koreksi di Pembelian" di `/jurnal`** (D32) · **sakelar "posting bisa diedit" mati secara bawaan** dan lencana "diubah setelah posting" saat dinyalakan (D42) |
| **CP-17** 🆕 | **N6** | **3** | `/mutasi-kas`: impor CSV + pemetaan kolom + peringatan duplikat, tambah manual, alokasi ke beberapa invoice, alokasi sebagian, **penimpaan cicilan manual (D40)**, baris "belum dijurnal" terlihat jelas |
| **CP-18** 🆕 | **U4** | **4** | `/hutang`: umur hutang, daftar cicilan mendekati jatuh tempo, per supplier + detail, **cicilan yang dipaku manual terlihat berbeda dari yang FIFO**, angka cocok dengan `/buku-besar` |
| CP-8 | F4 | 5 | rekonsiliasi hutang supplier (**dirancang ulang** — sisa per supplier vs saldo akun hutang di Neraca) |
| ~~CP-9~~ | ~~G4~~ | ❌ | **dibatalkan** — G1–G5 diserap §5.E, pemeriksaannya pindah ke CP-17 |
| CP-10 | H4 | 6 | marketplace: pratinjau jurnal; **konfirmasi perlakuan pajak (D20)** |
| CP-11 | I4 | 7 | kas kecil: saldo tersedia, isi kembali |
| CP-12 | J3 | 8 | saldo awal |
| CP-13 | K4 | **naik prioritas** | kunci/buka periode; peringatan — **lebih mendesak sejak D42** (posting bisa diedit), lihat kotak §3.4 — **diuji klik agen 2026-10-26** (8/9; skenario akunting lewat test saja) |
| CP-14 | L1 | 9 | **review akuntansi**: aturan tanda, arus kas metode langsung, golden test |
| CP-15 | L4 | 10 | lencana sumber laporan; angka Dashboard/Analytics dari jurnal vs PDF |
| **CP-19** 🆕 | **S0** | §5.G | hasil spike library grid (angka keenam kriteria) → **pilih library (D46)** |
| **CP-20** 🆕 | **S9** | §5.G | uji klik grid: tempel **10.000 baris** dari Excel/Google Sheets/internet banking/sheet template akuntan; **arah ditentukan saldo** (template Debet=masuk vs BCA Debet=keluar) dan **pemilih arah wajib** tanpa saldo; baris dilewati sebagai daftar; sel merah + filter; **saldo putus menahan Simpan**; akun lawan kode/nama; **usulan aturan + Terapkan**; **Pindah Buku** (peringatan & pasangan); **jurnal ringkasan** yang lahir di `/jurnal` + "Koreksi di Mutasi Kas"; duplikat sebagai peringatan; undo; sunting mutasi tersimpan (terposting/beralokasi/periode terkunci terkunci beralasan; jurnal dibalik → terbuka); wizard CSV mengisi grid; form HP; keyboard + pembaca layar |
| **CP-21** 🆕 | **X6** | §5.G | hasil uji banding penyedia (agregat saja) → **pilih penyedia (D54)** |
| **CP-22** 🆕 | **X5 + X7** | §5.G | PDF → grid di produksi dengan satu rekening koran nyata, hanya sesudah gerbang X0 |
| — | sebelum tiap migrasi ke main | selalu | **hanya Ricko** |
| — | ~~sebelum M1~~ | ✅ **lewat** | Seluruh D27–D45 dijawab Ricko 2026-09-20 — §5.D–§5.F boleh dimulai sesudah §5.B |

Ditambah checkpoint vendor (ganti `layer` / naik `phase.current`).

---

## 11. Verifikasi (setiap checkpoint dan akhir tiap fase)

```
npx tsc --noEmit -p tsconfig.json
npx vitest run
node_modules\.bin\eslint .            # 0 error, 24 warning
npm run build
git status --short lib/auth.ts lib/login-rate-limit.ts lib/login-rate-limit-store.ts proxy.ts app/api/account/password/route.ts app/login/page.tsx   # kosong
```
Ditambah: `git diff lib/db/schema.ts` hanya penambahan; test lama tidak diubah kecuali daftar urutan nav/tab/akses; `graphify update .`; `summaries.json` mencakup berkas baru; ROADMAP diperbarui; untuk §7.C: golden test hijau.

---

## 12. Sengaja TIDAK dikerjakan & risiko yang diketahui

**Tidak dikerjakan (jangan ditambahkan diam-diam):**
- **Master barang.** Baris invoice pembelian adalah teks bebas (§5.D). Tidak ada di PRD, dan menambahkannya diam-diam berarti membangun modul inventori setengah jadi.
- **Pemisahan ongkos kirim & diskon** — belum diputuskan Ricko, sementara digabung netto ke nilai barang. Skemanya sudah dirancang agar pemisahan nanti murni-tambah (§8.17).
- **Penyesuaian tanggal per cicilan** — disiapkan tempatnya (D34), tidak dibangun di versi ini.
- ~~**Aturan pemetaan otomatis mutasi bank** (`bank_mapping_rules`) — ditunda~~ → **dihidupkan kembali 2026-10-26 sebagai `cash_mutation_rules` (§5.G S4, D57).**
- ~~**PDF rekening koran** — MVP CSV dulu~~ → **dirancang 2026-10-26 di §5.G Modul B.** Yang tetap TIDAK dikerjakan di §5.G: saldo awal/akhir di cash flow, pencocokan neraca, rekonsiliasi bank (kolomnya disiapkan, fiturnya tidak), posting massal jurnal draf hasil grid, mengatur ulang urutan baris tersimpan, impor berkas `.xlsx` (tempel dari Excel menggantikannya), penyimpanan PDF asli, tabel draf di server.
- **Alokasi pembayaran per cicilan yang dipilih manual** — FIFO (D40), bukan pilihan pengguna.
- Penomoran otomatis `no_bukti` (putuskan setelah pola klien nyata terlihat).
- Buku pembantu piutang / customer (cermin supplier untuk AR) — tidak ada di PRD.
- Multi-mata-uang — seluruh sistem rupiah (P1).
- Regex pada aturan pemetaan bank (D22).
- Baris per-pesanan marketplace — settlement-level saja.
- Persetujuan berjenjang (maker–checker) untuk posting — di luar PRD.
- Membuka halaman pembukuan ke klien read-only (D3/D25 — keputusan terpisah).
- Menyentuh `lib/auth.ts` (D6).
- Agregator kedua — **tidak pernah** (P5).

**Risiko:**

#### Risiko data & rilis — perubahan 2026-09-19

1. **⚠️ `DROP termin_pembayaran` (0019) adalah satu-satunya migrasi yang membuang data di seluruh Phase 5.**
   - **Produksi aman hari ini**: `master_supplier` **belum pernah ada di main** — migrasi 0010–0014 masih menunggu rilis. Kalau 0019 ikut dalam rilis pertama, kolomnya tidak pernah menyimpan apa pun di produksi dan tidak ada yang hilang.
   - **Dev berisiko kecil**: baris supplier di dev mungkin sudah punya termin dari uji klik CP-4. Isinya uji coba, bukan data klien.
   - **Jendela berbahaya**: kalau Ricko merilis 0010–0018 **lebih dulu**, akunting mengisi termin supplier selama beberapa minggu, **lalu** 0019 diterapkan — data itu hilang tanpa jejak. **Catatan rilis: terapkan 0019 dalam jendela rilis yang sama dengan 0015–0018, atau tunda dua-duanya.** Jangan pernah merilis 0017 (yang menghentikan pemakaian kolom) tanpa 0019 di rilis yang sama.
   - Mitigasi bila jendelanya terlanjur terbuka: `SELECT id, nama, termin_pembayaran FROM master_supplier WHERE termin_pembayaran IS NOT NULL` disimpan sebelum 0019 — nilainya masih berguna sebagai **usulan** `jumlah_termin` saat invoice pertama supplier itu dibuat.
2. **Urutan migrasi tidak boleh ditukar.** 0016 (`ADD VALUE` saja) **wajib** sebelum 0017/0018 yang memakai nilainya — P8, preseden 0007. Migrasi gabungan akan gagal setelah sebagian objek terbuat, dan drizzle tidak punya rollback otomatis untuk itu.
3. **`buildReplacePlan` bertambah dari 2 menjadi 8 perujuk `master_coa`** (§8.15). Ini risiko tertinggi kedua setelah aturan tanda: satu kolom perujuk yang lupa didaftarkan membuat **ganti-massal Master COA memutus FK atau memindahkan angka ke akun yang salah** — dan tidak ada test yang otomatis merah. Tiap perluasan wajib membawa test regresi "input lama → keluaran sama persis".
4. **D42 — risikonya SUDAH DIKECILKAN oleh keputusan 2026-09-20 (bawaan `false`), tapi tidak hilang.** Klien yang setelannya tidak disentuh berperilaku persis seperti sekarang: posting permanen. Yang tersisa adalah klien yang setelannya **dinyalakan** — di sana angka yang sudah dilaporkan bisa berubah tanpa galat apa pun. Karena itu: (a) sakelarnya **tidak boleh dikirim tanpa** `nilai_sebelum`/`nilai_sesudah` dan lencana "diubah setelah posting"; (b) **kunci periode (§7.B, CP-13) tetap naik menjadi syarat praktis** sebelum sakelar itu dinyalakan untuk klien mana pun. Dua jebakan yang tersisa, dan dua-duanya dijaga test: **(a)** satu jalur tulis jurnal yang lupa membaca setelan ini akan mengizinkan pengeditan pada klien yang seharusnya permanen — penjaganya test baca-sumber per handler (P15); **(b)** predikat berbentuk `?? true` akan membuat **ketiadaan baris** setelan berarti "boleh diedit" — persis kebalikan dari keputusannya, dan persis keadaan mayoritas klien karena barisnya dibuat lazily. Test tiga-keadaan di M8 yang menjaganya.
5. **Akun di-snapshot ke invoice (D30), dan itu disengaja.** Mengganti `akun_hutang_default_id` supplier **tidak** memindahkan hutang yang sudah tercatat. Kalau akunting mengharapkan sebaliknya, ia akan melihat dua akun hutang terisi dan menganggapnya bug. Perlu dijelaskan di UI Settings supplier.
6. **FIFO (D40) adalah konvensi, bukan fakta — dan sejak 2026-09-20 ia BISA ditimpa manual.** Umur hutang kita bisa berbeda dari rekening koran supplier yang menerapkan urutan lain; itu bukan cacat, justru itulah yang harus terlihat di rekonsiliasi (§5.C). Risiko yang **baru** lahir dari penimpaan manual: **paku yang jadi yatim** saat `jumlah_termin`/`jatuh_tempo_akhir` invoice diubah belakangan. Aturannya sudah ditetapkan (jatuh ke FIFO + ditandai, tidak melempar), tapi kalau implementasinya diam-diam menganggapnya "cicilan terakhir", umur hutang akan bergeser tanpa ada yang tahu. Test paku-yatim di U1 adalah satu-satunya yang menjaganya.
7. **Jadwal termin turunan berubah surut.** Mengubah `jumlah_termin` atau `jatuh_tempo_akhir` pada invoice lama langsung mengubah seluruh jadwal dan umur hutangnya; karena tidak ada yang disimpan, pengingat lama **tidak bisa direproduksi**. Mitigasi: perubahan itu wajib masuk `audit_events` dengan `nilai_sebelum`/`nilai_sesudah` (D42 memberi kolomnya).
8. **Volume `cash_mutations` tumbuh jauh lebih cepat dari `journal_lines`** — satu rekening koran bulanan bisa ratusan baris per akun kas. Indeks `(akun_kas_id, tanggal)` wajib sejak migrasi pertamanya, bukan ditambal belakangan.
9. **P5 (satu agregator) mudah dilanggar di Modul 3.** Sisi "saldo akun hutang di Neraca" pada rekonsiliasi **wajib** lewat `lib/financial-agg.ts`. Menghitungnya sendiri dari `journal_lines` akan terasa lebih mudah dan langsung melahirkan agregator kedua.
10. **Finance melihat `/hutang` tapi tidak `/jurnal`** (D45). Koheren, tapi kalau akunting mengira finance bisa menelusuri angkanya ke buku besar, itu salah paham yang baru ketahuan saat ada pertanyaan. Perlu dinyatakan, bukan diasumsikan.

#### Risiko Grid Mutasi Kas & PDF rekening koran — 2026-10-26 (§5.G, direvisi dengan template akuntan)

1. **Salah baca AI — angka, baris hilang/ganda, halaman terlewat.** Kegagalan termahal adalah yang tidak melempar galat: jurnal tetap seimbang dan bisa diposting. Pengaman berlapis: (a) AI hanya menyusun tabel, kode kita yang mengkanonikkan (X3); (b) **kesinambungan saldo menahan Simpan** (D50); (c) nomor halaman per baris; (d) penanda lilac; (e) tidak pernah tersimpan otomatis. **Sisa:** rekening koran **tanpa kolom saldo** tidak punya pengaman (b) — grid wajib menampilkan "tanpa saldo = tanpa pemeriksa kesinambungan" dan meminta arah eksplisit; halaman hasil scan lebih rawan — ditandai.
2. **⚠️ Arah terbalik — dan importer produksi HARI INI masih rentan.** Template akuntan memakai Debet = masuk, rekening koran bank Debet = keluar; arah yang salah **tidak pernah melempar galat**. Rancangan baru memutuskan arah dari rantai saldo atau pilihan eksplisit (kotak Arah, §5.G). **Tapi impor CSV yang sedang jalan di produksi memetakan judul "Debet" = uang keluar (N3)** — berkas yang diekspor dari sheet template akuntan akan masuk **terbalik seluruhnya**, hanya dijaga peringatan arah di pratinjau (CP-17 #2). Sampai S2 dirilis: **beri tahu akunting** bahwa impor CSV hanya untuk berkas rekening koran bank, bukan sheet template.
3. **Data paling sensitif klien.** Rekening koran memuat nomor rekening, nama lawan transaksi, dan seluruh arus kas. Penjaga: gerbang X0, sakelar per fitur mati di produksi untuk rekening koran, PDF tidak disimpan (D56), draf tidak di `localStorage`, isi baris tidak masuk log/Sentry. **D51 (diubah Ricko 2026-10-26):** cadangan draf di **IndexedDB** menyimpan baris rekening koran di perangkat sampai disimpan atau dibuang — di komputer bersama terbaca pengguna berikutnya; pembersihan saat logout **belum diputuskan**. ~~Risiko D55 (data klien ke Gemini free tier)~~ **ditutup 2026-10-26** — paid tier aktif di Production; dev & Preview free tier hanya untuk data karangan. Gerbang X0 untuk rekening koran tetap berlaku (uji banding penyedia & ketentuan data).
4. **Kinerja 10.000 baris per akun per bulan.** Browser: virtualisasi, baris berkunci stabil, validasi per baris di-memo, rantai saldo O(n) dalam sen, aturan akun lawan O(baris × aturan) dengan `includes` (diukur di S4), duplikat hanya lewat `dryRun`. Server: **65.535 parameter per statement** (INSERT dipecah, tetap satu `db.batch`), body Vercel ±4,5 MB, statement per batch neon-http, `maxDuration`, dan **N+1 tersembunyi** di `syncMutationJournal` (status jurnal per panggilan — wajib dimuat massal). Tanpa D58, 5.000 baris berakun lawan = 5.000 jurnal + 10.000 baris jurnal per Simpan. Angka D52 dari uji beban, bukan tebakan.
5. **Jurnal ringkasan (D58).** Radius kunci melebar: memposting satu jurnal ringkasan mengunci seluruh baris hari itu untuk akun lawan itu. Sunting satu baris membangun ulang jurnal kunci lama dan baru — salah hitung kunci yang tersentuh = jurnal basi yang **tetap seimbang**. Penjaga: test "Σ ringkasan = Σ per baris" dengan permutasi, dan perencana yang membangun dari **seluruh anggota kunci** yang dimuat ulang, bukan dari selisih.
6. **Aturan akun lawan (D57).** Satu pola yang terlalu umum ("transfer") mengusulkan akun yang salah untuk ribuan baris sekaligus. Penjaga: usulan tidak masuk nilai sampai "Terapkan usulan"; uji pola terhadap 30 hari mutasi sebelum disimpan; seri → tanpa usulan; tanpa RegExp (D22, ReDoS).
7. **Pindah Buku (D59).** Dua transfer bernominal sama dalam 3 hari bisa terpasang silang. Penjaga: hanya pasangan **tunggal** yang diusulkan, ganda ditampilkan sebagai kandidat; pasangan tidak disimpan; saldo ≠ 0 di akhir periode adalah peringatan (transfer lintas bulan wajar). **Arus kas (D19):** jurnal kas ↔ Pindah Buku **bukan** jurnal kas ↔ kas, jadi aturan "transfer dilewati" di L1 harus juga melewati lawan = akun Pindah Buku — kalau tidak, transfer internal terhitung sebagai arus kas operasi dua kali.
8. **Menyunting mutasi yang sudah berjurnal.** Jurnal draf dibangun ulang di batch yang sama (P10); terposting & belum dibalik mengunci; ada alokasi → nominal terkunci. **Konkurensi:** `updatedAt` menolak seluruh batch (409) dengan daftar barisnya. Sunting massal = event `updated` per baris — volume `audit_events` naik.
9. **Interaksi dengan Kunci Periode.** D53: K1–K5 sebelum S7. Diperiksa tanggal **lama dan baru**; baris baru bertanggal ≤ kunci ditolak; grid menampilkan alasannya. Buka kunci tetap owner + alasan (K3).
10. **Hapus massal & perubahan perilaku impor.** Satu seleksi bisa menghapus ratusan mutasi (riwayatnya ikut terbuang — keputusan N4); dikecilkan konfirmasi berjumlah, kunci posting, dan D52. Impor CSV tidak lagi menyimpan sebagian (D47) — perlu disampaikan saat rilis.
11. ✅ **DITUTUP 2026-10-26 — mutasi terkunci permanen sesudah jurnalnya dibalik.** `POST /api/journals/[id]/reverse` membuat jurnal pembalik tanpa melepas `cash_mutations.journal_id` dari jurnal asli, dan `syncMutationJournal` menolak **setiap** jurnal ber-status `posted` — padahal pesan galatnya sendiri menyuruh "buat jurnal balik lebih dulu, baru ubah mutasinya". Itu jalan buntu sampai 2026-10-26: kini `nasibJurnalModul` (dulu `jurnalMengunciMutasi`) membuka mutasi yang jurnalnya dibalik (rantai pembalik terposting ganjil) dan menguncinya lagi bila pembaliknya ikut dibalik (genap). **Pembelian berbeda dan lebih berat** — lihat risiko 15.
12. **`is_kas` belum tersetel & `deriveIsKas` buta terhadap OVO/Paypal/Sinarmas (D62).** Di dev, 22 akun "Operating Balance" tidak satu pun ber-`is_kas`, dan turunan nama ("kas"/"bank") tidak mengenali dompet digital. Tanpa aksi S10, tab grid untuk akun itu tidak muncul. Mengubah `deriveIsKas` bukan jalan keluarnya — predikatnya dikunci sama dengan "Kas & Setara Kas" Dashboard.
13. **`react-data-grid` berstatus beta.** Dipin persis, dibungkus satu komponen.
14. **Batas `urutan` (D49).** Baris yang disisipkan belakangan ke hari yang sudah tersimpan diurutkan di akhir hari itu — rantai saldo hari itu bisa terlihat putus sesudah dimuat ulang. Mengatur ulang urutan tidak dibangun.
15. ✅ **DITUTUP 2026-10-26 — Pembelian menulis ulang jurnal TERPOSTING.** Kini `nasibJurnalModul` + `loadNasibJurnalModul` (satu aturan dengan mutasi kas): terkunci → 409; sudah dibalik → draf baru; setelan D42 menyala → diubah di tempat dengan `nilai_*`; hapus tetap ditolak selama jurnalnya terposting & hidup. Temuan aslinya: `PATCH /api/purchase-invoices/[id]` membangun ulang baris jurnal invoice di tempat tanpa memeriksa statusnya, dan DELETE ikut menghapusnya — padahal §5.D mewajibkan penolakan bila jurnalnya `posted` dan "posting bisa diedit" = `false` (D42). `canPost` tidak memeriksa sumber, jadi jurnal pembelian memang bisa diposting dari `/jurnal`. Relevan untuk §5.G karena jurnal ringkasan (D58) memakai pola bangun-ulang yang sama: penjaga statusnya wajib ada di perencana sejak hari pertama.

#### Risiko lama (tetap berlaku)

- **Aturan tanda §7.C** adalah titik terbesar tempat angka bisa "hampir benar". Golden test wajib; review tim akunting di CP-14.
- **`buildReplacePlan` menjadi lebih rumit tiap fase** (§8.15). Setiap tabel perujuk baru tanpa perluasan = jalur destruktif yang diam-diam rusak. Test regresi input-lama-tetap-sama wajib di tiap perluasan.
- **Volume `audit_events`** tumbuh linear; append-only tanpa pembersihan — cukup untuk skala UMKM, catat untuk ditinjau bila > ratusan ribu baris.
- **Kuota Gemini free-tier** untuk saran akun — tombol eksplisit, bukan otomatis; pertimbangkan cache saran per (klien, keterangan-ternormalisasi) bila kuota terasa (di luar cakupan sekarang).
- **`docs/deferred/0006_timestamptz.sql`** tetap wajib sebelum ganti driver; tabel baru sudah tz (D24) jadi utangnya tidak bertambah.
