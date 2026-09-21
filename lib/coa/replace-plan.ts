import { statusAfterExtract } from '@/lib/reports/mapping-status'

// Perencana "ganti Master COA" — MURNI (tanpa I/O), supaya keputusan sambung/
// putus bisa diuji tanpa DB dan supaya route handler tinggal mengeksekusi.
//
// Kenapa perlu re-link sama sekali: POST /api/clients/[id]/coa mengganti Master
// COA dengan DELETE-all + INSERT-all, dan `master_coa.id` di-generate acak. Jadi
// walau file Excel-nya identik, SEMUA id berubah dan setiap
// `report_line_items.master_coa_id` kehilangan sasarannya. Satu-satunya identitas
// yang bertahan lintas import adalah `kode` (ada unique(client_id, kode)) —
// itulah jembatan yang dipakai di sini.

export interface OldAccount {
  id: string
  kode: string
}

export interface AffectedLine {
  id: string
  reportId: string
  masterCoaId: string | null
  suggestedCoaId: string | null
  isSubtotal: boolean
  status: string
  rawName: string
  amount: string
}

export interface HistoryRow {
  rawName: string
  masterCoaId: string
  confirmedCount: number
}

export interface ReportMeta {
  id: string
  reportType: string
  periodStart: string
  periodEnd: string
  status: string
}

// ── Perujuk master_coa selain report_line_items ──────────────
//
// KEBIJAKANNYA DITENTUKAN OLEH NULLABILITY KOLOMNYA, bukan selera:
//   NOT NULL  (journal_lines.master_coa_id) → TIDAK BISA diputus. Satu-satunya
//             jawaban yang jujur adalah MENOLAK penggantian (409) dan menyebut
//             jurnal mana yang menghalangi. Memutusnya mustahil (FK restrict),
//             dan "memindahkannya ke akun lain" berarti diam-diam mengubah
//             pembukuan yang sudah dicatat.
//   NULL-able (master_supplier.akun_hutang_default_id) → boleh diputus jadi
//             null dan dihitung di laporan dampak. Kehilangan akun default
//             cuma membuat form supplier kosong, tidak mengubah angka apa pun.
//
// Setiap tabel BARU yang merujuk master_coa wajib ditambahkan di sini beserta
// keputusan nullability-nya — kalau tidak, jalur ganti-massal diam-diam rusak.

export interface AffectedJournalLine {
  id: string
  journalId: string
  /** Nomor bukti header-nya — supaya pesan blokir bisa ditindak manusia.
   *  null = jurnal itu memang tidak punya nomor bukti (opsional sejak 0011);
   *  label penggantinya dipasang di titik TAMPIL, bukan di sini. */
  noBukti: string | null
  /** NOT NULL di DB, jadi tidak pernah null di sini. */
  masterCoaId: string
}

export interface AffectedSupplier {
  id: string
  nama: string
  akunHutangDefaultId: string | null
}

/**
 * Invoice pembelian yang merujuk Master COA (M5).
 *
 * ══ KEEMPAT KOLOMNYA MEMBLOKIR, WALAU TIGA DI ANTARANYA NULL-ABLE ════════
 * Ini MENYIMPANG dari kebijakan umum "NULL-able → set null" di §8.15, dan
 * penyimpangannya bukan pilihan: `purchase_invoices` punya CHECK yang
 * mewajibkan akun hutang untuk invoice kredit, akun kas untuk tunai, dan akun
 * PPN Masukan bila ppn > 0. Memutus salah satunya jadi NULL akan melanggar
 * CHECK itu dan MENGGAGALKAN SELURUH BATCH ganti-massal — dengan galat
 * Postgres yang tidak menyebut satu pun invoice.
 *
 * Jadi: disambung ulang by kode kalau kodenya masih ada, DIBLOKIR 409 kalau
 * hilang. Yang diblokir bisa dibaca manusia (nomor invoice + kode akunnya),
 * sama seperti blokir jurnal.
 */
