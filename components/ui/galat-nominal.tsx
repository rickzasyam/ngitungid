// Penanda galat untuk field NOMINAL — satu tampilan di keempat form uang
// (jurnal, pembelian, mutasi, alokasi). Pesannya datang dari
// pesanGalatNominal (lib/nominal.ts); komponen ini hanya menampilkannya.
//
// Pesannya diberi `id` supaya input bisa menunjuknya lewat aria-describedby:
// pembaca layar menyebut isi galat saat fokus masuk ke field, bukan hanya
// "invalid".

import type { CSSProperties } from 'react'

const MERAH = '#b91c1c'

/** Border merah untuk field yang galat; objek kosong bila tidak. */
export function merahBila(pesan: string | null): CSSProperties {
  return pesan ? { border: '1px solid rgba(220,38,38,0.55)' } : {}
}

export function GalatNominal({ id, pesan }: { id: string; pesan: string | null }) {
  if (!pesan) return null
  return (
    <p id={id} className="text-[11px] mt-1 leading-snug" style={{ color: MERAH }}>
      {pesan}
    </p>
  )
}
