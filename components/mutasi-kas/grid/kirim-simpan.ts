// Pengirim Simpan grid → `POST /api/cash-mutations/batch` (D48).
//
// Body dikirim TERKOMPRES gzip (`CompressionStream`): batas 4,5 MB fungsi
// Vercel berlaku pada body permintaan, dan 10.000 baris dengan uraian bank
// panjang ±4 MB JSON — gzip ±15× lebih kecil. Route mendekompresnya lewat
// `bacaJsonBody` (lib/api/json-gzip.ts). Browser tanpa CompressionStream
// mengirim JSON biasa.
//
// Satu Simpan TIDAK pernah dipecah diam-diam (D52): yang melewati batas
// ditolak di sini dengan pesan, bukan dikirim sebagian.

import type { Duplikat, GalatSimpan, Ringkasan } from '@/lib/api/cash-mutation-batch'

/** Batas body TERKIRIM (sesudah gzip), dengan cadangan di bawah 4,5 MB Vercel. */
export const BATAS_BODY_KIRIM = 4 * 1024 * 1024

export type HasilKirim =
  | { ok: true; ringkasan: Ringkasan; duplikat: Duplikat[]; idBaru: Record<string, string>; dryRun: boolean }
  | {
      ok: false
      status: number
      error: string
      galat: GalatSimpan[]
      konflik: string[]
      details: string[]
    }

async function gzip(teks: string): Promise<Uint8Array | null> {
  try {
    if (typeof CompressionStream === 'undefined') return null
    const arus = new Blob([teks]).stream().pipeThrough(new CompressionStream('gzip'))
    return new Uint8Array(await new Response(arus).arrayBuffer())
  } catch {
    return null
  }
}

export async function kirimSimpan(body: Record<string, unknown>): Promise<HasilKirim> {
  const teks = JSON.stringify(body)
  const gz = await gzip(teks)
  const ukuran = gz ? gz.byteLength : new TextEncoder().encode(teks).byteLength
  if (ukuran > BATAS_BODY_KIRIM) {
    return {
      ok: false,
      status: 413,
      error: `Simpan ini ${(ukuran / 1024 / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB — melewati batas satu Simpan. Simpan sebagian baris lebih dulu.`,
      galat: [],
      konflik: [],
      details: [],
    }
  }
  let res: Response
  try {
    res = await fetch('/api/cash-mutations/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(gz ? { 'content-encoding': 'gzip' } : {}) },
      body: gz ? new Blob([gz as BlobPart]) : teks,
    })
  } catch {
    return { ok: false, status: 0, error: 'Gagal menghubungi server. Draf tetap ada di cadangan.', galat: [], konflik: [], details: [] }
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data?.error === 'string' ? data.error : `Gagal menyimpan (HTTP ${res.status}).`,
      galat: Array.isArray(data?.galat) ? (data.galat as GalatSimpan[]) : [],
      konflik: Array.isArray(data?.konflik) ? (data.konflik as string[]) : [],
      details: Array.isArray(data?.details) ? (data.details as string[]) : [],
    }
  }
  return {
    ok: true,
    ringkasan: data?.ringkasan as Ringkasan,
    duplikat: Array.isArray(data?.duplikat) ? (data.duplikat as Duplikat[]) : [],
    idBaru: (data?.idBaru as Record<string, string>) ?? {},
    dryRun: data?.dryRun === true,
  }
}
