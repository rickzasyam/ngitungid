# Prompt untuk Claude Code — Halaman Analytics NgitungID BI

> **Konteks:** Ini adalah prompt siap pakai untuk Claude Code guna mengimplementasikan halaman Analytics pada aplikasi NgitungID Business Intelligence. File `Analytics.dc.html` di folder ini adalah **referensi desain high-fidelity** — bukan kode produksi. Tugasmu adalah merekreasinya di codebase React/Next.js yang sudah ada, mengikuti pola, komponen, dan design system yang berlaku.

---

## Instruksi untuk Claude Code

Saya ingin kamu membangun halaman **Analytics** untuk aplikasi NgitungID BI. Halaman ini adalah dashboard analisis keuangan mendalam untuk satu klien UMKM. Buka file `Analytics.dc.html` di folder ini sebagai visual reference.

Berikut spesifikasi lengkap yang harus kamu implementasikan:

---

## 1. Layout Utama

```
┌─────────────────────────────────────────────────────┐
│  SIDEBAR (236px, bg #1a1a1a)  │  MAIN CONTENT       │
│                               │  (flex-1, bg white, │
│  Logo NgitungID BI            │   border-radius 22px,│
│  Nav items (vertikal)         │   di dalam padding   │
│  Client card (bawah)          │   10px dari edge)    │
│                               │                      │
│                               │  Header (sticky)     │
│                               │  ─────────────────   │
│                               │  Scrollable body     │
│                               │  (bg #f3f4f6)        │
└─────────────────────────────────────────────────────┘
```

**Layout:** `display: flex; height: 100vh; width: 100vw; overflow: hidden`

### Sidebar
- Width: `236px`, background: `#1a1a1a`, `flex-shrink: 0`
- Border kanan: `1px solid rgba(255,255,255,0.05)`
- **Logo area** (padding `22px 16px 14px`): Logo box `34×34px` bg `#c0ff33` border-radius `10px`, huruf "N" bold hitam 15px. Teks "NgitungID BI" putih 13px bold + subtitle "Financial Analytics" `rgba(255,255,255,0.35)` 10px.
- **Nav items** (padding `4px 10px`, gap `1px`): setiap item `display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:12px`
  - Inactive: color `rgba(255,255,255,0.5)`
  - **Active (Analytics):** background `#c0ff33`, icon stroke `#1a1a1a`, teks `#1a1a1a` font-weight 600
  - Item "Operational": disabled, color `rgba(255,255,255,0.2)`, badge "SOON" border `rgba(255,255,255,0.12)`
  - Item "Upload": badge bulat `17×17px` bg `#c0ff33` angka `#1a1a1a`
- **Client card** (padding `12px 10px`): card inner bg `rgba(255,255,255,0.05)` border-radius `14px`, nama klien putih 13px bold, progress bar tinggi 3px bg `rgba(255,255,255,0.08)` fill `#c0ff33`

### Main Content
- Padding: `10px` (di luar card putih)
- Card putih: `border-radius: 22px; box-shadow: 0 8px 40px rgba(0,0,0,0.45); display:flex; flex-direction:column`
- **Header** (padding `15px 22px`, border-bottom `1px solid #f0f0f0`): judul "Analytics" 18px bold `#1f2430`, subtitle 11px `#6b7280`, period tabs di kanan
- **Scrollable body**: `flex:1; overflow-y:auto; background:#f3f4f6`
  - Inner container: `padding:18px; display:flex; flex-direction:column; gap:16px; max-width:1520px; margin:0 auto`

---

## 2. State Management

```typescript
interface AnalyticsState {
  period: 'H1' | 'Q1' | 'Q2' | 'custom'
  cStart: number        // index bulan (0–5) untuk custom range
  cEnd: number          // index bulan (0–5) untuk custom range
  showCustom: boolean   // tampilkan dropdown custom date picker
  drawer: string | null // key metric/dimension yang sedang dibuka di drawer
  stmtView: 'bulanan' | 'kuartalan' | 'ytd'
  stmtMode: 'nominal' | 'pct'
  expanded: Record<string, boolean> // baris P&L yang di-expand (key: 'rev'|'hpp'|'opex')
}
```

---

## 3. Data & Kalkulasi

### Data Bulanan (mock — nanti diganti API)

