# Master Plan — Mesin Akuntansi & Jurnal Manual (Fase 1–4, seluruh cakupan)

| | |
|---|---|
| Plan NgodingPakeAI | `e2cbb3a7-5976-43dd-937a-5bec14f6c35c` — "Mesin Akuntansi & Jurnal Manual" |
| Workspace | `a3bbf493-5431-4bef-8065-e48c37e9a752` |
| Disusun | 2026-09-15, dari PRD server (seluruh fase) + 13 task fase-1 yang terlihat + pembacaan penuh basis kode (247 ringkasan) |
| Status | **D1–D10 DISETUJUI Ricko 2026-09-15; R4 dijawab Ricko 2026-09-15 (finance lihat saja).** D11–D26 (fase 2–4) dan R1–R3, R5–R11 menunggu konfirmasi — lihat §3.2/§3.3. Belum ada satu baris kode pun ditulis. |
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

| PRD Fase | Fitur | Prioritas | Bergantung pada | Bagian | Migrasi |
|---|---|---|---|---|---|
| 1 | Jurnal Umum | high | — | §4.A | 0010 |
| 1 (vendor) / 2 (PRD) | Master Data Supplier (tanpa rekonsiliasi) | medium | — | §4.B | 0011 |
| 2 | Buku Besar & Posting | high | Jurnal Umum | §5.A | 0012 |
| 2 | Master COA Bertipe | high | — (memperkaya derivasi D1) | §5.B | 0013 |
| 2 | Rekonsiliasi Hutang Supplier | medium | Posting + Supplier | §5.C | 0012 |
| 3 | Impor Mutasi Kas/Bank | medium | Jurnal Umum, COA Bertipe (`is_kas`) | §6.A | 0014 |
| 3 | Transaksi Marketplace | medium | Jurnal Umum | §6.B | 0015 |
| 3 | Kas Kecil | low | Jurnal Umum, Posting | §6.C | 0016 |
| 4 | Saldo Awal & Kunci Periode | medium | Posting | §7.A, §7.B | 0017 |
| 4 | Laporan dari Jurnal | high | Posting, COA Bertipe, Saldo Awal | §7.C | — |

