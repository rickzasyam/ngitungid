# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Overview

NgitungID BI is a multi-client Financial Business Intelligence SaaS for Indonesian SMEs
(UMKM). Ricko operates as admin, managing an accounting team that prepares client financial
reports and uploads them to the platform. AI extraction and COA mapping turn raw
uploads into automated financial dashboards for clients.

**Always read `ROADMAP.md` at the project root first**, before starting any task. It is the
source of truth for what's done, what's pending, and what decisions have already been made.
Update it after completing any task.

## Business Flow (read this to understand why each page exists)

```
1. Client Setup
   Admin creates a client, then uploads that client's Master COA (Excel).
   Master COA defines account classification: name, Posisi (Debit/Kredit),
   Kelompok (Laba Rugi / Neraca), Sub Kelompok, Kode, Class CF (Operating/
   Investing/Funding). Example: "Biaya Gaji Karyawan" -> Kelompok: Laba Rugi,
   Class CF: Operating. This is the foundation every later mapping step depends on.

2. Upload (/upload)
   Admin selects a client + period, then uploads 3 separate files:
   Laba Rugi (P&L), Neraca (Balance Sheet), Arus Kas (Cash Flow).
   Formats: PDF, CSV, or Excel, max 25MB each. Kept separate intentionally —
   improves AI extraction accuracy per report type.

3. Extraction (AI processing — not yet built, currently mocked)
   PDF -> Gemini API OCR -> table detection -> parsing -> per-row confidence score.
   CSV/Excel -> parsed directly (MVP priority, higher accuracy).

4. Extraction Review (/extraction-review)
   Split-screen: original PDF (left) vs extracted table (right). Admin edits
   low-confidence rows, rejects wrong ones, confirms the rest.

5. COA Mapping (/coa-mapping)
   Each extracted line item is mapped to the client's Master COA. Card states:
   amber (unmapped) -> lilac (AI suggested) -> lime (mapped). AI suggestions
   improve over time from `coa_mapping_history`.

6. Output — auto-generated after mapping is complete
   Dashboard (/dashboard): KPI cards, revenue trend, P&L overview, expense
   breakdown, balance sheet health, cashflow waterfall, quick insights.
   Analytics (/analytics): Likuiditas / Profitabilitas / Leverage / Efisiensi
   ratios with benchmarks, 0-100 health score, period comparisons, alerts.

Settings (/settings): scoped to whichever client is active in the sidebar
client switcher — Master COA management and Analytics metric visibility are
per-client, NOT global. General platform settings (language, currency format,
timezone) are the exception — those are platform-wide, not per-client.
```

## Roles (RBAC)

- **Admin**: full access — Upload, Extraction Review, COA Mapping, Settings, all clients.
- **User (client)**: read-only — Dashboard + Analytics only. Does not see the extraction/
  mapping process. Not yet implemented (Phase 2).

## Current Status

Phase 1 (Frontend) is nearly complete, built entirely on mock data — no backend exists yet.
Phase 2 (PostgreSQL, Prisma/Drizzle, NextAuth RBAC, API routes) has not started. Do not wire
real data or build backend features unless explicitly asked — check `ROADMAP.md` for the
current phase before assuming scope.

## Tech Stack

Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, PostgreSQL via Neon
+ Drizzle ORM, NextAuth v5, Gemini API. (See `ROADMAP.md` for what's built — much of the
backend described as "not yet started" below is now done.)

Tailwind v4 specifics: configuration lives in `globals.css` via `@theme inline {}`. There is
no `tailwind.config.ts` — do not create one.

## Database Environments (dev vs production)

Data lives in Neon with two branches: **`main`** (production — real client data) and
**`dev`** (daily work, testing, seed, throwaway). `DATABASE_URL` in `.env.local` is the
SINGLE switch every command reads — the app runtime (`lib/db/index.ts`), all `db:*`
drizzle-kit commands (via `drizzle.config.ts`), `db:seed`/`db:seed:dev`, and any
`tsx --env-file=.env.local` throwaway script. There is no per-command safety; the only
thing protecting production is which branch `DATABASE_URL` points at.

**Rules for any session that runs DB commands or throwaway scripts:**
- Development work assumes `.env.local` points at the **dev** branch. Never rely on that
  blindly for a destructive action — if unsure, confirm with Ricko before running.
- NEVER run against production (`main`): `db:seed:dev` (destructive — wipes seed clients'
  reports/COA), `db:seed`, `db:push`, or any throwaway/one-off script.
- Throwaway verification scripts target dev and always clean up after themselves.
- Production schema changes go through `db:generate` + `db:migrate` (reviewed SQL),
  deliberately pointed at `main` — not `db:push`.

**Rahasia & kredensial (aturan Ricko 2026-10-23 — menggantikan larangan lama membaca/mencetak `.env.local`):**
1. **Rahasia DEV boleh dibaca, dipakai, dan ditampilkan bila perlu, tanpa minta izin:** isi `.env.local`, connection
   string branch Neon dev (`ep-rapid-hat-aos7vlb0`), serta `DATABASE_URL` dan `AUTH_SECRET` **Preview** di Vercel.
