-- 0008 — master Layanan (data GLOBAL, bukan per-klien)
--
-- Layanan yang sama dijual lintas klien, jadi tabel ini SENGAJA tidak punya
-- client_id. Bandingkan master_coa yang justru per-klien: struktur akun memang
-- berbeda tiap klien, sedangkan daftar jasa tidak.
--
-- ══ TIDAK ADA PENGHAPUSAN, SELAMANYA ═══════════════════════════════════════
-- Kontrak mencatat layanan APA yang dijual. Menghapus "Setup SCM" tiga tahun
-- lagi akan melubangi setiap kontrak 2026 yang memuatnya — riwayat rusak oleh
-- perubahan master data. Pelajaran yang sama dengan `kode` di Master COA.
--
-- Karena itu tabel ini hanya punya penanda `aktif`:
--   aktif = false → hilang dari picker saat MEMBUAT/MENGUBAH kontrak
--   aktif = false → TETAP tampil normal di kontrak yang sudah memakainya
--                   (bukan error, bukan dicoret, bukan "(dihapus)")
-- Tidak ada endpoint DELETE, dan tidak boleh dibuat "demi kelengkapan".
--
-- Sengaja TANPA ON DELETE apa pun di sisi kontrak nanti: kontrak akan menunjuk
-- layanan lewat FK, dan karena baris di sini tidak pernah dihapus, tidak ada
-- kaskade yang perlu dipikirkan. Kalau suatu saat ada yang menambahkan DELETE,
-- FK itulah pertahanan terakhirnya — jangan diberi ON DELETE CASCADE.
--
-- unique(nama): daftar jasa dipilih manusia dari dropdown; dua baris bernama
-- sama hanya menghasilkan tebak-tebakan saat memilih.
CREATE TABLE "layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"deskripsi" text,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "layanan_nama_unique" UNIQUE("nama")
);