```typescript
const MONTHLY_DATA = [
  { m: 'Jan', rev: 485086931, np: 127635672, gp: 284632728, exp: 153404036 },
  { m: 'Feb', rev: 512340000, np: 141200000, gp: 298500000, exp: 157300000 },
  { m: 'Mar', rev: 498750000, np: 118900000, gp: 275600000, exp: 156700000 },
  { m: 'Apr', rev: 567890000, np: 165400000, gp: 320100000, exp: 154700000 },
  { m: 'Mei', rev: 601230000, np: 178300000, gp: 342800000, exp: 164500000 },
  { m: 'Jun', rev: 589450000, np: 169800000, gp: 335200000, exp: 165400000 },
]
```

### Data Neraca (Balance Sheet)

```typescript
const BALANCE_SHEET = {
  aktivaLancar:  1397767344,
  hutangLancar:   42142100,
  persediaan:   1214633693,
  kas:            75254490,
  piutang:        66794049,
  totalModal:   1419315950,
  totalAset:    1466658050,
}
// turunan:
// totalHutang = totalAset - totalModal
// workingCapital = aktivaLancar - hutangLancar
```

### Period Config

```typescript
const PERIOD_MAP = {
  H1: { idx: [0,1,2,3,4,5], label: 'H1 2026', days: 181, tot: 'H1' },
  Q1: { idx: [0,1,2],       label: 'Q1 2026', days: 90,  tot: 'Q1' },
  Q2: { idx: [3,4,5],       label: 'Q2 2026', days: 91,  tot: 'Q2' },
}
// Custom: idx = range dari cStart hingga cEnd (inklusif), days = idx.length * 30.4
```

### Turunan Aggregate (dari periode yang dipilih)

```typescript
const totRev  = sum('rev')           // total pendapatan
const totNP   = sum('np')            // total laba bersih
const totGP   = sum('gp')            // total laba kotor
const totExp  = sum('exp')           // total beban operasional
const totHPP  = totRev - totGP       // harga pokok penjualan
const totOI   = totGP - totExp       // laba operasi
```

### Rasio Keuangan

```typescript
// Likuiditas
const cr       = BS.aktivaLancar / BS.hutangLancar                    // Current Ratio
const qr       = (BS.aktivaLancar - BS.persediaan) / BS.hutangLancar  // Quick Ratio
const cashR    = BS.kas / BS.hutangLancar                              // Cash Ratio
const der      = totalHutang / BS.totalModal                           // Debt-to-Equity
const wc       = BS.aktivaLancar - BS.hutangLancar                    // Working Capital

// Profitabilitas
const gpm      = totGP / totRev * 100
const npm      = totNP / totRev * 100
const opm      = totOI / totRev * 100
const roe      = totNP / BS.totalModal * 100
const roa      = totNP / BS.totalAset * 100

// Efisiensi — PENTING: DIO & Inventory Turnover berbasis Pendapatan, bukan HPP
const dso      = BS.piutang / totRev * pc.days
const dio      = BS.persediaan * pc.days / totRev          // basis: pendapatan
const dpo      = BS.hutangLancar * pc.days / totHPP
const invTurn  = (totRev / BS.persediaan) * (365 / pc.days)  // basis: pendapatan
const assetTurn = (totRev / BS.totalAset) * (365 / pc.days)
const ccc      = dio + dso - dpo
```

### Sparkline Arrays (6 titik per metrik)

```typescript
// Per-bulan dari MONTHLY_DATA:
revArr   = monthly.map(d => d.rev)
gpArr    = monthly.map(d => d.gp)
npArr    = monthly.map(d => d.np)
gpmArr   = monthly.map(d => d.gp / d.rev * 100)
npmArr   = monthly.map(d => d.np / d.rev * 100)
opmArr   = monthly.map(d => (d.gp - d.exp) / d.rev * 100)
roeArr   = monthly.map(d => d.np * 12 / BS.totalModal * 100)
roaArr   = monthly.map(d => d.np * 12 / BS.totalAset * 100)
dsoArr   = monthly.map(d => BS.piutang / (d.rev * 12) * 365)
dioArr   = monthly.map(d => BS.persediaan / (d.rev * 12) * 365)  // basis: pendapatan
dpoArr   = monthly.map(d => BS.hutangLancar / ((d.rev - d.gp) * 12) * 365)
invArr   = monthly.map(d => d.rev * 12 / BS.persediaan)           // basis: pendapatan
atArr    = monthly.map(d => d.rev * 12 / BS.totalAset)
cccArr   = monthly.map((_, i) => dioArr[i] + dsoArr[i] - dpoArr[i])

// Untuk rasio neraca (statis sepanjang waktu), gunakan fungsi sintetis:
// synth(end, lift=0.84): simulasikan tren naik menuju nilai end
// synthDown(end, start): simulasikan tren turun dari start ke end
```

