import { describe, it, expect } from 'vitest'
import { pgErrorCode, isFkViolation, isUniqueViolation } from './db-errors'

// Bentuk error PERSIS seperti yang dilempar drizzle + neon-http (ditangkap dari
// diagnostik nyata terhadap Neon PG18): DrizzleQueryError membungkus error
// driver, jadi SQLSTATE-nya ada di .cause.code — BUKAN di .code — dan
// .message cuma "Failed query: ..." tanpa teks Postgres sama sekali.
function drizzleError(code: string, causeMessage = 'update or delete on table violates foreign key constraint') {
  const err = new Error('Failed query: delete from "clients" where "clients"."id" = $1') as Error & {
    cause?: unknown
  }
  const cause = new Error(causeMessage) as Error & { code?: string }
  cause.code = code
  err.cause = cause
  return err
}

describe('pgErrorCode — SQLSTATE bisa tersembunyi di .cause', () => {
  it('membaca .code langsung', () => {
    const e = Object.assign(new Error('x'), { code: '23505' })
    expect(pgErrorCode(e)).toBe('23505')
  })

  it('membaca .cause.code (bentuk DrizzleQueryError)', () => {
    expect(pgErrorCode(drizzleError('23503'))).toBe('23503')
  })

  it('error biasa → undefined', () => {
    expect(pgErrorCode(new Error('x'))).toBeUndefined()
    expect(pgErrorCode('bukan error')).toBeUndefined()
  })
})

describe('isFkViolation', () => {
  it('23503 foreign_key_violation', () => {
    expect(isFkViolation(drizzleError('23503'))).toBe(true)
  })

  // REGRESI (ditemukan 2026-07-17 saat menguji hapus klien di Neon PG18):
  // ON DELETE RESTRICT memakai SQLSTATE TERSENDIRI 23001, bukan 23503. Dulu
  // hanya 23503 yang didaftarkan, sehingga pelanggaran RESTRICT lolos dan
  // jatuh jadi 500 generik. Dua FK memakai RESTRICT: users.clientId → clients
  // dan reportLineItems.masterCoaId → masterCoa (jalur replace Master COA).
  it('23001 restrict_violation — ON DELETE RESTRICT (regresi)', () => {
    expect(isFkViolation(drizzleError('23001'))).toBe(true)
  })

  it('kode lain bukan FK', () => {
    // Pesan cause-nya HARUS pesan unique yang sebenarnya — kalau diberi teks
    // "foreign key", fallback teks memang seharusnya kena (dan itu benar).
    expect(isFkViolation(drizzleError('23505', 'duplicate key value violates unique constraint'))).toBe(false)
    expect(isFkViolation(new Error('sesuatu yang lain'))).toBe(false)
  })

  // Message drizzle tidak memuat teks Postgres; fallback harus melihat .cause.
  it('fallback teks membaca cause.message, bukan cuma message', () => {
    const e = new Error('Failed query: ...') as Error & { cause?: unknown }
    e.cause = new Error('violates foreign key constraint "x_fk"')
    expect(isFkViolation(e)).toBe(true)
  })
})

describe('isUniqueViolation', () => {
  it('23505 lewat .cause.code', () => {
    expect(isUniqueViolation(drizzleError('23505', 'duplicate key value violates unique constraint'))).toBe(true)
  })

  it('fallback teks lewat cause', () => {
    const e = new Error('Failed query: ...') as Error & { cause?: unknown }
    e.cause = new Error('duplicate key value violates unique constraint "users_email_unique"')
    expect(isUniqueViolation(e)).toBe(true)
  })

  it('FK bukan unique', () => {
    expect(isUniqueViolation(drizzleError('23503'))).toBe(false)
  })
})
