# NgitungID BI — Development Roadmap

**Last Updated:** 2026-06-29
**Current Phase:** Phase 1 — Frontend Foundation  
**Stack:** Next.js App Router · TypeScript · Tailwind CSS v4 · shadcn/ui · PostgreSQL · Gemini API

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

### 1.4 COA Mapping Page (Page 3)
- ✅ Session context bar — client, periode, report type, progress bar
- ✅ Unmapped COA cards — raw name, confidence badge, amount, card state (amber/lilac/lime)
- ✅ AI suggestion hint — lilac badge with suggested Master COA per item
- ✅ Searchable Master COA dropdown — grouped by category, kode + name display
- ✅ Card state transitions — dashed amber → dashed lilac (AI suggest) → solid lime (mapped)
- ✅ Auto-matched collapsible table — 21 items, confidence colors, read-only
- ✅ Sticky action bar — progress message, save button (disabled until all mapped)
- ✅ Save handler stub — console.log, TODO: POST to /api/reports/[id]/mapping

### 1.5 Dashboard Page (Page 4)
- ✅ KPI cards — Total Revenue, Net Profit, Gross Margin, Net Margin with radial ring visuals (Recharts RadialBarChart, Flux-inspired)
- ✅ Revenue trend chart — Recharts AreaChart, gradient fill, custom tooltip, handles null future months
- ✅ Net Profit Margin chart — Recharts LineChart, lilac accent, reference benchmark line
- ✅ Expense Breakdown donut — Recharts PieChart with center total label, legend with percentages
- ✅ Period filter dropdown — mock UI (Semua Periode, Q1, Q2, 6 Bulan Terakhir)
- ✅ Quick insights row — MoM revenue/profit comparison with trend arrows
- ✅ Client context integration — uses activeClient from global context, useRequireClient guard

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

---

## Phase 2 — Backend & Database

### 2.1 Database Schema
- ⏳ PostgreSQL setup
- ⏳ clients table
- ⏳ master_coa table
- ⏳ financial_reports table
- ⏳ report_line_items table
- ⏳ coa_mapping_history table
- ⏳ Drizzle ORM or Prisma setup

### 2.2 Authentication (RBAC)
- ⏳ NextAuth.js setup
- ⏳ Admin role — full access
- ⏳ User (client) role — dashboard only
- ⏳ Middleware route protection

### 2.3 Client Onboarding API
- ⏳ POST /api/clients — create new client
- ⏳ POST /api/clients/[id]/coa — import master COA from Excel
- ⏳ GET /api/clients/[id]/coa — list master COA

### 2.4 Upload & Extraction API
- ⏳ POST /api/upload/csv — parse CSV with PapaParse
- ⏳ POST /api/upload/excel — convert to CSV, parse
- ⏳ POST /api/upload/pdf — trigger Gemini extraction pipeline
- ⏳ GET /api/reports/[id]/status — polling endpoint for extraction progress

### 2.5 COA Matching Engine
- ⏳ Exact match algorithm
- ⏳ Fuzzy match with history boost (coa_mapping_history)
- ⏳ POST /api/reports/[id]/mapping — confirm line item mapping

### 2.6 Financial Data API
- ⏳ GET /api/dashboard/[clientId] — aggregated metrics
- ⏳ GET /api/analytics/[clientId]/ratios — financial health ratios
- ⏳ GET /api/reports/[clientId]/compare — period comparison

---

## Phase 3 — AI Integration

### 3.1 Gemini PDF Extraction
- ⏳ Gemini API setup and auth
- ⏳ PnL extraction prompt — line items, amounts, categories
- ⏳ Balance sheet extraction prompt — assets, liabilities, equity
- ⏳ Cash flow extraction prompt — operating/investing/financing detail
- ⏳ Confidence scoring per extracted line item
- ⏳ Header/total row filtering (ignore subtotals)

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

---

## Current Status
**Phase 1 Frontend: 95% Complete**

✅ All 5 pages implemented (Upload, Extraction Review, COA Mapping, Dashboard, Analytics)

### Remaining Phase 1 Work
- ⏳ Real file upload flow (connect stubs to API routes) — `POST /api/upload/{csv|excel|pdf}`
- ⏳ API integration for financial data (replace mock data) — `GET /api/analytics/{clientId}/monthly`, `/balance-sheet`, `/coa-breakdown`

### Next Sprint
Begin Phase 2 — Backend & Database setup (PostgreSQL, authentication, API endpoints)