---

## 4. Format Angka (Bahasa Indonesia)

```typescript
// Separator desimal: koma (,) — BUKAN titik
// Separator ribuan: titik (.) — BUKAN koma

const fmtRp = (v: number): string => {
  const a = Math.abs(v)
  if (a >= 1e9) return 'Rp ' + (v/1e9).toFixed(2).replace('.', ',') + 'M'
  if (a >= 1e6) return 'Rp ' + Math.round(v/1e6) + 'jt'
  if (a >= 1e3) return 'Rp ' + Math.round(v/1e3) + 'rb'
  return 'Rp ' + Math.round(v)
}
// contoh: 3254746931 → "Rp 3,25M" | 127635672 → "Rp 128jt"

const fmtFull = (v: number): string =>
  'Rp ' + Math.round(v).toLocaleString('id-ID')
// contoh: 1214633693 → "Rp 1.214.633.693"

const fmtPct = (v: number, d=1): string =>
  v.toFixed(d).replace('.', ',') + '%'
// contoh: 27.7 → "27,7%"

const fmtRatio = (v: number): string =>
  v.toFixed(2).replace('.', ',')
// contoh: 33.16 → "33,16"

const fmtDays = (v: number): string => Math.round(v) + ' hari'
const fmtX    = (v: number): string => v.toFixed(2).replace('.', ',') + '×'
```

---

## 5. Color System (Status Tone)

```typescript
const TONES = {
  sehat:     { fg: '#15803d', bg: '#dcfce7', dot: '#16a34a', bar: '#16a34a' },
  perhatian: { fg: '#b45309', bg: '#fef3c7', dot: '#d97706', bar: '#f59e0b' },
  risiko:    { fg: '#b91c1c', bg: '#fee2e2', dot: '#dc2626', bar: '#ef4444' },
  netral:    { fg: '#475569', bg: '#eef2f7', dot: '#64748b', bar: '#64748b' },
  info:      { fg: '#1d4ed8', bg: '#dbeafe', dot: '#2563eb', bar: '#3b82f6' },
}
```

**Pill component** (status badge):
```
fontSize: 10, fontWeight: 700, color: tone.fg, background: tone.bg
padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap'
```

---

## 6. Komponen: Period Tabs (Header kanan)

Segmented control dengan 4 opsi: `H1 2026 | Q1 | Q2 | Custom`

- Container: `background: #f3f4f6; padding: 3px; borderRadius: 11px`
- Tab aktif: `background: white; fontWeight: 700; color: #1f2430; boxShadow: 0 1px 3px rgba(0,0,0,0.1)`
- Tab inactive: `background: transparent; fontWeight: 500; color: #6b7280`
- Tab "Custom": punya ikon kalender (Lucide `Calendar`) di kiri

**Custom Date Dropdown** (muncul di bawah tab "Custom"):
- Posisi absolute, `top: calc(100% + 8px); right: 0; zIndex: 50`
- Background white, `borderRadius: 13px; boxShadow: 0 12px 40px rgba(0,0,0,0.18); padding: 14px; width: 240px`
- 2 select dropdown (Dari / Sampai) dengan options Jan–Jun 2026
- Tombol "Terapkan" lebar penuh, bg `#1f2430`, teks putih

---

## 7. Section: Executive Summary Band

Layout `grid; gridTemplateColumns: minmax(280px, 1.15fr) minmax(300px, 1fr); gap: 14px`

### Panel Kiri (dark, gradient `#202024 → #2a2a30`, border-radius 18px, padding 18px)

**Baris atas — Score Ring + Insight:**
- Ring: `width: 104px; height: 104px; borderRadius: 50%`
  - Background: `conic-gradient(#c0ff33 ${score * 3.6}deg, rgba(255,255,255,0.1) 0deg)`
  - Inner circle: `width: 84px; height: 84px; background: #202024`
  - Angka skor: 30px bold putih, teks "/100" 10px `rgba(255,255,255,0.4)`
  - Klik → buka drawer `'dim:overview'`
- Insight text area:
  - Label "SKOR KESEHATAN KEUANGAN" 11px, `rgba(255,255,255,0.45)`, letter-spacing 0.3px
  - Status "● Keuangan Sehat" 15px bold `#c0ff33`
  - Narasi 11px `rgba(255,255,255,0.7)` line-height 1.5

