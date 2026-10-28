# Log progres Stream A — Grid Mutasi Kas

- **Branch:** `feat/grid-mutasi` · **Cakupan:** MP §5.G Modul A (S0–S11)
- **Aturan & kepemilikan berkas:** `docs/HANDOFF.md`
- ROADMAP.md tetap dicatat seperti biasa; berkas ini log langkah per langkah stream.

Satu baris per langkah, terbaru di ATAS. Kolom "Butuh Ricko" diisi bila langkahnya berhenti di ⏸ CP, menyentuh
berkas bersama, atau menunggu keputusan — kosongkan (`—`) bila tidak.

| Tanggal | Langkah | Commit | Gerbang (tsc · vitest · eslint) | Sabotase | Catatan | Butuh Ricko |
|---|---|---|---|---|---|---|
| 2026-10-28 | S1 migrasi 0021 + replace-plan | `a258c1e` | bersih · 1988 lulus · 0 error / 24 warning | 3 merah: kolom Pindah Buku dilupakan (3 test) · aturan tidak diblokir (5) · route lupa `akun_kas_id` aturan (1) | `0021_grid_mutasi.sql` ke **dev saja** (22 migrasi); SQL dibaca, hanya objek baru. Rahasia dev ada sebagai variabel lingkungan proses (bukan `.env.local`), endpoint `ep-rapid-hat` diperiksa sebelum migrate. Perbaikan ikutan: setelan ber-relink memaksa jalur ganti-nama (FK SET NULL memutus setelan PPN di jalur hapus-langsung). `graphify` tidak terpasang di kontainer → dilewati. | — |
| 2026-10-28 | Kontrak `BarisMentah` (komentar) | `0092138` | — (komentar) | — | Usulan Stream B disetujui Ricko: "Satu baris transaksi tercetak; uraian yang terlipat sudah digabung (satu spasi)". Bentuk tipe tidak berubah. Draft PR rickzasyam/ngitungid#1 dibuka. | — |
| 2026-10-27 | CP-19 dijawab Ricko | (commit docs ini) | — (docs) | — | D46 = `react-data-grid` 7.0.0-beta.63 dipin persis · Enter seperti Excel (simpan lalu turun) di S9 · NVDA diuji Ricko sendiri, tidak menahan · `spike/grid-library` boleh di-push untuk Preview, tidak di-merge. Push sempat 403 lalu diperbaiki Ricko. | Rahasia dev dipasang Ricko, lanjut S1 di sesi baru |
| 2026-10-27 | S0 spike `react-data-grid` 7.0.0-beta.63 | `ea6edde` di `spike/grid-library` (tidak di-merge) + commit docs ini | bersih · 1969 lulus · 0 error / 24 warning (sama dengan sebelum) | — (spike, tanpa test baru) | 6 kriteria terukur, angka di `docs/plans/hasil-spike-grid-s0-2026-10-27.md`. Tiga celah library ditambal lewat API publik. **Rahasia dev tidak ada di environment** (`env:cek`: `.env.local` tidak ada), jadi diukur di server lokal dengan secret sekali pakai + DB palsu, tanpa DB. | ⏸ **CP-19**: pilih library; uji NVDA; izin push branch spike untuk Preview?; pasang rahasia dev untuk S1 & uji klik |
