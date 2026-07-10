// Fixture data khusus DEVELOPMENT — bukan data klien asli.
//
// Dijalankan lewat `pnpm db:seed:dev` (tsx --env-file=.env.local).
// Idempotent: setiap run menghapus fixture lama untuk 3 klien seed, lalu
// insert ulang. seed.ts (clients + admin) TIDAK disentuh — jalankan itu dulu.
//
// Tujuannya membuat /coa-mapping bisa diverifikasi: tiap klien punya Master
// COA dan line item yang BERBEDA, jadi kalau switcher klien bekerja, isi
// dropdown + daftar akun ikut berubah secara kasat mata.
import { inArray } from 'drizzle-orm'
import { db } from './index'
import {
  clients,
  masterCoa,
  financialReports,
  reportLineItems,
  coaMappingHistory,
} from './schema'

const RASYUKA = '11111111-1111-1111-1111-111111111111'
const GRAPHICOOK = '22222222-2222-2222-2222-222222222222'
const NUSANTARA = '33333333-3333-3333-3333-333333333333'
const CLIENT_IDS = [RASYUKA, GRAPHICOOK, NUSANTARA]

type CoaSeed = {
  kode: string
  nama: string
  posisi: 'Debit' | 'Kredit'
  kelompok: 'Laba Rugi' | 'Neraca'
  subKelompok: string
  classCf: 'Operating' | 'Investing' | 'Funding' | null
}