**Baris bawah — 3 KPI mini cards** (`display: flex; gap: 10px`):
- Setiap card: `flex:1; background: rgba(255,255,255,0.05); borderRadius: 11px; padding: 10px 12px`
- Label 10px `rgba(255,255,255,0.4)`, nilai 18px bold putih
- Cards: Laba Bersih (→ drawer `'np'`), Net Margin (→ `'npm'`), Posisi Kas (→ `'cash'`)

### Panel Kanan (flex column, gap 10px)

**Baris atas — 2 KPI cards** (white, border 1px `#ececec`, border-radius 13px):
- `flex: 1 1 0; padding: 13px 15px`
- `borderTop: 3px solid {tone.bar}` (warna sesuai tone metrik)
- Label 10.5px `#6b7280` bold, nilai 24px bold `#1f2430`, sub-label 10px `#9ca3af`
- Cards: Pendapatan (tone: `info`), Laba Kotor (tone: `sehat`)

**Top 3 Alerts card** (white, border-radius 14px, padding 12px 14px, flex:1):
- Judul "Top 3 Alerts" 11px bold `#1f2430`
- Setiap alert item: klik → buka drawer metrik terkait
  - Background sesuai severity
  - Dot `7×7px` bulat sesuai severity
  - Badge severity (UPPERCASE 9px bold) + judul 11px bold
  - Deskripsi 10.5px `#6b7280`
  - Chevron `›` di kanan

**Severity colors:**
```typescript
const SEVERITY = {
  critical: { label: 'Kritis',    bg: '#fee2e2', fg: '#b91c1c', dot: '#dc2626' },
  warning:  { label: 'Peringatan',bg: '#fef3c7', fg: '#b45309', dot: '#d97706' },
  info:     { label: 'Info',      bg: '#dbeafe', fg: '#1d4ed8', dot: '#2563eb' },
  review:   { label: 'Tinjau',    bg: '#eef2f7', fg: '#475569', dot: '#64748b' },
}
```

**Default alerts (dihitung dari data):**
1. `warning` — "DIO 68 hari di atas benchmark" → metric `'dio'`
2. `info`    — "Profitabilitas sangat baik" → metric `'roe'`
3. `review`  — "Current Ratio 33,16 terlalu tinggi" → metric `'cr'`

---

## 8. Section: Performa Keuangan

**5 KPI Cards** dalam `grid; gridTemplateColumns: repeat(5, 1fr); gap: 12px`

Setiap card:
- `padding: 14px; borderRadius: 13px; background: #fafafa; border: 1px solid #efefef`
- Hover: `background: white; boxShadow: 0 4px 14px rgba(0,0,0,0.07); transform: translateY(-1px)`
- Klik → buka drawer metrik
- Isi (atas ke bawah):
  1. Row: label (10.5px 600 `#6b7280`) + dot status (`6×6px` bulat, warna `tone.dot`)
  2. Nilai utama: 22px bold `#1f2430` letter-spacing -0.5px
  3. Row bawah: delta MoM (kiri) + sparkline (kanan, `78×26px`)

**Delta MoM:**
- Hitung: `(currentMonth - prevMonth) / |prevMonth| * 100`
- Naik + baik → warna `sehat.fg`, turun + buruk → `risiko.fg`
- Ikon chevron atas/bawah + persentase 11px bold
- Label "MoM" di bawah, 9px `#9ca3af`

**5 Cards:** Pendapatan (`info`), Laba Kotor (`sehat`), Laba Bersih (`sehat`), Gross Margin (`sehat`), Net Margin (`sehat`)

---

## 9. Section: Financial Health Summary (dark panel)

Background `#202024`, border-radius 18px, padding 18px.

**Header:** "Financial Health Summary" 13px bold putih + "Skor 82/100" 11px `rgba(255,255,255,0.5)` di kanan.

**Grid 2×2** untuk 4 dimensi, `gap: 14px 22px`:

```typescript
const DIMENSIONS = {
  likuiditas:    { label: 'Likuiditas',     score: 95, tone: 'info',      status: 'Sangat Tinggi',  metrics: ['cr','qr','cash','wc'] },
  profitabilitas:{ label: 'Profitabilitas', score: 88, tone: 'sehat',     status: 'Sangat Baik',    metrics: ['roe','roa','gpm','npm','opm'] },
  leverage:      { label: 'Leverage',       score: 98, tone: 'sehat',     status: 'Konservatif',    metrics: ['der','wc'] },
  efisiensi:     { label: 'Efisiensi',      score: 60, tone: 'perhatian', status: 'Perlu Perhatian',metrics: ['dio','dso','dpo','invturn','assetturn','ccc'] },
}
```

