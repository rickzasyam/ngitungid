// SPIKE S0 (MP §5.G, D46) — skrip ukur enam kriteria untuk /spike-grid.
// Branch `spike/grid-library`, TIDAK di-merge.
//
// Pakai:  AUTH_SECRET=<secret server yang sedang jalan> node spike/ukur-grid.mjs [baseUrl] [cpuThrottle]
// Sesi login dibuat dengan menandatangani JWT memakai AUTH_SECRET server lokal
// (peran akunting, tanpa DB) — hanya untuk server lokal sekali pakai.

import { createRequire } from 'node:module'
import { encode } from 'next-auth/jwt'

// Playwright terpasang global (NODE_PATH); import ESM tidak membaca NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright')

const BASE = process.argv[2] ?? 'http://127.0.0.1:3100'
const THROTTLE = Number(process.argv[3] ?? '1')
const hasil = { base: BASE, cpuThrottle: THROTTLE, kriteria: {} }
const catat = (k, v) => {
  hasil.kriteria[k] = v
  console.log(k, JSON.stringify(v))
}

const token = await encode({
  token: { sub: 'spike', name: 'Spike', email: 'spike@local', role: 'akunting', clientId: null },
  secret: process.env.AUTH_SECRET,
  salt: 'authjs.session-token',
})

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
await context.addCookies([{ name: 'authjs.session-token', value: token, url: BASE }])
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

// ── 0. Muat ─────────────────────────────────────────────────────────────
const tMuat = Date.now()
await page.goto(`${BASE}/spike-grid`)
const grid = page.getByRole('grid', { name: 'Mutasi kas (spike)' })
await grid.waitFor()
await page.locator('.rdg-row').first().waitFor()
const muat = await page.evaluate(() => ({
  ukur: window.__spike?.ukur ?? [],
  baris: document.querySelectorAll('.rdg-row').length,
  ariaRowcount: document.querySelector('[role=grid]')?.getAttribute('aria-rowcount'),
  heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
}))
catat('0-muat', { msSampaiGridTampil: Date.now() - tMuat, ...muat })

// ── 1. Gulir 20.000 baris ──────────────────────────────────────────────
async function gulir(durasiMs, jarakPx = null) {
  return page.evaluate(async ([durasi, jarak]) => {
    const el = document.querySelector('.rdg')
    const total = jarak ?? el.scrollHeight - el.clientHeight
    el.scrollTop = 0
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const frame = []
    let kosong = 0
    const mulai = performance.now()
    let sebelum = mulai
    await new Promise(selesai => {
      const r = el.getBoundingClientRect()
      const langkah = now => {
        frame.push(now - sebelum)
        sebelum = now
        // Diperiksa di AWAL frame = keadaan yang baru saja di-paint sesudah
        // gulir frame sebelumnya. Viewport tanpa baris = virtualisasi tertinggal.
        if (frame.length > 1) {
          const di = document.elementFromPoint(r.left + 60, r.top + r.height / 2)
          if (!di || !di.closest('.rdg-row')) kosong++
        }
        const p = Math.min(1, (now - mulai) / durasi)
        el.scrollTop = p * total
        if (p < 1) requestAnimationFrame(langkah)
        else selesai()
      }
      requestAnimationFrame(langkah)
    })
    frame.shift()
    const urut = [...frame].sort((a, b) => a - b)
    const p = q => urut[Math.min(urut.length - 1, Math.floor(q * urut.length))]
    return {
      tinggiPx: total,
      frame: frame.length,
      fpsRata: Math.round((frame.length / (performance.now() - mulai)) * 1000),
      p50ms: +p(0.5).toFixed(1),
      p95ms: +p(0.95).toFixed(1),
      maksMs: +urut[urut.length - 1].toFixed(1),
      frameLebih50ms: frame.filter(f => f > 50).length,
      frameViewportKosong: kosong,
      barisDiDom: document.querySelectorAll('.rdg-row').length,
      barisTerakhir: document.querySelector('.rdg-row:last-of-type')?.getAttribute('aria-rowindex'),
    }
  }, [durasiMs, jarakPx])
}
// Gulir wajar: 10.000 px/detik (± 280 baris/detik), 2 detik.
catat('1-gulir-wajar-20000px-2s', await gulir(2000, 20_000))
// Gulir ekstrem: seluruh 20.000 baris (± 720.000 px) dalam 3 detik.
catat('1-gulir-ekstrem-semua-3s', await gulir(3000))
// Lompat (seret scrollbar): 5 posisi acak → ms sampai baris tujuan ada di DOM.
catat(
  '1-lompat-scrollbar',
  await page.evaluate(async () => {
    const el = document.querySelector('.rdg')
    const out = []
    for (const f of [0.83, 0.12, 0.57, 0.99, 0.31]) {
      const t0 = performance.now()
      el.scrollTop = f * (el.scrollHeight - el.clientHeight)
      const tujuan = Math.floor((el.scrollTop + el.clientHeight / 2) / 36)
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const ada = [...document.querySelectorAll('.rdg-row')].some(r => Math.abs(Number(r.getAttribute('aria-rowindex')) - 1 - tujuan) <= 2)
      out.push({ ms: Math.round(performance.now() - t0), barisTujuanTampil: ada })
    }
    return out
  })
)

