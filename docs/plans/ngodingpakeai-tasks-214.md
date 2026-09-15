# Katalog 214 Task NgodingPakeAI → Langkah Master Plan

Sumber: ekspor web UI NgodingPakeAI 2026-09-15 (`mesin-akuntansi-jurnal-manual/features/01..15.md`). Plan `e2cbb3a7-5976-43dd-937a-5bec14f6c35c`.
Master Plan ("MP"): `docs/plans/2026-09-15-master-plan-mesin-akuntansi-semua-fase.md`.

**Ringkasan:** 214 task = **124 kerja baru** (F01–F08 + F15) + **90 fitur yang SUDAH ADA** (F09–F14). Judul task persis seperti di server; `ref` = `mesin-akuntansi-jurnal-manual/<slug-fitur>/<slug-judul-dipotong>` — `task next` selalu mengembalikan `ref` persisnya, jangan menebak.

**Struktur di tracker vendor** (diverifikasi `task list --all --json`, 2026-09-15 — 214/214 `todo`):

| Fase vendor | Fitur | Task | Catatan |
|---|---|---|---|
| 1 | F01 Jurnal Umum · F15 Master Data Supplier | 27 (13 fe + 14 be) | irisan yang sekarang terbuka |
| 2 | F02 Buku Besar & Posting · F03 Master COA Bertipe | 28 (13 fe + 15 be) | |
| 3 | F04 Impor Bank · F05 Marketplace · F06 Kas Kecil | 40 (20 fe + 20 be) | |
| 4 | F07 Saldo Awal & Kunci Periode · F08 Laporan dari Jurnal | 29 | kerja baru |
| 4 | **F09–F14 (fitur yang sudah ada)** | **90** | **terkunci sampai fase 1–3 selesai; tidak bisa `task complete` dari CLI sekarang — tandai selesai di web UI** |

Fase vendor = fase PRD, kecuali Supplier (PRD Fase 2) yang vendor taruh di fase 1. Langkah K1–K5 (kunci periode, D26 memajukannya) dikerjakan sebelum fase 4 vendor terbuka → kodenya dibangun dulu, task-nya di-`task complete` saat fase 4 terbuka.

**Cara memakai:** saat `task next` mengembalikan `feature` + `title`, cari barisnya di sini → kerjakan langkah MP yang disebut → `task complete`. Kolom "Catatan" mengalahkan judul task bila keduanya bertentangan (judul ditulis server tanpa membaca kode; catatan ditulis setelah membaca kode).

---

## F01 — Jurnal Umum (14) · MP §4.A
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman utama Jurnal Umum dengan data tiruan | A7 | data nyata ⊃ tiruan |
| 2 | Buat daftar jurnal per klien dan periode (mock) | A7 | |
| 3 | Buat tampilan detail jurnal dan barisnya (mock) | A7 | |
| 4 | Buat form input jurnal manual dengan baris debit kredit (mock) | A7 | |
| 5 | Validasi keseimbangan debit kredit di form dengan pesan selisih | A2 + A7 | aturan di lib, tampilan di form |
| 6 | Buat UI saran akun AI dari keterangan transaksi (mock) | A5 + A7 | R1: hingga 3 pasangan sebagai daftar |
| 7 | Tampilkan jejak pembuat di daftar dan detail jurnal (mock) | A4 + A7 | |
| 8 | Buat skema dan migrasi journal_entries dan journal_lines | A1 | migrasi 0010 |
| 9 | Buat API daftar jurnal per klien dan periode | A4 | `GET /api/journals` |
| 10 | Buat service validasi total debit sama dengan kredit | A2 | `lib/journal.ts` |
| 11 | Buat API simpan jurnal draf beserta barisnya | A4 | `POST /api/journals` |
| 12 | Buat API detail jurnal beserta baris debit kredit | A4 | `GET /api/journals/[id]` |
| 13 | Buat service saran akun AI mengikuti pola pemetaan COA | A5 | |
| 14 | Rekam created_by pengguna aktif pada tiap jurnal | A4 | D6 lookup email |