Setiap dimensi row:
- Label bold putih 12.5px + status pill (dengan bg/fg dari tone)
- Angka skor di kanan (13px bold, `tone.bar`)
- Progress bar: `height: 6px; background: rgba(255,255,255,0.1); fill: tone.bar` sesuai score%
- Alasan/summary 10px `rgba(255,255,255,0.4)` line-height 1.4
- Klik seluruh row → buka drawer `'dim:likuiditas'` dst.

---

## 10. Section: Ratio Cards (Likuiditas, Profitabilitas, Efisiensi)

Setiap section punya header (judul, subtitle, "Klik kartu untuk detail →") + grid kartu.

**Grid:**
- Likuiditas: `repeat(3, 1fr)` — kartu: `cr, qr, cash, der, wc, ccc`
- Profitabilitas: `repeat(3, 1fr)` — kartu: `roe, roa, gpm, npm, opm`
- Efisiensi: `repeat(3, 1fr)` — kartu: `dso, dio, dpo, invturn, assetturn, ccc` + warning banner DIO di bawah

**Ratio Card anatomy:**
```
padding: 15px, borderRadius: 13px
background: #fafafa, border: 1px solid #efefef
borderLeft: 3px solid {tone.bar}      ← aksen kiri berwarna
hover: background white + boxShadow
klik → buka drawer

├── [label 11px 600 #6b7280]          [Pill status]
├── [nilai 26px bold #1f2430]         [sparkline 64×22px]
├── ─── divider 1px #eee ───
├── [formula monospace 9.5px #9ca3af]
└── [Benchmark X. Interpretasi singkat...]
     └── "Benchmark X." → bold tone.fg; sisa teks 10px #6b7280
```

**DIO Warning Banner** (bawah section Efisiensi):
- `background: #fef3c7; border: 1px solid rgba(217,119,6,0.2); borderRadius: 12px; padding: 12px 14px`
- Ikon ⚠ + teks bold "Persediaan perlu perhatian." + narasi + "Lihat rekomendasi →" underline
- Klik → buka drawer `'dio'`

---

## 11. Section: Detail Laba Rugi

### Toggle Controls (kanan header)

Dua segmented control berdampingan:
1. **View:** `Bulanan | Kuartalan | YTD`
2. **Mode:** `Nominal | % Pendapatan`

Style segmented: container `background: #f3f4f6; padding: 3px; borderRadius: 9px`; tab aktif `background: white; fontWeight: 700; boxShadow: 0 1px 3px rgba(0,0,0,0.1)`

### Logika Kolom Tabel

```typescript
// stmtView === 'bulanan': kolom = nama bulan dari periode terpilih
// stmtView === 'kuartalan':
//   - H1 → 2 kolom (Q1, Q2)
//   - Q1 → 1 kolom (Q1)
//   - Q2 → 1 kolom (Q2)
// stmtView === 'ytd': kolom = bulan kumulatif (Jan, Jan+Feb, dst.)
// Selalu ada kolom fixed di kanan: "Total {pc.tot}" dengan background #fafafa, border-left 2px solid #efefef
```

### Baris P&L

```typescript
const ROW_DEFS = [
  { key: 'rev',  label: 'Pendapatan',         accent: '#3b82f6', bold: true,  expandable: true,  get: c => c.rev,
    sub: [['Produk', 0.62], ['Channel Online', 0.26], ['Customer B2B', 0.12]] },
  { key: 'hpp',  label: 'HPP',                muted: true,       neg: true,   expandable: true,  get: c => c.hpp,
    sub: [['Bahan Baku', 0.58], ['Tenaga Kerja Langsung', 0.27], ['Overhead Produksi', 0.15]] },
  { key: 'gp',   label: 'Laba Kotor',         bold: true,        divider: true, get: c => c.gp },
  { key: 'gpmr', label: 'Gross Margin',       pct: true,         get: c => c.gp, ofRev: true },
  { key: 'opex', label: 'Beban Operasional',  muted: true,       neg: true,   expandable: true,  get: c => c.opex,
    sub: [['Marketing', 0.34], ['Gaji & SDM', 0.46], ['Operasional', 0.20]] },
  { key: 'np',   label: 'Laba Bersih',        accent: '#16a34a', bold: true,  get: c => c.np },
  { key: 'npmr', label: 'Net Margin',         pct: true,         get: c => c.np, ofRev: true },
]
```

