import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'

// JSON besar yang dikompres DI FUNGSI (MP §5.G S8/S9) — jawaban grid, dan body
// Simpan grid yang dikirim terkompres.
//
// ══ KENAPA TIDAK MENGANDALKAN KOMPRESI OTOMATIS ══════════════════════════
// Batas body respons fungsi Vercel 4,5 MB berlaku pada byte yang KELUAR dari
// fungsi; kompresi CDN terjadi sesudahnya. Grid satu akun-bulan 10.000 baris
// = ±8,4 MB JSON (uji dev 2026-10-28) — ditolak sebelum sempat dikompres —
// sedangkan gzip-nya ±0,5 MB. Respons yang sudah ber-`Content-Encoding` tidak
// dikompres ulang oleh Next maupun CDN.

const gzipAsync = promisify(gzip)

/** Klien menerima gzip? `gzip;q=0` berarti TIDAK (RFC 9110 §12.5.3). */
export function terimaGzip(acceptEncoding: string | null): boolean {
  if (!acceptEncoding) return false
  for (const bagian of acceptEncoding.split(',')) {
    const [nama, ...param] = bagian.split(';').map(x => x.trim().toLowerCase())
    if (nama !== 'gzip' && nama !== '*') continue
    const q = param.find(p => p.startsWith('q='))
    if (q === undefined || Number(q.slice(2)) > 0) return true
  }
  return false
}

export async function jsonGzip(req: Request, body: unknown, init: { status?: number } = {}): Promise<Response> {
  if (!terimaGzip(req.headers.get('accept-encoding'))) return NextResponse.json(body, init)
  const isi = await gzipAsync(Buffer.from(JSON.stringify(body), 'utf8'))
  return new Response(new Uint8Array(isi), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      vary: 'accept-encoding',
    },
  })
}

// ── Body permintaan terkompres (Simpan grid, S9) ─────────────
//
// Batas 4,5 MB yang sama berlaku pada body PERMINTAAN. Uji beban S7: 10.000
// baris = 2,88 MB dengan uraian pendek, ±4 MB dengan uraian bank ±100 karakter
// — terlalu tipis. Grid mengirim body gzip (`CompressionStream`, ±15× lebih
// kecil); route mendekompresnya di sini. Batas TERURAI menjaga dari body kecil
// yang mengembang tak wajar (zip bomb): 10.000 + 2.000 + 2.000 baris dengan
// teks maksimal pun jauh di bawahnya.

export const BATAS_BODY_TERURAI = 64 * 1024 * 1024

export type BacaBody = { ok: true; nilai: unknown } | { ok: false; status: number; error: string }

export async function bacaJsonBody(req: Request, batas: number = BATAS_BODY_TERURAI): Promise<BacaBody> {
  const enc = (req.headers.get('content-encoding') ?? '').trim().toLowerCase()
  if (enc !== '' && enc !== 'identity' && enc !== 'gzip') {
    return { ok: false, status: 415, error: `Content-Encoding "${enc}" tidak didukung (hanya gzip).` }
  }
  if (!req.body) return { ok: false, status: 400, error: 'Body harus JSON.' }
  let teks: string
  try {
    const arus = enc === 'gzip' ? req.body.pipeThrough(new DecompressionStream('gzip')) : req.body
    const pembaca = arus.getReader()
    const potong: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await pembaca.read()
      if (done) break
      total += value.byteLength
      if (total > batas) {
        await pembaca.cancel()
        return { ok: false, status: 413, error: 'Body terlalu besar sesudah diurai.' }
      }
      potong.push(value)
    }
    const semua = new Uint8Array(total)
    let i = 0
    for (const p of potong) {
      semua.set(p, i)
      i += p.byteLength
    }
    teks = new TextDecoder('utf-8', { fatal: true }).decode(semua)
  } catch {
    return { ok: false, status: 400, error: enc === 'gzip' ? 'Body gzip tidak bisa diurai.' : 'Body harus JSON.' }
  }
  try {
    return { ok: true, nilai: JSON.parse(teks) as unknown }
  } catch {
    return { ok: false, status: 400, error: 'Body harus JSON.' }
  }
}
