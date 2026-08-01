'use client'

import { Wallet, Users, Clock, Package, Layers } from 'lucide-react'
import { formatRupiahShort, formatRupiahFull } from './dashboard-utils'
import { AKTIVA_CATS, BS_CAT_LABEL, type AktivaCat } from '@/lib/financial-agg'

interface BalanceSheetData {
  totalAset: number
  aktivaLancar: number
  aktivaTetap: number
  aktivaTidakBerwujud: number
  aktivaLainnya: number
  totalHutang: number
  totalModal: number
}

/** Warna per kategori aset. Kuncinya diambil dari AKTIVA_CATS supaya TypeScript
 *  memaksa daftar ini lengkap — menambah kategori di lib/financial-agg langsung
 *  membuat file ini gagal kompilasi sampai warnanya ditentukan. */
const ASET_COLOR: Record<AktivaCat, string> = {
  aktivaLancar: '#daf163',
  aktivaTetap: '#bbb3f3',
  aktivaTidakBerwujud: '#fdba74',
  aktivaLainnya: '#7dd3fc',
}

const ASET_SEGMENTS = AKTIVA_CATS.map(key => ({
  key,
  label: BS_CAT_LABEL[key],
  color: ASET_COLOR[key],
}))

interface WorkingCapitalMetric {
  label: string
  value: number
  icon: string
}

interface BalanceSheetHealthProps {
  balanceSheet: BalanceSheetData
  workingCapitalMetrics: WorkingCapitalMetric[]
}

// Satu segmen bar Komposisi Aset/Pasiva — nominal-nya tidak tertulis di mana
// pun (legend cuma menampilkan %), jadi tooltip di sini menambah info baru
// (beda dari Komponen Modal Kerja di kanan yang nominalnya sudah kasat mata).
function BarSegment({
  value, color, label, radius,
}: { value: number; color: string; label: string; radius: string }) {
  return (
    <div
      className="ng-seg-tooltip-wrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
      tabIndex={0}
      role="img"
      aria-label={`${label}: ${formatRupiahFull(value)}`}
      style={{ flex: value, background: color, borderRadius: radius }}
    >
      <div
        className="ng-seg-tooltip rounded-xl px-3 py-2"
        style={{ background: '#222124', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', borderTop: `2px solid ${color}` }}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: color }} />
          <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
        </div>
        <p className="text-xs font-bold" style={{ color }}>{formatRupiahFull(value)}</p>
      </div>
    </div>
  )
}

export function BalanceSheetHealth({ balanceSheet, workingCapitalMetrics }: BalanceSheetHealthProps) {
  return (
    <div
      className="ng-card-lift rounded-3xl p-6"
      style={{ background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #f0f0f0' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)' }}
        >
          <Layers className="w-4 h-4" style={{ color: '#1a1a1a' }} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: '#2d2d2d' }}>Kesehatan Neraca</h3>
          <p className="text-xs" style={{ color: '#6b7280' }}>Komposisi Aset, Hutang & Modal</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* LEFT: Stacked horizontal bars */}
        <div className="space-y-5">
          {/* Aset composition */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold" style={{ color: '#2d2d2d' }}>Komposisi Aset</p>
              <p className="text-xs font-bold" style={{ color: '#2d2d2d' }}>{formatRupiahShort(balanceSheet.totalAset)}</p>
            </div>
            {/* rounded-full TANPA overflow-hidden: tooltip segmen butuh ruang
                mengambang di atas bar. Bentuk pil tetap terjaga karena tiap
                segmen sudah punya border-radius per-sudut sendiri di bawah. */}
            <div className="flex rounded-full h-4" style={{ gap: '2px' }}>
              {/* Segmen diturunkan dari AKTIVA_CATS (lib/financial-agg) — dulu
                  tiga <BarSegment> hardcoded, sehingga kategori aset baru tidak
                  pernah muncul di bar walau sudah ikut Total Aset. Radius
                  dihitung dari posisi supaya ujung pil tetap benar berapa pun
                  jumlah segmennya. */}
              {ASET_SEGMENTS.map((seg, i) => (
                <BarSegment
                  key={seg.key}
                  value={balanceSheet[seg.key]}
                  color={seg.color}
                  label={seg.label}
                  radius={
                    ASET_SEGMENTS.length === 1
                      ? '999px'
                      : i === 0
                        ? '999px 0 0 999px'
                        : i === ASET_SEGMENTS.length - 1
                          ? '0 999px 999px 0'
                          : '0'
                  }
                />
              ))}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {ASET_SEGMENTS.map(seg => ({ label: seg.label, value: balanceSheet[seg.key], color: seg.color })).map(item => (
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
            <div className="flex rounded-full h-4" style={{ gap: '2px' }}>
              <BarSegment value={balanceSheet.totalHutang} color="#fdba74" label="Total Hutang" radius="999px 0 0 999px" />
              <BarSegment value={balanceSheet.totalModal} color="#6ee7b7" label="Total Modal" radius="0 999px 999px 0" />
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {[
                { label: 'Hutang', value: balanceSheet.totalHutang, color: '#fdba74' },
                { label: 'Modal', value: balanceSheet.totalModal, color: '#6ee7b7' },
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
                  className="ng-seg-tooltip-wrap flex items-center gap-3 p-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  tabIndex={0}
                  aria-label={`${metric.label}: ${formatRupiahFull(metric.value)}`}
                  style={{ background: '#f8f8f8', border: '1px solid #f0f0f0' }}
                >
                  {/* Tooltip nominal penuh (nilai di kartu disingkat jt/M) */}
                  <div className="ng-seg-tooltip rounded-xl px-3 py-2" style={{ background: '#222124', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                    <p className="text-[10px] font-medium mb-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{metric.label}</p>
                    <p className="text-xs font-bold" style={{ color: 'white' }}>{formatRupiahFull(metric.value)}</p>
                  </div>
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