2. **Rahasia PRODUKSI tetap dilarang tampil di percakapan:** connection string branch main (`ep-small-mode-ao8ouvtp`),
   `AUTH_SECRET` **Production**, dan `GEMINI_API_KEY` selama masih dipakai bersama Production. Kalau perlu dipakai
   (mis. migrasi ke main), ambil lewat alat dan langsung pakai sebagai **variabel lingkungan untuk satu perintah**
   (`DATABASE_URL=... pnpm db:migrate`) — tidak ditulis ke berkas, tidak dicetak. `drizzle.config.ts` tidak menimpa
   variabel lingkungan yang sudah ada dengan isi `.env.local` (terbukti 2026-10-23).
3. **Sebelum memakai `.env.local`, tetap pastikan `DATABASE_URL`-nya mengarah ke `ep-rapid-hat`.** Kalau mengarah ke
   `ep-small-mode`, **berhenti dan lapor** — itu berarti ada yang salah konfigurasi, bukan izin untuk bekerja di main.

Full workflow: see `README.md` § "Database environments".

## Design System (locked — do not deviate)

If you find references to other color values anywhere in this codebase, old prompts, old
personas, or design docs (e.g. `#c0ff33`, `#1a1a1a`, `#a78bfa`), those are deprecated. Use
only the values below as source of truth.

```
Primary Lime:     #daf163   (text on top: #1a1a1a black)
Secondary Lilac:  #bbb3f3   (text on top: #1a1a1a black)
Critical Pink:    #f472b6   (text on top: white)
Canvas bg:        #222124   (Soft Black)
Extended palette: sky #7dd3fc, peach #fdba74, mint #6ee7b7
```

### 3-layer depth pattern (apply on every page)

```
Layer 1 — Canvas:  bg-[#222124]        full-screen background
Layer 2 — Float:   white, rounded-3xl  floating card/shell
Layer 3 — Inset:   #f8f8f8             scrollable content area
```

Reference implementations that are already correct: `app/dashboard/page.tsx` and
`app/upload/page.tsx`. Match this pattern exactly on any page that doesn't have it yet.

### Shape & shadow

- Main cards, modals: `rounded-3xl`
- Buttons, badges, menu items: `rounded-full` or `rounded-2xl`
- Primary floating card shadow: `0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)`
- Secondary card shadow (hover-lift): `0 2px 8px rgba(0,0,0,0.05)` -> hover
  `0 6px 20px rgba(0,0,0,0.10)`

## Known Gotchas (do not repeat these mistakes)

1. **Tailwind v4 strips `@keyframes` declared inside `@layer utilities`.** Always put
   keyframes (`fadeIn`, `slideUp`, `slideInRight`, `scaleIn`, etc.) at the top level of
   `globals.css`, outside any `@layer` block. This previously caused entire card grids to
   render invisible because `opacity: 0` never animated back to 1. Verify after build:
   ```bash
   pnpm build
   grep -l "slideUp" .next/static/chunks/*.css || { echo "GAGAL: @keyframes hilang dari CSS hasil build"; exit 1; }
   ```
   Next 16 menaruh CSS hasil build di `.next/static/chunks/`, bukan `.next/static/css/`.
   Perintah lama menunjuk path yang sudah tidak ada, jadi ia cuma mengembalikan "No such
   file or directory" — lulus atau tidak, tampilannya sama. Bentuk di atas gagal keras di
   kedua mode kegagalan: glob tidak cocok, maupun berkas ada tapi `slideUp` tidak di dalamnya.

2. Use `animation-fill-mode: both`, not just `forwards`, so content doesn't disappear in
   hidden tabs or headless rendering.

3. Accessibility is required, not optional: `role="button"`, `tabIndex`, `aria-label`,
   `onKeyDown` on any non-native interactive element. `focus-visible:ring-2` for keyboard
   navigation. Add `@media (prefers-reduced-motion: reduce)` fallback for all animations.

4. Do not implement hover state with inline `onMouseEnter`/`onMouseLeave` JS — it breaks for
   keyboard focus. Use CSS class-based hover (`.card-hover:hover { ... }` in `globals.css`),
   with a CSS variable per instance if the hover color needs to vary per card.

5. Minimum touch target size is 32-36px, not 20-28px.

6. Hardcoded hex colors should be CSS variables in `globals.css` — one source of truth, not
   scattered across components.

