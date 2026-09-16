import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { masterCoa } from '@/lib/db/schema'
import { isHutangAccount } from '@/lib/supplier'

// Penjaga yang dipakai BERSAMA oleh route tambah, ubah, dan impor supplier.
// Modul terpisah karena Next menolak export non-handler di berkas route, dan
// karena aturannya harus sama persis di ketiga jalur: satu salinan yang lebih
// longgar di salah satunya sudah cukup untuk memasukkan akun yang salah.

/**
 * Akun hutang default HARUS milik klien yang sama DAN benar-benar akun hutang.
 *
 * Dua pemeriksaan, dua alasan berbeda:
 *   1. Milik klien — mencegah id akun klien lain diselundupkan lewat body.
 *   2. Benar-benar hutang — mencegah supplier dipasangi akun pendapatan atau
 *      aset. Nilainya "cuma" pengisi awal formulir jurnal, tapi pengisi awal
 *      yang salah lebih berbahaya daripada kosong: ia terlihat sudah benar,
 *      jadi tidak ada yang memeriksanya.
 *
 * Mengembalikan response galat, atau null kalau sah.
 */
export async function assertAkunHutangMilikKlien(
  akunId: string | null,
  clientId: string
): Promise<NextResponse | null> {
  if (!akunId) return null
  const [akun] = await db
    .select({ id: masterCoa.id, subKelompok: masterCoa.subKelompok, kode: masterCoa.kode })
    .from(masterCoa)
    .where(and(eq(masterCoa.id, akunId), eq(masterCoa.clientId, clientId)))
    .limit(1)
  if (!akun) {
    return NextResponse.json(
      { error: 'Akun hutang default tidak ditemukan pada Master COA klien ini.' },
      { status: 400 }
    )
  }
  if (!isHutangAccount(akun.subKelompok)) {
    return NextResponse.json(
      {
        error: `Akun "${akun.kode}" bukan akun hutang.`,
        details: [`Sub kelompoknya "${akun.subKelompok}" tidak terklasifikasi sebagai hutang.`],
      },
      { status: 400 }
    )
  }
  return null
}
