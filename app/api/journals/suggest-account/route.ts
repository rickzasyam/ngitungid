import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { masterCoa } from '@/lib/db/schema'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { suggestJournalAccounts } from '@/lib/gemini/suggest-journal-account'
import { AI_NONAKTIF, aiFeaturesEnabled } from '@/lib/ai-features'

export const runtime = 'nodejs'
// Panggilan Gemini bisa memakan puluhan detik saat free-tier sedang antre.
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AI_MIN_CONFIDENCE = 60
const KETERANGAN_MAX = 500

// POST /api/journals/suggest-account { clientId, keterangan }
//
// Membaca saja — tidak menulis satu baris pun. Saran hanya dikembalikan ke
// layar; yang memutuskan memakainya adalah manusia lewat tombol Terapkan (D10).
// requireAkunting karena yang boleh membuka /jurnal memang hanya mereka, dan
// endpoint ini membakar kuota Gemini milik bersama.
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error
  if (!aiFeaturesEnabled('saranAkunJurnal')) return NextResponse.json({ error: AI_NONAKTIF }, { status: 503 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const clientId = typeof raw.clientId === 'string' ? raw.clientId : ''
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const keterangan = typeof raw.keterangan === 'string' ? raw.keterangan.trim() : ''
  if (keterangan === '') {
    return NextResponse.json({ error: 'Keterangan transaksi wajib diisi dulu.' }, { status: 400 })
  }
  // Dibatasi supaya satu permintaan tidak bisa mengirim dokumen panjang ke
  // Gemini atas nama "keterangan".
  if (keterangan.length > KETERANGAN_MAX) {
    return NextResponse.json(
      { error: `Keterangan terlalu panjang untuk disarankan (maksimal ${KETERANGAN_MAX} karakter).` },
      { status: 400 }
    )
  }

  const accounts = await db
    .select({
      id: masterCoa.id,
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      posisi: masterCoa.posisi,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
    })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, clientId))
    .orderBy(asc(masterCoa.kode))

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: 'Master COA klien ini masih kosong — impor dulu di Settings.' },
      { status: 400 }
    )
  }

  let pairs
  try {
    pairs = await suggestJournalAccounts(keterangan, accounts)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Key belum diisi → 400 (bisa ditindaklanjuti admin). Kuota → 429. Sisanya 502.
    if (/GEMINI_API_KEY/.test(msg)) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY belum diset — saran AI butuh key ini (lihat .env.example).' },
        { status: 400 }
      )
    }
    const isQuota = /\b429\b|quota|rate limit|resource[_ ]?exhausted/i.test(msg)
    return NextResponse.json(
      {
        error: isQuota
          ? 'Kuota AI (Gemini free-tier) sedang penuh — tunggu ~1 menit lalu coba lagi.'
          : 'Gagal meminta saran AI. Coba lagi sebentar.',
      },
      { status: isQuota ? 429 : 502 }
    )
  }

  // Dua penyaring, dan keduanya perlu:
  //  - ambang keyakinan: saran lemah lebih berbahaya daripada tidak ada saran,
  //    karena yang sudah terisi cenderung diterima begitu saja;
  //  - kode yang dikarang: model bisa mengembalikan kode yang tidak ada di COA
  //    klien ini. Dipetakan lewat peta kode→akun, yang tidak kenal dibuang.
  const byKode = new Map(accounts.map(a => [a.kode, a]))
  const suggestions = pairs
    .filter(p => p.confidence >= AI_MIN_CONFIDENCE)
    .map(p => {
      const debit = byKode.get(p.debitKode)
      const kredit = byKode.get(p.kreditKode)
      if (!debit || !kredit) return null
      return {
        debit: { id: debit.id, kode: debit.kode, nama: debit.nama },
        kredit: { id: kredit.id, kode: kredit.kode, nama: kredit.nama },
        confidence: p.confidence,
        reason: p.reason,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return NextResponse.json({ suggestions, considered: pairs.length })
}
