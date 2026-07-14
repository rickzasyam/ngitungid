'use client'

import Link from 'next/link'
import { Files } from 'lucide-react'
import { Header } from '@/components/header'
import { UploadSession } from '@/components/upload-session'
import { StatusSection } from '@/components/status-section'
import { useRequireClient } from '@/lib/use-require-client'

export default function Page() {
  const { activeClient, isLoaded } = useRequireClient()

  if (!isLoaded || !activeClient) return null

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >
        <Header currentStep={1} />
        <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
          <div className="p-4 sm:p-8">
            <div className="w-full mx-auto" style={{ maxWidth: 1380 }}>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-6 lg:gap-[22px] items-start">
                {/* Left column — Upload Session */}
                <div
                  className="rounded-3xl p-4 sm:p-8 ng-rise"
                  style={{
                    background: 'white',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <UploadSession />
                </div>

                {/* Right column — rail: Status ekstraksi + pintasan Laporan.
                    Kelola laporan (hapus/ganti/ubah periode) kini di halaman
                    /laporan sendiri, bukan lagi panel sempit di sini. */}
                <div className="flex flex-col gap-6 ng-rise" style={{ animationDelay: '0.1s' }}>
                  <div
                    className="rounded-3xl p-4 sm:p-8"
                    style={{
                      background: 'white',
                      boxShadow: '0 4px 20px rgb(0,0,0,0.06)',
                      border: '1px solid #f0f0f0',
                    }}
                  >
                    <StatusSection />
                  </div>

                  {/* Pintasan ke halaman Laporan */}
                  <Link
                    href="/laporan"
                    className="rounded-3xl p-4 sm:p-6 flex items-center gap-4 transition-colors duration-150 hover:bg-[#fbfbfc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                    style={{ background: 'white', boxShadow: '0 4px 20px rgb(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
                  >
                    <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)' }}>
                      <Files style={{ width: 18, height: 18, color: '#1a1a1a' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold" style={{ fontSize: 13.5, color: 'var(--color-text-primary)' }}>Kelola Laporan Tersimpan</p>
                      <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Lihat, ganti file, ubah periode, atau hapus laporan yang sudah masuk →</p>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}