**Row styling rules:**
- `bold + !pct` → background `#fcfcfd`
- `pct` → italic, color `#6b7280`, fontWeight 500
- `muted` → color `#9ca3af`
- `accent` → `borderLeft: 3px solid accent`; jika tidak punya accent → `borderLeft: 3px solid transparent`
- `divider` → `borderBottom: 2px solid #eee`
- `neg` → tampilkan tanda "−" sebelum nilai
- `expandable` → ada ikon ▶ di kiri label, rotate 90° saat open; klik toggle expand

**Expand/collapse sub-baris:**
- Sub-baris: background `#f7f8fa`, indent kiri 30px, prefix "└ {nama}  {pct}%"
- Nilai sub = `rowTotal * porsi`
- Kolom Δ dan Tren kosong di sub-baris

**Kolom Δ (delta):**
- Perubahan antara 2 kolom terakhir (atau Q1 vs Q2 di kuartalan)
- Jika hanya 1 kolom → tampilkan "—"
- Warna sesuai arah & jenis metrik (neg row: naik = buruk)

**Kolom Tren:**
- Sparkline `56×18px` tanpa fill untuk `rev` (warna `#3b82f6`) dan `np` (warna `#16a34a`)
- Baris lain: titik "·" warna `#e5e7eb`

**Mode % Pendapatan:**
- Setiap nilai nominal diganti dengan persentase terhadap pendapatan kolom tersebut
- Baris `pct` tetap tampil sebagai persentase

**Header tabel:**
- Kolom akun (left align, minWidth 160px)
- Kolom bulan/kuartal (right align)
- Kolom Δ (right align, borderLeft 1px `#f0f0f0`)
- Kolom Tren (width 70px)
- Kolom Total (background `#f3f4f6`, borderLeft 2px `#efefef`, right align)
- Background header: `#fafafa`, fontSize 10.5px, fontWeight 600, color `#6b7280`, borderBottom `2px solid #efefef`

---

## 12. Metric Registry — Data Lengkap Drawer

Setiap metrik punya objek data berikut. Gunakan ini untuk mengisi drawer:

```typescript
interface MetricData {
  grp: string               // grup: 'Performa' | 'Likuiditas' | 'Profitabilitas' | 'Efisiensi'
  label: string             // nama metrik
  value: string             // nilai terformat
  tone: ToneKey             // warna status
  status: string            // label status (tampil di pill)
  benchmark: string         // string benchmark
  formula: string           // rumus (tampil monospace)
  comp: [string, string][]  // komponen: [[label, nilai], ...]
  trend: number[]           // 6 titik untuk bar chart & sparkline
  tUnit: 'money'|'pct'|'ratio'|'days'|'x'
  interp: string            // interpretasi naratif
  recos: string[]           // rekomendasi aksi (list bernomor)
}
```

**Lengkap per metrik:**

| Key | Label | Benchmark | Formula | Status |
|-----|-------|-----------|---------|--------|
| `rev` | Pendapatan | Tren positif | Σ Penjualan periode | Tumbuh (info) |
| `gp` | Laba Kotor | GPM > 50% | Pendapatan − HPP | Sehat |
| `np` | Laba Bersih | NPM > 10% | Laba Kotor − Opex − Pajak | Sehat |
| `gpm` | Gross Margin | > 50% | Laba Kotor ÷ Pendapatan | Sehat |
| `npm` | Net Margin | > 10% | Laba Bersih ÷ Pendapatan | Sangat Baik |
| `cr` | Current Ratio | 1,5 – 3,0 | Aktiva Lancar ÷ Hutang Lancar | Terlalu Tinggi (info) |
| `qr` | Quick Ratio | > 1,0 | (Aktiva Lancar − Persediaan) ÷ Hutang Lancar | Sehat |
| `cash` | Cash Ratio | > 0,5 | Kas & Setara Kas ÷ Hutang Lancar | Sehat |
| `der` | Debt-to-Equity | < 1,0 | Total Hutang ÷ Total Modal | Konservatif (netral) |
| `wc` | Modal Kerja | Positif | Aktiva Lancar − Hutang Lancar | Surplus Besar (info) |
| `roe` | Return on Equity | > 15% | Laba Bersih ÷ Total Modal | Sangat Baik |
| `roa` | Return on Assets | > 5% | Laba Bersih ÷ Total Aset | Baik |
| `opm` | Operating Margin | > 15% | Laba Operasi ÷ Pendapatan | Sehat |
| `dso` | DSO | < 30 hari | Piutang ÷ Pendapatan × Hari | Sangat Baik |
| `dio` | DIO | < 60 hari | Persediaan ÷ Pendapatan × Hari | Perlu Perhatian (perhatian) |
| `dpo` | DPO | 30–60 hari | Hutang Usaha ÷ HPP × Hari | Pendek (netral) |
| `invturn` | Inventory Turnover | > 6× | Pendapatan ÷ Persediaan (disetahunkan) | Rendah (perhatian) |
| `assetturn` | Asset Turnover | > 1,0 | Pendapatan ÷ Total Aset (disetahunkan) | Baik |
| `ccc` | Cash Conversion Cycle | Semakin pendek | DIO + DSO − DPO | Perlu Perhatian (perhatian) |

