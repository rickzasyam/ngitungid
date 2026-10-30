import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import ts from 'typescript'

// Kompiler JSX Next (SWC) MEMBUANG spasi di awal teks JSX yang (a) berlanjut
// ke baris berikutnya DAN (b) memuat entitas HTML seperti `&quot;`:
//
//   {n} perubahan Anda …        →  "1perubahan Anda …"
//   lebih dulu &quot;x&quot;
//
// Ditemukan di grid /mutasi-kas (2026-10-29, uji klik). Babel tidak melakukan
// ini, jadi tidak terlihat di test mana pun selain browser. Perbaikannya:
// `{' '}` eksplisit sesudah ekspresi.

const ROOT = join(__dirname, '..')
const berkas = execSync("git ls-files 'app/*.tsx' 'components/*.tsx'", { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

function temuan(path: string): string[] {
  const src = readFileSync(join(ROOT, path), 'utf8')
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: string[] = []
  const kunjungi = (n: ts.Node) => {
    if (n.kind === ts.SyntaxKind.JsxText) {
      const t = src.slice(n.pos, n.end)
      const baris = t.split('\n').filter(l => l.trim() !== '')
      if (/^[ \t]+\S/.test(t) && baris.length >= 2 && /&[a-zA-Z0-9#]+;/.test(t)) {
        out.push(`${path}:${sf.getLineAndCharacterOfPosition(n.pos).line + 1}: ${JSON.stringify(t.slice(0, 40))}`)
      }
    }
    ts.forEachChild(n, kunjungi)
  }
  kunjungi(sf)
  return out
}

describe('JSX: spasi sesudah ekspresi tidak hilang (SWC + entitas HTML)', () => {
  it('tidak ada teks multi-baris berentitas yang diawali spasi', () => {
    expect(berkas.length).toBeGreaterThan(20)
    expect(berkas.flatMap(temuan)).toEqual([])
  })
})