## F02 — Buku Besar & Posting (14) · MP §5.A
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman Buku Besar dengan data tiruan | C4 | |
| 2 | Tambahkan filter akun dan periode Buku Besar | C4 | |
| 3 | Tampilkan daftar mutasi dan saldo berjalan | C4 | |
| 4 | Tampilkan ringkasan saldo awal dan saldo akhir | C4 | |
| 5 | Tambahkan aksi posting pada jurnal draf | C4 | di `/jurnal` |
| 6 | Buat UI jurnal balik dan penanda jurnal terbalik | C4 | |
| 7 | Tampilkan riwayat pembuat dan pemosting jurnal | C4 | |
| 8 | Tambah kolom posting dan reversal pada skema jurnal | §5.0 | migrasi 0012 |
| 9 | Buat service posting jurnal draf ke buku besar | C1 | `canPost`; buku besar diturunkan (D11) |
| 10 | Buat endpoint aksi posting jurnal | C2 | |
| 11 | Kunci jurnal terposting dari edit dan hapus | A4 (+C2) | **sudah sejak Fase 1** lewat `canEditJournal` |
| 12 | Buat endpoint buku besar per akun saldo berjalan | C2 | `GET /api/ledger` |
| 13 | Buat endpoint pembuatan jurnal balik otomatis | C2 | |
| 14 | Buat endpoint riwayat pembuat dan pemosting jurnal | C2 | `audit_events` (R2) di respons detail |

## F03 — Master COA Bertipe (14) · MP §5.B
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman Master COA Bertipe | E4 | di tab Master COA yang ada, bukan halaman baru |
| 2 | Buat tabel akun dengan indikator keterangan | E4 | eksplisit tebal / turunan redup |
| 3 | Buat modal edit keterangan akun | E4 | form baris COA yang ada |
| 4 | Buat aksi isi massal akun terpilih | E4 | |
| 5 | Bangun panel impor Excel keterangan akun | E4 | |
| 6 | Bangun modal pratinjau dampak perubahan | E4 | |
| 7 | Migrasi kolom keterangan pada Master COA | E1 | **hanya** `tipe_akun` + `is_kas` (D14) |
| 8 | Endpoint daftar akun dan filter keterangan | E3 | `GET /coa?tipe=` (R8) |
| 9 | Endpoint ubah keterangan akun | E3 | PATCH baris yang ada |
| 10 | Endpoint isi massal keterangan akun | E3 | `POST /coa/types` |
| 11 | Endpoint impor Excel keterangan akun | E3 | sama dengan #10 (multipart) |
| 12 | Endpoint pratinjau dampak keterangan akun | E3 + E2 | `dryRun` |
| 13 | Terapkan tipe akun di engine laporan | E2 + L1 | `resolveAccountType` |
| 14 | Simpan riwayat perubahan keterangan akun | R2 | `audit_events` entity `master_coa` |

## F04 — Impor Mutasi Kas/Bank (15) · MP §6.A
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Buat halaman utama impor mutasi kas/bank | G4 | |
| 2 | Buat form unggah & ringkasan berkas | G4 | |
| 3 | Buat halaman kelola aturan pemetaan akun | G4 | |
| 4 | Buat layar peninjauan baris berdampingan | G4 | R9: kiri = baris mentah, bukan PDF |
| 5 | Tambah ubah akun per baris dan massal | G4 | |
| 6 | Buat pratinjau dan batch jadikan jurnal | G4 | |
| 7 | Tandai dan filter baris duplikat | G4 | |
| 8 | Buat skema tabel dan migrasi impor mutasi | §6.A | migrasi 0014 |
| 9 | Buat endpoint unggah dan parsing berkas | G2 | |
| 10 | Buat CRUD API aturan pemetaan akun | G2 | |
| 11 | Buat service pemetaan otomatis baris impor | G1 | `applyRules` |
| 12 | Buat endpoint perbaikan akun baris peninjauan | G2 | |
| 13 | Buat service deteksi duplikat mutasi | G1 | `fingerprint` |
| 14 | Buat service konversi baris jadi jurnal seimbang | G1 | `rowToJournalInput` |
| 15 | Buat endpoint pratinjau dan simpan draf jurnal | G2 | `journalize` |