Urutan eksekusi yang disarankan: **§4.A → §4.B → §5.A → §5.B → §5.C → §7.B (kunci periode lebih awal dari PRD, karena murah dan melindungi data sejak posting pertama) → §6.A → §6.B → §6.C → §7.A → §7.C.** Alasan menggeser kunci periode: begitu posting hidup di produksi, jurnal terposting tanpa kunci periode bisa "bertambah" ke bulan yang sudah dilaporkan. Ricko boleh menolak pergeseran ini (D26).

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
| P10 | Setiap mutasi jurnal = **satu `db.batch`** (atomik di neon-http) **+ satu baris `journal_events`** (mulai Fase 2) | `app/api/contracts/route.ts` POST |
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
| D12 | Riwayat perubahan = tabel **`journal_events`** append-only (`created`, `updated`, `posted`, `reversed`, `unlocked`, …) | Satu tabel untuk "kapan & oleh siapa" semua fase termasuk buka-kunci Fase 4. `event` bertipe **text** + daftar konstanta di lib (daftarnya tumbuh per fase; enum butuh migrasi tiap kali — pola `currency_format`). |
| D13 | Jurnal balik = **entri baru** dengan `reversal_of_id` → jurnal asli; baris D/K ditukar; dibuat sebagai `draft` lalu diposting lewat jalur posting biasa; jurnal asli **tetap `posted`**; "sudah dibalik" **diturunkan** (ada pembalik yang `posted`) | P3. Satu jalur posting; tidak ada nilai enum `reversed`. Jurnal yang sudah dibalik tak bisa dibalik lagi (predikat murni). |
| D14 | **Master COA Bertipe = SATU kolom baru `tipe_akun`** (enum `account_type`: `asset`,`liability`,`equity`,`revenue`,`expense`, **nullable**) **+ `is_kas boolean`**. **`posisi` sudah = normal balance; `class_cf` sudah = klasifikasi arus kas — JANGAN duplikasi kolom.** Resolusi: eksplisit `??` turunan (`classifyBs`/`classifyPnl`) | PRD menyiratkan tiga kolom baru; dua di antaranya sudah ada di skema sejak awal. `is_kas` dibutuhkan arus kas dari jurnal (§7.C) dan impor bank (§6.A). |
| D15 | `journal_lines.supplier_id` **nullable** → `master_supplier` (ON DELETE **restrict**), diisi pada baris akun hutang; DELETE supplier menolak 409 bila dirujuk | Satu-satunya cara rekonsiliasi per supplier tanpa buku pembantu terpisah. |
| D16 | **Saldo awal = jurnal** ber-`sumber='opening_balance'`, tanggal = sehari sebelum periode pertama, satu baris per akun, wajib seimbang lewat `validateJournalInput` yang sama | Tidak ada tabel baru; buku besar & laporan otomatis memperhitungkannya. |
| D17 | Kunci periode = tabel `period_locks` per klien (`terkunci_sampai date`); predikat murni `isDateLocked`; **kunci = `canDoAccounting`, buka = `requireOwner` + alasan wajib → `journal_events`** | PRD: "buka kunci terbatas oleh peran tertentu dengan catatan alasan". |
| D18 | Sumber laporan diputuskan **server** per (klien, periode): ada jurnal `posted` di periode → dari jurnal, else PDF; respons membawa `source`; UI menampilkan lencana | Jalur PDF **tidak disentuh** (regresi). |
| D19 | Arus kas dari jurnal = **metode langsung**: mutasi akun `is_kas`, diklasifikasi dari `class_cf` akun lawan; transfer antar akun kas dinetralkan | **Butuh review tim akunting Ricko** sebelum dipakai untuk klien nyata. |
| D20 | Marketplace: perlakuan `pajak` (beban vs pajak dibayar dimuka) dan `fee` (beban) = **keputusan akuntansi Ricko**; plan menyediakan akun yang dipilih pengguna per settlement, bukan aturan tetap | Ini kebijakan pembukuan, bukan teknis. |
| D21 | Kas kecil = **sistem imprest** (dana tetap): pengeluaran dicatat di buku pembantu, jurnal lahir saat **pengisian kembali** (D: akun beban…, K: bank) | Praktik baku UMKM; jurnal per pengeluaran kecil membanjiri buku besar. |
| D22 | Impor bank: parser alias header (pola `coa-import`) + **pemetaan kolom manual** bila deteksi gagal; aturan pemetaan hanya `contains`/`startsWith` (**bukan regex** — ReDoS dari input pengguna); dedupe via fingerprint `tanggal|nominal|keterangan-ternormalisasi` per akun kas | Format mutasi bank sangat beragam. |
| D23 | `journal_source` bertambah per fase lewat `ADD VALUE` tulis tangan: `import_bank` (0014), `marketplace` (0015), `kas_kecil` (0016), `opening_balance` (0017) | P8. |
| D24 | Semua kolom timestamp di **tabel baru** memakai `withTimezone: true`; tabel lama tidak disentuh (tetap urusan `docs/deferred/0006_timestamptz.sql`) | Mengurangi utang timestamptz alih-alih menambahnya. Drizzle menormalkan keduanya; test `login-rate-limit` sudah mengunci kedua bentuk. |
| D25 | Halaman baru & aksesnya: `/buku-besar` (staf), `/impor-bank` (staf), `/marketplace` (staf), `/kas-kecil` (staf); saldo awal & kunci periode sebagai **tab Settings** ("Pembukuan"); Laporan-dari-jurnal tidak menambah halaman (lencana di Dashboard/Analytics) | Konsisten D3/D7. |
| D26 | Menggeser Kunci Periode (§7.B) ke **sebelum Fase 3** | Lihat §1. |

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
- **0012_posting_events_supplier_link**: `journal_entries` + `posted_at timestamptz NULL`, `posted_by uuid NULL → users restrict`, `reversal_of_id uuid NULL → journal_entries restrict`; tabel `journal_events` (§8.5); `journal_lines` + `supplier_id uuid NULL → master_supplier restrict` + index. Semua `ADD COLUMN` nullable / `CREATE` → non-destruktif.
- **0013_coa_account_type**: `CREATE TYPE account_type`; `master_coa` + `tipe_akun account_type NULL`, `is_kas boolean NOT NULL DEFAULT false`. Non-destruktif.

### 5.A Buku Besar & Posting

