// Mesin pencocokan rawName (hasil ekstraksi PDF) → Master COA klien.
//
// Urutan prioritas — dari yang paling bisa dipercaya:
//   1. HISTORY  — admin pernah mengonfirmasi nama ini untuk klien ini
//                 (coa_mapping_history). Ini kebenaran manusia, bukan tebakan.
//   2. EXACT    — nama akun sama persis setelah dinormalisasi.
//   3. FUZZY    — skor gabungan bigram-Dice + token overlap, di atas ambang.
//
// Murni (tanpa I/O) supaya gampang diuji & dipakai dari route mana pun.

export type CoaCandidate = { id: string; nama: string }

export type Suggestion = {
  masterCoaId: string
  score: number // 0..1
  via: 'history' | 'exact' | 'fuzzy'
}

// Kata sambung/pengisi yang tidak membedakan makna akun.
const STOPWORDS = new Set(['dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'pada', 'the', 'of'])

/** lowercase, buang tanda baca, ratakan spasi. "HPP - Shopee!" → "hpp shopee" */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter(t => t.length > 0 && !STOPWORDS.has(t))
}

/** Bigram karakter — toleran typo & beda urutan kata. */
function bigrams(normalized: string): Set<string> {
  const t = normalized.replace(/ /g, '')
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

/** Dice coefficient: 2|A∩B| / (|A|+|B|). */
function diceCoefficient(aNorm: string, bNorm: string): number {
  const A = bigrams(aNorm)
  const B = bigrams(bNorm)
  if (A.size === 0 || B.size === 0) return aNorm === bNorm ? 1 : 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return (2 * inter) / (A.size + B.size)
}

/** Jaccard atas token — menangkap "Beban Ads Shopee" vs "Beban Iklan Shopee". */
function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const B = new Set(b)
  let inter = 0
  for (const t of new Set(a)) if (B.has(t)) inter++
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : inter / union
}

/**
 * Ambang minimum skor fuzzy. Di bawah ini lebih baik TIDAK menyarankan apa pun
 * daripada menyarankan akun yang salah — saran keliru lebih mahal (admin
 * cenderung meng-klik "terima") ketimbang tidak ada saran sama sekali.
 */
export const FUZZY_THRESHOLD = 0.55

/** Bobot: bigram lebih dominan (tahan typo), token overlap sebagai penguat. */
function fuzzyScore(rawNorm: string, rawTokens: string[], coaNama: string): number {
  const coaNorm = normalizeName(coaNama)
  return 0.6 * diceCoefficient(rawNorm, coaNorm) + 0.4 * tokenOverlap(rawTokens, tokenize(coaNama))
}

/**
 * @param historyByRawName kunci HARUS sudah dinormalisasi (pakai normalizeName).
 * @returns saran terbaik, atau null kalau tidak ada yang cukup meyakinkan.
 */
export function suggestCoa(
  rawName: string,
  accounts: CoaCandidate[],
  historyByRawName: Map<string, string> = new Map()
): Suggestion | null {
  if (accounts.length === 0) return null

  const rawNorm = normalizeName(rawName)
  if (rawNorm === '') return null

  // 1. History — hanya dipakai kalau COA-nya masih ada (bisa terhapus saat
  //    Master COA di-replace lewat import ulang).
  const fromHistory = historyByRawName.get(rawNorm)
  if (fromHistory && accounts.some(a => a.id === fromHistory)) {
    return { masterCoaId: fromHistory, score: 1, via: 'history' }
  }

  // 2. Exact — hanya kalau TIDAK ambigu. Dua akun berbeda bisa punya nama yang
  //    identik setelah normalisasi (mis. "Biaya Adm & ATK" vs "Biaya Adm ATK").
  //    Kalau ambigu jangan auto-map: turunkan jadi saran biasa supaya admin
  //    yang memutuskan.
  const exactMatches = accounts.filter(a => normalizeName(a.nama) === rawNorm)
  if (exactMatches.length === 1) {
    return { masterCoaId: exactMatches[0].id, score: 1, via: 'exact' }
  }
  if (exactMatches.length > 1) {
    return { masterCoaId: exactMatches[0].id, score: 0.99, via: 'fuzzy' }
  }

  // 3. Fuzzy
  const rawTokens = tokenize(rawName)
  let best: { id: string; score: number } | null = null
  for (const a of accounts) {
    const score = fuzzyScore(rawNorm, rawTokens, a.nama)
    if (!best || score > best.score) best = { id: a.id, score }
  }
  if (!best || best.score < FUZZY_THRESHOLD) return null
  return { masterCoaId: best.id, score: best.score, via: 'fuzzy' }
}

/**
 * Kebijakan tunggal auto-map vs saran (dipakai upload + backfill).
 * `history` (dikonfirmasi manusia) dan `exact` non-ambigu cukup pasti untuk
 * langsung dipetakan; `fuzzy` hanya jadi saran yang menunggu konfirmasi admin.
 */
export function isAutoMappable(s: Suggestion): boolean {
  return s.via === 'history' || s.via === 'exact'
}
