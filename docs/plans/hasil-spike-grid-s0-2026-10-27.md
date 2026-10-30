# Hasil spike S0 — `react-data-grid` 7.0.0-beta.63 (⏸ CP-19, D46)

| | |
|---|---|
| Tanggal | 2026-10-27 |
| Kode spike | branch **`spike/grid-library`** commit `ea6edde` — **tidak di-merge**, dan karena instruksi sesi "push hanya ke `feat/grid-mutasi`", **belum di-push** (lihat "Yang bisa Ricko periksa") |
| Halaman | `/spike-grid` (data sintetis, tidak menyentuh DB/API) |
| Skrip ukur | `spike/ukur-grid.mjs` (Playwright) di branch spike |
| Lingkungan ukur | Kontainer cloud 4 vCPU Intel Xeon, Chromium headless (Playwright 1.63, **render perangkat lunak tanpa GPU**), `next build` + `next start` (produksi). Kolom "4×" = CPU diperlambat 4× lewat CDP sebagai pengganti laptop admin yang lambat. |
| Yang TIDAK diuji | **NVDA** (kontainer Linux, tanpa pembaca layar) — diganti pembacaan pohon aksesibilitas Chromium; uji NVDA asli perlu Ricko (langkah di bawah). Tempel dari aplikasi Excel/Google Sheets asli — diganti teks TSV berbentuk salinan keduanya lewat clipboard sungguhan (`navigator.clipboard` + Ctrl+V). |

## Angka per kriteria

| # | Kriteria MP §5.G S0 | 1× | 4× | Hasil |
|---|---|---|---|---|
| 1 | **20.000 baris** digulir halus | Gulir wajar 10.000 px/dtk (±280 baris/dtk): **59 fps**, p95 frame 16,7 ms, 0 frame > 50 ms. Gulir ekstrem (seluruh 720.000 px dalam 3 dtk): 42 fps, p95 50 ms. Lompat scrollbar ke 5 posisi acak: **20–33 ms** sampai baris tujuan tampil. **0 frame viewport kosong** di semua uji. Baris di DOM tetap 25–26. Heap 14–17 MB. Muat halaman → grid tampil 419–487 ms (membangkitkan 20.000 baris: 13–17 ms). | Wajar: 36 fps, p95 50 ms, 4 frame > 50 ms. Ekstrem: 17 fps. Lompat: 133–183 ms. 0 frame kosong. Muat 1.126 ms. | ✅ |
| 2 | Editor sel **`NominalInput`** (N9) | Ketik `1000000` di sel aktif: `1\|1 → 10\|2 → 100\|3 → 1.000\|5 → 10.000\|6 → 100.000\|7 → 1.000.000\|9` (teks\|posisi kursor) — **kursor selalu di ujung**. Sisip di tengah (Home, →, `2`): `12.000.000`, kursor di 2. Titik = desimal: `12.000.000,5`. Enter → sel `12.000.000,50`. | — | ✅ |
| 3 | Panah, Tab/Shift+Tab, Enter, Esc | Panah 4 arah ✅ · Tab/Shift+Tab ✅ · Enter membuka editor ✅ · Esc membatalkan tanpa mengubah nilai ✅ · Enter menyimpan ✅ · Tab di dalam editor menyimpan + pindah ke kanan ✅ · Ctrl+End ✅ · PageDown ✅ · **Ctrl+Home bawaan ❌** (lihat temuan 2) → ditambal ✅ | — | ✅ dengan tambalan |
| 4 | Tempel **10.000 baris** TSV **< 2 detik** sampai tampil + tervalidasi | Excel (CRLF + sel berkutip berisi baris baru) ke grid kosong: **77–85 ms**. Google Sheets (LF): **68–70 ms**. Menimpa grid 20.000 baris: 63 ms (rantai saldo putus di baris 10.001 terdeteksi). Dengan 1% baris rusak: 41–54 ms (100 baris bergalat). Rincian: belah + terapkan 16–28 ms · validasi per sel + rantai saldo 18–36 ms · render sampai paint 6–21 ms. | 180–333 ms | ✅ (±25× di bawah batas) |
| 5 | Pembaca layar: nama kolom + nilai + status galat | Pohon AX Chromium: grid bernama "Mutasi kas (spike)", `aria-rowcount` = baris + 1, `aria-colcount` 7, 7 `columnheader` bernama. Sel galat yang difokus: `gridcell`, **nama = nilai** ("31/02/2026"), **deskripsi = pesan galat** ("Tanggal tidak terbaca."), `invalid=true`. Sel sah: nama saja. Live region mengumumkan hasil tempel. | — | ⚠️ AX lulus; **NVDA belum diuji** |
| 6 | Tambahan bundle `/mutasi-kas` | `react-data-grid` saja: **61,5 KB min / 23,4 KB gzip** (esbuild, React eksternal). Chunk build spike: 68,7 KB / 26,8 KB gzip (library + kode data spike). CSS: 9,7 KB / 2,4 KB gzip. Dimuat lewat `next/dynamic` (`ssr: false`), jadi **tidak masuk muatan pertama** halaman. Chunk `NominalInput` + `parseCsv` (7,3 KB / 3,3 KB gzip) sudah dipakai `/mutasi-kas` hari ini. | — | ✅ ±26 KB gzip, lazy |

