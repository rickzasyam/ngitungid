import { NextResponse } from 'next/server'

// Helper klasifikasi error tulis DB → response terstruktur. Tanpa ini, error
// tak terduga (mis. pelanggaran FK saat replace Master COA yang masih
// direferensi report_line_items) jatuh jadi 500 mentah TANPA body JSON, dan
// frontend cuma bisa menampilkan pesan generik. Semua route yang pakai
// db.batch() harus membungkusnya try/catch lalu memanggil helper ini.

const FK_VIOLATION = '23503' // foreign_key_violation
// restrict_violation — SQLSTATE TERPISAH yang dipakai Postgres khusus untuk
// `ON DELETE RESTRICT` (23503 dipakai untuk NO ACTION / FK biasa). Dua FK di
// schema ini memakai RESTRICT: users.clientId → clients, dan
// reportLineItems.masterCoaId → masterCoa. Tanpa kode ini didaftarkan,
// pelanggaran RESTRICT lolos dari isFkViolation() dan jatuh jadi 500 generik —
// padahal justru itu kasus yang paling ingin kita jelaskan ke pengguna.
const RESTRICT_VIOLATION = '23001'
const UNIQUE_VIOLATION = '23505'

// neon-http / pg menaruh SQLSTATE di `.code`; beberapa pembungkus menyarangkannya
// di `.cause`. Cek keduanya.
export function pgErrorCode(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const err = e as { code?: unknown; cause?: { code?: unknown } }
  if (typeof err.code === 'string') return err.code
  if (err.cause && typeof err.cause.code === 'string') return err.cause.code
  return undefined
}

function messageOf(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).toLowerCase()
}

// drizzle membungkus error driver: pesan Postgres yang sebenarnya ada di
// e.cause.message, sementara e.message cuma "Failed query: ...".
function causeMessageOf(e: unknown): string {
  if (typeof e !== 'object' || e === null) return ''
  const cause = (e as { cause?: unknown }).cause
  if (cause instanceof Error) return cause.message.toLowerCase()
  return typeof cause === 'string' ? cause.toLowerCase() : ''
}

/** FK biasa (23503) MAUPUN pelanggaran ON DELETE RESTRICT (23001). */
export function isFkViolation(e: unknown): boolean {
  const code = pgErrorCode(e)
  if (code === FK_VIOLATION || code === RESTRICT_VIOLATION) return true
  // Fallback teks. CATATAN: drizzle membungkus error asli jadi DrizzleQueryError
  // yang message-nya cuma "Failed query: ..." — teks Postgres-nya ada di
  // e.cause.message, bukan di e.message. Jadi fallback ini sering TIDAK kena;
  // pengecekan SQLSTATE di atas yang jadi andalan.
  const m = messageOf(e) + ' ' + causeMessageOf(e)
  return m.includes('foreign key') || m.includes('violates foreign key constraint') || m.includes('still referenced')
}

export function isUniqueViolation(e: unknown): boolean {
  if (pgErrorCode(e) === UNIQUE_VIOLATION) return true
  const m = messageOf(e) + ' ' + causeMessageOf(e)
  return m.includes('duplicate key') || m.includes('unique constraint')
}

// Fallback terstruktur untuk kegagalan tulis DB yang tak terduga. Pesan generik
// (tidak membocorkan internal), status 500, tapi selalu body JSON `{ error }`
// supaya frontend punya sesuatu yang jelas untuk ditampilkan.
export function dbWriteErrorResponse(e: unknown, message = 'Gagal menyimpan ke database. Coba lagi.') {
  console.error('[db-write]', e)
  return NextResponse.json({ error: message }, { status: 500 })
}
