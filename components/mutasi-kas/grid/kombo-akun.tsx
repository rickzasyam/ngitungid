'use client'

// Combobox Nama Akun (masukan Ricko 2026-10-30) — pengganti `<datalist>`
// bawaan browser, untuk editor sel grid DAN dialog "Isi Nama Akun kosong".
//
// Mengetik menyaring (kode ATAU nama); Alt+↓ membuka daftar penuh; ↑↓ memilih;
// Enter memasang; Tab memasang pilihan yang sudah disorot lalu pindah sel;
// Esc batal. Daftar dikelompokkan per jenis akun (tipe akun Master COA).
//
// Daftar di-PORTAL ke <body> (ModalPortal: leluhur ber-transform), tapi tetap
// anak React dari input-nya. Itu disengaja: event React merambat lewat pohon
// React, bukan DOM, jadi mousedown pada opsi melewati `onMouseDownCapture`
// sel editor react-data-grid — klik opsi dianggap DI DALAM editor, bukan klik
// luar yang menyimpan teks ketikan lalu menutup editor sebelum opsi terpilih.

import './kombo-akun.css'

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ModalPortal } from '@/components/ui/modal-portal'
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, type AccountType } from '@/lib/coa/account-type'

export type AkunPilihan = { id: string; kode: string; nama: string; jenis: AccountType | null }

export type CaraPilih = 'enter' | 'tab' | 'tab-mundur' | 'klik'

type Grup = { jenis: AccountType | null; label: string; akun: AkunPilihan[] }

const URUTAN_GRUP: (AccountType | null)[] = [...ACCOUNT_TYPES, null]
const labelGrup = (j: AccountType | null) => (j === null ? 'Lainnya' : ACCOUNT_TYPE_LABEL[j])
const kecil = (s: string) => s.trim().toLowerCase()

/** Akun yang cocok dengan ketikan (kode atau nama memuat kueri), dikelompokkan per jenis. */
export function saringAkun(akun: readonly AkunPilihan[], kueri: string | null): Grup[] {
  const q = kueri === null ? '' : kecil(kueri)
  const cocok = q === '' ? akun : akun.filter(a => kecil(a.kode).includes(q) || kecil(a.nama).includes(q) || kecil(`${a.kode} · ${a.nama}`).includes(q))
  return URUTAN_GRUP.map(j => ({ jenis: j, label: labelGrup(j), akun: cocok.filter(a => a.jenis === j) })).filter(g => g.akun.length > 0)
}

type Props = {
  akun: readonly AkunPilihan[]
  nilai: string
  onNilai: (teks: string) => void
  onPilih: (a: AkunPilihan, cara: CaraPilih) => void
  /** Daftar selalu terbuka selama input fokus (editor sel grid). */
  selaluTerbuka?: boolean
  label: string
  className?: string
  style?: React.CSSProperties
  autoFocus?: boolean
  placeholder?: string
  onBlur?: () => void
}

