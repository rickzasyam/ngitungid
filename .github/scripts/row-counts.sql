-- Row count per tabel untuk schema milik APLIKASI (public + drizzle).
-- Dipakai dua kali dalam workflow backup: sekali di sumber (branch main), sekali
-- di hasil restore — output-nya di-diff. Dipakai juga saat restore manual
-- (lihat README § "Backup & restore").
--
-- Schema `neon_auth` sengaja DIKECUALIKAN: dikelola Neon, bukan data aplikasi
-- (auth kita ada di public.users) dan tidak ikut di-dump.
--
-- query_to_xml dipakai supaya count-nya EKSAK & dinamis mengikuti tabel yang ada
-- (pg_stat_user_tables.n_live_tup hanya perkiraan, dan daftar tabel hardcoded
-- akan diam-diam melewatkan tabel baru).
SELECT
  table_schema || '.' || table_name AS tbl,
  (xpath(
    '/row/c/text()',
    query_to_xml(
      format('select count(*) as c from %I.%I', table_schema, table_name),
      false, true, ''
    )
  ))[1]::text::bigint AS n_rows
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema IN ('public', 'drizzle')
ORDER BY 1;
