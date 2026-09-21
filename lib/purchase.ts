// Aturan invoice pembelian. MURNI (tanpa I/O, tanpa React) — pola sama dengan
// lib/journal.ts dan lib/supplier.ts.
//
// ══ UANG DALAM SEN BULAT (P1) ═════════════════════════════════════════════
// subtotal, ppn, dan total dijumlahkan sebagai INTEGER SEN. Alasannya sama
// persis dengan yang ditulis di kepala lib/journal.ts: jurnal pembelian yang
// selisih satu sen adalah jurnal tidak seimbang yang ditolak posting, atau —
// lebih buruk — seimbang karena selisihnya lebih kecil dari epsilon yang
// kebetulan dipakai.
//
// ══ TOTAL TIDAK DISIMPAN (D27) ════════════════════════════════════════════
// computeInvoiceTotals dipanggil setiap kali total dibutuhkan. Yang tersimpan
// hanya subtotal per baris (D28) dan ppn header.
//
// ══ JURNAL DIBANGUN DARI DAFTAR KOMPONEN ═════════════════════════════════
// buildPurchaseJournalLines menerima daftar {akunId, minor}, bukan field tetap
// per jenis. Saat ongkos kirim & diskon dipisah nanti (belum diputuskan Ricko),
// ia menjadi SATU ELEMEN TAMBAHAN di daftar itu — bukan pembongkaran fungsi,
// bukan perubahan tanda tangan, dan bukan cabang if baru di setiap pemanggil.

import { isValidYmd } from '@/lib/contracts'
import { fromMinorUnits, toMinorUnits, type JournalLineValue } from '@/lib/journal'

export const PURCHASE_PAYMENT_METHODS = ['kredit', 'tunai'] as const
export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number]

export const PURCHASE_PAYMENT_LABEL: Record<PurchasePaymentMethod, string> = {
  kredit: 'Kredit',
  tunai: 'Tunai',
}

export function isPurchasePaymentMethod(v: unknown): v is PurchasePaymentMethod {
  return typeof v === 'string' && (PURCHASE_PAYMENT_METHODS as readonly string[]).includes(v)
}

/** Batas nomor invoice vendor — kolomnya text, batasnya aturan (sama NO_BUKTI_MAX). */
export const NO_INVOICE_MAX = 80
export const NAMA_BARANG_MAX = 200
/** Jurnal pembelian minimal 2 baris; invoice minimal 1 baris barang. */
export const MIN_INVOICE_LINES = 1

// ── Bentuk masukan & keluaran ────────────────────────────────

export type PurchaseLineInput = {
  namaBarang?: unknown
  qty?: unknown
  satuan?: unknown
  hargaSatuan?: unknown
  subtotal?: unknown
}

export type PurchaseInvoiceInput = {
  tanggal?: unknown
  supplierId?: unknown
  noInvoice?: unknown
  caraBayar?: unknown
  akunTujuanId?: unknown
  akunKasId?: unknown
  akunHutangId?: unknown
  akunPpnMasukanId?: unknown
  ppn?: unknown
  jumlahTermin?: unknown
  jatuhTempoAkhir?: unknown
  keterangan?: unknown
  lines?: unknown
}

export type PurchaseLineValue = {
  namaBarang: string
  qty: string
  satuan: string | null
  hargaSatuan: string
  subtotal: string
  lineOrder: number
}

export type PurchaseInvoiceValue = {
  tanggal: string
  supplierId: string
  noInvoice: string | null
  caraBayar: PurchasePaymentMethod
  akunTujuanId: string
  akunKasId: string | null
  akunHutangId: string | null
  akunPpnMasukanId: string | null
  ppn: string
  jumlahTermin: number
  jatuhTempoAkhir: string | null
  keterangan: string | null
  lines: PurchaseLineValue[]
}

export type PurchaseCheck =
  | { ok: true; value: PurchaseInvoiceValue }
  | { ok: false; errors: string[] }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** qty boleh pecahan (2,5 kg) — 4 desimal, sama dengan kolomnya. */
const QTY_RE = /^\d{1,14}(\.\d{1,4})?$/

function normalizeQty(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null
    return normalizeQty(String(v))
  }
  if (typeof v !== 'string') return null
  const s = v.trim().replace(',', '.')
  if (!QTY_RE.test(s)) return null
  if (Number(s) <= 0) return null
  // Selalu 4 desimal supaya nilai tersimpan tidak pernah terbaca berbeda
  // hanya karena bentuk penulisannya ('2.5' vs '2.5000').
  const [int, frac = ''] = s.split('.')
  return `${String(Number(int))}.${frac.padEnd(4, '0')}`
}