---

## 13. Komponen: Detail Drawer

Drawer muncul dari kanan layar. Terdapat 3 jenis isi:

### A. Drawer `'dim:overview'` — Overview semua dimensi

- Ring skor keseluruhan (74px, conic-gradient hijau)
- Angka 22px bold + "/100" + label "Keuangan Sehat"
- 4 blok dimensi yang bisa diklik (masing-masing buka drawer dimensi)
- Per blok: nama + skor, progress bar 5px, alasan/summary

### B. Drawer `'dim:{key}'` — Satu dimensi

- Judul dimensi + pill status
- Ringkasan alasan
- Card skor (angka besar + progress bar 8px)
- List metrik pendukung: setiap item klik → buka drawer metrik; tampilkan label, benchmark, nilai, pill

### C. Drawer metrik (default)

Layout dari atas ke bawah:
1. **Group label** (10.5px uppercase bold, `tone.fg`)
2. **Judul + pill** (21px bold `#1f2430`)
3. **Nilai besar + sparkline** (38px bold letter-spacing -1px, sparkline `130×42px`)
4. **Formula box** (bg `#f3f6fb`, border `#e3eaf3`, monospace 13px)
5. **Komponen Perhitungan** (tabel 2 kolom: label + nilai; divider per baris)
6. **Tren 6 Bulan** (bar chart 6 bar, bg `#fafafa`, borderRadius 11px):
   - Setiap bar: lebar 62%, borderRadius `4px 4px 0 0`
   - Bar terakhir (bulan terkini): `tone.bar` penuh; sisanya `tone.bar + '66'` (40% opacity)
   - Label nilai di bawah bar (9px bold `#475569`) + nama bulan (8.5px `#9ca3af`)
   - Height relatif: `8px + ((v - min) / range) * 38px`
7. **Interpretasi** (bg `tone.bg`, label uppercase, narasi 12.5px `#374151` line-height 1.6)
8. **Rekomendasi Aksi** (list bernomor):
   - Badge angka: `18×18px`, `borderRadius: 6px`, bg `tone.bg`, fg `tone.fg`, fontWeight 800
   - Teks 12.5px `#374151` line-height 1.5

**Wrapper drawer:**
- Overlay: `position: fixed; inset: 0; background: rgba(15,18,25,0.45); zIndex: 1000`
- Klik overlay → tutup drawer
- Panel: `width: min(460px, 92vw); height: 100%` dari kanan
- Background white, padding `22px 24px 40px`, `overflow-y: auto`
- Animasi masuk: `translateX(40px → 0) + opacity 0→1`, durasi `220ms`, easing `cubic-bezier(0.2, 0.8, 0.2, 1)`
- Overlay fade in: `opacity 0→1`, `150ms`
- Tombol close ✕: `30×30px`, `borderRadius: 9px`, border `1px solid #eee`, bg `#fafafa`

---

## 14. Sparkline Component

```typescript
// SVG sparkline dengan line + area fill + dot di titik terakhir
const Sparkline = ({ values, color, width=78, height=26, fill=true }) => {
  const min = Math.min(...values), max = Math.max(...values)
  const range = (max - min) || 1
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 2 - ((v - min) / range) * (height - 4)
  ])
  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`
  const last = points[points.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display:'block',overflow:'visible'}}>
      {fill && <path d={areaPath} fill={color} opacity={0.10} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.3} fill={color} />
    </svg>
  )
}
```

---

## 15. Integrasi API (Ganti Mock Data)

Saat ini semua data adalah mock. Untuk integrasi nyata:

```typescript
// Endpoint yang dibutuhkan:
GET /api/analytics/{clientId}/monthly?year=2026
// Response: MonthlyData[]