// Gulir roda tetikus (jalur input asli, bukan scrollTop).
await page.evaluate(() => (document.querySelector('.rdg').scrollTop = 0))
const box = await grid.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
const tRoda = Date.now()
for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 1200)
await page.waitForTimeout(100)
catat('1-gulir-roda-60x1200px', {
  ms: Date.now() - tRoda,
  scrollTop: await page.evaluate(() => Math.round(document.querySelector('.rdg').scrollTop)),
})

// ── 3. Keyboard ─────────────────────────────────────────────────────────
const posisi = () =>
  page.evaluate(() => {
    const a = document.activeElement
    const sel = a?.closest('[role=gridcell],[role=columnheader]')
    return {
      kolom: sel?.getAttribute('aria-colindex') ?? null,
      baris: sel?.closest('[role=row]')?.getAttribute('aria-rowindex') ?? null,
      editor: !!a?.closest('.rdg-editor-container'),
      tag: a?.tagName,
    }
  })
await page.evaluate(() => (document.querySelector('.rdg').scrollTop = 0))
await page.locator('[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="2"]').click()
const kb = { awal: await posisi() }
await page.keyboard.press('ArrowRight')
kb.panahKanan = await posisi()
await page.keyboard.press('ArrowDown')
kb.panahBawah = await posisi()
await page.keyboard.press('ArrowLeft')
kb.panahKiri = await posisi()
await page.keyboard.press('ArrowUp')
kb.panahAtas = await posisi()
await page.keyboard.press('Tab')
kb.tab = await posisi()
await page.keyboard.press('Shift+Tab')
kb.shiftTab = await posisi()
await page.keyboard.press('Enter')
kb.enterBukaEditor = await posisi()
await page.keyboard.type('XYZ')
await page.keyboard.press('Escape')
kb.escTutup = await posisi()
kb.escNilaiTidakBerubah = !(await page.locator('[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="2"]').innerText()).includes('XYZ')
await page.keyboard.press('Enter')
await page.keyboard.type('UJI-A-spike')
await page.keyboard.press('Enter')
kb.enterSimpan = (await page.locator('[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="2"]').innerText()) === 'UJI-A-spike'
kb.sesudahEnterSimpan = await posisi()
await page.keyboard.press('Control+End')
kb.ctrlEnd = await posisi()
await page.keyboard.press('Control+Home')
kb.ctrlHome = await posisi()
await page.keyboard.press('PageDown')
kb.pageDown = await posisi()
catat('3-keyboard', kb)

