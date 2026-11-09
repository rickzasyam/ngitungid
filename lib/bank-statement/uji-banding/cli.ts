import { writeFileSync } from 'node:fs'
import { jenisGalatAi, type AiProvider } from '@/lib/ai/penyedia'
import { penyediaEkstraksi } from '@/lib/ai/pilih-penyedia'
import { hariIniJakarta } from '@/lib/ymd'
import type { DokumenSintetis } from '../fikstur/dokumen-sintetis'
import { penyediaSempurna } from '../fikstur/jawaban-ai'
import { dokumenAcak, dokumenDuaKolom, dokumenLanjutanLintasHalaman, dokumenSatuKolom, dokumenTanpaSaldo } from '../fikstur/koleksi'
import { laporanMarkdown, rangkumUji, ujiDokumen, type Harga, type HasilDokumen, type Ringkasan } from './harness'
import { kesinambunganSementara } from './kesinambungan-sementara'
import { bacaStatus, tulisStatus, type StatusUji } from './status-uji'

// Uji banding penyedia dengan DOKUMEN SINTETIS saja (X4).
//
//   pnpm exec tsx --env-file=.env.local lib/bank-statement/uji-banding/cli.ts \
//     --penyedia tiruan,gemini:gemini-3.5-flash-lite,gemini:gemini-3.5-flash-lite+gemini-3.5-flash,anthropic:claude-haiku-5-5 \
//     --dokumen 12 --harga gemini:gemini-3.5-flash-lite=0.30/2.50@2026-10-28 \
//     --status <status.json> --keluar <berkas.md>
//
// - "tiruan" = jawaban sempurna tanpa panggilan AI (garis dasar; harus 100%).
// - Penyedia dibuat PERSIS seperti route (`penyediaEkstraksi`): Gemini dengan
//   thinking minimal dan tanpa mengulang kuota harian. "gemini" tanpa model =
//   bawaan ekstraksi (Flash-Lite).
// - "<penyedia>:<model>+<model pengulang>" = alur route dengan ulang otomatis
//   (`susunDenganUlang`): halaman yang ditolak penjaga diulang sekali dengan
//   model pengulang. Biaya memakai --harga kedua spek ("gemini:<model>").
// - --status: hasil per dokumen disimpan; menjalankan ulang perintah yang sama
//   melewati dokumen yang sudah selesai. Kuota HARIAN habis → penyedia itu
//   berhenti, sisanya dicatat "belum diuji", lanjutkan sesudah kuota direset.
// - --harga dikunci per SPEK ("gemini:<model>=masuk/keluar@tanggal") atau per
//   nama penyedia ("anthropic=…") bila hanya satu model penyedia itu yang diuji.
// - Sesi cloud: Node `fetch` baru memakai proxy keluar dengan NODE_USE_ENV_PROXY=1.
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

function penyedia(spek: string): { ai: AiProvider | 'tiruan'; ulang: AiProvider | null } {
  const [nama, model] = spek.split(':')
  if (nama === 'tiruan') return { ai: 'tiruan', ulang: null }
  const [utama, ulang] = (model ?? '').split('+')
  return { ai: penyediaEkstraksi(nama, utama || undefined), ulang: ulang ? penyediaEkstraksi(nama, ulang) : null }
}

async function main() {
  const jumlahAcak = Number(arg('dokumen') ?? 12)
  const dokumen: DokumenSintetis[] = [dokumenSatuKolom(), dokumenDuaKolom(), dokumenTanpaSaldo(), dokumenLanjutanLintasHalaman()]
  for (let i = 1; i <= jumlahAcak; i++) dokumen.push(dokumenAcak(1000 + i, 20 + ((i * 17) % 60)))
  const harga = bacaHarga()
  console.error(`Dokumen SINTETIS: ${dokumen.length} (${dokumen.reduce((n, d) => n + d.kebenaran.length, 0)} halaman). Tidak ada data klien nyata.`)

  const berkasStatus = arg('status')
  const status: StatusUji = berkasStatus ? bacaStatus(berkasStatus) : { versi: 1, hasil: {} }
  const ringkasan: Ringkasan[] = []
  const belumDiuji: string[] = []
  for (const spek of (arg('penyedia') ?? 'tiruan').split(',')) {
    const { ai: p, ulang } = penyedia(spek)
    const sudah = new Map((status.hasil[spek] ?? []).map(h => [h.nama, h]))
    const hasil: HasilDokumen[] = []
    for (const [i, d] of dokumen.entries()) {
      const lama = sudah.get(d.nama)
      if (lama) {
        hasil.push(lama)
        console.error(`  ${spek} · ${d.nama}: dari status (sudah diuji)`)
        continue
      }
      const ai = p === 'tiruan' ? await penyediaSempurna(d) : p
      try {
        hasil.push(await ujiDokumen(ai, d, kesinambunganSementara, { timeoutMs: 120_000, aiUlang: ulang ?? undefined }))
      } catch (e) {
        if (jenisGalatAi(e) !== 'kuotaHarian') throw e
        const sisa = dokumen.slice(i).map(x => x.nama)
        belumDiuji.push(`${spek}: ${sisa.length} dokumen (${sisa.join(', ')})`)
        console.error(`  ${spek}: KUOTA HARIAN HABIS di ${d.nama} — ${sisa.length} dokumen belum diuji`)
        break
      }
      if (berkasStatus) {
        status.hasil[spek] = [...(status.hasil[spek] ?? []).filter(h => h.nama !== d.nama), hasil[hasil.length - 1]]
        tulisStatus(berkasStatus, status)
      }
      const h = hasil[hasil.length - 1]
      console.error(`  ${spek} · ${d.nama}: ${h.kesinambungan === 'tanpa-saldo' ? 'tanpa kolom saldo (tidak diperiksa)' : h.lolosTanpaKoreksi ? 'lolos' : 'TIDAK lolos'}${h.halamanDiulang?.length ? ` · diulang: ${h.halamanDiulang.join(', ')}` : ''}${h.halamanGagal.length ? ` · halaman gagal: ${h.halamanGagal.map(g => `${g.halaman}=${g.jenis}`).join(', ')}` : ''}`)
    }
    const info = p === 'tiruan' ? { nama: 'tiruan', model: 'jawaban-sempurna' } : p
    const utama = ulang ? spek.split('+')[0] : spek
    ringkasan.push(
      rangkumUji(info as AiProvider, hasil, harga.get(utama) ?? harga.get(info.nama), ulang ? { model: ulang.model, harga: harga.get(`${ulang.nama}:${ulang.model}`) } : undefined)
    )
  }

  const md =
    laporanMarkdown(ringkasan, {
      tanggal: hariIniJakarta(),
      pemeriksa: 'kesinambunganSementara (pengganti S3 sampai grid masuk main)',
      dokumen: `${dokumen.length} sintetis (4 tetap + ${jumlahAcak} acak deterministik)`,
    }) +
    (belumDiuji.length > 0
      ? `\n**Belum diuji — kuota harian habis** (angka di atas hanya atas dokumen yang selesai): ${belumDiuji.join('; ')}.\n`
      : '')
  const keluar = arg('keluar')
  if (keluar) writeFileSync(keluar, md)
  console.log(md)
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