export interface AffectedInvoiceAccount {
  invoiceId: string
  /** null = invoice itu memang tidak punya nomor (D29). */
  noInvoice: string | null
  /** Kolom mana yang merujuk — dipakai pesan blokir supaya bisa ditindak. */
  kolom: 'tujuan' | 'kas' | 'hutang' | 'ppn'
  masterCoaId: string
}

/** Setelan pembukuan klien yang merujuk Master COA (akun PPN Masukan). */
export interface AffectedAccountingSetting {
  clientId: string
  akunPpnMasukanId: string | null
}

/** Invoice yang menghalangi penggantian: akunnya hilang/ambigu di berkas baru. */
export interface BlockedInvoice {
  invoiceId: string
  noInvoice: string | null
  kolom: 'tujuan' | 'kas' | 'hutang' | 'ppn'
  kode: string
}

export interface InvoiceRelink {
  invoiceId: string
  kolom: 'tujuan' | 'kas' | 'hutang' | 'ppn'
  newMasterCoaId: string
}

export interface SettingRelink {
  clientId: string
  /** null = akun PPN Masukan diputus (kodenya hilang/ambigu). */
  newAkunPpnMasukanId: string | null
}

/** Jurnal yang menghalangi penggantian: akunnya hilang/ambigu di berkas baru. */
export interface BlockedJournal {
  journalId: string
  noBukti: string | null
  kode: string
}

export interface JournalRelink {
  journalLineId: string
  newMasterCoaId: string
}

export interface SupplierRelink {
  supplierId: string
  /** null = akun default diputus (kodenya hilang/ambigu). */
  newAkunHutangDefaultId: string | null
}

/** Satu baris yang mapping-nya putus — bahan laporan dampak per laporan. */
export interface BrokenLine {
  lineItemId: string
  rawName: string
  amount: string
  kode: string
}

export interface ReportImpact {
  reportId: string
  reportType: string
  periodStart: string
  periodEnd: string
  statusBefore: string
  /** Status sesudah replace — hasil statusAfterExtract, bukan tebakan lokal. */
  statusAfter: string
  relinkedCount: number
  brokenCount: number
  brokenLines: BrokenLine[]
}

export interface ReplacePlan {
  /** kode yang ada di COA lama DAN baru → mapping-nya bisa disambung. */
  matchedKode: string[]
  /** kode lama yang hilang di file baru → mapping ke situ pasti putus. */
  missingKode: string[]
  /** kode baru yang sebelumnya belum ada. */
  addedKode: string[]
  /** kode dobel di file baru — sengaja tidak di-re-link (lihat CoaParseResult). */
  ambiguousKode: string[]
  relinkedLineCount: number
  brokenLineCount: number
  /** saran COA (suggested_coa_id) yang tidak bisa disambung lagi. */
  suggestionsLost: number
  suggestionsRelinked: number
  historySaved: number
  historyLost: number
  /** Hanya laporan yang benar-benar tersentuh. */
  reports: ReportImpact[]
  /** Laporan yang turun 'mapped' → 'review' akibat replace ini. */
  demotedReportIds: string[]
  /** Baris jurnal yang akunnya bisa disambung ke id baru. */
  journalRelinkedCount: number
  /**
   * Jurnal yang MENGHALANGI penggantian. Tidak kosong = route wajib menolak
   * 409 SEBELUM menulis apa pun. Sudah didedup per (jurnal, kode): satu jurnal
   * dengan lima baris yang kodenya sama muncul sekali, bukan lima kali.
   */
  journalBlocked: BlockedJournal[]
  supplierRelinkedCount: number
  /** Supplier yang akun hutang default-nya diputus jadi null. */
  supplierUnlinkedCount: number
  /** Kolom akun invoice pembelian yang bisa disambung ke id baru. */
  invoiceRelinkedCount: number
  /**
   * Invoice yang MENGHALANGI penggantian. Tidak kosong = route wajib menolak
   * 409 SEBELUM menulis apa pun — alasan yang sama dengan journalBlocked,
   * ditambah satu: memutusnya jadi null akan melanggar CHECK invoice dan
   * menggagalkan seluruh batch dengan galat yang tidak menyebut invoicenya.
   */
  invoiceBlocked: BlockedInvoice[]
  /** Setelan klien yang akun PPN Masukan-nya diputus jadi null. */
  settingUnlinkedCount: number
}

