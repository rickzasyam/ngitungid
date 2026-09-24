'use client'

// Input angka bersama untuk SEMUA field uang dan qty (jurnal, pembelian,
// mutasi, alokasi). Seluruh aturannya — format Indonesia saat mengetik, tombol
// titik = desimal, kursor yang tidak meloncat, tempel — hidup di modul murni
// lib/nominal-input.ts dan diuji di sana. Komponen ini hanya menyambungkannya
// ke DOM: membaca keadaan field sesudah browser menerapkan tombol, lalu
// menulis teks & posisi kursor hasil olahan.
//
// ══ NILAI VS TAMPILAN ═════════════════════════════════════════════════════
// `value` / `onChange` membawa NILAI: kanonik ("1000000.25"), '' bila kosong,
// atau teks mentah bila tidak terbaca (supaya pesanGalatNominal di form
// menandainya). Teks terformat hanya ada di state komponen ini.
//
// Nilai yang berubah dari LUAR (isi otomatis subtotal, sisi lain jurnal yang
// dikosongkan, reset sesudah simpan, data ubah) dikenali dengan
// membandingkannya dengan nilai milik tampilan saat ini — pola "sesuaikan
// state saat render", tanpa efek dan tanpa ref yang dibaca saat render.

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { olahKetikan, olahTempel, rapikan, tampilanDari, type MaxDesimal } from '@/lib/nominal-input'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode' | 'defaultValue'> & {
  value: string
  onChange: (nilai: string) => void
  /** 2 = uang (bawaan), 4 = qty. */
  maxDesimal?: MaxDesimal
}

interface Ui {
  teks: string
  /** null = jangan sentuh kursor (perubahan dari luar, bukan ketikan). */
  caret: number | null
  /** Nilai yang diwakili `teks` — pembanding untuk mengenali perubahan dari luar. */
  nilai: string
}

export function NominalInput({ value, onChange, maxDesimal = 2, onBlur, onPaste, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [ui, setUi] = useState<Ui>(() => ({ teks: tampilanDari(value, maxDesimal), caret: null, nilai: value }))

  if (value !== ui.nilai) {
    setUi({ teks: tampilanDari(value, maxDesimal), caret: null, nilai: value })
  }

  // Kursor dipasang SESUDAH React menulis nilai field — kalau tidak, browser
  // meletakkannya di ujung setiap kali teksnya diganti.
  useLayoutEffect(() => {
    const el = ref.current
    if (ui.caret === null || !el || document.activeElement !== el) return
    el.setSelectionRange(ui.caret, ui.caret)
  }, [ui])

  const terapkan = (baru: { teks: string; caret: number; nilai: string }) => {
    setUi(baru)
    if (baru.nilai !== ui.nilai) onChange(baru.nilai)
  }

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={ui.teks}
      onChange={e => {
        const el = e.target
        terapkan(
          olahKetikan({
            sebelum: ui.teks,
            nilaiSebelum: ui.nilai,
            sesudah: el.value,
            caret: el.selectionStart ?? el.value.length,
            jenis: (e.nativeEvent as InputEvent).inputType,
            maxDesimal,
          })
        )
      }}
      onPaste={e => {
        onPaste?.(e)
        if (e.defaultPrevented) return
        const tempel = e.clipboardData.getData('text')
        if (tempel === '') return
        e.preventDefault()
        const el = e.currentTarget
        terapkan(
          olahTempel({
            teks: ui.teks,
            awal: el.selectionStart ?? ui.teks.length,
            akhir: el.selectionEnd ?? ui.teks.length,
            tempel,
            maxDesimal,
          })
        )
      }}
      onBlur={e => {
        const rapi = rapikan(ui.nilai, ui.teks, maxDesimal)
        if (rapi !== ui.teks) setUi({ ...ui, teks: rapi, caret: null })
        onBlur?.(e)
      }}
    />
  )
}