// ── Total ────────────────────────────────────────────────────

export type InvoiceTotals = {
  /** Σ subtotal baris, SEN. */
  subtotalMinor: number
  ppnMinor: number
  totalMinor: number
}

/**
 * Total invoice dalam SEN.
 *
 * Dijumlahkan dari `subtotal` BARIS (D28) — tidak pernah dari `qty × harga`.
 * Perkalian ulang di sini akan menghasilkan angka yang berbeda dari yang
 * tersimpan pada baris yang qty-nya pecahan, dan selisihnya masuk ke jurnal.
 *
 * SENGAJA PERMISIF: nominal yang belum sah dihitung 0, tidak melempar. Fungsi
 * ini dipanggil setiap ketukan tombol oleh panel total di form — di tengah
 * pengetikan, "belum sah" adalah keadaan normal. Yang menolak input tidak sah
 * adalah validatePurchaseInvoice, sekali, di ujung.
 */
export function computeInvoiceTotals<T extends { subtotal?: unknown }>(
  lines: readonly T[] | null | undefined,
  ppn?: unknown
): InvoiceTotals {
  let subtotalMinor = 0
  for (const l of lines ?? []) subtotalMinor += toMinorUnits(l?.subtotal) ?? 0
  const ppnMinor = toMinorUnits(ppn) ?? 0
  return { subtotalMinor, ppnMinor, totalMinor: subtotalMinor + ppnMinor }
}

// ── Validasi ─────────────────────────────────────────────────

/**
 * Validasi satu invoice beserta barisnya.
 *
 * MENGUMPULKAN SEMUA GALAT (pola validateJournalInput): invoice punya N baris
 * yang diisi sekaligus, dan memperbaiki satu baris per kirim berarti akunting
 * menekan Simpan lima kali untuk satu pembelian.
 *
 * `akunPpnMasukanId` dioper pemanggil dari setelan klien (D33). Kalau PPN diisi
 * tapi setelannya kosong, yang keluar dari sini adalah galat yang menyebut
 * Settings — BUKAN akun yang ditebak. Akun PPN yang salah baru ketahuan saat
 * SPT, dan saat itu jurnalnya sudah berbulan-bulan.
 */