/** Baris ini akan disambung ke id baru, atau diputus (null). */
export interface LineRelink {
  lineItemId: string
  /** null = putus → master_coa_id null. */
  newMasterCoaId: string | null
  newSuggestedCoaId: string | null
  /**
   * Baris ini BENAR-BENAR kehilangan mapping yang tadinya ada
   * (punya master_coa_id, sekarang tidak).
   *
   * Dibedakan dari `newMasterCoaId === null` karena yang terakhir juga benar
   * untuk baris yang memang belum pernah dipetakan dan cuma kehilangan SARAN
   * COA. Hanya baris ber-`lostMapping` yang statusnya boleh direset ke
   * 'unmatched' — mereset baris lain adalah tulisan yang tidak perlu dan,
   * untuk baris ber-status 'edited' tanpa mapping, salah.
   */
  lostMapping: boolean
}

export interface PlanInput {
  oldAccounts: OldAccount[]
  /** kode → id BARU. Id di-generate pemanggil SEBELUM menulis (lihat route). */
  newKodeToId: Map<string, string>
  ambiguousKode: string[]
  lines: AffectedLine[]
  history: HistoryRow[]
  reports: ReportMeta[]
  /**
   * OPSIONAL, dan itu disengaja. Dihilangkan = berperilaku persis seperti
   * sebelum jurnal ada (hitungan nol, tidak ada blokir), sehingga pemanggil
   * lama dan test lama tidak perlu diubah sama sekali.
   */
  journalLines?: AffectedJournalLine[]
  suppliers?: AffectedSupplier[]
  invoiceAccounts?: AffectedInvoiceAccount[]
  accountingSettings?: AffectedAccountingSetting[]
}

/**
 * Menghitung dampak lengkap + instruksi re-link. Tidak menyentuh DB.
 * Dipakai DUA kali oleh route: sekali untuk dry-run (hanya `plan` yang dipakai)
 * dan sekali untuk eksekusi — satu sumber kebenaran, jadi angka yang dilihat
 * admin di layar konfirmasi mustahil berbeda dari yang benar-benar terjadi.
 */