## F05 — Transaksi Marketplace (12) · MP §6.B
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman utama transaksi marketplace dengan data tiruan | H4 | |
| 2 | Buat pemilih klien dan periode transaksi | H4 | R10: klien = aktif sidebar |
| 3 | Buat komponen ringkasan pisah bruto dan net | H4 | |
| 4 | Buat input fee pajak dan pilih akun COA | H4 | D20 |
| 5 | Buat pratinjau jurnal debit kredit seimbang | H4 | |
| 6 | Buat daftar transaksi marketplace dengan penanda sumber | H4 | `sumber='marketplace'` di `/jurnal` juga |
| 7 | Buat skema tabel transaksi marketplace dan migrasi | §6.B | migrasi 0015 |
| 8 | Buat service hitung net dan pemisahan bruto | H1 | |
| 9 | Buat generator jurnal otomatis dari transaksi marketplace | H1 | |
| 10 | Buat API simpan transaksi dan jurnal marketplace | H2 | |
| 11 | Buat API pratinjau jurnal marketplace | H2 | |
| 12 | Buat API daftar transaksi marketplace per periode | H2 | |

## F06 — Kas Kecil (13) · MP §6.C (direvisi R3: jurnal per pengeluaran)
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman kas kecil dengan data tiruan | I4 | |
| 2 | Buat panel tetapkan saldo dana kas kecil | I4 | |
| 3 | Buat form catat pengeluaran kas kecil | I4 | |
| 4 | Buat daftar pengeluaran kas kecil dengan mock | I4 | = jurnal `kas_kecil` |
| 5 | Buat form pengisian kembali dari bank | I4 | |
| 6 | Buat halaman rekap pemakaian kas kecil | I4 | |
| 7 | Tampilkan validasi saldo dan pesan kesalahan | I4 + I1 | "melebihi sisa dana ditolak" |
| 8 | Buat migrasi tabel dana dan transaksi kas kecil | §6.C | 0016: **hanya** `petty_cash_funds` (R3) |
| 9 | Buat service set saldo dan hitung sisa dana | I1 | sisa = saldo akun kas kecil |
| 10 | Buat endpoint tetapkan saldo dana kas kecil | I2 | |
| 11 | Buat endpoint catat pengeluaran dan jurnalnya | I2 | draf jurnal D beban / K kas kecil |
| 12 | Buat endpoint pengisian kembali dengan jurnal otomatis | I2 | draf jurnal D kas kecil / K bank |
| 13 | Buat endpoint rekap pemakaian per periode | I2 | |

## F07 — Saldo Awal & Kunci Periode (18) · MP §7.A + §7.B
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman saldo awal & kunci periode mock | J3 + K4 | tab Settings "Pembukuan" |
| 2 | Buat form input saldo awal per akun mock | J3 | |
| 3 | Tampilkan status saldo awal dan pemilih klien | J3 | klien = aktif sidebar |
| 4 | Tampilkan total debit kredit berjalan dan selisih | J3 | panel dari form jurnal |
| 5 | Buat daftar periode mock dengan aksi kunci | K4 | R7: daftar bulan, status diturunkan |
| 6 | Buat modal konfirmasi kunci dan metadata pengunci | K4 | |
| 7 | Buat UI buka kunci dengan peran dan alasan | K4 | owner saja |
| 8 | Tampilkan riwayat buka kunci periode dari mock | K4 | dari `audit_events` |
| 9 | Buat banner peringatan periode terkunci di form jurnal | K4 | |
| 10 | Buat tabel opening_balances dan migrasi | J1/J2 | **R6: TIDAK ada tabel** — jurnal `opening_balance` |
| 11 | Buat tabel period_locks dan period_unlock_log migrasi | §7.B | 0017 `period_locks`; log = `audit_events` (R6) |
| 12 | Buat API simpan saldo awal dengan validasi seimbang | J2 | |
| 13 | Buat API ambil saldo awal dan status terisi | J2 | |
| 14 | Buat API kunci periode dengan metadata pengunci | K3 | |
| 15 | Buat API buka kunci periode dengan otorisasi dan alasan | K3 | `requireOwner` |
| 16 | Buat service cek periode terkunci untuk jurnal | K1 | `isDateLocked` |
| 17 | Integrasi validasi periode terkunci ke endpoint jurnal | K2 | |
| 18 | Buat API status periode terkunci untuk peringatan | K3 | `GET /api/period-locks` |