**C1 — `lib/journal.ts` (perluasan) + `lib/ledger.ts` + test  ⏸ CP-5.**
- `lib/journal.ts` tambah: `canPost(entry, { isLocked }) → { ok } | { ok:false, reason }` (harus `draft`; baris seimbang; `!isLocked(tanggal)` — Fase 2 mengoper `() => false`); `canReverse(entry, existingReversal)` (harus `posted`; belum ada pembalik `posted`); `buildReversalLines(lines)` (tukar D/K, pertahankan akun & keterangan, `line_order` sama); `JOURNAL_EVENTS = ['created','updated','deleted','posted','reversal_created', …] as const` (text di DB, D12).
- `lib/ledger.ts` (murni): `normalSign(posisi) → +1|-1`; `computeRunningBalance({ lines, posisi, openingLines }) → { opening, rows: [{ …line, saldo }], closing }` — urut `(tanggal, no_bukti, line_order)`, saldo dalam **sen bulat** berarah normal balance (Debit-normal: `D−K` menambah; Kredit-normal: `K−D`); `summarizeByAccount(lines, accounts)` untuk daftar saldo semua akun (neraca saldo ringkas).
- Test: posting draf lolos, posted ditolak, terkunci ditolak; reversal dua kali ditolak; `buildReversalLines` menukar; saldo berjalan Debit vs Kredit-normal; opening dari baris sebelum periode; urutan stabil.

**C2 — Route posting, balik, riwayat, buku besar.**
- `POST /api/journals/[id]/post` — `requireAkunting`; ambil header+lines; `canPost` (isLocked stub Fase 2 → §7.B menggantinya); batch: update `status='posted', posted_at=now(), posted_by`; insert `journal_events{event:'posted'}`. 409 bila gagal predikat dengan `reason`.
- `POST /api/journals/[id]/reverse` body `{ tanggal, noBukti, keterangan? }` — `requireAkunting`; ambil asli; `canReverse` (cek pembalik existing: `select … where reversal_of_id = id and status='posted'`); buat entri **draft** baru `sumber='manual'`, `reversal_of_id=id`, baris dari `buildReversalLines`; batch + event `reversal_created` pada asli **dan** `created` pada baru. Default `noBukti` disarankan UI: `REV-<asli>`.
- `GET /api/journals/[id]` (perluasan) — tambah `events[]` (join users.name) dan `reversedBy: { id, noBukti } | null`, `reversalOf: {…} | null`.
- **Semua mutasi jurnal Fase 1** (POST/PATCH/DELETE) kini juga menulis `journal_events` (P10) — perbarui A4.
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

### 5.C Rekonsiliasi Hutang Supplier (D15)

**F1 — `supplier_id` di `journal_lines`** (migrasi 0012). `validateJournalInput` menerima `supplierId?` per baris; route POST/PATCH memverifikasi supplier milik klien; **hanya boleh pada baris yang akunnya `isHutangAccount`** (murni, test). DELETE supplier → 409 bila dirujuk (`isFkViolation` pun sebagai jaring).
**F2 — `lib/supplier-reconciliation.ts` + test.** `reconcileSuppliers({ lines(posted, akun hutang, ≤ periodEnd), suppliers, neracaHutangUsaha }) → { perSupplier: [{ supplier, saldo }], totalSupplier, totalNeraca, selisih, tanpaSupplier }` — sen bulat; saldo supplier = `K − D` baris ber-`supplier_id`; `tanpaSupplier` = baris hutang tanpa supplier (penjelas selisih).
**F3 — Route** `GET /api/clients/[id]/suppliers/reconciliation?periodEnd` — `requireUser`+`canAccessClientData`; `totalNeraca` dari **sumber laporan yang berlaku** (Fase 2: `aggregateBalanceSheet` atas PDF terbaru ≤ periodEnd; setelah §7.C: lewat `resolveReportSource`).
**F4 — UI  ⏸ CP-8.** Tab Supplier: bagian "Rekonsiliasi" (tanggal acuan; tabel per supplier; total; selisih berwarna; daftar baris tanpa supplier sebagai penjelas). Form jurnal: pemilih supplier muncul pada baris yang akunnya hutang. Task vendor: `…/bangun-halaman-rekonsiliasi-hutang-supplier` — **buka kembali** dari `failed` bila perlu (`task reset` **hanya atas perintah Ricko**), lalu selesaikan.
**F5 — ROADMAP + sync.**

---

## 6. Fase 3 — Impor Mutasi Kas/Bank · Marketplace · Kas Kecil

