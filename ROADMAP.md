# NgitungID BI — Development Roadmap

**Last Updated:** 2026-07-13
**Current Phase:** Phase 1 ✅ · Phase 2 Backend ✅ (2.1–2.6; `/compare` = Compare Neraca ✅ 2026-07-13, compare P&L belum diminta) · Phase 3.1 ✅ — Phase 3.2 & Phase 4 belum dimulai (sengaja, menunggu validasi manual loop inti)
**Stack:** Next.js App Router · TypeScript · Tailwind CSS v4 · shadcn/ui · PostgreSQL (Neon) · Drizzle ORM · Gemini API

---

## Legend
- ✅ Completed
- 🔄 In Progress
- ⏳ Pending
- 🔒 Blocked (depends on another task)

---

## Phase 1 — Frontend Foundation

### 1.1 Design System Setup
- ✅ Install and configure Tailwind CSS v4
- ✅ Define CSS design tokens in globals.css (@theme inline)
- ✅ Set 16 brand color variables (--color-bg-main, --color-accent-primary, etc.)
- ✅ Configure animation utilities (fadeInUp, shimmer, animation-delay-*)
- ✅ Establish typography scale and component patterns

### 1.2 Upload Page (Page 1)
- ✅ Sidebar component — dark, floating, active state with lime accent
- ✅ Header component — step indicator (Upload → Review → Mapping)
- ✅ UploadForm component — drag & drop zone, file type validation stub
- ✅ FileHistory component — upload history with status badges
- ✅ StatusSection component — progress bar with shimmer, task checklist
- ✅ Layout integration — 3-column grid, page composition
- ✅ MVP upload stubs — handleCSVUpload, handleExcelUpload, handlePDFUpload
- ✅ File input wiring — hidden input, Browse File button, drag-and-drop
- ✅ Selected file display — filename, size, remove button
- ✅ Layout polish — full-height sidebar, rounded card shell, design alignment
- ✅ Visual layer effect — black canvas bg, white floating main card, sidebar merges with bg
- ✅ Sidebar navigation — Dashboard, Analytics, Upload, COA Mapping, Operational (soon), Settings
- ✅ Upload Session UI — client selector (admin), periode date range, 3 independent file upload cards (PnL, Neraca, Cash Flow), session summary bar, process button with disabled state
- ✅ Date range picker — custom calendar (zero react-day-picker dependency), dark theme, lilac accents, two months side by side
- ✅ Sidebar workspace sync — workspace section updates when admin switches client
- ✅ Collapsible sidebar — toggle button, icon-only collapsed state, hover tooltips, localStorage persistence
- ✅ Global client context — ClientProvider wraps app, persists active client in localStorage
- ✅ Client switcher moved to Sidebar workspace card — single source of truth across all pages
- ✅ Admin Overview page — shown when admin has no active client, lists all clients with upload status
- ✅ useRequireClient hook — auto-redirects to Admin Overview when no client is active
- ✅ Responsive layout — mobile drawer sidebar, tablet grid breakpoints, 2K/ultrawide max-width fix, chart responsive heights, date picker mobile single-month view
- ⏳ Real upload flow — connect stubs to API routes

### 1.3 Extraction Review Page (Page 2)
- ✅ Split-screen layout — PDF viewer left 40%, extracted table right 60%
- ✅ Report type tabs — PnL, Neraca, Cash Flow switcher in PDF panel
- ✅ Mock PDF content — styled replica of Rasyuka PnL layout
- ✅ Extracted line items table — raw name, suggested COA, amount, confidence score
- ✅ Confidence color coding — high (green 90%+), medium (amber 70-89%), low (red <70%)
- ✅ Line item actions — edit COA inline, reject row, undo reject
- ✅ Filter controls — All, Perlu Review, Matched tabs
- ✅ Subtotal toggle — show/hide subtotal rows
- ✅ Confirm all button — bulk accept all lines
- ✅ Session summary bar — matched count, unmatched count, rejected count
- ✅ Bottom navigation — back to upload, proceed to COA mapping
- ✅ UI Polish 2026-07-02 — hover CSS class (ganti inline JS), touch target 32px+ untuk action buttons, aria-label per baris, entrance animation kedua panel, console.log dev-only dihapus

### 1.4 COA Mapping Page (Page 3)
- ✅ Session context bar — client, periode, report type, progress bar
- ✅ Unmapped COA cards — raw name, confidence badge, amount, card state (amber/lilac/lime)
- ✅ AI suggestion hint — lilac badge with suggested Master COA per item
- ✅ Searchable Master COA dropdown — grouped by category, kode + name display
- ✅ Card state transitions — dashed amber → dashed lilac (AI suggest) → solid lime (mapped)
- ✅ Auto-matched collapsible table — 21 items, confidence colors, read-only
- ✅ Sticky action bar — progress message, save button (disabled until all mapped)
- ✅ Save handler stub — TODO comment, POST to /api/reports/[id]/mapping (console.log dev-only dihapus)
- ✅ UI Polish 2026-07-02 — hover CSS class (ganti inline JS), touch target 32px+, focus-visible ring, section header icon container, entrance animation, fix z-index dropdown COA tertimpa card sibling