## F08 — Laporan dari Jurnal (11) · MP §7.C (direvisi R5: halaman `/laporan-keuangan`)
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman laporan jurnal dengan data tiruan | L4 | `/laporan-keuangan`, tab LR/Neraca/AK |
| 2 | Buat tab Laba Rugi pakai data tiruan | L4 | |
| 3 | Buat tab Neraca dengan penanda selisih | L4 | `checkBalance` |
| 4 | Buat tab Arus Kas per aktivitas | L4 | |
| 5 | Seragamkan format tampilan laporan jurnal dan PDF | L4 + L1 | satu renderer dari `AggLine[]` |
| 6 | Buat service agregasi laporan dari jurnal | L1 | `from-journal.ts` |
| 7 | Buat endpoint penentu sumber laporan periode | L2 + L3 | `resolveReportSource` |
| 8 | Buat endpoint Laba Rugi dari jurnal | L3 | `GET /api/reports/statements` (satu endpoint, tiga laporan) |
| 9 | Buat endpoint Neraca dengan validasi keseimbangan | L3 | idem + `balance` |
| 10 | Buat endpoint Arus Kas dari klasifikasi akun | L3 + L1 | D19 |
| 11 | Selaraskan format output dengan ekstraksi PDF | L1 | golden test |

## F15 — Master Data Supplier (13) · MP §4.B + §5.C
| # | Task | Langkah | Catatan |
|---|---|---|---|
| 1 | Bangun halaman daftar supplier per klien | B4 | tab Settings |
| 2 | Buat form tambah dan sunting supplier | B4 | |
| 3 | Tambah aksi hapus supplier dengan konfirmasi | B4 | |
| 4 | Buat pemilih akun hutang default supplier | B4 | + lencana "belum lengkap" bila kosong |
| 5 | Bangun halaman rekonsiliasi hutang supplier | **B5 `task fail`** → F4 | D5 |
| 6 | Bangun halaman impor dan ekspor supplier | B2 + B3 + B4 | tombol di tab |
| 7 | Buat skema tabel supplier dan migrasi | B1 | 0011 |
| 8 | Buat API CRUD supplier per klien | B3 | |
| 9 | Terapkan otorisasi peran pada aksi supplier | B3 | **R4 (Ricko 2026-09-15): finance lihat saja** — baca `requireInternal`, tulis `requireAkunting` |
| 10 | Buat endpoint daftar akun hutang liabilitas | B3 | R8: `GET /coa?tipe=liability` |
| 11 | Buat endpoint rekonsiliasi saldo hutang supplier | F3 | Fase 2 |
| 12 | Buat service impor supplier dari xlsx CSV | B2 + B3 | |
| 13 | Buat endpoint ekspor daftar supplier | B3 | |

---

# Fitur yang SUDAH ADA — verifikasi bukti lalu `task complete`

Aturan (MP §3.3 R11): ✅ = ada, sebut berkasnya saat `task complete`. ⚠️ = dipenuhi **dengan cara berbeda yang disengaja** (ada keputusan di ROADMAP) — selesaikan dengan catatan, **jangan** "melengkapi" ke arah judul task. ❌ = celah kecil di luar cakupan — laporkan ke Ricko, jangan kerjakan tanpa perintah. Lebih efisien bila Ricko menandai keenam fitur ini selesai sekaligus di web UI.

