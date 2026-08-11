'use client'

import { useEffect, useRef, useState } from 'react'
import { StyledSelect } from '@/components/ui/styled-select'
import { useClient } from '@/lib/client-context'
import { clientTypeOptions } from '@/lib/client-types'

// Pemilih Jenis Usaha — SATU implementasi untuk form Klien Baru DAN Edit Klien.
//
// Menggantikan `<input list>` + `<datalist>` di kedua form. Datalist memang
// memberi "ketik bebas + saran" secara gratis, tapi panelnya digambar oleh
// BROWSER: di Chrome/Windows ia muncul gelap dengan teks merah muda, tidak bisa
// disentuh CSS aplikasi sama sekali, dan ia juga menyisipkan riwayat autofill
// browser ke dalam daftar — itulah kenapa nilai seperti "QA Testing" bisa
// muncul padahal tidak ada di kode maupun di database.
//
// Katalognya DITURUNKAN dari data (nilai distinct `clients.type`), bukan array
// hardcoded — lihat lib/client-types.ts. Daftar klien sudah di-fetch sekali
// oleh ClientProvider, jadi ini nol request tambahan; dan karena `onCreated` /
// `onSaved` memanggil refreshClients(), jenis usaha yang baru diketik langsung
// tersedia untuk klien berikutnya.
//
// Komponen ini membaca useClient() SENDIRI, bukan menerima daftar lewat props:
// dua pemanggil yang masing-masing menurunkan daftarnya adalah persis bentuk
// duplikasi yang baru saja dihapus (TYPE_SUGGESTIONS ada di dua file).
//
// TIDAK ADA konfirmasi & TIDAK ADA peringatan "tidak bisa dihapus" — beda dari
// Layanan. `clients.type` cuma kolom text tanpa FK dan tanpa katalog, jadi
// salah ketik sembuh sendiri begitu klien itu diperbaiki dan lenyap saat tak
// dipakai. Menyalin peringatan Layanan ke sini akan mengatakan hal yang keliru.

const NEW_VALUE = '__new__'

export function JenisUsahaSelect({
  value,
  onChange,
  ariaLabel = 'Jenis Usaha',
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel?: string
}) {
  const { clients } = useClient()
  const [creating, setCreating] = useState(false)
  const newRef = useRef<HTMLInputElement>(null)

  const options = clientTypeOptions(clients.map(c => c.type))
  // Nilai yang tidak ada di daftar (mis. jenis usaha klien ini baru saja
  // diubah orang lain, atau satu-satunya pemakainya adalah klien ini sendiri
  // saat sedang diedit) tetap ditampilkan — kalau tidak, membuka form untuk
  // mengganti LOGO saja akan diam-diam mengosongkan jenis usahanya.
  const isKnown = value === '' || options.includes(value)

  useEffect(() => {
    if (creating) newRef.current?.focus()
  }, [creating])

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={newRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Jenis usaha baru…"
          aria-label="Jenis usaha baru"
          className="flex-1 px-4 py-3 rounded-2xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{
            background: 'var(--color-muted-bg)',
            border: '1.5px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="button"
          onClick={() => { setCreating(false); onChange('') }}
          className="px-3.5 py-3 rounded-2xl text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }}
        >
          Batal
        </button>
      </div>
    )
  }

  return (
    <StyledSelect
      ariaLabel={ariaLabel}
      value={value}
      placeholder="— pilih jenis usaha —"
      options={[
        ...(!isKnown && value !== '' ? [{ value, label: value }] : []),
        ...options.map(o => ({ value: o, label: o })),
        { value: NEW_VALUE, label: '+ Jenis Usaha Baru…', kind: 'action' as const },
      ]}
      onChange={v => {
        if (v === NEW_VALUE) { setCreating(true); onChange('') } else onChange(v)
      }}
      searchable={options.length > 8}
      searchPlaceholder="Cari jenis usaha…"
    />
  )
}
