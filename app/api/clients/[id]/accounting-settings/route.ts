import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clientAccountingSettings } from '@/lib/db/schema'
import { requireAkunting, requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { loadAccountingSettings } from '@/lib/api/accounting-settings'
import { assertInvoiceAccountsBelongToClient } from '@/lib/api/purchase-queries'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/accounting-settings — setelan pembukuan per klien.
//
// ══ KETIADAAN BARIS DIJAWAB DENGAN NILAI BAWAAN, BUKAN 404 ════════════════
// Barisnya dibuat lazily, jadi mayoritas klien memang belum punya. Menjawab
// 404 akan memaksa setiap pemanggil menangani "belum disetel" sebagai kegagalan
// — dan pemanggil yang lupa akan menyimpulkan setelannya menyala. Respons
// selalu berbentuk sama; yang berbeda cuma isinya.
//
// `postingBisaDiedit` BAWAANNYA FALSE (D42): posting permanen kecuali klien ini
// memang pernah disetel sebaliknya.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireInternal()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const row = await loadAccountingSettings(id)
  return NextResponse.json({
    akunPpnMasukanId: row?.akunPpnMasukanId ?? null,
    postingBisaDiedit: row?.postingBisaDiedit === true,
    /** false = belum pernah disetel. Dipakai UI untuk menjelaskan bawaannya. */
    tersimpan: row !== null,
  })
}

// PATCH /api/clients/[id]/accounting-settings — menyetel pembukuan klien.
//
// ══ HANYA AKUNTING, BUKAN SEKADAR INTERNAL ════════════════════════════════
// GET-nya requireInternal karena membaca setelan tidak mengubah apa pun. PATCH
// ini menyalakan sakelar yang membuat jurnal TERPOSTING bisa diubah — itu
// keputusan pembukuan, bukan keputusan tampilan.
//
// ══ UPSERT, DAN BARISNYA LAHIR DI SINI ════════════════════════════════════
// Baris setelan dibuat lazily. Menulis lewat UPDATE saja akan diam-diam tidak
// melakukan apa pun untuk klien yang belum punya baris — dan UI akan
// menampilkan nilai yang dikiranya tersimpan. onConflictDoUpdate membuat kedua
// jalur (baris baru / baris lama) berakhir di keadaan yang sama.
//
// Field yang TIDAK dikirim tidak diubah: formulirnya bisa menyimpan satu bagian
// saja, dan setelan yang tidak disentuh tidak boleh ikut ter-reset.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireAkunting()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as {
    akunPpnMasukanId?: string | null
    postingBisaDiedit?: boolean
  } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 })
  }

  const ubahPpn = 'akunPpnMasukanId' in body
  const ubahPosting = 'postingBisaDiedit' in body
  if (!ubahPpn && !ubahPosting) {
    return NextResponse.json({ error: 'Tidak ada setelan yang dikirim.' }, { status: 400 })
  }

  // Dibaca SEKALI dan dipakai sebagai nilai dasar untuk field yang tidak
  // dikirim — bukan dibaca ulang setelah menulis.
  const lama = await loadAccountingSettings(id)

  let akunPpnMasukanId = lama?.akunPpnMasukanId ?? null
  if (ubahPpn) {
    const v = body.akunPpnMasukanId
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: 'Akun PPN Masukan tidak valid.' }, { status: 400 })
    }
    akunPpnMasukanId = v === null || v === '' ? null : v
    const salah = await assertInvoiceAccountsBelongToClient([akunPpnMasukanId], id)
    if (salah) return salah
  }

  let postingBisaDiedit = lama?.postingBisaDiedit === true
  if (ubahPosting) {
    if (typeof body.postingBisaDiedit !== 'boolean') {
      return NextResponse.json(
        { error: 'Setelan "posting bisa diedit" harus true atau false.' },
        { status: 400 }
      )
    }
    postingBisaDiedit = body.postingBisaDiedit
  }

  await db
    .insert(clientAccountingSettings)
    .values({ clientId: id, akunPpnMasukanId, postingBisaDiedit })
    .onConflictDoUpdate({
      target: clientAccountingSettings.clientId,
      set: { akunPpnMasukanId, postingBisaDiedit, updatedAt: new Date() },
    })

  return NextResponse.json({ akunPpnMasukanId, postingBisaDiedit, tersimpan: true })
}