## F09 — Autentikasi, Peran & Akun (15)
| # | Task | Bukti | Status |
|---|---|---|---|
| 1 | Bangun halaman masuk dengan latar 3D | `app/login/page.tsx`, `components/login-terrain/*` | ✅ |
| 2 | Tampilkan galat login dan penguncian sementara | satu pesan generik; **durasi kunci sengaja TIDAK ditampilkan** (anti account-enumeration, ROADMAP 2026-07-18) | ⚠️ |
| 3 | Buat layout utama dan menu per peran | `components/app-shell.tsx`, `sidebar.tsx`, `lib/nav-items.ts` | ✅ |
| 4 | Buat penjaga rute dan halaman akses ditolak | `proxy.ts` + `authorized` di `lib/auth.ts` + `lib/route-access.ts`; **tidak ada halaman "ditolak"** — dialihkan ke `USER_HOME` by design | ⚠️ |
| 5 | Buat halaman pengaturan ganti kata sandi | `app/settings/page.tsx` tab Account | ✅ |
| 6 | Buat halaman preferensi bahasa dan format angka | tab General | ✅ |
| 7 | Terapkan provider format angka dan bahasa global | `lib/preferences-context.tsx` (`useRupiah`) | ✅ |
| 8 | Tampilkan identitas pengguna dan tombol keluar | `components/sidebar.tsx` (`ROLE_LABEL`, `signOut`) | ✅ |
| 9 | Buat skema pengguna, peran, dan preferensi | `lib/db/schema.ts` `users`; migrasi 0001/0003/0006/0007 | ✅ |
| 10 | Buat endpoint login dan manajemen sesi | `lib/auth.ts`, `app/api/auth/[...nextauth]` | ✅ |
| 11 | Implementasikan penguncian sementara gagal login | `lib/login-rate-limit*.ts`, migrasi 0005 | ✅ |
| 12 | Buat middleware otorisasi berbasis peran | `proxy.ts`, `lib/api/guards.ts`, `lib/roles.ts` | ✅ |
| 13 | Buat endpoint ganti kata sandi tanpa ID | `app/api/account/password/route.ts` | ✅ |
| 14 | Buat endpoint preferensi bahasa dan format angka | `app/api/account/preferences/route.ts` | ✅ |
| 15 | Buat endpoint logout dan hapus sesi | NextAuth `handlers` (`signOut`) | ✅ |

## F10 — Manajemen Klien & Workspace (13)
| # | Task | Bukti | Status |
|---|---|---|---|
| 1 | Buat halaman Admin Overview daftar klien (mock) | `app/admin-overview/page.tsx` (data nyata) | ✅ |
| 2 | Buat komponen avatar inisial klien reusable | `components/client-avatar.tsx` | ✅ |
| 3 | Buat modal pengalih klien aktif | `components/client-switcher-modal.tsx` | ✅ |
| 4 | Tampilkan klien aktif di header & persist antar halaman | `lib/client-context.tsx` (localStorage) + sidebar | ✅ |
| 5 | Buat form buat & sunting klien dengan data tiruan | `new-client-modal.tsx`, `client-manage.tsx` | ✅ |
| 6 | Buat dialog konfirmasi hapus klien ketik nama | `client-manage.tsx` `DeleteClientModal` | ✅ |
| 7 | Buat skema tabel klien & migrasi | `clients`; 0000/0004 | ✅ |
| 8 | Buat tabel penugasan staf akunting per klien | `client_assignments`; 0004 | ✅ |
| 9 | Buat API CRUD data klien | `app/api/clients/route.ts`, `[id]/route.ts` | ✅ |
| 10 | Buat penyimpanan unggah logo klien | bytea di `clients` + `[id]/logo/route.ts` | ✅ |
| 11 | Buat API penugasan staf & filter data per peran | `[id]/assignments`; **penugasan = pencatatan saja, TIDAK menyaring akses** (keputusan Ricko); filter peran via `canAccessClientData` | ⚠️ |
| 12 | Buat API hapus klien dengan validasi akun penampil | `DELETE [id]` 409 + konfirmasi nama | ✅ |
| 13 | Buat API simpan & ambil klien aktif pengguna | **tidak ada API** — klien aktif disimpan client-side (localStorage), memenuhi "bertahan antar halaman" | ⚠️ |

