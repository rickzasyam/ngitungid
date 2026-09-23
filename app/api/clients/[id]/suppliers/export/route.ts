import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, masterCoa, masterSupplier } from '@/lib/db/schema'
import { requireInternal } from '@/lib/api/guards'
import { canAccessClientData } from '@/lib/roles'
import { buildSupplierWorkbook, supplierExportFilename } from '@/lib/supplier-export'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/clients/[id]/suppliers/export — unduh .xlsx.
//
// requireInternal, sama dengan GET daftar (R4): finance boleh mengunduh karena
// ia boleh melihat. Klien tetap tidak. Ekspor adalah operasi BACA — ia tetap
// tersedia untuk finance meski tombol tulis lainnya disembunyikan.
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

  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, id)).limit(1)
  if (!client) {
    return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 })
  }

  // Urutan SAMA dengan GET daftar supaya isi berkas cocok dengan yang tampil di
  // tab Supplier — cadangan yang urutannya berbeda dari layar bikin ragu saat
  // dibandingkan. leftJoin: supplier tanpa akun default tetap ikut terekspor.
  const rows = await db
    .select({
      nama: masterSupplier.nama,
      kontak: masterSupplier.kontak,
      npwp: masterSupplier.npwp,
      bankNama: masterSupplier.bankNama,
      bankRekening: masterSupplier.bankRekening,
      bankAtasNama: masterSupplier.bankAtasNama,
      akunHutangKode: masterCoa.kode,
    })
    .from(masterSupplier)
    .leftJoin(masterCoa, eq(masterSupplier.akunHutangDefaultId, masterCoa.id))
    .where(eq(masterSupplier.clientId, id))
    .orderBy(asc(masterSupplier.nama))

  const body = buildSupplierWorkbook(rows)
  const filename = supplierExportFilename(client.name)
  // Nama klien boleh mengandung huruf non-ASCII. RFC 5987: `filename` ASCII
  // sebagai fallback, `filename*` yang sebenarnya dipakai browser modern.
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '-').replace(/"/g, '')

  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // Cadangan harus selalu mencerminkan isi DB saat diminta, bukan salinan
      // proxy dari lima menit lalu.
      'Cache-Control': 'no-store',
    },
  })
}
