// Ringkasan berkas .env yang AMAN dicetak: nama kunci + panjang nilai, plus
// endpoint Neon untuk DATABASE_URL (aturan 3 CLAUDE.md). Nilai tidak pernah ikut
// keluar. Lahir dari kejadian 2026-10-23: penyamaran `grep -n … | sed 's/^KEY=…/'`
// gagal diam-diam karena awalan nomor baris, dan GEMINI_API_KEY tercetak utuh.
// Jalankan: `pnpm env:cek` (lib/env-aman-cli.ts); `.env.main` lewat `cekEnvMain`.

const ENDPOINT_DEV = 'ep-rapid-hat-aos7vlb0'
const ENDPOINT_MAIN = 'ep-small-mode-ao8ouvtp'

function bukaKutip(v: string): { nilai: string; berkutip: boolean } {
  const q = v[0]
  if (v.length >= 2 && (q === '"' || q === "'") && v.at(-1) === q) return { nilai: v.slice(1, -1), berkutip: true }
  return { nilai: v, berkutip: false }
}

/** Label pertama host Neon (`ep-…`, tanpa `-pooler`), atau null bila bukan URL Neon. */
function endpointNeon(url: string): string | null {
  const host = url.slice(url.lastIndexOf('@') + 1)
  let label = ''
  for (const ch of host) {
    if (ch === '.' || ch === '/' || ch === ':' || ch === '?') break
    label += ch
  }
  if (!label.startsWith('ep-')) return null
  return label.endsWith('-pooler') ? label.slice(0, -'-pooler'.length) : label
}

/** Pasangan kunci–nilai seperti dibaca dotenv (kutip dibuang, komentar ujung diabaikan). */
function bacaEnv(teks: string): { kunci: string; nilai: string }[] {
  const out: { kunci: string; nilai: string }[] = []
  for (const mentah of teks.split('\n')) {
    let baris = mentah.trim()
    if (baris === '' || baris.startsWith('#')) continue
    if (baris.startsWith('export ')) baris = baris.slice('export '.length).trim()
    const sama = baris.indexOf('=')
    if (sama < 1) continue
    const dibuka = bukaKutip(baris.slice(sama + 1).trim())
    let nilai = dibuka.nilai
    // Komentar di ujung nilai tanpa kutip bukan bagian nilai (perilaku dotenv).
    if (!dibuka.berkutip && nilai.includes(' #')) nilai = nilai.slice(0, nilai.indexOf(' #')).trim()
    out.push({ kunci: baris.slice(0, sama).trim(), nilai })
  }
  return out
}

export function ringkasEnv(teks: string): string[] {
  return bacaEnv(teks).map(({ kunci, nilai }) => {
    let info = `${kunci}: ${nilai.length} karakter`
    if (kunci === 'DATABASE_URL') {
      const ep = endpointNeon(nilai)
      info += ` · endpoint ${ep ?? 'bukan Neon / tidak dikenali'}`
      if (ep === ENDPOINT_DEV) info += ' (dev ✓)'
      if (ep === ENDPOINT_MAIN) info += ' — ⚠️ MAIN (produksi): berhenti dan lapor, aturan 3 CLAUDE.md'
    }
    return info
  })
}

/**
 * Pemeriksa `.env.main` — berkas connection string PRODUKSI yang diisi Ricko,
 * satu-satunya jalan migrasi ke main (`pnpm db:migrate:main`). Hanya endpoint
 * yang dilaporkan, tidak ada panjang nilai atau kunci lain: berkas ini berisi
 * rahasia produksi (aturan 2 CLAUDE.md). `ok` hanya bila endpoint-nya main —
 * kalau berkas ini menunjuk dev, migrasi "ke main" diam-diam mendarat di dev.
 */
export function cekEnvMain(teks: string): { ok: boolean; pesan: string } {
  const url = bacaEnv(teks).find(e => e.kunci === 'DATABASE_URL')?.nilai
  if (!url) return { ok: false, pesan: '.env.main: DATABASE_URL tidak ada — berhenti.' }
  const ep = endpointNeon(url)
  if (ep !== ENDPOINT_MAIN) {
    return { ok: false, pesan: `.env.main: endpoint ${ep ?? 'bukan Neon / tidak dikenali'} — BUKAN main (${ENDPOINT_MAIN}). Berhenti.` }
  }
  return { ok: true, pesan: `.env.main: endpoint ${ep} (main ✓)` }
}
