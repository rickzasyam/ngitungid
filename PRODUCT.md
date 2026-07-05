# Product

## Register

product

## Users

Multi-role: (1) Akuntan profesional di firma / KAP yang mengelola laporan keuangan beberapa klien sekaligus, dan (2) Tim finance internal perusahaan yang menganalisis data keuangan bisnis sendiri. Kedua role bekerja di lingkungan desktop, membutuhkan kecepatan dan kejelasan — mereka tidak punya waktu untuk UI yang membingungkan.

## Product Purpose

NgitungID Business Intelligence adalah platform analitik keuangan untuk pasar Indonesia. Pengguna mengupload laporan keuangan (PDF, CSV, Excel) — Laba Rugi, Neraca, Arus Kas — lalu AI mengekstrak, memetakan, dan menyajikan insight dalam dashboard yang bisa dibaca langsung. Sukses = akuntan bisa menyelesaikan analisis klien dalam hitungan menit, bukan jam.

## Brand Personality

Modern · Cerdas · Percaya Diri. Terasa seperti tool yang dibangun oleh orang yang paham keuangan dan paham desain — bukan software akuntansi yang terperangkap di 2005. Nada komunikasi: langsung, tidak berlebihan, profesional tapi tidak kaku.

## Anti-references

- **Spreadsheet feel**: Hindari tampilan padat tabel, warna abu-abu utilitarian, grid yang terasa seperti Excel atau Numbers. Setiap layar harus terasa seperti *produk*, bukan worksheet.
- SAP / ERP enterprise: Tidak berat, tidak overwhelm dengan menu nested, tidak ada chrome berlebihan.
- Generic SaaS cream: Bukan template putih/cream tanpa karakter. Identitas visual NgitungID sudah distinct (soft black sidebar + lime accent) — pertahankan.

## Design Principles

1. **Clarity over cleverness** — Angka dan status harus terbaca sekilas. Jika pengguna harus berpikir lebih dari 1 detik untuk memahami suatu elemen, sederhanakan.
2. **Confidence in every state** — Empty states, loading states, dan error states harus terasa sama berpolisihnya seperti happy path. Tidak ada placeholder tanggung.
3. **Data dignity** — Laporan keuangan adalah dokumen serius. Desain harus memberi konteks dan hierarki yang tepat — bukan dekorasi yang mengalihkan perhatian dari angka.
4. **Progressive disclosure** — Tampilkan apa yang dibutuhkan sekarang. Detail dan aksi lanjutan muncul saat konteksnya tepat.
5. **Indonesian-first** — Bahasa, format tanggal, dan konvensi akuntansi Indonesia adalah first-class citizen, bukan afterthought.

## Accessibility & Inclusion

- Target: WCAG 2.1 AA minimum.
- Semua interactive element harus keyboard-navigable.
- Reduced motion: semua animasi harus punya fallback `@media (prefers-reduced-motion: reduce)`.
- Kontras teks: body text ≥ 4.5:1, large/bold text ≥ 3:1.