### 1.5 Dashboard Page (Page 4)
- ✅ KPI cards — Total Revenue, Net Profit, Fixed Cost, Variable Cost dengan decorative circle overlay (lime/lilac variant)
- ✅ Revenue trend chart — Recharts ComposedChart, capsule bar Revenue/Net Profit + garis NPM%
- ✅ P&L Overview chart — Recharts BarChart, dark panel, Pendapatan vs Biaya per bulan
- ✅ Expense Breakdown donut — Recharts PieChart with center total label, legend with percentages
- ✅ Balance Sheet Health — komposisi Aset/Pasiva (progress bar) + 4 metric modal kerja
- ✅ Top 5 Sumber Penerimaan (packed bubble chart) — hover tooltip, legend dengan progress bar, mode compact untuk grid 2-kolom
- ✅ Cashflow Waterfall chart — Operating/Investing/Funding per bulan
- ✅ Client context integration — uses activeClient from global context, useRequireClient guard
- ✅ UI Polish 2026-07-02 — migrasi warna deprecated (#f20054/#c0ffee/#02a9a3/#3b82f6 → sky/peach/mint), hover Recharts Cell via CSS class `.ng-bar-cell`, hover card via `.ng-card-lift`, stagger entrance KPI + chart
- ✅ Fix 2026-07-02 — TopReceiptsBubble sempat ter-drop tanpa importer saat cleanup, dikembalikan + dirender
- ✅ Fix 2026-07-02 — rebalance layout: Expense Breakdown + Top Receipts (compact) sejajar 2-kolom setara bobot visual, Balance Sheet Health baris penuh sendiri (kontennya cukup padat untuk full width)

### 1.6 Analytics Page (Page 5) — **COMPLETED 2026-06-28**
- ✅ Period tabs — H1 / Q1 / Q2 / Custom date picker with range selector
- ✅ Executive Summary Band — health score ring (#daf163 accent), 3 KPI mini cards, top 3 alerts
- ✅ 5 Performance KPI Cards — Pendapatan, Laba Kotor, Laba Bersih, Gross Margin, Net Margin + sparklines + MoM delta
- ✅ Financial Health Summary (dark panel) — 4 dimensions (Likuiditas, Profitabilitas, Leverage, Efisiensi) with progress bars
- ✅ Likuiditas Ratio Cards — Current Ratio, Quick Ratio, Cash Ratio, Debt-to-Equity, Modal Kerja, CCC
- ✅ Profitabilitas Ratio Cards — ROE, ROA, Gross Margin, Net Margin, Operating Margin
- ✅ Efisiensi Ratio Cards — DSO, DIO, DPO, Inventory Turnover, Asset Turnover, CCC + DIO warning banner
- ✅ Metric Drawer (3 modes) — overview all dimensions, single dimension detail, individual metric detail with trend bars
- ✅ P&L Detail Table — toggle Bulanan/Kuartalan/YTD × Nominal/% Pendapatan, expand row sub-komponen
- ✅ Format Indonesia — koma desimal, titik ribuan, status pills (Sehat/Perhatian/Risiko/Netral/Info)
- ✅ Sparklines & Trend Visualization — 6-month trend arrays, SVG line + area + dot component
- ✅ Fix: Drawer bar chart dinamis sesuai filter periode (3 bar Q1/Q2, 6 bar H1) + horizontal scroll > 6 bar
- ✅ Fix: DateRangePicker menggunakan komponen existing (`components/date-range-picker.tsx`)
- ✅ Fix: Warna tab period selaras dengan accent color dashboard (`var(--color-accent-primary)`)
- ✅ Fix: Global color consistency — lime #daf163, lilac #bbb3f3, bg #222124 via CSS variables
- ✅ UI Polish: Semua emoji diganti Lucide icons, extended color palette (sky #7dd3fc, peach #fdba74, mint #6ee7b7) ditambahkan untuk states tambahan
- ✅ UI Polish: Premium card design — gradient strips, section header icons, stagger animations, hover lifts, cubic-bezier transitions across all pages
- ✅ UI Polish 2026-07-02 — sisa inline hover JS (RatioCard, MetricDrawer, SectionCard) dipindah ke CSS class (`.ng-tile`, `.ng-dark-tile`, `.ng-dim-row`, `.ng-fade-hover`); semua elemen klik jadi keyboard-accessible (role="button", tabIndex, onKeyDown, aria-label); tone `info` migrasi dari biru (#3b82f6) ke sky (#7dd3fc); side-stripe border-left dihapus dari RatioCard (diganti leading tone dot)

### 1.7 Settings Page (Page 6) — **COMPLETED 2026-07-02**
- ✅ Kelola Master COA — scoped ke `activeClient` (bukan list semua klien), status badge, upload/replace Excel (mock), preview struktur tabel (Kode/Nama/Posisi/Kelompok/Sub Kelompok/Class CF), empty state untuk klien tanpa Master COA
- ✅ Analytics Metrics Visibility — toggle per metrik per kategori (Likuiditas/Profitabilitas/Leverage/Efisiensi), state keyed per client id (independen antar klien), master toggle per kategori, counter metrik aktif
- ✅ Layout left-nav 230px + content area — General (platform-level, tidak scoped), Master COA, Analytics Display, Account (Soon), Notifications (Soon)
- ✅ Chip klien aktif di atas tab scoped sebagai pengingat konteks; empty state inline (bukan `useRequireClient`) supaya tab General tetap bisa diakses tanpa klien aktif
- ✅ Tab General — Language, Currency Format, Timezone (mock, segmented control)

---

## Phase 2 — Backend & Database

### 2.1 Database Schema — **COMPLETED 2026-07-02**
- ✅ PostgreSQL setup — Neon (serverless), driver `neon-http`
- ✅ Drizzle ORM setup — `lib/db/schema.ts`, `lib/db/index.ts`, `drizzle.config.ts`, scripts `db:generate`/`db:migrate`/`db:push`/`db:studio`
- ✅ clients table
- ✅ master_coa table — unique(client_id, kode), index client_id
- ✅ financial_reports table — enum report_type & status, unique(client_id, report_type, period_start, period_end), index (client_id, report_type, period_start)
- ✅ report_line_items table — enum status, index report_id & master_coa_id, FK onDelete set null/restrict sesuai konteks
- ✅ coa_mapping_history table — unique(client_id, raw_name) sebagai target upsert untuk fuzzy-match nanti (2.5)
- ✅ client_metric_visibility table (di luar daftar awal, ditambahkan karena menutup gap "Remaining Phase 1 Work" — kecil & tidak bergantung pekerjaan yang di-defer)
- ✅ Migration SQL ter-generate & tervalidasi (`drizzle-kit generate`, tanpa perlu live DB connection) — `lib/db/migrations/0000_early_lilandra.sql`
- ✅ Migrasi dijalankan ke Neon project nyata milik user — 6 tabel terkonfirmasi ada & kosong

### 2.2 Authentication (RBAC) — **COMPLETED 2026-07-05** (login end-to-end dikonfirmasi user)
- ✅ NextAuth v5 (`next-auth@beta`) setup — Credentials provider (email+password), session strategy JWT, `lib/auth.ts`
- ✅ Admin role — full access, `clientId` null, bisa switch klien manapun
- ✅ User (client) role — `clientId` terisi (FK ke clients, onDelete restrict), dipin ke 1 klien, tidak bisa switch
- ✅ `proxy.ts` (BUKAN `middleware.ts` — lihat Decisions & Notes) — protect semua route kecuali `/login`, `/api/auth/*`, static assets
- ✅ users table — email unique, passwordHash (bcryptjs), role enum, clientId nullable
- ✅ `lib/db/seed.ts` + `pnpm db:seed` — idempotent, seed 3 clients (UUID tetap) + admin pertama dari env var
- ✅ `app/login/page.tsx` — 3-layer depth pattern, form email+password, error state
- ✅ Migration users table ter-generate, ter-review, dan ter-migrasi ke Neon nyata
- ✅ Build terverifikasi: `ƒ Proxy (Middleware)` terpasang, akses tanpa login ke `/` redirect ke `/login?callbackUrl=...`
- ✅ `pnpm db:seed` berhasil membuat 3 klien + akun admin asli user
- ✅ Login manual end-to-end dikonfirmasi user (kredensial asli mereka, di browser) — 2.2 fully closed

### 2.3 Client Onboarding API — **COMPLETED 2026-07-05**
- ✅ GET /api/clients — role-aware (admin: semua klien urut nama; user: hanya klien miliknya). Menggantikan `MOCK_CLIENTS` + bridge UUID sepenuhnya.
- ✅ POST /api/clients — admin-only, buat klien baru `{ name, type }` (validasi non-empty, trim)
- ✅ POST /api/clients/[id]/coa — admin-only, import Master COA dari Excel (xlsx). Replace-all atomik via `db.batch([delete, insert])`, validasi header toleran + error per-baris, 400 tanpa menyentuh DB kalau ada error
- ✅ GET /api/clients/[id]/coa — admin (klien mana pun) atau user pemilik; balikin `{ count, updatedAt, accounts }` urut kode
- ✅ `lib/api/guards.ts` (`requireUser`/`requireAdmin`) + `lib/coa-import.ts` (`parseCoaWorkbook` — normalisasi header, alias toleran, dedup kode, validasi field wajib, Class CF nullable)
- ✅ Frontend disambungkan: `client-context` fetch `GET /api/clients` (`MOCK_CLIENTS` + `SEED_CLIENT_UUID_TO_MOCK_ID` dihapus, expose `clients` + `refreshClients`), sidebar switcher, admin-overview + modal "Klien Baru", Settings Master COA (upload/preview/status asli via API)
- ✅ Terverifikasi end-to-end di browser (session admin asli): buat klien → muncul tanpa reload; upload COA valid → persist 4 akun (Class CF kosong → null); upload malformed (kolom Kode hilang) → 400 + COA lama TIDAK terhapus; preview & badge Settings render dari DB. Klien uji dibersihkan setelahnya (DB kembali 3 klien seed)
- ✅ **2026-07-06 — hardening vs file asli (`Master COA RASYUKA.xlsx`):** parser awalnya menolak file nyata (baris judul "DATA MASTER COA", kolom nama berjudul "COA", posisi `D`/`K`, 5 kode dobel). Diperbaiki di `lib/coa-import.ts`: deteksi baris header by skor kecocokan alias (lewati banner), alias `COA`→nama, normalisasi `D`/`K`→`Debit`/`Kredit`, kode dobel di-suffix `-2` otomatis + `warnings[]` non-blocking (route + banner Settings). Hasil: **106 akun, 0 error**, terverifikasi insert ke Neon (unique(client_id, kode) terpenuhi, klien uji dibersihkan)

### 2.4 Upload & Extraction API
- ⏳ POST /api/upload/csv — parse CSV with PapaParse
- ⏳ POST /api/upload/excel — convert to CSV, parse
- ⏳ POST /api/upload/pdf — trigger Gemini extraction pipeline
- ⏳ GET /api/reports/[id]/status — polling endpoint for extraction progress
- ✅ **Kelola laporan ter-upload (2026-07-13)** — panel "Riwayat Upload" di /upload jadi nyata (dulu mock Phase 1): `GET /api/reports/list?clientId=` (meta + lineCount/mappedCount), **Hapus** (`DELETE /api/reports/[id]`, line item cascade, history mapping TIDAK ikut terhapus), **Ubah Periode** per sesi (`PATCH /api/reports/period` — atomik semua laporan sesi, pre-check konflik unique → 409; kasus nyata: PDF Maret ter-upload sbg Januari), **Ganti file** per laporan (reuse `POST /api/upload` yang memang delete-first utk klien+tipe+periode sama → re-ekstrak Gemini + auto-map ulang). Verifikasi Neon: 10/10 assert (cascade, konflik 409 tanpa partial-move, sukses atomik, 404)

### 2.5 COA Matching Engine — **COMPLETED 2026-07-10**
- ✅ `lib/coa-match.ts` (murni, tanpa I/O) — prioritas: **history** (pernah dikonfirmasi admin utk klien ini) → **exact** (nama ternormalisasi, non-ambigu) → **fuzzy** (0.6·bigram-Dice + 0.4·token-Jaccard, ambang **0.55**). Di bawah ambang: TIDAK menyarankan apa pun — saran keliru lebih mahal daripada tidak ada saran (admin cenderung meng-klik "terima")
- ✅ Kebijakan tunggal `isAutoMappable()`: history/exact → **auto-map** (`master_coa_id` + status `matched`, masuk tabel "Ter-mapping Otomatis"); fuzzy → **saran saja** (`suggested_coa_id`, tetap `unmatched` → kartu lilac "Saran AI"). Exact yang **ambigu** (>1 akun bernama sama setelah normalisasi) diturunkan jadi saran, tidak auto-map
- ✅ Disambungkan di `POST /api/upload` — Master COA + history di-load SEKALI (bukan per file); response ikut `autoMapped` & `suggested` per laporan
- ✅ `POST /api/reports/[id]/suggest` — backfill saran untuk laporan lama / sesudah Master COA diperbarui / sesudah history bertambah. **Tanpa memanggil Gemini** (hemat kuota free-tier), idempoten; subtotal, baris yang sudah dipetakan, dan baris `rejected` dilewati
- ✅ Divalidasi vs data ASLI: 36 nama line item L/R Rasyuka vs 106 akun Master COA asli → **36/36 exact (100%)** — software akunting klien menulis nama akun yang sama persis di COA & PDF. Akun tak dikenal ("Biaya Langganan Zoom Pro") benar-benar tidak disarankan; history boost memetakan nama yang tadinya tak tersaran
- ✅ POST /api/reports/[id]/mapping — confirm line item mapping (2026-07-10). Set `master_coa_id` + status `matched`, upsert `coa_mapping_history`, flip report → `mapped`. Atomik via `db.batch`. Baris **subtotal & rejected dikecualikan** dari hitungan sisa — tanpa itu status tidak pernah jadi `mapped` (bug ditemukan & diperbaiki saat review)
- ✅ GET /api/reports/periods — daftar periode per klien (prasyarat period selector)
- ✅ GET/PUT /api/clients/[id]/metrics — persist client_metric_visibility (2026-07-10)
- ✅ /coa-mapping lepas dari mock: dropdown COA (dikelompokkan per subKelompok) + line item + period selector dari API; simpan per-laporan lalu re-read dari server
- ✅ `pnpm db:seed:dev` (`lib/db/seed-dev.ts`) — fixture dev: Master COA + line item berbeda per klien (verifikasi client switcher)
- ✅ **Auto-backfill saran saat /coa-mapping dimuat (2026-07-13)** — root cause "auto-map 0": matching hanya berjalan saat upload, jadi laporan yang diunggah SEBELUM Master COA di-import/di-replace tidak pernah di-match ulang (endpoint /suggest ada tapi tak pernah dipanggil UI). Fix: loadData /coa-mapping menjalankan POST /suggest utk laporan yang masih punya baris unmapped (idempoten, tanpa Gemini), reload bila ada perubahan. Kasus nyata Maret Rasyuka: 0 → 90/90 (100%) auto-mapped setelah COA 106 terpasang
- ✅ Persist review actions (edit/reject/undo/confirm) di `extraction-review` (2026-07-10) — `PATCH /api/reports/[id]/line-items/[lineItemId]` (status + editedName, guard IDOR: baris harus milik laporan di URL) + `POST …/line-items/confirm-all` (non-rejected → matched). Frontend: optimistic update + rollback saat gagal. **Report status TIDAK disentuh di sini** — transisi review→mapped tetap milik route /mapping (berbasis masterCoaId), tidak konflik. Terverifikasi vs Neon: edit/reject/undo persist, IDOR ditolak 404 tanpa perubahan diam-diam, confirm-all melewati rejected

### 2.6 Financial Data API — **Dashboard selesai 2026-07-10; Analytics ratios menyusul**
- ✅ `lib/financial-agg.ts` (murni) — agregasi on-the-fly dari `report_line_items` + `master_coa` (baris matched/edited, non-subtotal). Klasifikasi berbasis kata kunci `subKelompok`/`classCf` → tahan variasi taksonomi antar klien (COA asli Rasyuka vs seed-dev). **Urutan cek penting**: "harga pokok penjualan" & "pendapatan dan biaya lain-lain" dicek sebelum kata kunci revenue (keduanya mengandungnya). Rumus P&L terverifikasi cocok dgn PDF: revenue(net) − hpp = laba kotor; − opex + lain-lain − pajak = laba bersih
- ✅ `GET /api/dashboard/[clientId]?periodStart=&periodEnd=` — monthly P&L series, KPI totals (revenue/netProfit/**fixed & variable cost asli**, bukan lagi fudge 18.5%/79.2%), expense breakdown, neraca (point-in-time terbaru), cashflow per bulan (by classCf), top-5 penerimaan (agregasi per nama). Role-aware
- ✅ `app/dashboard/page.tsx` lepas dari mock — fetch endpoint, bentuk props chart dijaga identik (swap data source, bukan redesign); loading + empty state (belum ada laporan terpetakan); neraca/cashflow disembunyikan kalau tak ada laporannya
- ✅ Terverifikasi: 14/14 uji rumus sintetik (termasuk bug klasifikasi HPP-mengandung-"penjualan" yang tertangkap & diperbaiki); wiring endpoint vs Neon (monthly 2 bulan, KPI, top receipts, neraca). Cocok-angka-real via Gemini tertunda (503 high-demand) — rekonsiliasi detail→subtotal sudah terbukti di M1
- ✅ `GET /api/analytics/[clientId]/ratios?periodStart=&periodEnd=` (2026-07-10) — seri bulanan P&L (bentuk `{m,rev,np,gp,exp}`) + neraca (`aktivaLancar/hutangLancar/persediaan/kas/piutang/totalModal/totalAset`) + rasio siap-pakai (CR/QR/cashR/DER/WC/GPM/NPM/OPM/ROE/ROA/DSO/DIO/DPO/invTurn/assetTurn). Reuse `lib/financial-agg` (rumus rasio identik dgn yang di analytics page), role-aware, `safeDiv` anti bagi-nol. tsc+build hijau
- ✅ **trendArrays (task #23 sub-A, 2026-07-10)** — di-refactor jadi core `windowRatios(windowEnd)`; `trendArrays` (shape `TrendArrays` metric-drawer, 19 key) = 1 titik per checkpoint Neraca dalam rentang, rasio KUMULATIF sampai `periodEnd` checkpoint (bukan bulan terisolasi), pakai `windowRatios` yang sama (bukan algoritma paralel). Ganti `synth()` fake trend di analytics page. Verifikasi vs Neon: `trendArrays.cr[last]` == `ratios.cr`, rev/npm kumulatif naik, cr berubah antar checkpoint, 1-checkpoint → array 1 elemen
- ✅ **`lib/financial-health.ts` (task #23 sub-B, 2026-07-10)** — modul scoring murni (terpisah dari agg). Threshold ABSOLUT (konstanta `THRESHOLDS`, tunable): DER/NPM/ROA/ROE (Permenkop UKM 06/2006), CR/QR/CashR (UMKM dagang umum), InvTurn (retail). Tone TREN (`TREND_EPS=2%` relatif, tunable): OPM/AssetTurn/GPM higher-better, DSO/DIO/CCC lower-better, DPO **selalu info** (arah ambigu), WC info-only. `scoreFromTone` (sehat100/perhatian60/netral50/risiko20/info=exclude), `dimensionScore` (rata-rata non-info; CCC di Likuiditas & Efisiensi), `overallScore` (equal weight 4 dimensi), `generateAlerts` (maks 3, risiko dulu lalu perhatian by dimensi terlemah, fallback pesan positif). 17/17 uji sintetik lulus (semua-sehat/semua-risiko/campuran/1-checkpoint→netral/DPO-info)
- ⏳ **Wiring `app/analytics/page.tsx` lepas dari mock — belum.** BUKAN swap mekanis seperti dashboard: page ini di-hardcode **tepat 6 bulan** (tab H1/Q1/Q2 meng-index `MONTHLY_DATA[0..5]`) → klien dgn ≠6 bulan meng-index `undefined` dan CRASH. Perlu: (1) period selector adaptif ke bulan yang benar-benar ada, (2) pindahkan derivasi trend module-level (`DRAWER_TRENDS`, `dsoAll`…) ke dalam komponen dari data fetched, (3) tangani konten editorial (ALERTS/DIMS_PANEL/OVERALL_SCORE — skor kesehatan & alert saat ini hardcoded ke angka mock; perlu diturunkan dari rasio vs benchmark atau disederhanakan). Endpoint sudah siap dikonsumsi
- ✅ **Compare Neraca (2026-07-13)** — realisasi item "/compare", partial (hanya Neraca, sesuai request): `GET /api/analytics/[clientId]/neraca-compare?a=&b=` (endpoint terpisah dari /ratios — pasangan checkpoint pilihan user, bukan turunan rentang) + `lib/neraca-compare.ts` (murni: section per subKelompok via classifyBs, penjumlahan BERTANDA — kontra akun negatif, identitas TOTAL AKTIVA=PASIVA) + section "Compare Neraca" di /analytics (2 dropdown checkpoint, expand/collapse akun per section ala tabel P&L, kolom Rp/%/Growth(Rp)/Growth(%), banner kalau tidak seimbang >Rp100 / ada subKelompok tak terklasifikasi). Diverifikasi vs angka asli PDF "Compare Neraca Feb–Mar 2026" Rasyuka: 19/19 assert (semua subtotal, TOTAL, growth, identitas ±Rp1 artefak pembulatan cetak). Compare P&L: belum diminta, belum dibangun

---

## Phase 3 — AI Integration

### 3.1 Gemini PDF Extraction — **COMPLETED 2026-07-06**
- ✅ Gemini setup & auth — `@google/genai` v2.10, model `gemini-3.5-flash`, `GEMINI_API_KEY`; `lib/gemini/client.ts` (lazy singleton) + `lib/gemini/extract.ts`
- ✅ Ekstraksi structured output (`responseSchema`) — PDF native inline base64, per baris: `rawName`, `amount` (negatif utk pengurang/kurung), `isSubtotal`, `confidence`; retry transient 429/5xx (honor server `retryDelay`)
- ✅ Prompt per tipe — Laba Rugi / Neraca / Arus Kas (hint struktur & pola subtotal masing-masing)
- ✅ Confidence per baris (0–100, dari Gemini)
- ✅ Subtotal DITANDAI (`isSubtotal`), bukan difilter — toggle show/hide di extraction-review
- ✅ Divalidasi vs 3 PDF asli Rasyuka Maret 2026: L/R 46 baris, Neraca 29 (TOTAL AKTIVA = TOTAL PASIVA seimbang), Arus Kas 38 — amount/tanda/subtotal akurat
- ✅ Upload API (`POST /api/upload`, admin) — simpan PDF (bytea) + ekstrak paralel + simpan `report_line_items` (`unmatched`) + status `review`; wire tombol "Proses Laporan" + state "Mengekstrak dengan AI…"
- ✅ Reports API (`GET /api/reports` by client+period, `GET /api/reports/[id]/pdf`) + extraction-review lepas dari `MOCK_LINES`/`MOCK_REPORT_META` (line item asli + PDF `<iframe>`)
- ✅ `financial_reports.sourcePdf` bytea (migration `0002`) — round-trip Buffer terverifikasi via neon-http
- ⏳ Persist review actions (edit/reject/confirm) + "Lanjut ke COA Mapping" → digabung ke Phase 2.5

### 3.2 COA Auto-Mapping AI
- ⏳ Gemini-assisted fuzzy matching
- ⏳ Learning loop — improve suggestions from confirmed mappings

---

## Phase 4 — Operational Module (Coming Soon)
- 🔒 Inventory management — real-time stock value
- 🔒 Stock movement tracking
- 🔒 Inventory-to-COGS reconciliation

---

## Decisions & Notes

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-17 | Upload split into 3 separate files (PnL, Neraca, CF) | Better AI extraction accuracy per report type |
| 2026-06-17 | Master COA per-client, imported via Excel | Each client has unique COA; Excel is existing workflow |
| 2026-06-17 | Tailwind CSS v4 — @theme inline, no tailwind.config.ts | v4 syntax; config via CSS only |
| 2026-06-17 | coa_mapping_history table for ML-like auto-matching | Reduces admin work month-over-month |
| 2026-06-17 | MVP priority: CSV parsing before PDF/AI pipeline | Faster to validate core data flow |
| 2026-06-19 | Extraction Review uses mock data for Phase 1 frontend | Real Gemini extraction wired in Phase 3 |
| 2026-06-19 | Date range picker rebuilt as custom calendar (no react-day-picker) | 100% control over styling; no library CSS conflicts |
| 2026-06-19 | Lilac (#a78bfa) as secondary accent — scrollbar, date picker, selected states | Differentiates interactive/secondary elements from primary lime CTA |
| 2026-06-19 | Sidebar workspace card syncs with admin client selector | Admin context switch updates sidebar without page reload |
| 2026-06-19 | COA Mapping page uses 3-state card UI (unset/suggested/mapped) | Visual feedback guides admin through mapping workflow efficiently |
| 2026-06-19 | Sidebar collapse state persisted in localStorage | Consistent UX across page navigation without backend |
| 2026-06-19 | Client selection is global (React Context), not per-page state | Prevents desync bug where Sidebar and page content showed different clients |
| 2026-06-19 | Client switcher lives in Sidebar workspace card, not in Upload page | Single consistent location across all pages; matches common SaaS patterns (Linear, Notion) |
| 2026-06-19 | Admin Overview page added as the "no client selected" landing state | Gives admin a useful dashboard instead of an empty/broken page |
| 2026-06-19 | Fixed COA Mapping page client desync bug — now reads activeClient from context instead of hardcoded SESSION mock | Bug found during manual testing after global client context rollout |
| 2026-06-19 | Dashboard charts built with Recharts — radial rings for KPIs, area/line/donut for trends | Flux-app-inspired radial visual achievable with RadialBarChart; full chart flexibility retained |
| 2026-06-24 | Responsive strategy: desktop-first with graceful mobile fallback | Financial BI is primarily desktop-used; mobile support is functional but not pixel-perfect |
| 2026-06-24 | Sidebar becomes fixed overlay drawer on mobile (< md breakpoint) | Avoids layout shift; preserves desktop collapsible behavior unchanged |
| 2026-06-24 | Charts use clamp() for responsive height instead of fixed px | Scales naturally between 180px mobile and 280px large screen |
| 2026-06-28 | Analytics page: accent lime #daf163 (not #c0ff33) from design-reference | Matches Figma design; TONES exported from ratio-card.tsx for reuse |
| 2026-06-28 | ~~Drawer trend arrays always use all 6 months (MONTHLY_DATA), not filtered period~~ → **Superseded 2026-06-29:** drawer trend kini mengikuti filter periode aktif (`pc.idx`) | Konsistensi: bar di drawer harus mencerminkan periode yang dipilih user |
| 2026-06-28 | Balance sheet ratios (CR, DER, etc.) use synthetic trend via synth() | Simulates realistic monthly progression since BS is point-in-time data |
| 2026-06-28 | DIO & Inventory Turnover basis: Pendapatan (not HPP) per analytics spec | Aligns with narasi "persediaan lambat berputar vs penjualan" |
| 2026-06-28 | P&L sub-baris: mock portions (62% Produk, etc.) pending COA API integration | High-priority feature — users value expand rows to see detail breakdown |
| 2026-06-29 | Lime accent diupdate dari #c0ff33 ke #daf163, lilac dari #a78bfa ke #bbb3f3, bg dari #1a1a1a ke #222124 | Selaraskan dengan dashboard design system yang sudah locked |
| 2026-06-29 | Semua hardcode warna dipindahkan ke CSS variables di globals.css (kecuali Recharts fill/stroke props & string-concat alpha yang butuh literal hex) | Single source of truth untuk design tokens; var() tidak bekerja di SVG presentation attribute |
| 2026-06-29 | DateRangePicker analytics menggunakan components/date-range-picker.tsx | DRY principle, konsistensi dark theme |
| 2026-06-29 | Semua emoji UI diganti Lucide icons — konsisten cross-platform, scalable, colorable | Emoji rendering berbeda di tiap OS/browser |
| 2026-06-29 | Extended palette ditambahkan: sky #7dd3fc (info), peach #fdba74 (warning), mint #6ee7b7 (success soft) | Harmonis secara color theory dengan lime/lilac/pink utama |
| 2026-07-02 | Sidebar sliding nav capsule — satu elemen lime yang bergeser (translateY+height terukur) ke item aktif, bukan background per-item | Terasa premium; butuh Sidebar dipindah ke root layout supaya persist antar navigasi (sebelumnya remount per halaman bikin animasi "loncat" bukan geser) |
| 2026-07-02 | activeItem Sidebar diturunkan dari `usePathname()` + peta rute (bukan prop manual per halaman) | Prop manual rawan typo/desync; satu sumber kebenaran dari URL |
| 2026-07-02 | Settings page discoped per `activeClient` (Master COA & Analytics Metrics), bukan list semua klien | Preferensi ini memang per-klien secara bisnis — konsisten dengan pattern Upload/Dashboard/Analytics yang sudah ada |
| 2026-07-02 | Settings edge case: empty state inline, bukan `useRequireClient` | Tab General bersifat platform-level, harus tetap bisa diakses walau belum ada klien aktif; auto-redirect akan memblokir itu |
| 2026-07-02 | Hover state di seluruh app dipindah dari `onMouseEnter`/`onMouseLeave` inline JS ke CSS class (`.ng-card-lift`, `.ng-tile`, `.ng-bar-cell`, dll) | Inline JS hover tidak jalan saat keyboard focus; CSS class + `focus-visible` konsisten untuk mouse & keyboard |
| 2026-07-02 | Warna deprecated (#f20054, #c0ffee, #02a9a3, #3b82f6, #a78bfa) dituntaskan migrasinya ke extended palette (sky/peach/mint) di seluruh dashboard & analytics | Konsistensi penuh dengan design system yang di-lock; beberapa titik lolos di polish sesi sebelumnya |
| 2026-07-02 | Dead code dihapus: kpi-card.tsx lama, quick-insights.tsx, upload-form.tsx (via git rm, histori tetap ada) | Sudah tidak ada importer setelah beberapa kali refactor; tapi lihat catatan di bawah soal top-receipts-bubble.tsx |
| 2026-07-02 | top-receipts-bubble.tsx sempat ikut terhapus di cleanup yang sama, lalu di-restore + dirender kembali di Dashboard | Komponennya lengkap dan tidak rusak — cuma kehilangan pemanggil (`<TopReceiptsBubble>`) di salah satu sesi polish sebelumnya; pelajaran: verifikasi "tidak ada importer" harus dicek ulang tepat sebelum hapus, bukan cuma sekali di awal sesi |
| 2026-07-02 | Dashboard: Top 5 Sumber Penerimaan dipasang `compact` sejajar Expense Breakdown Donut (2 kolom setara), bukan full-width sendirian | Mode non-compact di card full-width menyisakan banyak ruang kosong (canvas fixed 300px + legend flex-1 meregang); dipasangkan dengan card berbobot visual serupa jauh lebih proporsional |
| 2026-07-02 | Phase 2.1 dimulai — DB host: Neon, ORM: Drizzle (dikonfirmasi user, ROADMAP sebelumnya masih "Drizzle or Prisma") | Neon serverless cocok dengan deployment Next.js/Vercel tanpa setup lokal; Drizzle ringan & sintaksnya dekat SQL, cocok dipasangkan Neon |
| 2026-07-02 | Driver `neon-http` dipilih, bukan `neon-serverless` (websocket pool) | Tidak ada operasi Phase 2 yang direncanakan butuh transaksi multi-statement lintas round-trip; neon-http lebih rendah latensi & tanpa lifecycle connection pool di lingkungan serverless. Ganti driver gampang (satu baris) kalau 2.5 nanti ternyata butuh transaksi |
| 2026-07-02 | Enum Postgres (`pgEnum`) hanya untuk `report_type` & 2 status field (financial_reports, report_line_items) — `posisi`/`kelompok`/`sub_kelompok`/`class_cf` tetap `text` | Report type & status adalah state machine yang sudah hardcode di banyak komponen UI, biaya migrasi enum sudah "gratis" (ubah value = ubah kode juga). Kelompok/sub-kelompok berasal dari data Excel klien yang di-import & masih berpotensi berubah bentuk — enum Postgres (`ALTER TYPE ADD VALUE` tidak reversibel) terlalu kaku untuk data yang masih iterating |
| 2026-07-02 | Tabel snapshot agregat (monthly_financials, balance_sheet_snapshots) sengaja TIDAK dibuat di 2.1 | Semua data dashboard/analytics (MONTHLY_DATA, rasio CR/ROE/dst) adalah derivasi dari `report_line_items` + `master_coa` — dihitung on-the-fly saat Financial Data API (2.6) dibangun, bukan snapshot yang bisa stale. Belum ada data produksi/query aggregation yang butuh optimasi sekarang |
| 2026-07-02 | `financial_reports` punya `unique(client_id, report_type, period_start, period_end)` | Mencegah admin upload dua kali untuk klien+tipe+periode yang sama tanpa sadar; sekaligus catatan untuk 2.6 nanti: periode upload sebaiknya divalidasi selalu 1 bulan penuh (bukan rentang custom sembarang) supaya agregasi bulanan di dashboard tidak perlu rekonsiliasi rentang yang tidak rata |
| 2026-07-02 | `client_metric_visibility` dibuat sekarang, bukan ditunda bareng auth/API | Tabelnya kecil, tidak bergantung pada subsistem yang di-defer (auth/matching engine), dan langsung menutup gap yang sudah dicatat di "Remaining Phase 1 Work" — menunda hanya menambah satu sesi migrasi lagi untuk tabel 2 kolom |
| 2026-07-02 | NextAuth v5 (`next-auth@5.0.0-beta.31`, beta pinned tanpa caret) + Credentials provider (email+password), bukan OAuth/magic-link | User konfirmasi email+password; tim internal admin & klien UMKM, tidak butuh SSO. Versi di-pin exact karena masih beta — caret range bisa narik breaking change tanpa sadar |
| 2026-07-02 | Session strategy JWT, bukan database session | Neon serverless + `neon-http` (bukan connection pool) lebih cocok stateless; menghindari query session di setiap request |
| 2026-07-02 | **Next.js 16.2.6 mengganti `middleware.ts` → `proxy.ts`** (fungsi diekspor bernama `proxy`, bukan `middleware`) | Ditemukan & diverifikasi independen lewat `node_modules/next/dist/lib/constants.js` (`PROXY_FILENAME`) + dokumentasi resmi `nextjs.org/docs/messages/middleware-to-proxy` sebelum diimplementasi — `middleware.ts` di versi ini silently diabaikan, bukan error, jadi mudah lolos tanpa sadar. Route protection juga butuh `callbacks.authorized` di `lib/auth.ts`, bukan cuma re-export `auth` — re-export polos hanya attach `req.auth`, tidak redirect |
| 2026-07-02 | `users.clientId` nullable FK, tanpa tabel join many-to-many | Null = admin (akses semua klien), terisi = user dipin ke 1 klien — cocok dengan RBAC 2-role yang ada sekarang (admin/user). Tidak ada requirement multi-klien per user; join table jadi over-engineering |
| 2026-07-02 | `users.clientId` pakai `onDelete: 'restrict'` (bukan cascade/set null) | Menghapus klien yang masih punya user terpasang harus gagal eksplisit, bukan diam-diam menghapus/orphan user tsb — mencegah kehilangan akses tanpa sadar |
| 2026-07-02 | bcryptjs (pure-JS) dipakai untuk password hashing, cost factor 12, bukan native `bcrypt`/`argon2` | Tidak butuh native binding (lebih portable lintas environment deploy); cost 12 standar industri saat ini |
| 2026-07-02 | `MOCK_CLIENTS` (id `'client-1'` dst, dipakai admin-overview & settings) TIDAK diganti ke UUID asli; dijembatani via lookup map `SEED_CLIENT_UUID_TO_MOCK_ID` di `lib/client-context.tsx` | Mengubah `MOCK_CLIENTS` butuh menyentuh 2 halaman lain di luar scope auth; 3 klien di-seed dengan UUID **tetap** (bukan random) supaya bridge-nya deterministic. Ditandai `TODO(2.3)`: bridge ini dibongkar begitu `GET /api/clients` menggantikan `MOCK_CLIENTS` sepenuhnya |
| 2026-07-02 | Belum ada halaman public register — akun baru (admin/staff/user) dibuat manual lewat `lib/db/seed.ts` (admin pertama, dari env var) atau `pnpm db:studio` (tambahan, hash manual via bcryptjs CLI one-liner) | Semua akun dibuat internal oleh Ricko, bukan self-service signup — sesuai model bisnis (admin yang provisioning akun klien), jadi register page bukan prioritas sebelum ada UI Account management |
| 2026-07-05 | **Bridge `SEED_CLIENT_UUID_TO_MOCK_ID` + `MOCK_CLIENTS` dihapus** (menutup `TODO(2.3)`) — klien di-fetch dari `GET /api/clients` di `client-context`, di-consume via context (`clients`) oleh sidebar/admin-overview/settings | 2.3 memang titik pembongkaran yang direncanakan; UUID seed tetap tetap (idempotency), tapi tidak lagi dipetakan ke id mock |
| 2026-07-05 | Import Master COA pakai **replace-all** (hapus semua COA klien lalu insert), bukan upsert per-kode | Cocok dengan UX "Ganti Excel" (file baru = sumber kebenaran baru); upsert menyisakan baris lama yang dihapus di file baru → COA tidak konsisten dengan file |
| 2026-07-05 | Replace-all dieksekusi via `db.batch([delete, insert])`, BUKAN `db.transaction()` | Diverifikasi di `node_modules/drizzle-orm/neon-http/session.js`: `transaction()` throw `"No transactions support in neon-http driver"`. `db.batch()` dikirim sebagai satu Neon HTTP transaction (atomik) — pas untuk rangkaian statement yang sudah diketahui di depan. Konsisten dgn keputusan driver `neon-http` (2.1) |
| 2026-07-05 | `parseCoaWorkbook` (`lib/coa-import.ts`): header toleran (normalisasi + alias), validasi **all-or-nothing** (ada error baris → 400, DB tidak disentuh), dedup kode dalam file, Class CF nullable | Master COA data fondasi — lebih aman tolak file bermasalah dgn pesan per-baris daripada import sebagian. Alias header bisa ditambah kalau ketemu format template klien baru |
| 2026-07-05 | `GET /api/clients` role-aware dalam satu endpoint (admin: semua; user: hanya klien-nya) | Satu sumber untuk `client-context` kedua role; user role tetap ter-scope ke klien-nya (RBAC di layer API, bukan cuma UI) |
| 2026-07-05 | Tetap mock (di luar scope 2.3): status upload/overdue di admin-overview (→ 2.4/2.6), bar "storage used" sidebar (kosmetik, `pseudoStorage` deterministik → 2.6), persistensi Analytics Metrics Visibility (tabel `client_metric_visibility` ada, disambung setelah route API) | Menghindari scope creep; masing-masing bergantung subsistem yang belum dibangun. Data fabrikasi di admin-overview diganti state netral "Buka workspace" biar tidak menampilkan angka palsu dgn klien asli |
| 2026-07-05 | Buat klien lewat modal "Klien Baru" di admin-overview; belum ada UI edit/hapus klien | Onboarding (create) yang dibutuhkan 2.3; edit/hapus menyusul bareng UI Account management. Hapus klien juga perlu hati-hati (FK `users.clientId` onDelete restrict) |
| 2026-07-06 | Parser Master COA di-harden setelah uji file asli Rasyuka: deteksi header by skor alias (lewati baris judul), alias `COA`→nama, `D`/`K`→`Debit`/`Kredit`, kode dobel **di-suffix `-2`** (bukan ditolak) + `warnings[]` | Template klien nyata beda dari asumsi awal (banner judul, kolom bernama "COA", singkatan posisi, kode dipakai ulang antar section: mis. section "Lain-Lain" mulai ulang `24-xxxx`). Nama akun 100% unik (106/106) jadi identitas mapping tetap aman; suffix mempertahankan `unique(client_id, kode)` **tanpa migration & tanpa edit Excel** (pilihan user, vs relax constraint / renumber manual) |
| 2026-07-06 | Phase 3 (Gemini PDF extraction) ditunda — laporan L/R klien ternyata PDF, butuh OCR Gemini + API key | ~~User pilih fokus fix 2.3 dulu~~ → **dikerjakan 2026-07-06** setelah user isi `GEMINI_API_KEY`. Gemini baca PDF native (inline base64, ~100KB) → tidak perlu poppler/render lokal |
| 2026-07-06 | SDK `@google/genai` (v2.10) + model `gemini-3.5-flash`, structured output (`responseSchema` + `responseMimeType: application/json`), `temperature: 0` | SDK unified GA (bukan `@google/generative-ai` lawas); API dipin ke tipe SDK terpasang (dua sumber dok beda — satu halusinasi `interactions.create`). Flash cukup akurat & murah utk dokumen. Schema output menjamin JSON valid → tak perlu parsing bebas |
| 2026-07-06 | PDF disimpan di Neon sebagai `bytea` (kolom `financial_reports.source_pdf`, nullable) — bukan Vercel Blob | File kecil (~100KB–1MB), TOAST aman; tanpa service/token tambahan. neon-http kembalikan `Buffer` langsung (round-trip terverifikasi). Ganti ke object storage kalau nanti perlu file besar/skala |
| 2026-07-06 | Ekstraksi SINKRON saat upload, paralel (`Promise.all`) lintas file; `export const maxDuration = 60` di route | 3 PDF paralel ~17–25s (bounded by slowest) < 60s. Async + polling (`GET /api/reports/[id]/status`) = jalur produksi kalau perlu, belum dibangun. Retry transient (429 free-tier/5xx) honor `retryDelay` |
| 2026-07-06 | "Sesi upload" = (clientId, periodStart, periodEnd) — TANPA tabel session baru | 3 laporan dikelompokkan by klien+periode (sejalan `unique(client, type, period)`); extraction-review load by query `?start=&end=`. Sederhana, tak ada entitas baru |
| 2026-07-06 | **Free tier `gemini-3.5-flash` = 5 request/menit** — didokumentasikan di `.env.example` | 1 upload = 1 request/file (maks 3). Pemakaian rutin banyak klien butuh billing berbayar. Retry sudah honor `retryDelay` tapi tidak menembus kuota menit |
| 2026-07-06 | `pnpm-workspace.yaml` `allowBuilds`: `@google/genai` & `protobufjs` = `false` | pnpm v11 memblok `pnpm <script>` (precheck install exit 1) kalau build script belum diputuskan. SDK jalan tanpa build (ekstraksi terverifikasi) → `false` = jangan jalankan postinstall, tanpa risiko script pihak ketiga |
| 2026-07-10 | COA matching **deterministik** (`lib/coa-match.ts`), BUKAN Gemini | Nama akun di PDF klien = nama di Master COA-nya (terbukti 36/36 exact utk Rasyuka). Matching lokal: gratis, instan, deterministik, tidak kena kuota. Gemini-assisted fuzzy tetap disimpan sebagai 3.2 untuk klien yang penamaannya benar-benar berbeda |
| 2026-07-10 | history/exact → **auto-map**; fuzzy → **saran saja** (satu kebijakan: `isAutoMappable()`) | UI memang punya tabel "Ter-mapping Otomatis" (collapsed) + kartu lilac "Saran AI" — dua state ini baru hidup kalau auto-map dipisah dari saran. Exact ambigu (>1 akun bernama sama setelah normalisasi) sengaja diturunkan jadi saran supaya tidak salah petakan diam-diam |
| 2026-07-10 | Ambang fuzzy 0.55; di bawah itu **tidak menyarankan apa pun** | Saran yang salah lebih mahal daripada tidak ada saran — admin cenderung menerima saran yang tampil. Terbukti: "Biaya Langganan Zoom Pro" (tak ada di COA) benar-benar tidak disarankan |
| 2026-07-10 | `POST /api/reports/[id]/suggest` terpisah dari upload, tanpa panggil Gemini | Backfill laporan lama & re-run setelah Master COA / history berubah, tanpa membakar kuota free-tier (5 req/menit) dan tanpa ekstraksi ulang. Idempoten: subtotal, baris yang sudah dipetakan, dan `rejected` dilewati |
| 2026-07-10 | **Fix rumus rasio** (`lib/financial-agg.ts` + ratios route): (1) `hutangUsaha` = HANYA akun ber-nama "dagang" (Hutang Dagang), bukan seluruh subKelompok "Hutang" yang campur (Pihak Ketiga, Pajak, Gaji, Biaya YMH Dibayar). (2) DIO & InvTurn basis **HPP** (bukan Pendapatan). (3) DPO pakai **rata-rata Hutang Usaha** (bukan total hutang lancar). (4) ROE/ROA pakai **rata-rata (awal+akhir)** ekuitas/aset — beginning balance dari query neraca terakhir SEBELUM rentang, fallback ke ending kalau tak ada | Rasio stok-vs-flow harus pakai rata-rata neraca & basis biaya yang benar (DIO/DPO vs HPP). "Hutang" generik di COA klien mencampur AP dgn akrual/pajak → DPO overstated kalau semua dihitung. Verifikasi vs Neon: hutangUsaha benar (dagang saja), beginning ambil periode sebelum rentang, DPO turun & DIO naik sesuai ekspektasi |
| 2026-07-13 | Kelola laporan ditempatkan di **panel "Riwayat Upload" halaman /upload** (bukan Settings / tab baru): panel-nya sudah ada sejak Phase 1 (mock) di lokasi yang tepat secara mental-model ("kelola file yang di-upload" = tempat upload), Settings = konfigurasi bukan data. "Ubah" = pindah periode LEVEL SESI (atomik, bukan per laporan — pindah parsial memecah sesi); "Ganti" = reuse POST /api/upload (sudah delete-first); konfirmasi hapus 2-langkah inline (tanpa infra modal baru) | Menutup mock Phase 1 sekaligus; endpoint per-kebutuhan kecil (list/delete/period) lebih aman daripada mengubah kontrak GET /api/reports yang dipakai extraction-review & coa-mapping |
| 2026-07-13 | Compare Neraca = **endpoint terpisah** `GET /api/analytics/[clientId]/neraca-compare?a=&b=` + lib murni `lib/neraca-compare.ts`, BUKAN extend /ratios; checkpoint pilihan user **independen dari filter rentang halaman**; agregasi **BERTANDA** (bukan abs ala aggregateBalanceSheet) supaya kontra akun (Akumulasi Penyusutan, Prive) mengurangi & identitas AKTIVA=PASIVA terjaga; Growth% = (B−A)/A tanda-asli (konvensi laporan manual klien); % akun = porsi subtotal section (template lama punya denominator rusak — sengaja diperbaiki); angka tampil PENUH (bukan singkatan jt/M); toleransi banner tidak-seimbang Rp 100 (artefak pembulatan cetak PDF ±beberapa rupiah, salah mapping riil ≥ ribuan) | Komparasi = operasi 2 titik pilihan user: extend /ratios memaksa re-agregasi payload penuh tiap ganti pasangan & mengikat pasangan ke rentang halaman (berubah diam-diam saat ganti preset). Lib murni = testable: 19/19 assert vs angka asli PDF Compare Neraca Feb–Mar 2026 Rasyuka |

---

## Current Status
**Phase 1 ✅ · Phase 2 Backend ✅ (2.1–2.6) · Phase 3.1 ✅**

Loop inti sudah lepas dari mock end-to-end: **upload → Gemini extract → review (persist) → COA mapping → Dashboard real → Analytics real.** Compare Neraca (realisasi `/compare`, sisi Neraca) selesai 2026-07-13. Fitur berikutnya (3.2, Phase 4) **sengaja belum dimulai** — fokus dulu validasi manual loop inti dengan data nyata.

### Phase 1 — Frontend ✅
6 halaman + polish menyeluruh selesai. "Remaining Phase 1 Work" lama (real upload flow, API integration untuk data finansial) sudah **tertutup** oleh Phase 2.4–2.6 (upload/extract/dashboard/analytics lepas dari mock).

### Phase 2 — Backend ✅
- ✅ 2.1 Database Schema — 7 tabel + 4 enum di Drizzle, migrasi ke Neon nyata
- ✅ 2.2 Authentication (NextAuth v5, RBAC, `proxy.ts`) — login end-to-end dikonfirmasi user di browser
- ✅ 2.3 Client Onboarding API — clients + Master COA (`GET`/`POST /api/clients(+/[id]/coa)`); parser di-harden vs file asli Rasyuka
- ✅ 2.4 Upload & Extraction — via Phase 3.1 (`POST /api/upload`, PDF). CSV/Excel di-skip (laporan klien PDF)
- ✅ 2.5 COA Matching — engine deterministik (`lib/coa-match.ts`), auto-map/saran, persist mapping (`/api/reports/[id]/mapping`) + review actions (`extraction-review`)
- ✅ 2.6 Financial Data API — Dashboard + Analytics lepas dari mock. `GET /api/dashboard/[clientId]` + `GET /api/analytics/[clientId]/ratios` (seri bulanan, neraca, rasio, **trendArrays**, **scoring `lib/financial-health.ts`**, **pnlBreakdown**). **Task #23 (analytics off-mock A–E) selesai 2026-07-12.** Semantic-layer yang dulu dianggap blocker ternyata TIDAK diperlukan — klasifikasi berbasis kata kunci `subKelompok`/`classCf` (`lib/financial-agg.ts`) cukup
- ✅ Compare Neraca (`GET /api/analytics/[clientId]/neraca-compare` + section di /analytics) — realisasi partial item `/compare` (2026-07-13); compare P&L belum diminta

### Phase 3 — AI Integration
- ✅ 3.1 Gemini PDF Extraction — `@google/genai` + `gemini-3.5-flash`, divalidasi vs 3 PDF asli
- ⏳ 3.2 COA Auto-Mapping AI (Gemini fuzzy) — belum dimulai (sengaja; matching deterministik sudah cukup utk klien penamaan-identik)

### Phase 4 — Operational Module
- ⏳ Belum dimulai (sengaja) — menunggu loop inti tervalidasi manual dengan data nyata

### Next Sprint
Loop inti (upload → OCR → review → mapping → dashboard → analytics) **sudah lepas dari mock sepenuhnya**. Dua item "Next Sprint" lama (1. persist review actions, 2. Financial Data API) **dua-duanya sudah selesai**. Fokus berikutnya bukan fitur baru, tapi **validasi manual end-to-end dengan data nyata** sebelum lanjut.

**Sengaja ditunda sampai loop inti tervalidasi manual:**
- Compare P&L (padanan Compare Neraca untuk Laba Rugi) — belum diminta; Compare Neraca sendiri sudah ✅ 2026-07-13
- 3.2 COA Auto-Mapping AI (Gemini fuzzy) — untuk klien yang penamaan akunnya berbeda dari Master COA
- Phase 4 Operational Module (inventory / stock movement / COGS reconciliation)

**Catatan validasi (kondisi DB saat ini).** Ketiga klien baru punya laporan **Laba Rugi** — belum ada Neraca/Arus Kas ter-mapping. Konsekuensinya:
- Dashboard: KPI/revenue/P&L/expense breakdown tampil; Balance-Sheet-Health butuh Neraca, Cashflow-Waterfall butuh Arus Kas.
- Analytics: menampilkan **empty-state yang benar** sampai ada Neraca ter-mapping (rasio butuh neraca); trend & alert butuh **≥2 periode**.
Untuk menguji Analytics penuh: upload + map ≥1 Neraca (idealnya 2+ periode) untuk satu klien.

**Catatan operasional:** `GEMINI_API_KEY` masih **free tier (5 req/menit)** — cukup 1 upload (≤3 file); pemakaian rutin butuh billing berbayar (lihat `.env.example`). Cocok-angka-real Dashboard/Analytics vs PDF asli masih tertunda karena 503 high-demand di free tier.

**Dev fixture.** `pnpm db:seed:dev` (`lib/db/seed-dev.ts`) mengisi Master COA + 1–2 periode laporan berbeda per klien; idempotent, tidak menyentuh `seed.ts`. ⚠️ **DESTRUKTIF** untuk 3 klien seed (menghapus reports/COA mereka) — jangan jalankan tanpa sengaja.