## F11 — Pemrosesan Laporan Keuangan dari PDF (14)
| # | Task | Bukti | Status |
|---|---|---|---|
| 1 | Bangun halaman unggah tiga laporan PDF | `app/upload/page.tsx`, `components/upload-session.tsx` | ✅ |
| 2 | Buat pemilih periode dan status berkas terisi | `upload-session.tsx` | ✅ |
| 3 | Buat halaman tinjauan berdampingan PDF dan baris ekstraksi | `app/extraction-review/page.tsx`; **PDF tidak ikut menggulir ke baris terpilih** (iframe) | ✅ / ❌ kecil |
| 4 | Buat komponen konfirmasi baris terima tolak | `extraction-review` + `line-items/[lineItemId]` | ✅ |
| 5 | Buat panel kelola laporan ganti berkas pindah periode | `app/laporan/page.tsx` | ✅ |
| 6 | Buat notifikasi status pembacaan dan galat unggahan | inline di `upload-session`, `status-section`, `/laporan` | ✅ |
| 7 | Buat skema DB laporan dan baris ekstraksi PDF | `financial_reports`, `report_line_items` | ✅ |
| 8 | Buat migrasi tabel laporan, berkas, dan baris ekstraksi | 0000, 0002 | ✅ |
| 9 | Buat endpoint unggah tiga PDF dengan validasi dan cek duplikat | `app/api/upload`; **unggah ulang MENGGANTI** (delete-first), bukan menolak — keputusan yang ada | ⚠️ |
| 10 | Buat service ekstraksi AI PDF dan pembaruan status laporan | `lib/gemini/extract.ts`, `lib/reports/mapping-status.ts` | ✅ |
| 11 | Buat endpoint daftar dan detail laporan beserta baris ekstraksi | `/api/reports`, `/list`, `/[id]` | ✅ |
| 12 | Buat endpoint konfirmasi baris terima tolak satuan dan massal | `line-items/[id]`, `confirm-all` | ✅ |
| 13 | Buat endpoint ganti berkas dan pindah periode laporan | `/api/reports/period`, `/api/upload` | ✅ |
| 14 | Buat endpoint coba ulang ekstraksi dengan pengaman anti-ganda | `retry-extract` (compare-and-set) | ✅ |

## F12 — Pemetaan COA Cerdas (14)
| # | Task | Bukti | Status |
|---|---|---|---|
| 1 | Bangun halaman pemetaan COA dengan data tiruan | `app/coa-mapping/page.tsx` (data nyata) | ✅ |
| 2 | Tampilkan usulan akun dan badge sumber kecocokan | `coa-mapping` (auto-matched + keyakinan) | ✅ |
| 3 | Buat aksi terima dan ganti akun per baris | `coa-mapping` + `StyledSelect` | ✅ |
| 4 | Tampilkan kandidat samar dan tombol saran AI | `coa-mapping` + tombol suggest-ai | ✅ |
| 5 | Tandai baris belum dipetakan dengan jelas | `lib/reports/group-unmapped.ts` | ✅ |
| 6 | Buat aksi simpan batch dan status termapping | `POST /api/reports/[id]/mapping` | ✅ |
| 7 | Buat skema tabel pemetaan dan riwayat konfirmasi | `coa_mapping_history`; kolom di `report_line_items` | ✅ |
| 8 | Buat service pencocokan persis nama akun | `lib/coa-match.ts` | ✅ |
| 9 | Buat service pencocokan berbasis riwayat konfirmasi | `lib/coa-match.ts` | ✅ |
| 10 | Buat endpoint usulan pemetaan gabungan dengan sumber | `/api/reports/[id]/suggest` | ✅ |
| 11 | Buat service pencocokan samar terurut kemiripan | `lib/coa-match.ts` (Dice + token) | ✅ |
| 12 | Buat endpoint saran akun AI per baris dan sekaligus | `/api/reports/[id]/suggest-ai` (sekaligus per laporan) | ✅ |
| 13 | Buat endpoint simpan pemetaan batch dan update status | `/api/reports/[id]/mapping` | ✅ |
| 14 | Buat mekanisme re-queue baris saat COA dihapus | `lib/coa/replace-plan.ts` + route COA (status → unmatched) | ✅ |