Prasyarat: §5 selesai; §7.B (kunci periode) disarankan sudah ada (D26).

### 6.A Impor Mutasi Kas/Bank (D22, D23)

**Migrasi 0014**: `bank_imports`, `bank_import_rows`, `bank_mapping_rules` (§8.6–8.8); `ALTER TYPE journal_source ADD VALUE 'import_bank'` (tulis tangan, boleh di berkas yang sama — DDL tabel tidak memakai nilainya).

**G1 — Murni + test.** `lib/bank-import/parse.ts`: `parseBankStatement(buffer, { columnMap? })` xlsx/CSV (papaparse) → `{ rows: [{ tanggal, keterangan, debit, kredit, saldo? }], errors, warnings, detectedColumns }`; `HEADER_ALIASES` (tanggal/date/tgl; keterangan/description/uraian/remark; debit/keluar/withdrawal/DB; kredit/masuk/deposit/CR; saldo/balance); tanggal dinormalkan ke YMD dari beberapa format umum (dd/mm/yyyy, yyyy-mm-dd, dd-MMM-yy) **tanpa `new Date` untuk output**; bila deteksi kolom gagal → `errors` + `detectedColumns` untuk UI pemetaan manual. `lib/bank-import/fingerprint.ts`: `fingerprint(row)` = hash stabil `tanggal|nominal-sen|keterangan-ternormalisasi` (reuse `normalizeName`). `lib/bank-import/rules.ts`: `applyRules(rows, rules)` — `contains`/`startsWith` case-insensitive, prioritas naik, aturan pertama yang cocok menang. `lib/bank-import/to-journal.ts`: `rowToJournalInput(row, { akunKasId, akunLawanId, noBuktiPrefix }) → JournalInput` (dua baris; arah dari debit/kredit mutasi: uang masuk → D kas / K lawan; keluar → D lawan / K kas) → divalidasi `validateJournalInput` yang sama.
**G2 — Route.** `POST /api/bank-imports` multipart `{ clientId, akunKasId, file, columnMap? }` → `requireAkunting`; akun `resolveIsKas` wajib true; parse; fingerprint; tandai `isDuplicate` (fingerprint pernah ada pada impor lain akun kas yang sama); `applyRules`; simpan header + rows (status `unmapped`/`mapped`/`duplicate`). `GET /api/bank-imports?clientId`, `GET /api/bank-imports/[id]` (rows). `PATCH /api/bank-imports/[id]/rows/[rowId]` `{ akunLawanId?, status? (skip) }`. `POST /api/bank-imports/[id]/journalize` `{ rowIds }` → tiap baris `mapped` → draf jurnal `sumber='import_bank'` (batch per 50), `row.journal_id` diisi, status `journaled`. `GET/POST/PATCH/DELETE /api/bank-mapping-rules?clientId` (`requireAkunting` tulis).
**G3 — Nav/akses.** `'impor-bank'` setelah `'buku-besar'`, staf.
**G4 — UI `/impor-bank`  ⏸ CP-9.** Langkah: pilih akun kas (`StyledSelect` disaring `isKas`) → unggah → bila deteksi gagal: pemetaan kolom manual (dropdown per kolom) → layar peninjauan: tabel baris dengan pemilih akun lawan inline (`StyledSelect`), lencana **Duplikat** (aturan: tampil, tidak dipilih default), filter status, aksi "Terapkan aturan" & "Simpan sebagai aturan" dari satu baris → tombol **Jadikan Jurnal** untuk baris terpilih → tautan ke `/jurnal`. Tab kecil "Aturan Pemetaan" (CRUD). Task vendor: fitur "Impor Mutasi Kas/Bank" (Unggah Berkas, Aturan Pemetaan, Peninjauan Baris, Jadikan Jurnal, Deteksi Duplikat).
**G5 — ROADMAP + sync.**

### 6.B Transaksi Marketplace (D20, D23)

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