**Cadangan TanStack Virtual tidak dibangun:** tidak ada kriteria yang gagal tanpa bisa diatasi (syarat MP untuk mengulang).

## Temuan — semua sudah ditambal di spike memakai API publik library

1. **Ctrl+V di sel aktif membuka editor** kalau prop `onCellPaste` tidak diisi — seluruh TSV masuk ke SATU sel. Tambalan: `onCellPaste` no-op, tempel sebenarnya di `onPasteCapture` pembungkus (tempel multi-baris memang kode kita, sesuai MP).
2. **Ctrl+Home bawaan pindah ke sel JUDUL** (sticky, selalu terlihat), jadi grid tidak bergulir ke atas. Tambalan: `onCellKeyDown` → `setActivePosition({ idx: 0, rowIdx: 0 }, { shouldFocus: true })`.
3. **Delete/Backspace bawaan membuka editor**, bukan mengosongkan sel seperti spreadsheet. Tambalan: `onCellKeyDown` mengosongkan sel.
4. **Teks galat di dalam sel menggandakan nama sel** (percobaan pertama: span `sr-only` → nama "31/02/2026 Tanggal tidak terbaca."). Tambalan: span `hidden` + `aria-describedby` — nama = nilai, deskripsi = galat. Pola ini yang dibawa ke S9.

## Catatan untuk S6/S9 (bukan penghalang)

- **CSS library hidup di `@layer rdg.*`** yang dideklarasikan sesudah lapisan Tailwind, jadi **mengalahkan utilitas Tailwind** pada sel grid. Gaya grid ditulis sebagai kelas tak berlapis (di `globals.css`, sesuai gotcha #6) — begitu juga di spike.
- **Enter menyimpan lalu tetap di sel yang sama** (Excel: turun satu baris). Perlu diputuskan di S9.
- **Grid kosong tidak punya sel data untuk difokus**; tempel ke grid kosong di spike lewat sel judul. S9 butuh keadaan kosong yang eksplisit ("Klik di sini lalu Ctrl+V").
- Kecepatan tempel bergantung pada **memo validasi per objek baris** (WeakMap). Reducer S6 wajib mempertahankan identitas objek baris yang tidak disentuh.
- `react-data-grid@7.0.0-beta.63` **dirilis 2026-10-25**, dua hari sebelum spike (beta.62: 2026-10-19; beta.61: 2026-07-14). D46 memasangnya dengan versi persis.
- Angka 1× diambil tanpa GPU. Laptop dengan kompositor GPU kemungkinan lebih baik; kolom 4× sengaja pesimistis.

## Rekomendasi (keputusan tetap di Ricko — D46)

**`react-data-grid` 7.0.0-beta.63, dipin persis.** Keenam kriteria terpenuhi. Tiga celah perilakunya tertutup lewat API publik, tanpa fork. Pembaca layar masih harus dikonfirmasi dengan NVDA.

## Yang bisa Ricko periksa

- **Vercel Preview:** branch spike belum di-push. Kalau Ricko ingin mencobanya di Preview, beri izin push `spike/grid-library`. Preview-nya bisa dibuka dengan akun dev, lalu menuju `/spike-grid` (branch ini tidak akan di-merge).
- **NVDA (Windows + Chrome/Edge)** di `/spike-grid`:
  1. Tab sampai masuk grid, lalu tekan panah kanan/kiri. NVDA harus membaca judul kolom + nilai sel.
  2. Klik **Muat 20.000 baris**, lalu ketik `31/02/2026` + Enter di sel Tanggal. Kembali ke sel itu: NVDA harus membaca nilainya, "tidak valid" (*invalid entry*), dan "Tanggal tidak terbaca."
  3. Klik **Salin 10.000 baris TSV**, klik sebuah sel, lalu Ctrl+V. NVDA harus mengumumkan "10.000 baris ditempel dalam … ms".
- **Tempel dari Excel/Google Sheets asli:** salin blok 7 kolom (Tanggal · Uraian · Masuk · Keluar · Saldo · Akun lawan · Catatan), klik sel tujuan, lalu Ctrl+V.
