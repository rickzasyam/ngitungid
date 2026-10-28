import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'

// Jawaban JSON besar yang dikompres DI FUNGSI, bukan di CDN (MP §5.G S8).
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
