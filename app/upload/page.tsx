'use client'

import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { UploadSession } from '@/components/upload-session'
import { FileHistory } from '@/components/file-history'
import { StatusSection } from '@/components/status-section'
import { useRequireClient } from '@/lib/use-require-client'

export default function Page() {
  const { activeClient, isLoaded } = useRequireClient()

  if (!isLoaded || !activeClient) return null

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--color-bg-main)' }}>
      <Sidebar activeItem="upload" />

      <div className="flex-1 p-3 min-w-0 overflow-hidden">
        <div
          className="h-full rounded-3xl overflow-hidden flex flex-col"
          style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
        >
          <Header currentStep={1} />
          <main className="flex-1 overflow-y-auto" style={{ background: '#f8f8f8' }}>
            <div className="p-4 sm:p-8">
              <div className="w-full max-w-7xl mx-auto space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <div
                    className="rounded-3xl p-4 sm:p-8"
                    style={{
                      background: 'white',
                      boxShadow: '0 4px 20px rgb(0,0,0,0.06)',
                      border: '1px solid #f0f0f0',
                    }}
                  >
                    <UploadSession />
                  </div>
                </div>
                <div
                  className="rounded-3xl p-4 sm:p-6"
                  style={{
                    background: 'white',
                    boxShadow: '0 4px 20px rgb(0,0,0,0.06)',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <FileHistory />
                </div>
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
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}