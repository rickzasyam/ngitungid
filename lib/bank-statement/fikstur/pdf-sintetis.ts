// Penulis PDF SINTETIS untuk test & harness (Stream B, sebelum gerbang X0).
//
// Sengaja ditulis tangan, tanpa dependensi: cukup untuk teks Helvetica di posisi
// tertentu dan halaman tanpa lapisan teks (tiruan hasil scan). Tidak pernah
// dipakai untuk dokumen nyata — rekening koran nyata tidak boleh masuk repo
// maupun dikirim ke penyedia mana pun sebelum X0.

export type TeksPdf = { x: number; y: number; teks: string; ukuran?: number }
/** `gambarSaja`: halaman tanpa lapisan teks (hanya garis) — meniru PDF hasil scan. */
export type HalamanPdf = { teks: TeksPdf[]; gambarSaja?: boolean }

export const A4 = { lebar: 595, tinggi: 842 }

// Lebar karakter Helvetica per 1000 em (perkiraan per golongan; cukup untuk
// rata kanan kolom angka di fikstur).
function lebarHuruf(c: string): number {
  if (c >= '0' && c <= '9') return 556
  if (c === ' ' || c === ',' || c === '.' || c === '/' || c === ':') return 278
  if (c === '-') return 333
  if (c >= 'A' && c <= 'Z') return 667
  return 500
}

export function lebarTeks(teks: string, ukuran = 8): number {
  let w = 0
  for (const c of teks) w += lebarHuruf(c)
  return (w / 1000) * ukuran
}

function escapePdf(s: string): string {
  let out = ''
  for (const c of s) {
    if (c === '(' || c === ')' || c === '\\') out += '\\' + c
    else if (c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126) out += '?'
    else out += c
  }
  return out
}

function streamHalaman(h: HalamanPdf): string {
  if (h.gambarSaja) {
    // Garis-garis tabel tanpa satu karakter pun — pembaca harus jatuh ke cadangan gambar.
    let s = '0.5 w\n'
    for (let y = 760; y > 120; y -= 18) s += `40 ${y} m 555 ${y} l S\n`
    return s
  }
  let s = ''
  for (const t of h.teks) {
    s += `BT /F1 ${t.ukuran ?? 8} Tf ${t.x.toFixed(2)} ${t.y.toFixed(2)} Td (${escapePdf(t.teks)}) Tj ET\n`
  }
  return s
}

/** PDF 1.4 minimal: katalog, pohon halaman, satu font Helvetica, satu stream per halaman. */
export function buatPdf(halaman: HalamanPdf[]): Uint8Array {
  const obj: string[] = []
  const nomorHalaman = halaman.map((_, i) => 4 + i * 2)
  obj[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  obj[2] = `<< /Type /Pages /Kids [${nomorHalaman.map(n => `${n} 0 R`).join(' ')}] /Count ${halaman.length} >>`
  obj[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  halaman.forEach((h, i) => {
    const n = nomorHalaman[i]
    const isi = streamHalaman(h)
    obj[n] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.lebar} ${A4.tinggi}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${n + 1} 0 R >>`
    obj[n + 1] = `<< /Length ${isi.length} >>\nstream\n${isi}endstream`
  })

  let pdf = '%PDF-1.4\n'
  const offset: number[] = []
  for (let n = 1; n < obj.length; n++) {
    offset[n] = pdf.length
    pdf += `${n} 0 obj\n${obj[n]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${obj.length}\n0000000000 65535 f \n`
  for (let n = 1; n < obj.length; n++) pdf += `${String(offset[n]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${obj.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  // Semua karakter ASCII (escapePdf mengganti sisanya), jadi 1 karakter = 1 byte.
  const out = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) out[i] = pdf.charCodeAt(i)
  return out
}
