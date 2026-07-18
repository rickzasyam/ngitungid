import { describe, it, expect, vi } from 'vitest'
import { resolveNewAccountClientId } from './account'

const CLIENT_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const existsAll = async () => true
const existsNone = async () => false

describe('resolveNewAccountClientId — clientId ASIMETRIS per role', () => {
  it("user + clientId valid & EXIST → clientId diteruskan (siap insert / 201)", async () => {
    const r = await resolveNewAccountClientId('user', CLIENT_A, existsAll)
    expect(r).toEqual({ ok: true, clientId: CLIENT_A })
  })

  it('user TANPA clientId → error (→ 400)', async () => {
    const r = await resolveNewAccountClientId('user', undefined, existsAll)
    expect(r.ok).toBe(false)
  })

  it('user + clientId bukan UUID → error, DB tidak di-hit', async () => {
    const spy = vi.fn(async () => true)
    const r = await resolveNewAccountClientId('user', 'bukan-uuid', spy)
    expect(r.ok).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('user + clientId valid tapi TIDAK exist → error (→ 400)', async () => {
    const r = await resolveNewAccountClientId('user', CLIENT_A, existsNone)
    expect(r.ok).toBe(false)
  })

  // Inti keamanan: staf TIDAK boleh ke-assign clientId walau body mengirimnya.
  it.each(['akunting', 'owner'] as const)(
    "%s → clientId DIPAKSA null, body diabaikan (clientExists tak dipanggil)",
    async (role) => {
      const spy = vi.fn(async () => true)
      const r = await resolveNewAccountClientId(role, CLIENT_A, spy)
      expect(r).toEqual({ ok: true, clientId: null })
      expect(spy).not.toHaveBeenCalled()
    }
  )
})
