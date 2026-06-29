'use client'

import { Upload as UploadIcon, FileText, X } from 'lucide-react'
import { useState, useRef } from 'react'

export function UploadForm() {
  const [isDragActive, setIsDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (file: File) => {
    if (!file) return

    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
    ]

    const isAllowedType = allowedTypes.includes(file.type) ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.pdf')

    if (!isAllowedType) {
      console.warn('[Upload] Invalid file type:', file.type)
      // TODO: replace with toast notification
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      console.warn('[Upload] File too large:', file.size)
      // TODO: replace with toast notification
      return
    }

    setSelectedFile(file)

    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      handleCSVUpload(file)
    } else if (
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls')
    ) {
      handleExcelUpload(file)
    } else if (file.type === 'application/pdf') {
      handlePDFUpload(file)
    }
  }

  const handleCSVUpload = async (file: File) => {
    // MVP PRIORITY — implement this first
    // TODO: parse CSV using papaparse
    // TODO: validate required columns: tanggal, akun, debit, kredit, keterangan
    // TODO: POST to /api/upload/csv
    console.log('[CSV] File selected for processing:', file.name)
  }

  const handleExcelUpload = async (file: File) => {
    // TODO: convert Excel to CSV rows using xlsx library
    // TODO: then call handleCSVUpload logic
    console.log('[Excel] File selected for processing:', file.name)
  }

  const handlePDFUpload = async (file: File) => {
    // POST MVP — implement after CSV flow is stable
    // TODO: POST to /api/upload/pdf → triggers Gemini AI extraction pipeline
    console.log('[PDF] File selected for processing:', file.name)
  }

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-bold text-(--color-text-primary)">
          Dual-Path Ingestion
        </h2>
        <p className="text-(--color-text-muted) text-sm mt-0.5">
          Upload laporan keuangan PDF atau spreadsheet CSV/Excel
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileSelect(file)
        }}
      />

      {/* Drag & drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-3xl p-14 text-center
                    transition-all duration-300 cursor-pointer select-none
                    ${isDragActive
                      ? 'border-(--color-accent-primary) bg-(--color-accent-primary)/5 scale-[1.02]'
                      : 'border-(--color-border-subtle) bg-(--color-muted-bg)/50 hover:border-(--color-accent-primary)/60 hover:scale-[1.005]'
                    }`}
      >
        <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center
                         justify-center transition-all duration-300
                         ${isDragActive
                           ? 'bg-(--color-accent-primary) shadow-[0_8px_24px_rgb(218,241,99,0.35)]'
                           : 'bg-(--color-muted-bg)'
                         }`}>
          <UploadIcon className={`w-7 h-7 transition-colors duration-300
                                  ${isDragActive
                                    ? 'text-(--color-accent-primary-fg)'
                                    : 'text-(--color-text-muted)'
                                  }`} />
        </div>
        <h3 className="text-base font-semibold text-(--color-text-primary) mb-1">
          {isDragActive ? 'Lepaskan file di sini' : 'Drag & drop file ke sini'}
        </h3>
        <p className="text-(--color-text-muted) text-sm mb-5">
          atau klik untuk browse file CSV, XLSX, XLS, dan PDF
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation()
            fileInputRef.current?.click()
          }}
          className="bg-(--color-accent-primary) text-(--color-accent-primary-fg)
                     px-7 py-2.5 rounded-full text-sm font-semibold
                     hover:shadow-[0_6px_20px_rgb(218,241,99,0.4)]
                     transition-all duration-300 hover:-translate-y-0.5"
        >
          Browse File
        </button>
      </div>

      {/* Selected file display */}
      {selectedFile && (
        <div className="flex items-center gap-3 p-4 bg-(--color-muted-bg)
                        rounded-2xl border border-(--color-border-subtle)
                        animate-fade-in-up">
          <div className="w-9 h-9 rounded-xl bg-(--color-accent-primary)/15
                          flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-(--color-accent-primary)" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-(--color-text-primary) truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-(--color-text-muted)">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="w-7 h-7 rounded-full hover:bg-(--color-muted-dark)
                       flex items-center justify-center transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5 text-(--color-text-muted)" />
          </button>
        </div>
      )}

      {/* File type badges */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'PDF', color: 'bg-red-50 text-red-600' },
          { label: 'CSV', color: 'bg-green-50 text-green-700' },
          { label: 'Excel', color: 'bg-blue-50 text-blue-700' },
          { label: 'Max 25 MB', color: 'bg-(--color-muted-bg) text-(--color-text-muted)' },
        ].map((type) => (
          <span key={type.label}
                className={`px-3 py-1.5 text-xs rounded-full font-semibold ${type.color}`}>
            {type.label}
          </span>
        ))}
      </div>
    </div>
  )
}
