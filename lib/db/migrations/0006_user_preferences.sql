-- 0006 — preferensi per-USER: language + currency_format
--
-- Scope per-user (keputusan Ricko, lihat ROADMAP 2026-08-05): bahasa itu
-- preferensi pribadi, dan sebentar lagi ada 4 akunting + akun klien yang boleh
-- berbeda-beda. Konsistensi laporan yang dilihat klien dijaga di titik EKSPOR
-- (format tetap untuk PDF), bukan dengan memaksa semua orang seragam di layar.
--
-- TIDAK ADA kolom timezone. Setelan WIB/WITA/WIT dibatalkan (bukan ditunda):
-- empat akunting semuanya WIB, seluruh klien Indonesia, dan setelan itu hanya
-- akan mempengaruhi string seperti "diupload 14:32" sambil memaksa setiap
-- formatter tanggal dijaga permanen agar tidak menggeser periode akuntansi.
-- Timestamp dirender pada satu zona tetap (WIB), hardcoded di lib/format.ts.
--
-- currency_format adalah format TAMPILAN, bukan mata uang:
--   'idr'  → Rp 1.234.567
--   'intl' → IDR 1,234,567
-- Semua nilai di sistem ini Rupiah. Tidak ada konversi, tidak ada kurs.
--
-- currency_format sengaja `text`, BUKAN enum, sedangkan language tetap enum.
-- Alasannya bukan konsistensi melainkan keterbacaan: kalau keduanya enum dan
-- keduanya default 'id', nilai 'id' berarti "bahasa Indonesia" di satu kolom dan
-- "gaya angka Indonesia" di kolom lain — dua makna berbeda dengan ejaan sama di
-- satu baris. 'idr' terbaca tanpa ambiguitas. Daftar bahasa memang tertutup
-- ('id'/'en') sehingga enum tepat di sana. Nilai currency_format divalidasi di
-- API (PUT /api/account/preferences), bukan lewat CHECK constraint — supaya
-- menambah format tampilan baru tidak perlu migrasi.
--
-- NON-DESTRUKTIF: dua ADD COLUMN dengan DEFAULT. Sejak PostgreSQL 11 default
-- non-volatile disimpan di katalog, jadi tidak ada rewrite tabel dan baris yang
-- sudah ada otomatis bernilai 'id'/'id'. Tidak ada kolom yang dihapus/diubah
-- tipenya, tidak ada data lama yang tersentuh.

CREATE TYPE "public"."user_language" AS ENUM('id', 'en');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" "user_language" DEFAULT 'id' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "currency_format" text DEFAULT 'idr' NOT NULL;
