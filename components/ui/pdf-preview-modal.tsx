'use client'

import { useCallback, useId } from 'react'
import { FileText, X } from 'lucide-react'
import { ModalShell } from '@/components/ui/modal-portal'

/**
 * Preview PDF inline — modal di TENGAH dengan iframe ke sebuah URL PDF.
 * Browser merender PDF-nya sendiri; tidak ada library viewer.
 *
 * Diangkat dari /laporan (dulu komponen lokal `PdfPreview` di file halaman itu)
 * saat halaman Kontrak butuh preview yang sama persis. Yang dibawa naik BUKAN
 * cuma markup-nya, tapi dua keputusan yang mahal ditemukan ulang:
 *
 *  1. max-w-4xl (896px) + h-[85vh]. Dulu slide-over 680px yang menempel di
 *     kanan; begitu user zoom in di viewer PDF bawaan browser, halaman A4
 *     melebar lalu TERPOTONG kiri-kanan tanpa ruang geser. Dan `h-[85vh]` bukan
 *     duplikat `max-h` milik ModalShell: ModalShell hanya MEMBATASI tinggi,
 *     tidak MEMBERI tinggi, sehingga `flex-1` di pembungkus iframe punya
 *     flex-basis 0 dan iframe jatuh ke tinggi bawaannya (150px) — modal
 *     terlihat kuncup.
 *  2. Fokus awal dipasang lewat ref callback, BUKAN useEffect. ModalShell
 *     menaruh isinya di portal yang baru ada setelah render pertamanya, jadi
 *     saat efek komponen ini jalan tombolnya belum menempel dan .focus() diam-
 *     diam tidak kena sasaran.
 *
 * Esc & klik backdrop ditangani ModalShell (lewat `onDismiss`) — jangan pasang
 * listener keydown kedua di sini.
 */
export function PdfPreviewModal({
  src,
  title,
  subtitle,
  accent = '#daf163',
  onClose,
}: {
  /** URL endpoint PDF, mis. `/api/contracts/<id>/dokumen`. */
  src: string
  /** Baris atas — jenis dokumennya, mis. "Laba Rugi" / "Kontrak REG-001". */
  title: string
  /** Baris bawah — nama file aslinya. */
  subtitle: string
  /** Warna chip ikon; dialiri alpha 22 supaya lembut. */
  accent?: string
  onClose: () => void
}) {
  const titleId = useId()

  // useCallback([]) menjaga identitas ref stabil supaya fokus tidak direbut
  // ulang setiap render.
  const setCloseBtn = useCallback((node: HTMLButtonElement | null) => {
    node?.focus()
  }, [])

  return (
    <ModalShell onDismiss={onClose} labelledBy={titleId} className="max-w-4xl h-[85vh]">
      <div
        className="flex items-center justify-between gap-3 flex-shrink-0"
        style={{ padding: '15px 20px', borderBottom: '1px solid #f0f0f0' }}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 32, height: 32, borderRadius: 9, background: accent + '22' }}
          >
            <FileText className="w-4 h-4" style={{ color: '#1f2430' }} />
          </div>
          <div className="min-w-0">
            <div id={titleId} style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2430' }}>{title}</div>
            <div
              className="truncate"
              style={{ fontSize: 11.5, color: 'var(--color-text-muted)', maxWidth: 440 }}
              title={subtitle}
            >
              {subtitle}
            </div>
          </div>
        </div>
        <button
          ref={setCloseBtn}
          onClick={onClose}
          aria-label="Tutup preview"
          className="inline-flex items-center justify-center rounded-full flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{ width: 34, height: 34, border: '1px solid #e5e7eb', background: 'white', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0" style={{ background: '#525659' }}>
        <iframe
          src={src}
          title={`PDF ${title} — ${subtitle}`}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </ModalShell>
  )
}