7. **CCC and the health score are computed CLIENT-side, in the same component that holds
   the metric visibility map.** `GET /api/analytics/[clientId]/ratios` returns only 15
   ratios; CCC is derived in `app/analytics/page.tsx` (~`:409`, `dio + dso - dpo`) and
   `assessHealth()` runs right after (~`:426`). The visibility map lives in that same
   component. **Never filter the ratios before computing** — hiding DPO must not change
   CCC, and CCC feeds the health score in two dimensions (likuiditas and efisiensi), so
   filtering early would silently move a client's score because of a display preference.
   There is no process or module boundary preventing this; the only guard is the DPO
   invariance test in `lib/analytics/metric-visibility.test.ts`. Visibility is applied
   **only** at the point where a card is rendered.

8. **Snapshot drizzle untuk migrasi 0006–0009 TIDAK ADA — hasil `db:generate` tidak boleh
   dipercaya begitu saja.** `lib/db/migrations/meta/` hanya berisi snapshot 0000–0005 dan
   0010+, sementara `_journal.json` mendaftarkan 0006–0009 (ditulis tangan, tanpa snapshot).
   Karena drizzle-kit membandingkan `schema.ts` dengan snapshot TERAKHIR yang ada, sesi
   2026-09-15 menerima migrasi 0010 yang membuat ulang `contracts`, `contract_layanan`,
   `layanan`, enum `jenis_kontrak`/`user_language`, kolom preferensi user, bahkan
   `ALTER TYPE user_role ADD VALUE 'finance'` — statement pertamanya pasti gagal di
   database mana pun yang sudah jalan.

   **`0010_journals.sql` sudah DIPANGKAS TANGAN** jadi objek jurnal saja; jangan pernah
   men-generate ulang 0010. `meta/0010_snapshot.json` sengaja dipertahankan karena snapshot
   drizzle berisi keadaan PENUH, bukan delta — kehadirannya memulihkan rantai, dan
   `db:generate` sesudahnya sudah bersih (terbukti: balasan "No schema changes").

   **Sebelum migrasi ke main:** pastikan main sudah berada di 0000–0009, lalu terima 0010
   yang dipangkas ini apa adanya. Setiap kali `schema.ts` berubah, jalankan `pnpm db:generate`
   lalu BACA SQL-nya sebelum `db:migrate` — kalau ia menyebut tabel atau enum yang kamu tahu
   sudah ada, berhenti: snapshotnya melenceng lagi.

9. **JANGAN pernah menjalankan `git checkout` / `git restore` / `git reset` / `git stash` /
   `git clean` pada berkas apa pun tanpa dua langkah ini lebih dulu:** (1) jalankan
   `git diff <berkas>` dan BACA hasilnya, (2) minta izin eksplisit dari Ricko. Kalau
   berkas itu memuat perubahan yang belum di-commit dan bukan buatanmu — **berhenti dan
   tanya.** Jangan menyimpulkan sendiri bahwa perubahan itu aman dibuang.

   Ini lahir dari kejadian nyata (2026-09-15): `git checkout ROADMAP.md` dijalankan untuk
   memecah commit per langkah, dan menghapus suntingan ROADMAP milik Ricko yang belum
   di-commit — catatan lanjutan sesi yang berisi jawaban R4, referensi commit plan, hasil
   `sync` final, dan angka graphify. Isinya kebetulan masih ada di salinan sementara dan
   bisa dipulihkan; kalau tidak, catatan itu hilang tanpa jejak di git mana pun.

   **`git status` di awal sesi tidak cukup** sebagai dasar: ia hanya potret satu saat, dan
   Ricko bisa menyunting berkas kapan saja selagi sesi berjalan. Yang berlaku adalah
   keadaan berkas TEPAT SEBELUM perintahnya dijalankan.

   Untuk memecah pekerjaan jadi beberapa commit, pakai cara yang tidak membuang apa pun:
   `git add <berkas>` per commit, atau `git stash push` HANYA setelah izin diberikan.

## Working Conventions

- **Only Ricko approves. Never write "Approved", "Decisions recorded", or any equivalent
  on your own behalf.** Report what you were told and what you decided to do, but do not
  narrate agreement into existence. If you are told to stop for approval on a specific
  point, stop on that point — even when the rest of the work continues, and even if an
  answer arrives that looks like a preference. Choosing between offered options is not
  the same as being told to proceed; when in doubt, the instruction to stop wins.
- Read `ROADMAP.md` before starting, update it after finishing.
- Don't remove or refactor existing components outside the current task's scope without
  confirming first — components can be disconnected from a page without being deleted (this
  has happened before: a chart component was fully intact but stopped being rendered during
  a polish pass).
- When restructuring a page that has an existing working feature (e.g. Master COA
  management, Analytics metric toggles), move the existing logic into the new structure
  rather than rewriting it from scratch.
- For large or ambiguous UI/visual work, describe the desired outcome and constraints in
  detail rather than pasting exact code — let the implementation decisions follow existing
  patterns already present in the codebase.
- Prefer English for UI chrome/settings labels (e.g. "General", "Analytics Display") unless
  the label is user-facing product copy already established in Indonesian (e.g. "Laba
  Rugi", "Neraca", "Kelola Master COA").

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