**Migrasi**: `ADD VALUE 'opening_balance'` (bagian dari 0017).
**J1 — `lib/journal.ts` (perluasan) + test.** `buildOpeningBalanceInput({ tanggal, rows: [{ masterCoaId, saldo, posisi }] }) → JournalInput`: tiap akun → satu baris pada sisi normal-nya (Debit-normal → D, Kredit-normal → K); kontra (saldo negatif) → sisi berlawanan; `no_bukti = 'SALDO-AWAL-<tahun>'`, `keterangan` baku; hasil **wajib** lolos `validateJournalInput` — bila tak seimbang, kembalikan `selisih` untuk ditampilkan (jangan menyeimbangkan diam-diam). Hanya boleh **satu** jurnal `opening_balance` per klien (predikat murni + unique parsial via cek route).
**J2 — Route** `POST /api/journals/opening-balance { clientId, tanggal, rows }` → `requireAkunting`; tolak bila sudah ada; simpan sebagai **draft** (diposting lewat jalur biasa, supaya masuk kunci periode & events). `GET /api/journals/opening-balance?clientId`.
**J3 — UI: tab Settings "Pembukuan" (D25)  ⏸ CP-12.** `SettingsTabId` += `'pembukuan'` (staf saja) + test; bagian **Saldo Awal**: tanggal, tabel semua akun Master COA (kode, nama, posisi, input saldo), total D/K hidup + selisih (reuse panel dari form jurnal), Simpan → membuat draf → tautan "Posting di /jurnal". Task vendor: "Input Saldo Awal", "Validasi Saldo Awal".

### 7.B Kunci Periode (D17) — **disarankan dieksekusi setelah §5.A (D26)**

**Migrasi 0017**: `period_locks` (§8.12) (+ `ADD VALUE 'opening_balance'` bila §7.A dikerjakan bersamaan; kalau §7.B maju, pisahkan ke migrasi sendiri).
**K1 — `lib/period-lock.ts` + test.** `isDateLocked(tanggal, locks)` (string YMD ≤ `terkunciSampai` aktif → true); `validateLockInput`; `latestLock(locks)`; `canUnlock(role) = isOwner(role)`.
**K2 — Integrasi (perbarui langkah lama).** `canPost` di §5.A menerima `isLocked` nyata; `POST/PATCH/DELETE /api/journals` dan `reverse`, `journalize` (bank/marketplace/kas kecil), `opening-balance` semuanya menolak **409 `{ error, lockedUntil }`** bila `isDateLocked(tanggal)`. Test baca-sumber: setiap route penulis jurnal memanggil `isDateLocked`.
**K3 — Route** `GET /api/period-locks?clientId`; `POST` `{ clientId, terkunciSampai }` `requireAkunting` → insert + `journal_events{event:'period_locked'}` (journal_id null → kolom nullable, §8.5); `DELETE /api/period-locks/[id]` body `{ alasan }` **`requireOwner`**, alasan wajib ≥ 10 karakter → hapus + event `period_unlocked` dengan `catatan=alasan`.
**K4 — UI  ⏸ CP-13.** Tab "Pembukuan" bagian **Kunci Periode**: status "Terkunci sampai …", tombol Kunci (pilih tanggal ≥ kunci sebelumnya), tombol Buka (owner saja; modal alasan wajib); **peringatan** di form jurnal, tombol Posting, dan halaman impor/marketplace/kas kecil bila tanggal ≤ kunci (UI membaca `GET /api/period-locks`; server tetap menegakkan). Task vendor: "Kunci Periode", "Buka Kunci Terbatas", "Peringatan Periode Terkunci".
**K5 — ROADMAP + sync.**

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
- **Golden test:** ambil fixture `seed-dev` (line item hasil "ekstraksi") klien seed, susun jurnal yang ekuivalen, jalankan `aggregatePnl`/`aggregateBalanceSheet` pada keduanya → **identik**. Ini bukti "Konsistensi Format".

**L2 — `lib/reports/source.ts` + test.** `resolveReportSource({ postedCountInPeriod, hasPdfReport }) → 'journal' | 'pdf' | 'none'` (jurnal menang bila ada ≥1 terposting di periode; else PDF; else none). Murni.
**L3 — Route.** `app/api/dashboard/[clientId]`, `analytics/[clientId]/ratios`, `analytics/[clientId]/neraca-detail`: sebelum membaca `financial_reports`, panggil `resolveReportSource` per periode yang diminta; bila `journal` → `AggLine[]` dari L1 (dan `CompareLine[]` untuk neraca-detail), **jalur PDF yang ada tidak diubah**; respons + `source` (dan per-bulan bila campuran). `GET /api/reports/list` tidak berubah. Test baca-sumber: ketiga route memanggil `resolveReportSource`; tidak ada agregator baru (`grep` memastikan hanya `financial-agg` yang diimpor untuk agregasi).
**L4 — UI  ⏸ CP-15.** Lencana "Dari jurnal" / "Dari PDF" di header Dashboard & Analytics (tone `info`), tooltip menjelaskan aturan D18; bila campuran per bulan, lencana per titik data. Task vendor: "Pilih Sumber Laporan", "Laba Rugi", "Neraca", "Arus Kas", "Konsistensi Format".
**L5 — ROADMAP + sync.**

