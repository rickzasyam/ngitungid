import { writeFileSync } from 'node:fs'
import { penyediaAnthropic } from '@/lib/ai/anthropic'
import { penyediaGemini } from '@/lib/ai/gemini'
import { penyediaOpenAi } from '@/lib/ai/openai'
import type { AiProvider } from '@/lib/ai/penyedia'
import { hariIniJakarta } from '@/lib/ymd'
import type { DokumenSintetis } from '../fikstur/dokumen-sintetis'
import { penyediaSempurna } from '../fikstur/jawaban-ai'
import { dokumenAcak, dokumenDuaKolom, dokumenLanjutanLintasHalaman, dokumenSatuKolom, dokumenTanpaSaldo } from '../fikstur/koleksi'
import { laporanMarkdown, rangkumUji, ujiDokumen, type Harga, type HasilDokumen, type Ringkasan } from './harness'
import { kesinambunganSementara } from './kesinambungan-sementara'

// Uji banding penyedia dengan DOKUMEN SINTETIS saja (X4).
//
//   pnpm exec tsx --env-file=.env.local lib/bank-statement/uji-banding/cli.ts \
//     --penyedia tiruan,gemini,anthropic:claude-haiku-5-5,openai:<model> \
//     --dokumen 12 --harga anthropic=0.10/0.50@2026-10-06 --keluar <berkas.md>
//
// - "tiruan" = jawaban sempurna tanpa panggilan AI (garis dasar; harus 100%).
// - Penyedia sungguhan butuh kuncinya di env. Kunci DEV (free tier) boleh
//   dipakai DI SINI karena semua dokumennya karangan (UJI-B-, "PT UJI COBA").
// - Tidak ada argumen berkas PDF: rekening koran nyata = X6, di luar repo.
// - Harga diisi dari halaman harga resmi PADA TANGGAL UJI; tanpa --harga,
//   kolom biaya ditulis "harga belum diisi", bukan ditebak.

function arg(nama: string): string | undefined {
  const i = process.argv.indexOf(`--${nama}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function bacaHarga(): Map<string, Harga> {
  const out = new Map<string, Harga>()
  for (const h of (arg('harga') ?? '').split(',').filter(Boolean)) {
    const [penyedia, sisa] = h.split('=')
    const [angka, tanggal] = (sisa ?? '').split('@')
    const [masuk, keluar] = angka.split('/').map(Number)
    if (!penyedia || !Number.isFinite(masuk) || !Number.isFinite(keluar) || !tanggal) throw new Error(`--harga tidak terbaca: ${h}`)
    out.set(penyedia, { masukPerJuta: masuk, keluarPerJuta: keluar, mataUang: 'USD', tanggal })
  }
  return out
}

function penyedia(spek: string): AiProvider | 'tiruan' {
  const [nama, model] = spek.split(':')
  if (nama === 'tiruan') return 'tiruan'
  if (nama === 'gemini') return model ? penyediaGemini(model) : penyediaGemini()
  if (nama === 'anthropic') return penyediaAnthropic({ model })
  if (nama === 'openai') return penyediaOpenAi({ model: model ?? '' })
  throw new Error(`Penyedia tidak dikenal: ${nama}`)
}

async function main() {
  const jumlahAcak = Number(arg('dokumen') ?? 12)
  const dokumen: DokumenSintetis[] = [dokumenSatuKolom(), dokumenDuaKolom(), dokumenTanpaSaldo(), dokumenLanjutanLintasHalaman()]
  for (let i = 1; i <= jumlahAcak; i++) dokumen.push(dokumenAcak(1000 + i, 20 + ((i * 17) % 60)))
  const harga = bacaHarga()
  console.error(`Dokumen SINTETIS: ${dokumen.length} (${dokumen.reduce((n, d) => n + d.kebenaran.length, 0)} halaman). Tidak ada data klien nyata.`)

  const ringkasan: Ringkasan[] = []
  for (const spek of (arg('penyedia') ?? 'tiruan').split(',')) {
    const p = penyedia(spek)
    const hasil: HasilDokumen[] = []
    for (const d of dokumen) {
      const ai = p === 'tiruan' ? await penyediaSempurna(d) : p
      hasil.push(await ujiDokumen(ai, d, kesinambunganSementara, { timeoutMs: 120_000 }))
      const h = hasil[hasil.length - 1]
      console.error(`  ${spek} · ${d.nama}: ${h.kesinambungan === 'tanpa-saldo' ? 'tanpa kolom saldo (tidak diperiksa)' : h.lolosTanpaKoreksi ? 'lolos' : 'TIDAK lolos'}${h.halamanGagal.length ? ` · halaman gagal: ${h.halamanGagal.map(g => `${g.halaman}=${g.jenis}`).join(', ')}` : ''}`)
    }
    const info = p === 'tiruan' ? { nama: 'tiruan', model: 'jawaban-sempurna' } : p
    ringkasan.push(rangkumUji(info as AiProvider, hasil, harga.get(info.nama)))
  }

  const md = laporanMarkdown(ringkasan, {
    tanggal: hariIniJakarta(),
    pemeriksa: 'kesinambunganSementara (pengganti S3 sampai grid masuk main)',
    dokumen: `${dokumen.length} sintetis (4 tetap + ${jumlahAcak} acak deterministik)`,
  })
  const keluar = arg('keluar')
  if (keluar) writeFileSync(keluar, md)
  console.log(md)
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