// ── Master COA per klien — sengaja dibuat berbeda total ──────
const COA: Record<string, CoaSeed[]> = {
  [RASYUKA]: [
    { kode: '04-0001', nama: 'Penjualan Bruto - Shopee', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: '04-0002', nama: 'Penjualan Bruto - Tiktok', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: '04-0003', nama: 'Penjualan Bruto - Offline', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: '05-0001', nama: 'HPP - Shopee', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'HPP', classCf: 'Operating' },
    { kode: '05-0002', nama: 'HPP - Tiktok', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'HPP', classCf: 'Operating' },
    { kode: '11-0001', nama: 'Biaya Admin Marketplace - Shopee', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: '11-0003', nama: 'Beban Iklan - Shopee', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: '11-0005', nama: 'Beban Iklan - Meta', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: '11-0006', nama: 'Biaya Pengiriman', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: '24-0001', nama: 'Beban Gaji', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: '25-0001', nama: 'Biaya Sewa Kantor', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: '25-0002', nama: 'Biaya Utilitas', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: '32-0001', nama: 'Beban Penyusutan Peralatan', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Lain-lain', classCf: 'Investing' },
    { kode: '10-0001', nama: 'Kas dan Setara Kas', posisi: 'Debit', kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', classCf: null },
  ],
  [GRAPHICOOK]: [
    { kode: 'JK-1001', nama: 'Pendapatan Jasa Desain', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: 'JK-1002', nama: 'Pendapatan Jasa Branding', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: 'JK-1003', nama: 'Pendapatan Retainer Bulanan', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: 'JK-2001', nama: 'Beban Freelancer Desainer', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: 'JK-2002', nama: 'Beban Lisensi Software Kreatif', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: 'JK-2003', nama: 'Beban Stock Photo & Font', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Variabel', classCf: 'Operating' },
    { kode: 'JK-3001', nama: 'Gaji Tim Kreatif', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: 'JK-3002', nama: 'Sewa Studio', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: 'JK-3003', nama: 'Beban Internet Studio', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: 'JK-9001', nama: 'Kas Operasional Studio', posisi: 'Debit', kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', classCf: null },
  ],
  [NUSANTARA]: [
    { kode: 'MF-4001', nama: 'Penjualan Produk Jadi', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: 'MF-4002', nama: 'Penjualan Produk Setengah Jadi', posisi: 'Kredit', kelompok: 'Laba Rugi', subKelompok: 'Penerimaan', classCf: 'Operating' },
    { kode: 'MF-5001', nama: 'Biaya Bahan Baku Langsung', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'HPP', classCf: 'Operating' },
    { kode: 'MF-5002', nama: 'Biaya Tenaga Kerja Langsung', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'HPP', classCf: 'Operating' },
    { kode: 'MF-5003', nama: 'Biaya Overhead Pabrik', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'HPP', classCf: 'Operating' },
    { kode: 'MF-6001', nama: 'Beban Listrik Pabrik', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: 'MF-6002', nama: 'Beban Perawatan Mesin', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: 'MF-6003', nama: 'Beban Penyusutan Mesin', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Lain-lain', classCf: 'Investing' },
    { kode: 'MF-7001', nama: 'Beban Gaji Staf Administrasi', posisi: 'Debit', kelompok: 'Laba Rugi', subKelompok: 'Biaya Fixed', classCf: 'Operating' },
    { kode: 'MF-9001', nama: 'Persediaan Bahan Baku', posisi: 'Debit', kelompok: 'Neraca', subKelompok: 'Aktiva Lancar', classCf: null },
    { kode: 'MF-9002', nama: 'Mesin dan Peralatan Pabrik', posisi: 'Debit', kelompok: 'Neraca', subKelompok: 'Aktiva Tetap', classCf: null },
  ],
}

// ── Periode laporan per klien ────────────────────────────────
// Rasyuka punya 2 periode supaya period selector benar-benar punya pilihan.
type PeriodSeed = { periodStart: string; periodEnd: string }
const PERIODS: Record<string, PeriodSeed[]> = {
  [RASYUKA]: [
    { periodStart: '2026-01-01', periodEnd: '2026-01-31' },
    { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
  ],
  [GRAPHICOOK]: [{ periodStart: '2026-01-01', periodEnd: '2026-01-31' }],
  [NUSANTARA]: [{ periodStart: '2026-01-01', periodEnd: '2026-01-31' }],
}

// Line item laba_rugi. `coaKode: null` => unmatched (butuh mapping manual).
type LineSeed = { rawName: string; amount: string; coaKode: string | null; confidence: number }
const LINES: Record<string, LineSeed[]> = {
  [RASYUKA]: [
    { rawName: 'Penjualan Shopee Rasyuka Official', amount: '312450000.00', coaKode: '04-0001', confidence: 98 },
    { rawName: 'Penjualan Tiktok', amount: '148900000.00', coaKode: '04-0002', confidence: 97 },
    { rawName: 'Penjualan Offline', amount: '23736931.00', coaKode: '04-0003', confidence: 95 },
    { rawName: 'HPP - Shopee Rasyuka Official', amount: '-142300000.00', coaKode: '05-0001', confidence: 96 },
    { rawName: 'HPP - Tiktok', amount: '-58154203.00', coaKode: '05-0002', confidence: 95 },
    { rawName: 'Biaya Admin MP - Shopee Rasyuka Official', amount: '-18747000.00', coaKode: '11-0001', confidence: 88 },
    { rawName: 'Beban Ads Shopee', amount: '-9820000.00', coaKode: '11-0003', confidence: 85 },
    { rawName: 'Biaya Kirim JNE/J&T', amount: '-7410000.00', coaKode: '11-0006', confidence: 91 },
    // ↓ unmatched — inilah yang muncul di kartu "Akun Belum Dipetakan"
    { rawName: 'Beban Ads Meta', amount: '-1674449.00', coaKode: null, confidence: 42 },
    { rawName: 'Biaya Gaji Karyawan Staf', amount: '-19767100.00', coaKode: null, confidence: 78 },
    { rawName: 'Biaya Sewa Kantor Bulanan', amount: '-2666667.00', coaKode: null, confidence: 72 },
  ],
  [GRAPHICOOK]: [
    { rawName: 'Invoice Desain Logo — Klien A', amount: '45000000.00', coaKode: 'JK-1001', confidence: 96 },
    { rawName: 'Invoice Branding Package — Klien B', amount: '78000000.00', coaKode: 'JK-1002', confidence: 94 },
    { rawName: 'Retainer Bulanan — Klien C', amount: '25000000.00', coaKode: 'JK-1003', confidence: 99 },
    { rawName: 'Pembayaran Freelancer Illustrator', amount: '-18500000.00', coaKode: 'JK-2001', confidence: 89 },
    { rawName: 'Langganan Adobe Creative Cloud', amount: '-3200000.00', coaKode: 'JK-2002', confidence: 93 },
    // ↓ unmatched
    { rawName: 'Pembelian Font Premium Envato', amount: '-1450000.00', coaKode: null, confidence: 51 },
    { rawName: 'Gaji Tim Desain Internal', amount: '-32000000.00', coaKode: null, confidence: 74 },
  ],
  [NUSANTARA]: [
    { rawName: 'Penjualan Unit Produk Jadi Q1', amount: '1240000000.00', coaKode: 'MF-4001', confidence: 97 },
    { rawName: 'Penjualan Komponen Setengah Jadi', amount: '318000000.00', coaKode: 'MF-4002', confidence: 92 },
    { rawName: 'Pembelian Bahan Baku Baja', amount: '-540000000.00', coaKode: 'MF-5001', confidence: 95 },
    { rawName: 'Upah Buruh Produksi Langsung', amount: '-210000000.00', coaKode: 'MF-5002', confidence: 90 },
    { rawName: 'Listrik Pabrik PLN', amount: '-87500000.00', coaKode: 'MF-6001', confidence: 88 },
    // ↓ unmatched
    { rawName: 'Servis Berkala Mesin CNC', amount: '-46200000.00', coaKode: null, confidence: 63 },
    { rawName: 'Penyusutan Mesin Produksi', amount: '-75000000.00', coaKode: null, confidence: 69 },
    { rawName: 'Gaji Staf Admin Pabrik', amount: '-54000000.00', coaKode: null, confidence: 71 },
  ],
}

async function main() {
  const existing = await db.select({ id: clients.id }).from(clients).where(inArray(clients.id, CLIENT_IDS))
  if (existing.length !== CLIENT_IDS.length) {
    throw new Error('Klien seed belum lengkap — jalankan `pnpm db:seed` dulu.')
  }

  // Urutan hapus penting: report_line_items.master_coa_id pakai onDelete
  // RESTRICT, jadi master_coa tidak bisa dihapus selama line item masih ada.
  // Menghapus financial_reports meng-cascade line item-nya lebih dulu.
  await db.delete(financialReports).where(inArray(financialReports.clientId, CLIENT_IDS))
  await db.delete(coaMappingHistory).where(inArray(coaMappingHistory.clientId, CLIENT_IDS))
  await db.delete(masterCoa).where(inArray(masterCoa.clientId, CLIENT_IDS))
  console.log('✓ fixture lama dibersihkan')

  let coaTotal = 0
  let lineTotal = 0

  for (const clientId of CLIENT_IDS) {
    const coaRows = await db
      .insert(masterCoa)
      .values(COA[clientId].map(c => ({ clientId, ...c })))
      .returning({ id: masterCoa.id, kode: masterCoa.kode })
    coaTotal += coaRows.length

    const coaIdByKode = new Map(coaRows.map(r => [r.kode, r.id]))

    for (const period of PERIODS[clientId]) {
      const [report] = await db
        .insert(financialReports)
        .values({
          clientId,
          reportType: 'laba_rugi',
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          sourceFileName: `laba-rugi-${period.periodStart}.xlsx`,
          status: 'review',
          extractedAt: new Date(),
        })
        .returning({ id: financialReports.id })

      const values = LINES[clientId].map((l, i) => {
        const masterCoaId = l.coaKode ? coaIdByKode.get(l.coaKode) ?? null : null
        return {
          reportId: report.id,
          rawName: l.rawName,
          amount: l.amount,
          masterCoaId,
          // suggestedCoaId hanya diisi untuk yang unmatched tapi confidence
          // lumayan — meniru output AI yang "menebak tapi belum yakin".
          suggestedCoaId: null,
          confidence: l.confidence,
          status: masterCoaId ? ('matched' as const) : ('unmatched' as const),
          lineOrder: i,
        }
      })

      await db.insert(reportLineItems).values(values)
      lineTotal += values.length
    }
  }

  console.log(`✓ ${coaTotal} baris master_coa`)
  console.log(`✓ ${lineTotal} baris report_line_items`)
  console.log('Seed dev fixture selesai.')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seed dev gagal:', err)
    process.exit(1)
  })
