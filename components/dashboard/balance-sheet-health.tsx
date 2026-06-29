'use client'

import { Wallet, Users, Clock, Package } from 'lucide-react'
import { formatRupiahShort } from './dashboard-utils'

interface BalanceSheetData {
  totalAset: number
  aktivaLancar: number
  aktivaTetap: number
  aktivaLainnya: number
  totalHutang: number
  totalModal: number
}

interface WorkingCapitalMetric {
  label: string
  value: number
  icon: string
}

interface BalanceSheetHealthProps {
  balanceSheet: BalanceSheetData
  workingCapitalMetrics: WorkingCapitalMetric[]
}

export function BalanceSheetHealth({ balanceSheet, workingCapitalMetrics }: BalanceSheetHealthProps) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
    >
      <h3 className="text-base font-bold mb-0.5" style={{ color: '#2d2d2d' }}>Kesehatan Neraca</h3>
      <p className="text-xs mb-5" style={{ color: '#6b7280' }}>Komposisi Aset, Hutang & Modal</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* LEFT: Stacked horizontal bars */}
        <div className="space-y-5">
          {/* Aset composition */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: '#2d2d2d' }}>Komposisi Aset</p>
              <p className="text-xs font-bold" style={{ color: '#2d2d2d' }}>{formatRupiahShort(balanceSheet.totalAset)}</p>
            </div>
            <div className="flex rounded-full overflow-hidden h-4" style={{ gap: '2px' }}>
              <div
                style={{
                  flex: balanceSheet.aktivaLancar,
                  background: '#daf163',
                  borderRadius: '999px 0 0 999px',
                }}
                title={`Aktiva Lancar: ${formatRupiahShort(balanceSheet.aktivaLancar)}`}
              />
              <div
                style={{
                  flex: balanceSheet.aktivaTetap,
                  background: '#bbb3f3',
                }}
                title={`Aktiva Tetap: ${formatRupiahShort(balanceSheet.aktivaTetap)}`}
              />
              <div
                style={{
                  flex: balanceSheet.aktivaLainnya,
                  background: '#3b82f6',
                  borderRadius: '0 999px 999px 0',
                }}
                title={`Aktiva Lainnya: ${formatRupiahShort(balanceSheet.aktivaLainnya)}`}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {[
                { label: 'Aktiva Lancar', value: balanceSheet.aktivaLancar, color: '#daf163' },
                { label: 'Aktiva Tetap', value: balanceSheet.aktivaTetap, color: '#bbb3f3' },
                { label: 'Lainnya', value: balanceSheet.aktivaLainnya, color: '#3b82f6' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className="rounded-full flex-shrink-0" style={{ width: '7px', height: '7px', background: item.color }} />
                  <span className="text-[10px]" style={{ color: '#6b7280' }}>{item.label}</span>
                  <span className="text-[10px] font-semibold" style={{ color: '#2d2d2d' }}>
                    {((item.value / balanceSheet.totalAset) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pasiva composition */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: '#2d2d2d' }}>Komposisi Pasiva</p>
              <p className="text-xs font-bold" style={{ color: '#2d2d2d' }}>{formatRupiahShort(balanceSheet.totalAset)}</p>
            </div>
            <div className="flex rounded-full overflow-hidden h-4" style={{ gap: '2px' }}>
              <div
                style={{
                  flex: balanceSheet.totalHutang,
                  background: '#c0ffee',
                  borderRadius: '999px 0 0 999px',
                }}
                title={`Total Hutang: ${formatRupiahShort(balanceSheet.totalHutang)}`}
              />
              <div
                style={{
                  flex: balanceSheet.totalModal,
                  background: '#02a9a3',
                  borderRadius: '0 999px 999px 0',
                }}
                title={`Total Modal: ${formatRupiahShort(balanceSheet.totalModal)}`}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {[
                { label: 'Hutang', value: balanceSheet.totalHutang, color: '#c0ffee' },
                { label: 'Modal', value: balanceSheet.totalModal, color: '#02a9a3' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className="rounded-full flex-shrink-0" style={{ width: '7px', height: '7px', background: item.color }} />
                  <span className="text-[10px]" style={{ color: '#6b7280' }}>{item.label}</span>
                  <span className="text-[10px] font-semibold" style={{ color: '#2d2d2d' }}>
                    {((item.value / balanceSheet.totalAset) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Equation label */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-2xl"
            style={{ background: '#f8f8f8', border: '1px solid #f0f0f0' }}
          >
            <span className="text-[10px] font-mono" style={{ color: '#9ca3af' }}>
              Total Aset ({formatRupiahShort(balanceSheet.totalAset)}) = Hutang ({formatRupiahShort(balanceSheet.totalHutang)}) + Modal ({formatRupiahShort(balanceSheet.totalModal)})
            </span>
          </div>
        </div>

        {/* RIGHT: Working Capital Metrics */}
        <div>
          <p className="text-xs font-semibold mb-3" style={{ color: '#2d2d2d' }}>Komponen Modal Kerja</p>
          <div className="space-y-3">
            {workingCapitalMetrics.map(metric => {
              const IconMap: Record<string, React.ElementType> = {
                cash: Wallet,
                receivable: Users,
                prepaid: Clock,
                inventory: Package,
              }
              const MetricIcon = IconMap[metric.icon]
              return (
                <div
                  key={metric.label}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: '#f8f8f8', border: '1px solid #f0f0f0' }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: '#f0f0f0' }}
                  >
                    <MetricIcon className="w-4 h-4" style={{ color: '#6b7280' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs" style={{ color: '#6b7280' }}>{metric.label}</p>
                    <p className="text-sm font-bold" style={{ color: '#2d2d2d' }}>
                      {formatRupiahShort(metric.value)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#9ca3af' }}>
                    {((metric.value / balanceSheet.aktivaLancar) * 100).toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}