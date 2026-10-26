import { describe, expect, it } from 'vitest'
import { ringkasEnv } from './env-aman'

const RAHASIA = {
  gemini: 'AQ.RahasiaGeminiPalsu_1234567890abcdefghijklmnopqrstuv',
  auth: 'c2VjcmV0LWF1dGgtcGFsc3U=',
  pwd: 'npg_PasswordPalsu99',
}

const ENV = [
  '# komentar yang memuat AQ.RahasiaGeminiPalsu_1234567890abcdefghijklmnopqrstuv',
  `DATABASE_URL="postgresql://neondb_owner:${RAHASIA.pwd}@ep-rapid-hat-aos7vlb0-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"`,
  `AUTH_SECRET=${RAHASIA.auth}`,
  `export GEMINI_API_KEY='${RAHASIA.gemini}'`,
  'AI_FEATURES_ENABLED="true"',
  'KOSONG=',
  'DENGAN_KOMENTAR=abc # catatan',
  '',
].join('\r\n')

describe('ringkasEnv', () => {
  const keluar = ringkasEnv(ENV)
  const semua = keluar.join('\n')

  it('tidak pernah memuat nilai rahasia, utuh maupun potongan', () => {
    for (const r of Object.values(RAHASIA)) {
      expect(semua).not.toContain(r)
      expect(semua).not.toContain(r.slice(0, 8))
    }
    expect(semua).not.toContain('neondb_owner')
  })

  it('melaporkan nama kunci dan panjang nilai saja (kutip & CRLF dibuang, komentar ujung bukan nilai)', () => {
    expect(keluar).toContain(`GEMINI_API_KEY: ${RAHASIA.gemini.length} karakter`)
    expect(keluar).toContain(`AUTH_SECRET: ${RAHASIA.auth.length} karakter`)
    expect(keluar).toContain('AI_FEATURES_ENABLED: 4 karakter')
    expect(keluar).toContain('KOSONG: 0 karakter')
    expect(keluar).toContain('DENGAN_KOMENTAR: 3 karakter')
    expect(keluar).toHaveLength(6)
  })

  it('menyebut endpoint DATABASE_URL tanpa -pooler, dan menandai dev', () => {
    expect(keluar[0]).toMatch(/^DATABASE_URL: \d+ karakter · endpoint ep-rapid-hat-aos7vlb0 \(dev ✓\)$/)
  })

  it('memperingatkan keras bila DATABASE_URL mengarah ke main', () => {
    const [b] = ringkasEnv('DATABASE_URL=postgresql://u:p@ep-small-mode-ao8ouvtp.c-2.aws.neon.tech/db')
    expect(b).toContain('MAIN (produksi)')
    expect(b).not.toContain('u:p')
  })
})