export function KomboAkun({ akun, nilai, onNilai, onPilih, selaluTerbuka = false, label, className, style, autoFocus, placeholder, onBlur }: Props) {
  const idDaftar = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // Node daftar di ref + `daftarSiap` sebagai PEMICU: ModalPortal baru
  // memasang isinya di render BERIKUTNYA, jadi efek penempatan harus jalan
  // ulang begitu node-nya menempel (pola yang sama dengan date-range-picker).
  const daftarRef = useRef<HTMLDivElement | null>(null)
  const [daftarSiap, setDaftarSiap] = useState(false)
  const pasangDaftar = useCallback((node: HTMLDivElement | null) => {
    daftarRef.current = node
    setDaftarSiap(node !== null)
  }, [])
  // null = tidak menyaring (daftar penuh, akun yang terisi disorot) — keadaan
  // saat dibuka lewat F2, klik ganda, ▾, atau Alt+↓. Ketikan pertama (termasuk
  // huruf yang membuka editor) mengisi kueri lewat onChange.
  const [kueri, setKueri] = useState<string | null>(null)
  const [terbuka, setTerbuka] = useState(selaluTerbuka)
  // Pengguna sudah mengetik atau memindah sorotan — hanya saat itu Tab ikut memasang.
  const [disentuh, setDisentuh] = useState(false)
  const grup = useMemo(() => saringAkun(akun, kueri), [akun, kueri])
  const datar = useMemo(() => grup.flatMap(g => g.akun), [grup])

  // Sorotan awal: akun yang sedang terisi (bila ada di daftar), atau yang pertama.
  const indeksNilai = useMemo(() => {
    const k = kecil(nilai)
    const i = datar.findIndex(a => kecil(a.kode) === k || kecil(`${a.kode} · ${a.nama}`) === k || kecil(a.nama) === k)
    return i
  }, [datar, nilai])
  const [aktifManual, setAktifManual] = useState<{ kueri: string | null; i: number } | null>(null)
  // Sorotan diturunkan, bukan disetel efek: berubah kueri → sorotan kembali ke awal.
  const aktif =
    datar.length === 0
      ? -1
      : aktifManual && aktifManual.kueri === kueri
        ? Math.min(aktifManual.i, datar.length - 1)
        : kueri === null && indeksNilai >= 0
          ? indeksNilai
          : 0
  const tampil = terbuka || selaluTerbuka

  // Posisi daftar: tepat di bawah input (atau di atasnya bila tidak muat),
  // ditulis langsung ke .style — sama dengan pola date-range-picker.
  useLayoutEffect(() => {
    if (!tampil || !daftarSiap) return
    const tempatkan = () => {
      const input = inputRef.current
      const d = daftarRef.current
      if (!input || !d) return
      const r = input.getBoundingClientRect()
      const ruangBawah = window.innerHeight - r.bottom - 8
      const ruangAtas = r.top - 8
      const atas = d.offsetHeight > ruangBawah && ruangAtas > ruangBawah
      d.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - d.offsetWidth - 8))}px`
      d.style.top = atas ? `${Math.max(8, r.top - 4 - d.offsetHeight)}px` : `${r.bottom + 4}px`
      d.style.maxHeight = `${Math.max(160, Math.min(320, atas ? ruangAtas : ruangBawah))}px`
      d.style.visibility = 'visible'
    }
    tempatkan()
    window.addEventListener('scroll', tempatkan, true)
    window.addEventListener('resize', tempatkan)
    return () => {
      window.removeEventListener('scroll', tempatkan, true)
      window.removeEventListener('resize', tempatkan)
    }
  })

  // Opsi yang disorot selalu terlihat di dalam daftar yang bergulir.
  useLayoutEffect(() => {
    if (!tampil || !daftarSiap || aktif < 0) return
    daftarRef.current?.querySelector(`[data-indeks="${aktif}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [tampil, daftarSiap, aktif])

  const idOpsi = (i: number) => `${idDaftar}-o${i}`

  function pindah(langkah: number) {
    if (datar.length === 0) return
    setAktifManual({ kueri, i: (aktif + langkah + datar.length) % datar.length })
    setDisentuh(true)
    setTerbuka(true)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      setKueri(null)
      setAktifManual(null)
      setTerbuka(true)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (!tampil) {
        setTerbuka(true)
        return
      }
      pindah(e.key === 'ArrowDown' ? 1 : -1)
      return
    }
    const opsi = tampil && aktif >= 0 ? datar[aktif] : undefined
    if (e.key === 'Enter' && opsi) {
      e.preventDefault()
      e.stopPropagation()
      onPilih(opsi, 'enter')
      return
    }
    if (e.key === 'Tab' && opsi && disentuh) {
      e.preventDefault()
      e.stopPropagation()
      onPilih(opsi, e.shiftKey ? 'tab-mundur' : 'tab')
      return
    }
    if (e.key === 'Escape' && terbuka && !selaluTerbuka) {
      e.preventDefault()
      e.stopPropagation()
      setTerbuka(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        role="combobox"
        aria-label={label}
        aria-expanded={tampil}
        aria-controls={idDaftar}
        aria-autocomplete="list"
        aria-activedescendant={tampil && aktif >= 0 ? idOpsi(aktif) : undefined}
        autoComplete="off"
        spellCheck={false}
        className={className}
        style={style}
        placeholder={placeholder}
        value={nilai}
        onFocus={e => {
          e.currentTarget.select()
          setTerbuka(true)
        }}
        onChange={e => {
          onNilai(e.target.value)
          setKueri(e.target.value)
          setAktifManual(null)
          setDisentuh(true)
          setTerbuka(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!selaluTerbuka) setTerbuka(false)
          onBlur?.()
        }}
      />
      {tampil && (
        <ModalPortal>
          <div
            ref={pasangDaftar}
            id={idDaftar}
            role="listbox"
            aria-label={label}
            className="kombo-akun"
            // Tetap di input: mousedown di daftar tidak boleh mencuri fokus.
            onMouseDown={e => e.preventDefault()}
          >
            {datar.length === 0 ? (
              <p className="kombo-akun-kosong">
                Tidak ada akun yang cocok dengan &quot;{kueri ?? nilai}&quot;. Enter menyimpan teks apa adanya (akan ditandai merah).
              </p>
            ) : (
              grup.map(g => {
                const mulai = datar.indexOf(g.akun[0])
                return (
                  <div key={g.label} role="group" aria-label={g.label}>
                    <div className="kombo-akun-grup" aria-hidden="true">
                      {g.label}
                    </div>
                    {g.akun.map((a, j) => {
                      const i = mulai + j
                      return (
                        <div
                          key={a.id}
                          id={idOpsi(i)}
                          data-indeks={i}
                          role="option"
                          aria-selected={i === aktif}
                          className={`kombo-akun-opsi${i === aktif ? ' kombo-akun-aktif' : ''}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            onPilih(a, 'klik')
                          }}
                        >
                          <span className="kombo-akun-kode">{a.kode}</span>
                          <span className="kombo-akun-nama">{a.nama}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </ModalPortal>
      )}
    </>
  )
}