// ── 2. Editor NominalInput ──────────────────────────────────────────────
// Sel Masuk (kolom 3) baris data ke-2 (aria-rowindex 3).
await page.keyboard.press('Control+Home')
const selMasuk = page.locator('[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="3"]')
await selMasuk.click()
const ed = { langkah: [] }
const input = () => page.locator('.rdg-editor-container input')
// Ketik langsung di sel aktif (tanpa Enter) = mulai menyunting & mengganti isi.
for (const ch of '1000000') {
  await page.keyboard.type(ch)
  ed.langkah.push(await input().evaluate(el => `${el.value}|${el.selectionStart}`))
}
ed.tampil = await input().inputValue()
ed.kursorDiUjung = await input().evaluate(el => el.selectionStart === el.value.length)
// Sisipkan di tengah: Home, →, ketik "2" → "12.000.000", kursor sesudah "2".
await page.keyboard.press('Home')
await page.keyboard.press('ArrowRight')
await page.keyboard.type('2')
ed.sisipTengah = await input().evaluate(el => `${el.value}|${el.selectionStart}`)
// Titik = desimal (N9).
await page.keyboard.press('End')
await page.keyboard.type('.5')
ed.titikJadiKoma = await input().inputValue()
await page.keyboard.press('Enter')
ed.selSesudahEnter = await selMasuk.innerText()
// Isi juga Keluar di baris yang sama → Masuk DAN Keluar terisi → kedua sel galat.
const selKeluar = page.locator('[role=row][aria-rowindex="3"] [role=gridcell][aria-colindex="4"]')
await page.keyboard.press('ArrowRight')
await page.keyboard.type('500')
await page.keyboard.press('Enter')
ed.galatMasukDanKeluar = {
  masukInvalid: await selMasuk.getAttribute('aria-invalid'),
  keluarInvalid: await selKeluar.getAttribute('aria-invalid'),
  keluarDescribedby: await selKeluar.getAttribute('aria-describedby'),
  keluarTeks: await selKeluar.innerText(),
}
// Delete di sel aktif = kosongkan sel; galat kedua sel hilang.
await page.keyboard.press('Delete')
ed.deleteKosongkanSel = {
  editorTerbuka: await page.locator('.rdg-editor-container').count(),
  keluarTeks: await selKeluar.innerText(),
  masukInvalid: await selMasuk.getAttribute('aria-invalid'),
}
// Tab di dalam editor = simpan + pindah ke sel kanan.
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('Enter')
await page.keyboard.press('End')
await page.keyboard.type('9')
await page.keyboard.press('Tab')
ed.tabDiEditor = { posisi: await posisi(), masukTeks: await selMasuk.innerText() }
catat('2-editor-nominal', ed)

