// Ringkasan berkas .env yang AMAN dicetak: nama kunci + panjang nilai, plus
// endpoint Neon untuk DATABASE_URL (aturan 3 CLAUDE.md). Nilai tidak pernah ikut
// keluar. Lahir dari kejadian 2026-10-23: penyamaran `grep -n … | sed 's/^KEY=…/'`
// gagal diam-diam karena awalan nomor baris, dan GEMINI_API_KEY tercetak utuh.
// Jalankan: `pnpm env:cek` (lib/env-aman-cli.ts).

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

export function ringkasEnv(teks: string): string[] {
  const out: string[] = []
  for (const mentah of teks.split('\n')) {
    let baris = mentah.trim()
    if (baris === '' || baris.startsWith('#')) continue
    if (baris.startsWith('export ')) baris = baris.slice('export '.length).trim()
    const sama = baris.indexOf('=')
    if (sama < 1) continue
    const kunci = baris.slice(0, sama).trim()
    const dibuka = bukaKutip(baris.slice(sama + 1).trim())
    const berkutip = dibuka.berkutip
    let nilai = dibuka.nilai
    // Komentar di ujung nilai tanpa kutip bukan bagian nilai (perilaku dotenv).
    if (!berkutip && nilai.includes(' #')) nilai = nilai.slice(0, nilai.indexOf(' #')).trim()

    let info = `${kunci}: ${nilai.length} karakter`
    if (kunci === 'DATABASE_URL') {
      const ep = endpointNeon(nilai)
      info += ` · endpoint ${ep ?? 'bukan Neon / tidak dikenali'}`
      if (ep === ENDPOINT_DEV) info += ' (dev ✓)'
      if (ep === ENDPOINT_MAIN) info += ' — ⚠️ MAIN (produksi): berhenti dan lapor, aturan 3 CLAUDE.md'
    }
    out.push(info)
  }
  return out
}