export function buildReplacePlan(input: PlanInput): {
  plan: ReplacePlan
  relinks: LineRelink[]
  journalRelinks: JournalRelink[]
  supplierRelinks: SupplierRelink[]
  invoiceRelinks: InvoiceRelink[]
  settingRelinks: SettingRelink[]
} {
  const { oldAccounts, newKodeToId, ambiguousKode, lines, history, reports } = input

  const ambiguous = new Set(ambiguousKode)
  const oldIdToKode = new Map(oldAccounts.map(a => [a.id, a.kode]))
  const oldKodeSet = new Set(oldAccounts.map(a => a.kode))

  /** id lama → id baru, hanya untuk kode yang aman disambung. */
  const resolve = (oldId: string | null): string | null => {
    if (!oldId) return null
    const kode = oldIdToKode.get(oldId)
    if (kode === undefined || ambiguous.has(kode)) return null
    return newKodeToId.get(kode) ?? null
  }

  const matchedKode = [...oldKodeSet].filter(k => newKodeToId.has(k) && !ambiguous.has(k)).sort()
  const missingKode = [...oldKodeSet].filter(k => !newKodeToId.has(k) || ambiguous.has(k)).sort()
  const addedKode = [...newKodeToId.keys()].filter(k => !oldKodeSet.has(k)).sort()

  const relinks: LineRelink[] = []
  let relinkedLineCount = 0
  let brokenLineCount = 0
  let suggestionsLost = 0
  let suggestionsRelinked = 0

  // Dampak per laporan — hanya baris yang PUNYA mapping/saran lama yang relevan.
  const byReport = new Map<string, { relinked: number; broken: BrokenLine[] }>()
  // Semua baris per laporan (termasuk yang tak tersentuh) — dibutuhkan untuk
  // menghitung ulang status laporan: "masih 100% ter-mapping?" tidak bisa
  // dijawab hanya dari baris yang berubah.
  const linesByReport = new Map<string, AffectedLine[]>()

  for (const l of lines) {
    const arr = linesByReport.get(l.reportId) ?? []
    arr.push(l)
    linesByReport.set(l.reportId, arr)

    const newMaster = resolve(l.masterCoaId)
    const newSuggested = resolve(l.suggestedCoaId)

    if (l.suggestedCoaId) {
      if (newSuggested) suggestionsRelinked++
      else suggestionsLost++
    }

    if (l.masterCoaId) {
      const bucket = byReport.get(l.reportId) ?? { relinked: 0, broken: [] }
      if (newMaster) {
        relinkedLineCount++
        bucket.relinked++
      } else {
        brokenLineCount++
        bucket.broken.push({
          lineItemId: l.id,
          rawName: l.rawName,
          amount: l.amount,
          kode: oldIdToKode.get(l.masterCoaId) ?? '(tidak diketahui)',
        })
      }
      byReport.set(l.reportId, bucket)
    }

    // Hanya kirim instruksi untuk baris yang benar-benar berubah.
    if (l.masterCoaId !== newMaster || l.suggestedCoaId !== newSuggested) {
      relinks.push({
        lineItemId: l.id,
        newMasterCoaId: newMaster,
        newSuggestedCoaId: newSuggested,
        lostMapping: l.masterCoaId !== null && newMaster === null,
      })
    }
  }

  // Riwayat auto-match: FK-nya CASCADE, jadi baris history ikut terhapus saat
  // master_coa lama dihapus. Yang kode-nya selamat di-INSERT ulang menunjuk id
  // baru — tanpa ini, memori mapping klien hilang senyap tiap ganti Excel.
  let historySaved = 0
  let historyLost = 0
  for (const h of history) {
    if (resolve(h.masterCoaId)) historySaved++
    else historyLost++
  }

  // Status laporan SESUDAH replace — pakai helper yang sama dengan jalur upload
  // & route /mapping. `masterCoaId` di-proyeksikan ke nilai barunya dulu, dan
  // baris yang putus statusnya dianggap 'unmatched' (persis yang akan ditulis).
  const reportById = new Map(reports.map(r => [r.id, r]))
  const impacts: ReportImpact[] = []
  const demotedReportIds: string[] = []

  for (const [reportId, bucket] of byReport) {
    const meta = reportById.get(reportId)
    if (!meta) continue
    const projected = (linesByReport.get(reportId) ?? []).map(l => {
      const newMaster = resolve(l.masterCoaId)
      const broke = l.masterCoaId !== null && newMaster === null
      // rawName & amount diteruskan apa adanya: replace COA tidak mengubah
      // keduanya, tapi isMappable() memerlukannya untuk mengenali baris kosong.
      return {
        isSubtotal: l.isSubtotal,
        status: broke ? 'unmatched' : l.status,
        masterCoaId: newMaster,
        rawName: l.rawName,
        amount: l.amount,
      }
    })
    const computed = statusAfterExtract(projected)

    // Demote HANYA 'mapped' → 'review'. 'confirmed' tidak disentuh: itu tanda
    // persetujuan klien, mencabutnya keputusan produk tersendiri.
    const statusAfter =
      meta.status === 'mapped' && computed === 'review' ? 'review' : meta.status
    if (statusAfter !== meta.status) demotedReportIds.push(reportId)

    impacts.push({
      reportId,
      reportType: meta.reportType,
      periodStart: meta.periodStart,
      periodEnd: meta.periodEnd,
      statusBefore: meta.status,
      statusAfter,
      relinkedCount: bucket.relinked,
      brokenCount: bucket.broken.length,
      brokenLines: bucket.broken,
    })
  }

  impacts.sort((a, b) =>
    a.periodStart === b.periodStart
      ? a.reportType.localeCompare(b.reportType)
      : a.periodStart.localeCompare(b.periodStart)
  )

  // ── journal_lines: NOT NULL, jadi hilang = BLOKIR, bukan putus ──
  //
  // Bedanya dengan report_line_items mendasar. Baris laporan yang kehilangan
  // akun kembali ke antrean pemetaan — merepotkan, tapi datanya utuh dan bisa
  // dipetakan ulang. Baris JURNAL tidak punya keadaan "belum dipetakan": ia
  // adalah pencatatan yang sudah terjadi. Memutusnya mustahil (kolomnya NOT
  // NULL dengan FK restrict), dan memindahkannya ke akun lain berarti diam-diam
  // menulis ulang pembukuan. Maka satu-satunya jawaban yang jujur: tolak
  // penggantiannya, sebutkan nomor buktinya, biar manusia yang memutuskan.
  const journalRelinks: JournalRelink[] = []
  const journalBlocked: BlockedJournal[] = []
  const blockedSeen = new Set<string>()
  let journalRelinkedCount = 0

  for (const jl of input.journalLines ?? []) {
    const target = resolve(jl.masterCoaId)
    if (target) {
      journalRelinkedCount++
      // Instruksi HANYA untuk baris yang benar-benar berpindah id — persis
      // aturan yang dipakai `relinks` di atas. Jalur hapus-satu-baris memanggil
      // planner ini dengan peta kode→id yang SEKARANG, jadi tanpa penyaringan
      // ini setiap baris jurnal klien akan ditulis ulang tanpa berubah.
      if (target !== jl.masterCoaId) {
        journalRelinks.push({ journalLineId: jl.id, newMasterCoaId: target })
      }
      continue
    }
    // Didedup per (jurnal, kode): satu jurnal dengan lima baris berkode sama
    // adalah SATU masalah untuk dibaca manusia, bukan lima.
    const kode = oldIdToKode.get(jl.masterCoaId) ?? '(tidak diketahui)'
    const key = `${jl.journalId} ${kode}`
    if (blockedSeen.has(key)) continue
    blockedSeen.add(key)
    journalBlocked.push({ journalId: jl.journalId, noBukti: jl.noBukti, kode })
  }

  // Jurnal tanpa nomor bukti diurutkan ke BELAKANG memakai kunci kosong —
  // localeCompare pada null akan melempar, dan urutan yang stabil membuat
  // daftar blokir terbaca sama tiap kali dibuka.
  journalBlocked.sort((a, b) => {
    const ka = a.noBukti ?? ''
    const kb = b.noBukti ?? ''
    return ka === kb ? a.kode.localeCompare(b.kode) : ka.localeCompare(kb)
  })

  // ── master_supplier.akun_hutang_default_id: NULL-able, jadi boleh diputus ──
  // Kehilangan akun default hanya membuat form supplier kembali kosong; tidak
  // ada angka yang berubah, tidak ada pencatatan yang hilang.
  const supplierRelinks: SupplierRelink[] = []
  let supplierRelinkedCount = 0
  let supplierUnlinkedCount = 0

  for (const s of input.suppliers ?? []) {
    if (!s.akunHutangDefaultId) continue
    const target = resolve(s.akunHutangDefaultId)
    if (target) supplierRelinkedCount++
    else supplierUnlinkedCount++
    // Sama seperti jurnal: hanya yang berpindah (atau diputus) yang ditulis.
    if (target !== s.akunHutangDefaultId) {
      supplierRelinks.push({ supplierId: s.id, newAkunHutangDefaultId: target })
    }
  }

  // ── purchase_invoices: EMPAT kolom, semuanya memblokir (M5) ──────────
  // Lihat catatan panjang di AffectedInvoiceAccount: CHECK invoice membuat
  // "set null" mustahil, jadi kebijakannya blokir — sama dengan journal_lines.
  const invoiceRelinks: InvoiceRelink[] = []
  const invoiceBlocked: BlockedInvoice[] = []
  const invoiceBlockedSeen = new Set<string>()
  let invoiceRelinkedCount = 0

  for (const ia of input.invoiceAccounts ?? []) {
    const target = resolve(ia.masterCoaId)
    if (target) {
      invoiceRelinkedCount++
      if (target !== ia.masterCoaId) {
        invoiceRelinks.push({ invoiceId: ia.invoiceId, kolom: ia.kolom, newMasterCoaId: target })
      }
      continue
    }
    // Didedup per (invoice, kolom, kode) — satu invoice yang dua kolomnya
    // menunjuk akun hilang yang sama tetap dua masalah berbeda untuk dibaca.
    const kode = oldIdToKode.get(ia.masterCoaId) ?? '(tidak diketahui)'
    const key = `${ia.invoiceId} ${ia.kolom} ${kode}`
    if (invoiceBlockedSeen.has(key)) continue
    invoiceBlockedSeen.add(key)
    invoiceBlocked.push({ invoiceId: ia.invoiceId, noInvoice: ia.noInvoice, kolom: ia.kolom, kode })
  }

  invoiceBlocked.sort((a, b) => {
    const ka = a.noInvoice ?? ''
    const kb = b.noInvoice ?? ''
    if (ka !== kb) return ka.localeCompare(kb)
    return a.kolom === b.kolom ? a.kode.localeCompare(b.kode) : a.kolom.localeCompare(b.kolom)
  })

  // ── client_accounting_settings.akun_ppn_masukan_id: BOLEH diputus ────
  // Berbeda dari invoice: ini pengisi awal formulir, bukan bagian dari sebuah
  // pencatatan. Invoice yang sudah ada tetap memegang akun PPN-nya sendiri
  // lewat snapshot (D30), jadi memutus setelan tidak mengubah satu angka pun.
  const settingRelinks: SettingRelink[] = []
  let settingUnlinkedCount = 0

  for (const st of input.accountingSettings ?? []) {
    if (!st.akunPpnMasukanId) continue
    const target = resolve(st.akunPpnMasukanId)
    if (!target) settingUnlinkedCount++
    if (target !== st.akunPpnMasukanId) {
      settingRelinks.push({ clientId: st.clientId, newAkunPpnMasukanId: target })
    }
  }

  return {
    plan: {
      matchedKode,
      missingKode,
      addedKode,
      ambiguousKode: [...ambiguous].sort(),
      relinkedLineCount,
      brokenLineCount,
      suggestionsLost,
      suggestionsRelinked,
      historySaved,
      historyLost,
      reports: impacts,
      demotedReportIds,
      journalRelinkedCount,
      journalBlocked,
      supplierRelinkedCount,
      supplierUnlinkedCount,
      invoiceRelinkedCount,
      invoiceBlocked,
      settingUnlinkedCount,
    },
    relinks,
    journalRelinks,
    supplierRelinks,
    invoiceRelinks,
    settingRelinks,
  }
}

/** Riwayat yang kode-nya selamat — dipisah supaya route bisa langsung insert. */
export function historyToReinsert(
  input: Pick<PlanInput, 'oldAccounts' | 'newKodeToId' | 'ambiguousKode' | 'history'>
): { rawName: string; masterCoaId: string; confirmedCount: number }[] {
  const ambiguous = new Set(input.ambiguousKode)
  const oldIdToKode = new Map(input.oldAccounts.map(a => [a.id, a.kode]))
  const out: { rawName: string; masterCoaId: string; confirmedCount: number }[] = []
  for (const h of input.history) {
    const kode = oldIdToKode.get(h.masterCoaId)
    if (kode === undefined || ambiguous.has(kode)) continue
    const target = input.newKodeToId.get(kode)
    if (target) out.push({ rawName: h.rawName, masterCoaId: target, confirmedCount: h.confirmedCount })
  }
  return out
}
