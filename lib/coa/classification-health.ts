import { classifyPnl, classifyBs } from '@/lib/financial-agg'
import {
  ACCOUNT_TYPE_LABEL,
  deriveAccountType,
  type AccountType,
} from './account-type'

// Apakah kombinasi klasifikasi sebuah akun BENAR-BENAR terhitung di agregasi?
//
// Poin utama modul ini: jawabannya diturunkan dengan MEMANGGIL fungsi
// klasifikasi yang asli (classifyPnl/classifyBs) dan menyalin ambang classCf
// dari aggregateCashflow — bukan dari daftar nilai yang di-hardcode. Jadi kalau
// aturan klasifikasi berubah, peringatan di form Master COA ikut benar dengan
// sendirinya, tanpa perlu disinkronkan manual.
//
// Dipakai UI untuk MEMPERINGATKAN, bukan memblokir: kadang akun sengaja dibuat
// di luar agregasi. Yang dilarang cuma satu — membiarkannya terjadi diam-diam.

export type AggregationTarget = 'laba_rugi' | 'neraca' | 'none'

/** Peniru pemilihan di financial-agg: `kelompok` menentukan baris masuk P&L,
 *  Neraca, atau tidak sama sekali. Substring, sama persis dengan sana. */
export function aggregationTargetOf(kelompok: string): AggregationTarget {
  const k = kelompok.toLowerCase().trim()
  if (k.includes('laba')) return 'laba_rugi'
  if (k.includes('neraca')) return 'neraca'
  return 'none'
}

/** Bucket arus kas dari classCf. Ambangnya SENGAJA disalin dari
 *  aggregateCashflow (cocok-persis untuk operating, substring untuk sisanya) —
 *  termasuk perilaku "Operating Balance" yang memang dikecualikan di sana. */
export function cashflowBucketOf(classCf: string | null): 'operating' | 'investing' | 'funding' | null {
  const cf = (classCf ?? '').toLowerCase().trim()
  if (cf === 'operating' || cf === 'operasi') return 'operating'
  if (cf.includes('invest')) return 'investing'
  if (cf.includes('funding') || cf.includes('pendanaan')) return 'funding'
  return null
}

export interface ClassificationWarning {
  field: 'kelompok' | 'subKelompok' | 'classCf' | 'tipeAkun'
  message: string
}

/**
 * Peringatan untuk kombinasi klasifikasi yang membuat akun tidak terhitung.
 * Array kosong = semuanya masuk agregasi.
 */
export function classificationWarnings(input: {
  kelompok: string
  subKelompok: string
  classCf: string | null
  /** Fase 2 (E3/E4). Opsional supaya pemanggil lama tetap sah apa adanya. */
  tipeAkun?: AccountType | null
  posisi?: string
  nama?: string
}): ClassificationWarning[] {
  const out: ClassificationWarning[] = []
  const target = aggregationTargetOf(input.kelompok)

  if (target === 'none') {
    out.push({
      field: 'kelompok',
      message: `Kelompok "${input.kelompok}" tidak dikenali sebagai Laba Rugi maupun Neraca — akun ini tidak akan terhitung di agregasi mana pun.`,
    })
    // subKelompok tidak perlu diperiksa: barisnya sudah tersaring lebih dulu.
    return out
  }

  if (target === 'laba_rugi' && classifyPnl(input.subKelompok) === 'other') {
    out.push({
      field: 'subKelompok',
      message: `Sub Kelompok "${input.subKelompok}" tidak cocok dengan kategori Laba Rugi mana pun — akun ini tidak akan masuk pendapatan, HPP, biaya, lain-lain, atau pajak.`,
    })
  }

  if (target === 'neraca' && classifyBs(input.subKelompok) === 'other') {
    out.push({
      field: 'subKelompok',
      message: `Sub Kelompok "${input.subKelompok}" tidak cocok dengan kategori Neraca mana pun — akun ini tidak akan masuk Total Aset, Hutang, maupun Modal.`,
    })
  }

  // classCf hanya dipakai laporan Arus Kas. Kosong itu WAJAR untuk akun yang
  // memang tidak muncul di arus kas, jadi jangan diributkan; yang layak
  // diperingatkan adalah nilai yang DIISI tapi tidak dikenali — itu tanda salah
  // ketik, dan efeknya sama saja dengan dikosongkan.
  if (input.classCf !== null && input.classCf.trim() !== '' && cashflowBucketOf(input.classCf) === null) {
    out.push({
      field: 'classCf',
      message: `Class CF "${input.classCf}" tidak dikenali sebagai Operating/Investing/Funding — akun ini tidak akan terhitung di Arus Kas.`,
    })
  }

  // ── Tipe akun eksplisit yang BERTENTANGAN dengan turunannya (E4) ──────
  //
  // Bukan galat: akunting berhak menimpa tebakan sistem, dan itulah gunanya
  // kolom eksplisit. Yang layak diperingatkan adalah pertentangan yang tidak
  // ada yang melihat — mis. akun ditandai `revenue`, lalu impor COA berikutnya
  // memindahkan sub kelompoknya ke Beban. Nilai eksplisitnya tetap menang
  // diam-diam, dan laporan berubah tanpa ada yang menyentuh akun itu.
  //
  // Hanya diperiksa kalau tipenya BENAR-BENAR diisi: null berarti "ikut
  // turunan", dan dua nilai yang memang sama tidak pernah bisa bertentangan.
  if (input.tipeAkun) {
    const turunan = deriveAccountType({
      nama: input.nama ?? '',
      posisi: input.posisi ?? '',
      kelompok: input.kelompok,
      subKelompok: input.subKelompok,
    })
    if (turunan !== null && turunan !== input.tipeAkun) {
      out.push({
        field: 'tipeAkun',
        message: `Tipe Akun diisi "${ACCOUNT_TYPE_LABEL[input.tipeAkun]}", tapi kelompok & sub kelompoknya menunjuk "${ACCOUNT_TYPE_LABEL[turunan]}". Yang dipakai laporan adalah yang diisi — pastikan itu memang disengaja.`,
      })
    }
  }

  return out
}
