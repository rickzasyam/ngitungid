'use client'

import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface KPICardProps {
  label: string
  value: string
  changePercent?: number
  icon: React.ElementType
  variant: 'lime' | 'lilac'
}

export function KPICard({
  label,
  value,
  changePercent,
  icon: Icon,
  variant,
}: KPICardProps) {
  const bg = variant === 'lime' ? '#daf163' : '#bbb3f3'
  const isPositive = changePercent !== undefined && changePercent >= 0

  return (
    <div className="relative overflow-hidden rounded-3xl p-5" style={{ background: bg }}>
      <div
        className="absolute rounded-full"
        style={{
          width: '160px',
          height: '160px',
          top: '-60px',
          right: '-50px',
          background: variant === 'lime' ? 'rgba(34,33,36,0.06)' : 'rgba(255,255,255,0.15)',
          zIndex: 0,
        }}
      />

      <div className="relative" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(34,33,36,0.12)' }}
          >
            <Icon className="w-4 h-4" style={{ color: '#222124' }} />
          </div>
        </div>
        <p className="text-xs font-medium mb-1" style={{ color: 'rgba(34,33,36,0.65)' }}>{label}</p>
        <p className="text-2xl font-bold mb-2" style={{ color: '#222124' }}>{value}</p>
        {changePercent !== undefined && (
          <div className="flex items-center gap-1">
            {isPositive
              ? <ArrowUpRight className="w-3 h-3" style={{ color: '#222124' }} />
              : <ArrowDownRight className="w-3 h-3" style={{ color: '#222124' }} />
            }
            <span className="text-xs font-semibold" style={{ color: '#222124' }}>
              {Math.abs(changePercent).toFixed(1)}%
            </span>
            <span className="text-xs" style={{ color: 'rgba(34,33,36,0.55)' }}>vs bulan lalu</span>
          </div>
        )}
      </div>
    </div>
  )
}