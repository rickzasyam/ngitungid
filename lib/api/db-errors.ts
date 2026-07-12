import { NextResponse } from 'next/server'

// Helper klasifikasi error tulis DB → response terstruktur. Tanpa ini, error
// tak terduga (mis. pelanggaran FK saat replace Master COA yang masih
// direferensi report_line_items) jatuh jadi 500 mentah TANPA body JSON, dan
// frontend cuma bisa menampilkan pesan generik. Semua route yang pakai
// db.batch() harus membungkusnya try/catch lalu memanggil helper ini.

const FK_VIOLATION = '23503'
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

export function isFkViolation(e: unknown): boolean {
  if (pgErrorCode(e) === FK_VIOLATION) return true
  const m = messageOf(e)
  return m.includes('foreign key') || m.includes('violates foreign key constraint')
}

export function isUniqueViolation(e: unknown): boolean {
  if (pgErrorCode(e) === UNIQUE_VIOLATION) return true
  const m = messageOf(e)
  return m.includes('duplicate key') || m.includes('unique constraint')
}

// Fallback terstruktur untuk kegagalan tulis DB yang tak terduga. Pesan generik
// (tidak membocorkan internal), status 500, tapi selalu body JSON `{ error }`
// supaya frontend punya sesuatu yang jelas untuk ditampilkan.
export function dbWriteErrorResponse(e: unknown, message = 'Gagal menyimpan ke database. Coba lagi.') {
  console.error('[db-write]', e)
  return NextResponse.json({ error: message }, { status: 500 })
}