GET /api/analytics/{clientId}/balance-sheet?date=2026-06-30
// Response: BalanceSheet

GET /api/analytics/{clientId}/coa-breakdown?period=H1&year=2026
// Response: COABreakdown (untuk expand baris P&L — FITUR PENTING, lihat bawah)
```

### ⭐ FITUR PRIORITAS: COA Breakdown di Baris P&L

Pengguna sangat menyukai fitur expand baris Pendapatan di tabel P&L untuk melihat sub-komponen COA. Ini harus terhubung ke data Chart of Accounts nyata dari sistem upload/COA Mapping.

**Data struktur yang diharapkan:**
```typescript
interface COABreakdown {
  revenue: COAItem[]     // sub-akun pendapatan
  hpp: COAItem[]         // sub-akun HPP
  opex: COAItem[]        // sub-akun beban operasional
}

interface COAItem {
  coaCode: string        // misal "4-1001"
  coaName: string        // misal "Penjualan Produk A"
  amount: number         // nominal per periode
  percentage: number     // % dari total parent
  monthlyAmounts: number[] // 6 titik per bulan (untuk sparkline)
}
```

**Behavior expand (PENTING):**
- Saat baris Pendapatan diklik, tampilkan sub-baris COA nyata (bukan persentase statis)
- Sub-baris style: background `#f7f8fa`, indent 30px dari kiri, prefix "└ {coaCode} {coaName}"
- Nilai per kolom = nominal per bulan/kuartal/ytd sesuai view aktif
- Kolom Total = sum seluruh periode terpilih
- Persen (badge abu) = porsi dari total parent

---

## 16. Sections & Scroll Order

Urutan vertikal dalam scrollable body:

```
1. #sec-exec      — Executive Summary Band
2. #sec-performa  — 5 KPI Performance Cards
3. #sec-skor      — Financial Health Summary (dark)
4. #sec-likuiditas — Ratio Cards Likuiditas
5. #sec-profitabilitas — Ratio Cards Profitabilitas
6. #sec-efisiensi  — Ratio Cards Efisiensi + Warning Banner
7. #sec-detail    — Tabel P&L dengan toggle
```

Setiap section (kecuali exec dan skor) dibungkus card:
```css
background: white;
border-radius: 18px;
padding: 18px 20px;
box-shadow: 0 1px 3px rgba(0,0,0,0.04);
border: 1px solid #ececec;
```

---

## 17. Responsif & Accessibility

- Halaman ini didesain untuk layar desktop ≥ 1280px
- Pada layar < 1280px, scrollbar horizontal muncul di tabel P&L (sudah ada `overflowX: auto`)
- Drawer: `width: min(460px, 92vw)` — sudah adaptive di layar sempit
- Semua elemen klik punya `cursor: pointer`
- Disabled items punya `cursor: not-allowed`

---

## 18. File Referensi

- `Analytics.dc.html` — Desain referensi high-fidelity lengkap (buka di browser)
- `data-schema.json` — Schema tipe data + contoh nilai semua metrik

---

## Checklist Implementasi

- [ ] Layout shell (sidebar + main card)
- [ ] Period tabs + custom date picker
- [ ] State management (period, drawer, stmtView, stmtMode, expanded)
- [ ] Kalkulasi semua rasio keuangan
- [ ] Format angka Bahasa Indonesia (koma desimal, titik ribuan)
- [ ] Executive Summary Band (score ring, KPIs, alerts)
- [ ] Performance KPI Cards (5 kartu + sparkline + delta MoM)
- [ ] Financial Health Summary (dark panel, 4 dimensi)
- [ ] Likuiditas Ratio Cards (6 kartu)
- [ ] Profitabilitas Ratio Cards (5 kartu)
- [ ] Efisiensi Ratio Cards (6 kartu + warning banner)
- [ ] Tabel P&L (toggle view/mode, kolom dinamis, expand row)
- [ ] **COA Breakdown expand dari API** (prioritas)
- [ ] Drawer (3 jenis: overview, dimensi, metrik)
- [ ] Sparkline SVG component
- [ ] Color system / tone mapping
- [ ] Animasi drawer (slide in dari kanan)
