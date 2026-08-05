import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, masterCoa } from '@/lib/db/schema'
import { requireUser } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { buildCoaWorkbook, coaExportFilename } from '@/lib/coa-export'

// xlsx + neon-http butuh Node runtime (bukan edge) — sama dengan route import.
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/coa/export — unduh Master COA klien sebagai .xlsx.
//
// Cadangan untuk operasi paling destruktif di app ini: mengganti Master COA
// menimpa seluruh isinya, dan sampai fitur ini ada tidak ada cara mengambil
// snapshot lebih dulu.
//
// AKSES: requireUser + canAccessClientData — asimetris persis seperti GET /coa
// di sebelah. Staf (owner/akunting) boleh klien mana pun; role 'user' HANYA
// klien miliknya sendiri. Membaca COA sendiri memang sudah haknya lewat tab
// Master COA, jadi mengunduhnya tidak membuka data baru apa pun.
//
// Catatan path: folder-nya `[id]`, bukan `[clientId]`, karena Next.js melarang
// dua nama slug berbeda pada segmen dinamis yang sama dan
// app/api/clients/[id]/… sudah lebih dulu ada.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireUser()
  if ('error' in g) return g.error

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID klien tidak valid.' }, { status: 400 })
  }
  if (!canAccessClientData(g.user.role, g.user.clientId, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) {
    return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })
  }

  // Urutan SAMA dengan GET /coa supaya isi file cocok dengan yang tampil di
  // tab Master COA — cadangan yang urutannya berbeda dari layar bikin ragu
  // saat dibandingkan.
  const rows = await db
    .select({
      kode: masterCoa.kode,
      nama: masterCoa.nama,
      posisi: masterCoa.posisi,
      kelompok: masterCoa.kelompok,
      subKelompok: masterCoa.subKelompok,
      classCf: masterCoa.classCf,
    })
    .from(masterCoa)
    .where(eq(masterCoa.clientId, id))
    .orderBy(asc(masterCoa.kode))

  const body = buildCoaWorkbook(rows)
  const filename = coaExportFilename(client.name)
  // Nama klien boleh mengandung huruf non-ASCII. RFC 5987: `filename` ASCII
  // sebagai fallback untuk klien lama, `filename*` yang sebenarnya dipakai
  // browser modern.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '-').replace(/"/g, '')

  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(body.byteLength),
      // Snapshot hidup — jangan sampai browser menyajikan cadangan basi.
      'Cache-Control': 'no-store',
    },
  })
}