---

## 8. Skema kumulatif (semua fase)

Konvensi umum: uuid PK `defaultRandom()`; `client_id → clients.id cascade`; uang `numeric(18,2)`; tanggal `date`; **tabel baru: `timestamp(..., { withTimezone: true })`** (D24); `created_at`/`updated_at` `defaultNow()`.

### 8.1 Enum
| Enum | Nilai awal | Tambahan per fase (ADD VALUE tulis tangan) |
|---|---|---|
| `journal_status` | `draft`, `posted` | — |
| `journal_source` | `manual` | `import_bank` (0014), `marketplace` (0015), `kas_kecil` (0016), `opening_balance` (0017) |
| `account_type` | `asset`, `liability`, `equity`, `revenue`, `expense` | — (0013) |

### 8.2 `journal_entries` (0010; kolom Fase 2 di 0012)
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

### 8.3 `journal_lines` (0010; `supplier_id` di 0012)
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

### 8.4 `master_supplier` (0011)
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| client_id | uuid NN → clients cascade | |
| nama | text NN | **unique(client_id, nama)** |
| kontak | text NULL | |
| npwp | text NULL | |
| termin_pembayaran | integer NULL | hari 0–365 |
| akun_hutang_default_id | uuid NULL → master_coa **set null** | disambung ulang by kode (D4) |
| created_at, updated_at | timestamptz | |

### 8.5 `journal_events` (0012)
| Kolom | Tipe | Catatan |
|---|---|---|
| id | uuid PK | |
| client_id | uuid NN → clients cascade | |
| journal_id | uuid NULL → journal_entries cascade | NULL untuk event periode (kunci/buka) |
| event | text NN | daftar di `lib/journal.ts` `JOURNAL_EVENTS`; text bukan enum (D12) |
| user_id | uuid NULL → users set null | |
| catatan | text NULL | alasan buka kunci, dll |
| at | timestamptz NN default now | |
Indeks: `(journal_id, at)`, `(client_id, at)`. **Append-only** — tidak ada UPDATE/DELETE.

### 8.6 `bank_imports` (0014)
id · client_id · akun_kas_id → master_coa restrict · nama_berkas text · jumlah_baris int · diimpor_oleh → users restrict · created_at. Indeks `(client_id, created_at)`.

### 8.7 `bank_import_rows` (0014)
id · import_id → bank_imports cascade · tanggal date · keterangan text · debit numeric · kredit numeric · saldo numeric NULL · fingerprint text NN · is_duplicate boolean NN · akun_lawan_id → master_coa set null · status text NN (`unmapped`/`mapped`/`skipped`/`journaled`/`duplicate`) · journal_id → journal_entries set null · line_order int. Indeks `(import_id)`, `(fingerprint)`.

### 8.8 `bank_mapping_rules` (0014)
id · client_id cascade · pola text NN · tipe_cocok text NN (`contains`/`startsWith`) · akun_id → master_coa restrict · prioritas int NN default 100 · aktif boolean NN default true · created_at. Indeks `(client_id, prioritas)`.

### 8.9 `marketplace_settlements` (0015)
id · client_id cascade · platform text NN · periode_mulai date · periode_akhir date · bruto, fee, pajak, net numeric NN · akun_penjualan_id, akun_fee_id, akun_pajak_id, akun_kas_id → master_coa restrict · journal_id → journal_entries set null · catatan text NULL · created_by → users restrict · created_at, updated_at. Indeks `(client_id, periode_mulai)`.

### 8.10 `petty_cash_funds` (0016)
id · client_id cascade · nama text NN · akun_kas_kecil_id → master_coa restrict · dana_tetap numeric NN · aktif boolean default true · created_at, updated_at. `unique(client_id, nama)`.

### 8.11 `petty_cash_expenses` (0016)
id · fund_id → petty_cash_funds cascade · tanggal date · keterangan text NN · nominal numeric NN · akun_beban_id → master_coa restrict · bukti text NULL · journal_id → journal_entries set null (diisi saat pengisian kembali) · created_by → users restrict · created_at. Indeks `(fund_id, tanggal)`, `(journal_id)`.