## F13 — Dashboard & Analitik Finansial (16)
| # | Task | Bukti | Status |
|---|---|---|---|
| 1 | Bangun halaman dashboard analitik finansial | `app/dashboard`, `app/analytics` | ✅ |
| 2 | Buat panel 16 rasio keuangan terkelompok | `app/analytics` + `ratio-card.tsx` | ✅ |
| 3 | Buat grafik tren laba rugi dan komposisi biaya | `revenue-trend-chart`, `pnl-overview-chart`, `expense-breakdown-donut` | ✅ |
| 4 | Buat grafik neraca dan arus kas waterfall | `balance-sheet-health`, `cashflow-waterfall-chart` | ✅ |
| 5 | Buat grafik gelembung penerimaan dan siklus konversi kas | `top-receipts-bubble`; CCC = kartu + sparkline | ✅ |
| 6 | Buat panel skor kesehatan dan detail neraca | `app/analytics` (`assessHealth`, Detail Neraca) | ✅ |
| 7 | Buat kontrol filter visibilitas metrik per klien | tab Settings Analytics Display | ✅ |
| 8 | Sambungkan pemilih klien dan periode ke dashboard | `useRequireClient`, `DateRangePicker` | ✅ |
| 9 | Buat skema dan migrasi pengaturan visibilitas metrik | `client_metric_visibility`; 0000 | ✅ |
| 10 | Buat skema dan migrasi preferensi format angka | `users.currency_format`; 0006 | ✅ |
| 11 | Buat service kalkulasi 16 rasio keuangan | `lib/financial-agg.ts` + route ratios | ✅ |
| 12 | Buat endpoint API 16 rasio keuangan | `/api/analytics/[clientId]/ratios` | ✅ |
| 13 | Buat endpoint API data visualisasi keuangan | `/api/dashboard/[clientId]` | ✅ |
| 14 | Buat service dan endpoint skor kesehatan finansial | `lib/financial-health.ts`; **dihitung di klien** (invarian CLAUDE.md #7), tidak ada endpoint terpisah | ⚠️ |
| 15 | Buat endpoint API detail neraca per checkpoint | `/api/analytics/[clientId]/neraca-detail` | ✅ |
| 16 | Buat endpoint API pengaturan visibilitas metrik | `/api/clients/[id]/metrics` | ✅ |

## F14 — Master Data & Administrasi Kerja Sama (18)
| # | Task | Bukti | Status |
|---|---|---|---|
| 1 | Bangun halaman Pengaturan tiga bagian dengan data tiruan | Settings: Master COA + Layanan; **Kontrak = halaman `/kontrak` sendiri** (by design) | ⚠️ |
| 2 | Buat tabel Master COA klien dengan aksi tambah sunting hapus (mock) | `components/settings/coa-row-editor.tsx` | ✅ |
| 3 | Tambah dialog konfirmasi hapus akun Master COA | `CoaDeleteDialog` | ✅ |
| 4 | Buat tombol ekspor Master COA ke xlsx dari data tiruan | tombol di Settings → `coa/export` | ✅ |
| 5 | Buat halaman unggah dan pratinjau ganti massal COA (mock) | `coa-replace-dialog.tsx` | ✅ |
| 6 | Buat UI katalog layanan global dengan CRUD (mock) | tab Settings Layanan | ✅ |
| 7 | Buat UI kelola kontrak klien dengan unggah dan pratinjau PDF (mock) | `app/kontrak/page.tsx`, `pdf-preview-modal.tsx` | ✅ |
| 8 | Buat komponen lencana masa berlaku kontrak di sidebar (mock) | `sidebar.tsx` + `countNeedsAttention` | ✅ |
| 9 | Buat skema dan migrasi tabel Master COA klien | `master_coa`; 0000 | ✅ |
| 10 | Buat API CRUD Master COA klien dengan reset pemetaan saat hapus | `coa/rows/*` + `replace-plan` | ✅ |
| 11 | Buat endpoint ekspor Master COA klien ke berkas xlsx | `coa/export` | ✅ |
| 12 | Buat API unggah dan pratinjau dampak ganti massal COA | `POST /coa` `dryRun=1` | ✅ |
| 13 | Buat API terapkan ganti massal COA setelah konfirmasi | `POST /coa` (route yang sama, tanpa `dryRun`) | ✅ |
| 14 | Buat skema dan migrasi katalog layanan global | `layanan`; 0008 | ✅ |
| 15 | Buat API CRUD katalog layanan global | `/api/layanan`, `[id]` (tanpa DELETE, by design) | ✅ |
| 16 | Buat skema dan migrasi kontrak klien serta relasi layanan | `contracts`, `contract_layanan`; 0009 | ✅ |
| 17 | Buat API kontrak klien: unggah, unduh, dan pratinjau PDF | `/api/contracts*`, `[id]/dokumen` (inline) | ✅ |
| 18 | Buat API lencana masa berlaku kontrak untuk sidebar | `/api/contracts/badge` | ✅ |

---

**Jumlah:** F01 14 · F02 14 · F03 14 · F04 15 · F05 12 · F06 13 · F07 18 · F08 11 · F15 13 = **124 baru** · F09 15 · F10 13 · F11 14 · F12 14 · F13 16 · F14 18 = **90 sudah ada** · total **214**.