export function validatePurchaseInvoice(input: PurchaseInvoiceInput): PurchaseCheck {
  const errors: string[] = []

  if (!isValidYmd(input.tanggal)) {
    errors.push('Tanggal invoice tidak valid (format YYYY-MM-DD).')
  }

  const supplierId = typeof input.supplierId === 'string' ? input.supplierId.trim() : ''
  if (!UUID_RE.test(supplierId)) errors.push('Supplier belum dipilih.')

  // Kosong → NULL, bukan '' (D29). Sama persis dengan no_bukti jurnal: kolomnya
  // unik per (klien, supplier), dan '' adalah satu nilai konkret sehingga
  // invoice kedua tanpa nomor akan bentrok dengan yang pertama.
  let noInvoice: string | null = null
  if (typeof input.noInvoice === 'string' && input.noInvoice.trim() !== '') {
    noInvoice = input.noInvoice.trim()
    if (noInvoice.length > NO_INVOICE_MAX) {
      errors.push(`Nomor invoice maksimal ${NO_INVOICE_MAX} karakter.`)
    }
  }

  const caraBayar = isPurchasePaymentMethod(input.caraBayar) ? input.caraBayar : null
  if (!caraBayar) errors.push('Cara bayar harus Kredit atau Tunai.')

  const akunTujuanId = typeof input.akunTujuanId === 'string' ? input.akunTujuanId.trim() : ''
  if (!UUID_RE.test(akunTujuanId)) errors.push('Akun tujuan belum dipilih.')

  const akunKasId = typeof input.akunKasId === 'string' && UUID_RE.test(input.akunKasId.trim())
    ? input.akunKasId.trim()
    : null
  const akunHutangId =
    typeof input.akunHutangId === 'string' && UUID_RE.test(input.akunHutangId.trim())
      ? input.akunHutangId.trim()
      : null
  const akunPpnMasukanId =
    typeof input.akunPpnMasukanId === 'string' && UUID_RE.test(input.akunPpnMasukanId.trim())
      ? input.akunPpnMasukanId.trim()
      : null

  // ── PPN ──
  const ppnKosong = input.ppn === '' || input.ppn === null || input.ppn === undefined
  const ppnMinor = ppnKosong ? 0 : toMinorUnits(input.ppn)
  if (ppnMinor === null) errors.push('Nominal PPN tidak valid.')
  if (ppnMinor !== null && ppnMinor > 0 && !akunPpnMasukanId) {
    errors.push(
      'PPN diisi tapi akun PPN Masukan belum disetel untuk klien ini — atur dulu di Settings › Pembukuan.'
    )
  }

  // ── Termin & jatuh tempo ──
  const terminRaw = typeof input.jumlahTermin === 'number' ? input.jumlahTermin : Number(input.jumlahTermin)
  const jumlahTermin = Number.isFinite(terminRaw) ? Math.trunc(terminRaw) : NaN
  let jatuhTempoAkhir: string | null = null

  if (caraBayar === 'kredit') {
    if (!Number.isFinite(jumlahTermin) || jumlahTermin < 1) {
      errors.push('Jumlah termin minimal 1.')
    }
    if (!isValidYmd(input.jatuhTempoAkhir)) {
      errors.push('Tanggal jatuh tempo akhir wajib diisi untuk pembelian kredit.')
    } else {
      jatuhTempoAkhir = input.jatuhTempoAkhir as string
      // Jatuh tempo SEBELUM tanggal invoice berarti hutang yang lahir sudah
      // telat — hampir pasti salah ketik tahun, dan ia langsung muncul di ember
      // ">90 hari" monitoring hutang tanpa ada yang tahu kenapa.
      if (isValidYmd(input.tanggal) && jatuhTempoAkhir < (input.tanggal as string)) {
        errors.push('Jatuh tempo tidak boleh sebelum tanggal invoice.')
      }
    }
    if (!akunHutangId) {
      errors.push(
        'Supplier ini belum punya akun hutang default — atur dulu di Settings › Supplier.'
      )
    }
  }

  if (caraBayar === 'tunai' && !akunKasId) {
    errors.push('Akun kas belum dipilih untuk pembelian tunai.')
  }

  // ── Baris barang ──
  const rawLines: PurchaseLineInput[] = Array.isArray(input.lines) ? input.lines : []
  if (rawLines.length < MIN_INVOICE_LINES) {
    errors.push(`Invoice minimal ${MIN_INVOICE_LINES} baris barang.`)
  }

  const lines: PurchaseLineValue[] = []
  rawLines.forEach((raw, i) => {
    const n = i + 1
    const l: PurchaseLineInput = raw ?? {}

    const namaBarang = typeof l.namaBarang === 'string' ? l.namaBarang.trim() : ''
    if (namaBarang === '') errors.push(`Baris ${n}: nama barang wajib diisi.`)
    else if (namaBarang.length > NAMA_BARANG_MAX) {
      errors.push(`Baris ${n}: nama barang maksimal ${NAMA_BARANG_MAX} karakter.`)
    }

    const qty = normalizeQty(l.qty)
    if (qty === null) errors.push(`Baris ${n}: qty harus angka lebih dari nol.`)

    const hargaKosong = l.hargaSatuan === '' || l.hargaSatuan === null || l.hargaSatuan === undefined
    const hargaMinor = hargaKosong ? 0 : toMinorUnits(l.hargaSatuan)
    if (hargaMinor === null) errors.push(`Baris ${n}: harga satuan tidak valid.`)

    const subtotalMinor = toMinorUnits(l.subtotal)
    if (subtotalMinor === null) errors.push(`Baris ${n}: subtotal tidak valid.`)

    const satuanRaw = typeof l.satuan === 'string' ? l.satuan.trim() : ''
    lines.push({
      namaBarang,
      qty: qty ?? '0.0000',
      satuan: satuanRaw === '' ? null : satuanRaw,
      hargaSatuan: fromMinorUnits(hargaMinor ?? 0),
      subtotal: fromMinorUnits(subtotalMinor ?? 0),
      lineOrder: i,
    })
  })

  // Total invoice nol dengan baris yang ada berarti seluruh subtotal nol —
  // jurnal yang lahir darinya seimbang tapi tidak mencatat apa pun. Ditolak
  // di sini, bukan dibiarkan jadi jurnal kosong di buku besar.
  const totals = computeInvoiceTotals(lines, ppnMinor === null ? 0 : fromMinorUnits(ppnMinor))
  if (rawLines.length >= MIN_INVOICE_LINES && totals.totalMinor <= 0) {
    errors.push('Total invoice harus lebih dari nol.')
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      tanggal: input.tanggal as string,
      supplierId,
      noInvoice,
      caraBayar: caraBayar as PurchasePaymentMethod,
      akunTujuanId,
      akunKasId: caraBayar === 'tunai' ? akunKasId : null,
      akunHutangId: caraBayar === 'kredit' ? akunHutangId : null,
      // Akun PPN hanya disimpan kalau PPN-nya memang ada — menyimpannya untuk
      // invoice tanpa PPN membuat snapshot yang tidak pernah dipakai, dan
      // menahan akun itu dari penghapusan tanpa alasan (FK restrict).
      akunPpnMasukanId: (ppnMinor ?? 0) > 0 ? akunPpnMasukanId : null,
      ppn: fromMinorUnits(ppnMinor ?? 0),
      jumlahTermin: caraBayar === 'kredit' ? jumlahTermin : 1,
      jatuhTempoAkhir: caraBayar === 'kredit' ? jatuhTempoAkhir : null,
      keterangan:
        typeof input.keterangan === 'string' && input.keterangan.trim() !== ''
          ? input.keterangan.trim()
          : null,
      lines,
    },
  }
}

