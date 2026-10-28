import { NextResponse } from 'next/server'
import { requireAkunting } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { loadCashAccount } from '@/lib/api/cash-mutation-queries'
import { AI_NONAKTIF, aiFeaturesEnabled } from '@/lib/ai-features'
import { jenisGalatAi } from '@/lib/ai/penyedia'
import { penyediaDariEnv } from '@/lib/ai/pilih-penyedia'
import { GalatSusun, susunHalaman, type SumberHalaman } from '@/lib/bank-statement/susun-tabel'

export const runtime = 'nodejs'
// Satu halaman per panggilan; penyedia bisa lambat saat antre.
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Batas body: di bawah ±4,5 MB body fungsi Vercel. PNG halaman A4 skala 2
// biasanya < 1 MB (≈ 1,35 MB base64).
const BODY_MAKS = 4_000_000
const BARIS_MAKS = 400
const PANJANG_BARIS_MAKS = 2_000
const HALAMAN_MAKS = 500
const TIMEOUT_PENYEDIA_MS = 50_000

// POST /api/cash-mutations/ekstrak-halaman (MP §5.G X4)
//   { clientId, akunKasId, halaman, baris: string[] | gambarPng: string, kolomSebelumnya?: string[] }
//   → HalamanMentah (lib/mutasi-kas/kontrak-baris-mentah.ts), persis.
//
// SATU halaman per panggilan; browser memanggilnya berurutan (progres, ulangi
// per halaman, bisa dibatalkan). Teks halaman sudah diekstrak DI BROWSER (D56):
// PDF-nya tidak pernah sampai ke sini.
//
// TIDAK MENULIS dan TIDAK MENCATAT ISI apa pun: tanpa DB tulis, tanpa berkas,
// tanpa log konsol; galat dijawab sebagai respons (bukan dilempar ke pelacak galat) dan
// pesannya tanpa isi baris. Gerbang `ekstraksiRekeningKoran` (sakelar SENDIRI,
// bawaan mati) diperiksa sebelum body dibaca.
export async function POST(req: Request) {
  const g = await requireAkunting()
  if ('error' in g) return g.error
  if (!aiFeaturesEnabled('ekstraksiRekeningKoran')) return NextResponse.json({ error: AI_NONAKTIF }, { status: 503 })

  const panjang = Number(req.headers.get('content-length') ?? 0)
  if (panjang > BODY_MAKS) return NextResponse.json({ error: 'Halaman terlalu besar untuk diproses.' }, { status: 413 })
  let teks: string
  try {
    teks = await req.text()
  } catch {
    return NextResponse.json({ error: 'Body tidak terbaca.' }, { status: 400 })
  }
  if (teks.length > BODY_MAKS) return NextResponse.json({ error: 'Halaman terlalu besar untuk diproses.' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(teks)
  } catch {
    return NextResponse.json({ error: 'Body harus JSON.' }, { status: 400 })
  }
  const raw = (body ?? {}) as Record<string, unknown>

  const clientId = typeof raw.clientId === 'string' ? raw.clientId : ''
  const akunKasId = typeof raw.akunKasId === 'string' ? raw.akunKasId : ''
  if (!UUID_RE.test(clientId)) return NextResponse.json({ error: 'clientId tidak valid.' }, { status: 400 })
  if (!UUID_RE.test(akunKasId)) return NextResponse.json({ error: 'akunKasId tidak valid.' }, { status: 400 })
  const halaman = raw.halaman
  if (typeof halaman !== 'number' || !Number.isInteger(halaman) || halaman < 1 || halaman > HALAMAN_MAKS) {
    return NextResponse.json({ error: 'Nomor halaman tidak valid.' }, { status: 400 })
  }

  const daftarTeks = (v: unknown, maks: number, panjangMaks: number) =>
    Array.isArray(v) && v.length <= maks && v.every(x => typeof x === 'string' && x.length <= panjangMaks)
  let sumber: SumberHalaman
  const adaBaris = raw.baris !== undefined
  const adaGambar = raw.gambarPng !== undefined
  if (adaBaris === adaGambar) {
    return NextResponse.json({ error: 'Kirim tepat satu: baris teks halaman ATAU gambarPng.' }, { status: 400 })
  }
  if (adaBaris) {
    if (!daftarTeks(raw.baris, BARIS_MAKS, PANJANG_BARIS_MAKS)) return NextResponse.json({ error: 'Baris halaman tidak valid.' }, { status: 400 })
    sumber = { jenis: 'teks', baris: raw.baris as string[] }
  } else {
    // PNG base64 diawali "iVBORw0KGgo" (tanda tangan PNG). Selain itu ditolak
    // sebelum sampai ke penyedia.
    if (typeof raw.gambarPng !== 'string' || !raw.gambarPng.startsWith('iVBORw0KGgo')) {
      return NextResponse.json({ error: 'gambarPng harus PNG base64.' }, { status: 400 })
    }
    sumber = { jenis: 'gambar', base64: raw.gambarPng }
  }
  const kolomSebelumnya = raw.kolomSebelumnya ?? []
  if (!daftarTeks(kolomSebelumnya, 50, 200)) return NextResponse.json({ error: 'kolomSebelumnya tidak valid.' }, { status: 400 })

  if (!canAccessClientData(g.user.role, g.user.clientId, clientId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Akun kas harus milik klien ini DAN akun kas/bank — aturan yang sama dengan
  // jalur tulis mutasi, supaya ekstraksi hanya dipakai di konteks yang sah.
  if (!(await loadCashAccount(clientId, akunKasId))) {
    return NextResponse.json({ error: 'Akun kas tidak ditemukan pada klien ini, atau bukan akun kas/bank.' }, { status: 400 })
  }

  try {
    const ai = penyediaDariEnv()
    const r = await susunHalaman(ai, { halaman, sumber, kolomSebelumnya: kolomSebelumnya as string[], timeoutMs: TIMEOUT_PENYEDIA_MS })
    return NextResponse.json(r.halaman)
  } catch (e) {
    if (e instanceof GalatSusun) {
      // `masalah` hanya menyebut nomor baris & jenis kerusakan — tanpa isi baris.
      return NextResponse.json(
        { error: `Halaman ${halaman} tidak bisa disusun dengan yakin — ulangi halaman ini.`, masalah: e.masalah },
        { status: 422 }
      )
    }
    const jenis = jenisGalatAi(e)
    const [status, pesan] =
      jenis === 'kuotaHarian'
        ? [429, 'Kuota harian penyedia AI sudah habis — ekstraksi bisa diulang sesudah kuota direset.']
        : jenis === 'kuota'
          ? [429, 'Kuota penyedia AI sedang penuh — tunggu sebentar lalu ulangi halaman ini.']
          : jenis === 'batasWaktu'
            ? [504, 'Penyedia AI terlalu lama menjawab — ulangi halaman ini.']
            : jenis === 'konfigurasi'
              ? [503, 'Penyedia AI untuk ekstraksi rekening koran belum dikonfigurasi.']
              : jenis === 'ditolak'
                ? [422, 'Penyedia AI menolak memproses halaman ini.']
                : [502, 'Gagal meminta penyedia AI. Ulangi halaman ini.']
    return NextResponse.json({ error: pesan }, { status })
  }
}