// ── 4. Tempel 10.000 baris ──────────────────────────────────────────────
async function tempel(nama, tsv, pilihSel) {
  await pilihSel()
  await page.evaluate(t => navigator.clipboard.writeText(t), tsv)
  await page.evaluate(() => (window.__spike.ukur = []))
  const t0 = Date.now()
  await page.keyboard.press('Control+V')
  await page.waitForFunction(() => window.__spike.ukur.some(u => u.label.startsWith('tempel-')), null, { timeout: 30000 })
  const wall = Date.now() - t0
  const u = await page.evaluate(() => window.__spike.ukur.find(x => x.label.startsWith('tempel-')))
  const status = await page.getByTestId('pesan').innerText()
  return { nama, msHandlerSampaiPaint: Math.round(u.ms), msTekanCtrlVSampaiSelesai: wall, detail: u.detail, status }
}
const buatTsv = (n, gaya, persenGalat = 0) => {
  const baris = []
  let saldo = 50_000_000_00
  for (let i = 0; i < n; i++) {
    const masuk = i % 5 !== 0
    const nom = 10_000_00 + ((i * 7919) % 2_000_000_00)
    saldo += masuk ? nom : -nom
    const f = v => {
      const utuh = String(Math.floor(v / 100))
      let s = ''
      for (let k = 0; k < utuh.length; k++) s += (k > 0 && (utuh.length - k) % 3 === 0 ? '.' : '') + utuh[k]
      return `${s},${String(v % 100).padStart(2, '0')}`
    }
    let tgl = `${String(1 + Math.floor((i / n) * 30)).padStart(2, '0')}/04/2026`
    let nominal = f(nom)
    if (persenGalat && i % Math.round(100 / persenGalat) === 7) {
      if (i % 2) tgl = '31/02/2026'
      else nominal = '12,345,6'
    }
    const uraian = gaya === 'excel' && i % 500 === 0 ? `"Penjualan ${i}\nbaris kedua"` : `Penjualan Shopee ${i}`
    baris.push([tgl, uraian, masuk ? nominal : '', masuk ? '' : nominal, f(saldo), '', ''].join('\t'))
  }
  return gaya === 'excel' ? baris.join('\r\n') + '\r\n' : baris.join('\n')
}
const kosongkan = async () => {
  await page.getByRole('button', { name: 'Kosongkan grid' }).click()
  await page.getByRole('columnheader', { name: 'Tanggal' }).click()
}
const muat20k = async () => {
  await page.getByRole('button', { name: 'Muat 20.000 baris' }).click()
  await page.evaluate(() => (document.querySelector('.rdg').scrollTop = 0))
  await page.locator('[role=row][aria-rowindex="2"] [role=gridcell][aria-colindex="1"]').click()
}
const tp = []
tp.push(await tempel('excel-10000-ke-grid-kosong', buatTsv(10_000, 'excel'), kosongkan))
tp.push(await tempel('gsheets-10000-ke-grid-kosong', buatTsv(10_000, 'gsheets'), kosongkan))
tp.push(await tempel('excel-10000-timpa-20000', buatTsv(10_000, 'excel'), muat20k))
tp.push(await tempel('excel-10000-galat-1persen', buatTsv(10_000, 'excel', 1), kosongkan))
catat('4-tempel', tp)
catat('4-heap-sesudah-tempel', { heapMB: await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null)) })

// ── 5. A11y — pohon aksesibilitas (pengganti sementara NVDA) ────────────
await page.evaluate(() => (document.querySelector('.rdg').scrollTop = 0))
const axDari = async ekspresi => {
  const { result } = await cdp.send('Runtime.evaluate', { expression: ekspresi })
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })
  const n = nodes[0]
  const prop = {}
  for (const p of n.properties ?? []) prop[p.name] = p.value.value
  return { role: n.role?.value, name: n.name?.value, description: n.description?.value, ...prop }
}
const a11y = { grid: await axDari("document.querySelector('[role=grid]')") }
a11y.gridAttr = await page.evaluate(() => {
  const g = document.querySelector('[role=grid]')
  return { rowcount: g.getAttribute('aria-rowcount'), colcount: g.getAttribute('aria-colcount') }
})
a11y.kolomHeader = await page.getByRole('columnheader').allInnerTexts()
// Sel bergalat pertama yang dirender: fokus, lalu baca node AX elemen aktif.
await page.locator('[role=gridcell][aria-invalid=true]').first().click()
a11y.selGalatFokus = await axDari('document.activeElement')
a11y.selGalatBaris = await page.evaluate(() => document.activeElement.closest('[role=row]').getAttribute('aria-rowindex'))
// Sel sah biasa untuk pembanding.
await page.keyboard.press('ArrowUp')
a11y.selSahFokus = await axDari('document.activeElement')
// Header kolom yang menamai sel: NVDA membacanya dari columnheader se-kolom.
a11y.liveRegion = await page.getByRole('status').innerText()
catat('5-a11y', a11y)

await browser.close()
console.log('\nRINGKAS', JSON.stringify(hasil))