// ── Jurnal otomatis ──────────────────────────────────────────

/** Satu komponen nilai invoice yang menjadi SATU baris debit di jurnalnya. */
export type JournalKomponen = {
  jenis: 'barang' | 'ppn' | 'ongkir' | 'diskon'
  akunId: string
  /** INTEGER SEN. Komponen bernilai nol dilewati. */
  minor: number
  keterangan?: string | null
}

/**
 * Baris jurnal untuk sebuah invoice pembelian (D31).
 *
 * **Kredit:** D `akun_tujuan` = subtotal · D `akun_ppn_masukan` = ppn ·
 * **K `akun_hutang` = total**
 * **Tunai:** sama, tapi **K `akun_kas` = total**
 *
 * ══ KENAPA DAFTAR KOMPONEN, BUKAN FIELD TETAP ═══════════════════════════
 * Ongkos kirim & diskon belum diputuskan Ricko dan sementara digabung netto ke
 * nilai barang. Saat dipisah, ia menjadi satu elemen tambahan di `komponen` —
 * fungsi ini, tanda tangannya, dan seluruh pemanggilnya tidak berubah. Itu
 * seluruh gunanya bentuk ini.
 *
 * Komponen bernilai NOL dilewati: baris jurnal bernominal nol melanggar CHECK
 * `journal_lines_satu_sisi_check` (tepat satu sisi terisi), jadi menyertakannya
 * akan menggagalkan seluruh batch.
 */
export function buildPurchaseJournalLines({
  komponen,
  akunLawanId,
}: {
  komponen: readonly JournalKomponen[]
  /** Akun hutang (kredit) atau akun kas (tunai). */
  akunLawanId: string
}): JournalLineValue[] {
  const debitLines: JournalLineValue[] = []
  let totalMinor = 0
  let order = 0

  for (const k of komponen) {
    if (!Number.isSafeInteger(k.minor) || k.minor <= 0) continue
    totalMinor += k.minor
    debitLines.push({
      masterCoaId: k.akunId,
      debit: fromMinorUnits(k.minor),
      kredit: '0.00',
      keterangan: k.keterangan ?? null,
      lineOrder: order++,
    })
  }

  if (debitLines.length === 0) return []

  return [
    ...debitLines,
    {
      masterCoaId: akunLawanId,
      debit: '0.00',
      kredit: fromMinorUnits(totalMinor),
      keterangan: null,
      lineOrder: order,
    },
  ]
}

/**
 * Komponen jurnal dari sebuah invoice tervalidasi — satu tempat yang tahu
 * bagaimana invoice diterjemahkan menjadi nilai-nilai yang dijurnalkan.
 */
export function invoiceKomponen(value: PurchaseInvoiceValue): JournalKomponen[] {
  const totals = computeInvoiceTotals(value.lines, value.ppn)
  const out: JournalKomponen[] = [
    { jenis: 'barang', akunId: value.akunTujuanId, minor: totals.subtotalMinor },
  ]
  if (totals.ppnMinor > 0 && value.akunPpnMasukanId) {
    out.push({ jenis: 'ppn', akunId: value.akunPpnMasukanId, minor: totals.ppnMinor })
  }
  return out
}

/** Akun lawan sebuah invoice: hutang bila kredit, kas bila tunai. */
export function invoiceAkunLawan(value: PurchaseInvoiceValue): string | null {
  return value.caraBayar === 'kredit' ? value.akunHutangId : value.akunKasId
}