### 8.12 `period_locks` (0017)
id · client_id cascade · terkunci_sampai date NN · dikunci_oleh → users restrict · created_at. Indeks `(client_id, terkunci_sampai)`. Membuka = menghapus baris + event (riwayat ada di `journal_events`).

### 8.13 `master_coa` (perubahan 0013)
`+ tipe_akun account_type NULL` · `+ is_kas boolean NN default false`. **Tidak ada** kolom normal balance / arus kas baru (D14).

### 8.14 Urutan migrasi
0010 journals → 0011 supplier → 0012 posting/events/supplier_link → 0013 coa_account_type → **(0017a period_locks bila D26 diterima, dipisah dari 0017)** → 0014 bank_import → 0015 marketplace → 0016 petty_cash → 0017 opening_balance value. Nomor berkas mengikuti urutan **penerapan nyata**; sesuaikan angka saat `db:generate`.

### 8.15 Perujuk `master_coa` yang WAJIB disambung ulang oleh `buildReplacePlan` (P14)
`report_line_items` (ada) · `coa_mapping_history` (ada) · `journal_lines` (A3) · `master_supplier.akun_hutang_default_id` (A3) · `bank_import_rows.akun_lawan_id` (G-fase) · `bank_mapping_rules.akun_id` · `marketplace_settlements.akun_*` · `petty_cash_funds.akun_kas_kecil_id` · `petty_cash_expenses.akun_beban_id` · `bank_imports.akun_kas_id`. **Setiap tabel baru yang merujuk `master_coa` menambah satu langkah "perluas replace-plan + test" di fasenya.** Kebijakan: rujukan yang **NOT NULL** → blokir 409 bila kode hilang; rujukan **NULL-able** → set null + hitung di dampak.

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

| CP | Setelah | Ricko memeriksa |
|---|---|---|
| CP-1 | A2 | aturan pembukuan + test |
| CP-2 | A3 | kebijakan blokir 409 COA; `dryRun` di Settings |
| CP-3 | A7 | klik `/jurnal`: buat, ubah, hapus, saran AI, selisih, pembuat, periode |
| CP-4 | B4 | tab Supplier: CRUD, pemilih akun hutang, impor `dryRun`, ekspor round-trip |
| CP-5 | C1 | predikat posting/balik, saldo berjalan |
| CP-6 | C4 | posting, balik, riwayat, `/buku-besar` |
| CP-7 | E4 | tipe akun eksplisit vs turunan, isi dari berkas, dampak |
| CP-8 | F4 | rekonsiliasi supplier |
| CP-9 | G4 | impor bank: deteksi kolom, duplikat, aturan, jadikan jurnal |
| CP-10 | H4 | marketplace: pratinjau jurnal; **konfirmasi perlakuan pajak (D20)** |
| CP-11 | I4 | kas kecil: saldo tersedia, isi kembali |
| CP-12 | J3 | saldo awal |
| CP-13 | K4 | kunci/buka periode; peringatan |
| CP-14 | L1 | **review akuntansi**: aturan tanda, arus kas metode langsung, golden test |
| CP-15 | L4 | lencana sumber laporan; angka Dashboard/Analytics dari jurnal vs PDF |
| — | sebelum tiap migrasi ke main | **hanya Ricko** |

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
- **Aturan tanda §7.C** adalah titik terbesar tempat angka bisa "hampir benar". Golden test wajib; review tim akunting di CP-14.
- **`buildReplacePlan` menjadi lebih rumit tiap fase** (§8.15). Setiap tabel perujuk baru tanpa perluasan = jalur destruktif yang diam-diam rusak. Test regresi input-lama-tetap-sama wajib di tiap perluasan.
- **Volume `journal_events`** tumbuh linear; append-only tanpa pembersihan — cukup untuk skala UMKM, catat untuk ditinjau bila > ratusan ribu baris.
- **Kuota Gemini free-tier** untuk saran akun — tombol eksplisit, bukan otomatis; pertimbangkan cache saran per (klien, keterangan-ternormalisasi) bila kuota terasa (di luar cakupan sekarang).
- **`docs/deferred/0006_timestamptz.sql`** tetap wajib sebelum ganti driver; tabel baru sudah tz (D24) jadi utangnya tidak bertambah.
