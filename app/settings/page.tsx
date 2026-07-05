'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  FileSpreadsheet,
  Upload,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Droplets,
  TrendingUp,
  Scale,
  Gauge,
  Eye,
  Globe,
  SlidersHorizontal,
  User,
  Bell,
  Building2,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'

// ── Master COA — data asli dari GET /api/clients/[id]/coa ─────
type CoaAccount = {
  kode: string
  nama: string
  posisi: string
  kelompok: string
  subKelompok: string
  classCf: string | null
}

type CoaData = {
  count: number
  updatedAt: string | null
  accounts: CoaAccount[]
}

const PREVIEW_LIMIT = 8

function formatCoaDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Metrics visibility — kategori mengikuti Analytics page ───
type MetricDef = { id: string; label: string; desc: string }

const METRIC_CATEGORIES: {
  id: string
  label: string
  desc: string
  accent: string
  accentBg: string
  Icon: typeof Droplets
  metrics: MetricDef[]
}[] = [
  {
    id: 'likuiditas',
    label: 'Likuiditas',
    desc: 'Kemampuan menutup kewajiban jangka pendek',
    accent: '#7dd3fc',
    accentBg: '#f0f9ff',
    Icon: Droplets,
    metrics: [
      { id: 'cr',    label: 'Current Ratio',          desc: 'Aktiva Lancar ÷ Hutang Lancar' },
      { id: 'qr',    label: 'Quick Ratio',            desc: '(Aktiva Lancar − Persediaan) ÷ Hutang Lancar' },
      { id: 'cashr', label: 'Cash Ratio',             desc: 'Kas ÷ Hutang Lancar' },
      { id: 'wc',    label: 'Modal Kerja',            desc: 'Aktiva Lancar − Hutang Lancar' },
      { id: 'ccc',   label: 'Cash Conversion Cycle',  desc: 'DIO + DSO − DPO' },
    ],
  },
  {
    id: 'profitabilitas',
    label: 'Profitabilitas',
    desc: 'Kemampuan menghasilkan laba dari investasi dan pendapatan',
    accent: '#daf163',
    accentBg: '#f7fde8',
    Icon: TrendingUp,
    metrics: [
      { id: 'roe', label: 'Return on Equity',  desc: 'Laba Bersih ÷ Total Modal' },
      { id: 'roa', label: 'Return on Assets',  desc: 'Laba Bersih ÷ Total Aset' },
      { id: 'gpm', label: 'Gross Margin',      desc: 'Laba Kotor ÷ Pendapatan' },
      { id: 'npm', label: 'Net Margin',        desc: 'Laba Bersih ÷ Pendapatan' },
      { id: 'opm', label: 'Operating Margin',  desc: 'Laba Operasi ÷ Pendapatan' },
    ],
  },
  {
    id: 'leverage',
    label: 'Leverage',
    desc: 'Struktur pendanaan dan beban hutang',
    accent: '#bbb3f3',
    accentBg: '#f3f2ff',
    Icon: Scale,
    metrics: [
      { id: 'der', label: 'Debt-to-Equity Ratio', desc: 'Total Hutang ÷ Total Modal' },
      { id: 'dar', label: 'Debt-to-Assets Ratio', desc: 'Total Hutang ÷ Total Aset' },
    ],
  },
  {
    id: 'efisiensi',
    label: 'Efisiensi',
    desc: 'Efektivitas aset dan operasional',
    accent: '#fdba74',
    accentBg: '#fff7ed',
    Icon: Gauge,
    metrics: [
      { id: 'dso',       label: 'DSO',                desc: 'Days Sales Outstanding — umur piutang' },
      { id: 'dio',       label: 'DIO',                desc: 'Days Inventory Outstanding — umur persediaan' },
      { id: 'dpo',       label: 'DPO',                desc: 'Days Payable Outstanding — umur hutang usaha' },
      { id: 'invturn',   label: 'Inventory Turnover', desc: 'Perputaran persediaan per tahun' },
      { id: 'assetturn', label: 'Asset Turnover',     desc: 'Perputaran aset per tahun' },
    ],
  },
]

const ALL_METRIC_IDS = METRIC_CATEGORIES.flatMap(c => c.metrics.map(m => m.id))

// Default visibility per klien — DPO & DAR mati sebagai contoh mixed state
const defaultVisibility = (): Record<string, boolean> =>
  Object.fromEntries(ALL_METRIC_IDS.map(id => [id, id !== 'dpo' && id !== 'dar']))

// ── Settings nav ─────────────────────────────────────────────
type TabId = 'general' | 'coa' | 'analytics' | 'account' | 'notifications'

const NAV_ITEMS: { id: TabId; label: string; desc: string; Icon: typeof Globe; scoped: boolean; soon?: boolean }[] = [
  { id: 'general',       label: 'General',           desc: 'Bahasa, format, timezone',      Icon: Globe,             scoped: false },
  { id: 'coa',           label: 'Master COA',        desc: 'Struktur akun klien',           Icon: FileSpreadsheet,   scoped: true },
  { id: 'analytics',     label: 'Analytics Display', desc: 'Metrik yang tampil ke klien',   Icon: SlidersHorizontal, scoped: true },
  { id: 'account',       label: 'Account',           desc: 'Profil & keamanan',             Icon: User,              scoped: false, soon: true },
  { id: 'notifications', label: 'Notifications',     desc: 'Email & pengingat',             Icon: Bell,              scoped: false, soon: true },
]

// ── Small building blocks ────────────────────────────────────

function SwitchVisual({ on, accent }: { on: boolean; accent: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block flex-shrink-0 rounded-full transition-colors duration-200"
      style={{ width: 38, height: 22, background: on ? accent : 'var(--color-muted-dark)', padding: 2 }}
    >
      <span
        className="block rounded-full transition-transform duration-200"
        style={{
          width: 18, height: 18, background: 'white',
          transform: on ? 'translateX(16px)' : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </span>
  )
}

function SectionHeading({ Icon, accent, title, subtitle }: {
  Icon: typeof Droplets
  accent: string
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: accent }}
      >
        <Icon className="w-4 h-4" style={{ color: '#1a1a1a' }} />
      </div>
      <div>
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
      </div>
    </div>
  )
}

function SegButtons<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 p-1 rounded-full flex-shrink-0" style={{ background: 'var(--color-muted-bg)' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3.5 py-1.5 rounded-full text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
          style={{
            background: value === opt.value ? 'white' : 'transparent',
            color: value === opt.value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontWeight: value === opt.value ? 600 : 400,
            boxShadow: value === opt.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            minHeight: 32,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Card putih standar untuk section settings
function SettingsCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div
      className="rounded-3xl p-5 sm:p-6 animate-slide-up"
      style={{
        animationDelay: `${delay}ms`,
        background: 'white',
        border: '1px solid #f0f0f0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {children}
    </div>
  )
}

// Chip klien aktif — pengingat scope untuk tab per-klien
function ActiveClientChip({ name, type }: { name: string; type: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3 animate-fade-in"
      style={{ background: 'var(--color-bg-main)', color: 'white' }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
      >
        {name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{type}</p>
      </div>
      <p className="text-[11px] text-right flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Pengaturan di tab ini<br />berlaku untuk klien ini
      </p>
    </div>
  )
}

// Empty state saat belum ada klien aktif (tab scoped)
function NoClientState() {
  return (
    <div
      className="rounded-3xl p-10 text-center animate-slide-up"
      style={{ background: 'white', border: '2px dashed var(--color-border-subtle)' }}
    >
      <div
        className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
        style={{ border: '1.5px dashed rgba(218,241,99,0.9)', background: '#fbfef2' }}
      >
        <Building2 className="w-5 h-5" style={{ color: '#8aa32e' }} />
      </div>
      <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
        Belum ada klien aktif
      </p>
      <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--color-text-muted)' }}>
        Pengaturan di tab ini berlaku per-klien. Pilih klien terlebih dahulu
        lewat kartu workspace di sidebar kiri bawah.
      </p>
    </div>
  )
}

// ── Tab: General (platform-level, tidak scoped) ──────────────

function GeneralTab() {
  const [language, setLanguage] = useState<'id' | 'en'>('id')
  const [currencyFormat, setCurrencyFormat] = useState<'id' | 'intl'>('id')
  const [timezone, setTimezone] = useState<'wib' | 'wita' | 'wit'>('wib')

  const rows: { label: string; desc: string; control: React.ReactNode }[] = [
    {
      label: 'Language',
      desc: 'Bahasa antarmuka platform',
      control: (
        <SegButtons
          label="Language"
          options={[{ value: 'id' as const, label: 'Bahasa Indonesia' }, { value: 'en' as const, label: 'English' }]}
          value={language}
          onChange={setLanguage}
        />
      ),
    },
    {
      label: 'Currency Format',
      desc: 'Format penulisan nominal di seluruh laporan',
      control: (
        <SegButtons
          label="Currency Format"
          options={[{ value: 'id' as const, label: 'Rp 1.234.567' }, { value: 'intl' as const, label: 'IDR 1,234,567' }]}
          value={currencyFormat}
          onChange={setCurrencyFormat}
        />
      ),
    },
    {
      label: 'Timezone',
      desc: 'Acuan tanggal upload & periode laporan',
      control: (
        <SegButtons
          label="Timezone"
          options={[{ value: 'wib' as const, label: 'WIB' }, { value: 'wita' as const, label: 'WITA' }, { value: 'wit' as const, label: 'WIT' }]}
          value={timezone}
          onChange={setTimezone}
        />
      ),
    },
  ]

  return (
    <SettingsCard>
      <SectionHeading
        Icon={Globe}
        accent="linear-gradient(135deg, #daf163 0%, #c8e000 100%)"
        title="Preferensi Platform"
        subtitle="Berlaku global untuk seluruh platform, bukan per-klien"
      />
      <div className="mt-4">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4"
            style={{ borderBottom: i < rows.length - 1 ? '1px solid #f5f5f5' : 'none' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{row.label}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{row.desc}</p>
            </div>
            {row.control}
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

// ── Tab: Master COA (scoped ke klien aktif) ──────────────────

function MasterCoaTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<CoaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/coa`)
      setData(res.ok ? await res.json() : { count: 0, updatedAt: null, accounts: [] })
    } catch {
      setData({ count: 0, updatedAt: null, accounts: [] })
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  const handleFile = async (file: File) => {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setError('Format file harus .xlsx atau .xls')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/clients/${clientId}/coa`, { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[] }
        | null
      if (!res.ok) {
        const details = payload?.details
        setError(details?.length ? details.join(' · ') : (payload?.error ?? 'Gagal upload Master COA.'))
        return
      }
      await load()
      setShowPreview(true)
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.')
    } finally {
      setUploading(false)
    }
  }

  const count = data?.count ?? 0
  const hasCoa = count > 0
  const previewRows = data?.accounts.slice(0, PREVIEW_LIMIT) ?? []
  const updatedAtLabel = formatCoaDate(data?.updatedAt ?? null)

  return (
    <SettingsCard>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <SectionHeading
            Icon={FileSpreadsheet}
            accent="linear-gradient(135deg, #daf163 0%, #c8e000 100%)"
            title="Master COA"
            subtitle="Fondasi klasifikasi akun — dipakai AI saat mapping hasil ekstraksi"
          />
        </div>

        {/* Status badge */}
        {loading ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Memuat…</span>
          </div>
        ) : hasCoa ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
            style={{ background: '#f0fdf4', color: '#15803d' }}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{count} akun{updatedAtLabel ? ` · ${updatedAtLabel}` : ''}</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
            style={{ background: '#fef3c7', color: '#b45309' }}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Belum ada Master COA</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4">
        {hasCoa && (
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            aria-expanded={showPreview}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors duration-150 hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
            style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
          >
            <Eye className="w-3.5 h-3.5" />
            Struktur
            {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-200 enabled:hover:-translate-y-px enabled:hover:shadow-[0_4px_14px_rgba(218,241,99,0.4)] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
          style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
        >
          {uploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Mengupload…
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              {hasCoa ? 'Ganti Excel' : 'Upload Master COA'}
            </>
          )}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mt-4 flex items-start gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in"
          style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
          <span className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</span>
        </div>
      )}

      {/* Empty state hint */}
      {!loading && !hasCoa && (
        <div
          className="mt-4 rounded-2xl px-4 py-3"
          style={{ border: '2px dashed #fde68a', background: 'linear-gradient(135deg, #fffdf0 0%, #fefce8 100%)' }}
        >
          <p className="text-xs" style={{ color: '#92400e' }}>
            Upload file Excel berisi kolom: <strong>Kode, Nama Akun, Posisi, Kelompok, Sub Kelompok, Class CF</strong>.
            Tanpa Master COA, hasil ekstraksi klien ini tidak bisa dipetakan.
          </p>
        </div>
      )}

      {/* Preview struktur */}
      {hasCoa && showPreview && (
        <div className="mt-4 rounded-2xl overflow-hidden border animate-fade-in" style={{ borderColor: '#f0f0f0', background: '#fafafa' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {['Kode', 'Nama Akun', 'Posisi', 'Kelompok', 'Sub Kelompok', 'Class CF'].map(col => (
                    <th
                      key={col}
                      className="text-left px-4 py-2.5 font-semibold whitespace-nowrap"
                      style={{ color: 'var(--color-text-muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr
                    key={row.kode}
                    style={{
                      borderBottom: i < previewRows.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className="px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)', fontSize: 10.5 }}
                      >
                        {row.kode}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: 'var(--color-text-primary)' }}>{row.nama}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{row.posisi}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10.5px] font-medium"
                        style={row.kelompok === 'Laba Rugi'
                          ? { background: '#f7fde8', color: '#4d7c0f' }
                          : { background: '#f3f2ff', color: '#6d5fc8' }}
                      >
                        {row.kelompok}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{row.subKelompok}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.classCf ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10.5px] font-medium"
                          style={row.classCf === 'Operating'
                            ? { background: '#f0f9ff', color: '#0369a1' }
                            : { background: '#fff7ed', color: '#c2410c' }}
                        >
                          {row.classCf}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[10.5px] border-t" style={{ color: 'var(--color-text-muted)', borderColor: '#f0f0f0' }}>
            Menampilkan {previewRows.length} dari {count} akun · Preview struktur — data lengkap tersimpan per klien
          </p>
        </div>
      )}
    </SettingsCard>
  )
}

// ── Tab: Analytics Display (scoped ke klien aktif) ───────────

function AnalyticsDisplayTab({ clientName, visibility, onToggleMetric, onToggleCategory }: {
  clientName: string
  visibility: Record<string, boolean>
  onToggleMetric: (metricId: string) => void
  onToggleCategory: (catId: string) => void
}) {
  const visibleCount = ALL_METRIC_IDS.filter(id => visibility[id]).length

  return (
    <>
      {/* Summary bar */}
      <div
        className="rounded-2xl px-5 py-4 flex items-center justify-between animate-slide-up"
        style={{ background: 'white', border: '1px solid #f0f0f0', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Metrik Analytics — {clientName}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Metrik yang dimatikan tidak muncul di halaman Analytics klien ini
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold" style={{ color: '#8aa32e' }}>
            {visibleCount}<span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>/{ALL_METRIC_IDS.length}</span>
          </p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>metrik tampil</p>
        </div>
      </div>

      {METRIC_CATEGORIES.map((cat, catIndex) => {
        const onCount = cat.metrics.filter(m => visibility[m.id]).length
        const allOn = onCount === cat.metrics.length

        return (
          <div
            key={cat.id}
            className="rounded-3xl overflow-hidden animate-slide-up"
            style={{
              animationDelay: `${(catIndex + 1) * 70}ms`,
              background: 'white',
              border: '1px solid #f0f0f0',
              boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            {/* Top accent strip */}
            <div style={{ height: 4, background: cat.accent }} />

            {/* Category header — master toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={allOn}
              aria-label={`Tampilkan semua metrik ${cat.label}`}
              onClick={() => onToggleCategory(cat.id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-inset"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: cat.accentBg }}
              >
                <cat.Icon className="w-4 h-4" style={{ color: cat.accent === '#daf163' ? '#4d7c0f' : cat.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{cat.label}</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{cat.desc}</p>
              </div>
              <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                {onCount}/{cat.metrics.length}
              </span>
              <SwitchVisual on={allOn} accent={cat.accent} />
            </button>

            {/* Metric rows */}
            <div className="border-t" style={{ borderColor: '#f0f0f0' }}>
              {cat.metrics.map((metric, i) => {
                const on = visibility[metric.id]
                return (
                  <button
                    key={metric.id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Tampilkan ${metric.label} di Analytics klien`}
                    onClick={() => onToggleMetric(metric.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-(--color-muted-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-inset"
                    style={{ borderBottom: i < cat.metrics.length - 1 ? '1px solid #f5f5f5' : 'none', minHeight: 52 }}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm transition-colors duration-150"
                        style={{ color: on ? 'var(--color-text-primary)' : '#9ca3af', fontWeight: on ? 500 : 400 }}
                      >
                        {metric.label}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: '#9ca3af' }}>{metric.desc}</p>
                    </div>
                    {!on && (
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-muted)' }}
                      >
                        Disembunyikan
                      </span>
                    )}
                    <SwitchVisual on={on} accent={cat.accent} />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  // Tidak pakai useRequireClient: tab General bersifat platform-level dan harus
  // tetap bisa diakses tanpa klien aktif — tab scoped punya empty state sendiri.
  const { activeClient } = useClient()
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // Metrics visibility — keyed per klien, tiap klien punya state independen.
  // Init kosong; default di-resolve lazy per klien via `?? defaultVisibility()`
  // (tab ini masih mock sampai client_metric_visibility disambungkan — Phase 2.3 note).
  const [metricsByClient, setMetricsByClient] = useState<Record<string, Record<string, boolean>>>({})

  const toggleMetric = (clientId: string, metricId: string) =>
    setMetricsByClient(prev => {
      const current = prev[clientId] ?? defaultVisibility()
      return { ...prev, [clientId]: { ...current, [metricId]: !current[metricId] } }
    })

  const toggleCategory = (clientId: string, catId: string) => {
    const cat = METRIC_CATEGORIES.find(c => c.id === catId)!
    setMetricsByClient(prev => {
      const current = prev[clientId] ?? defaultVisibility()
      const allOn = cat.metrics.every(m => current[m.id])
      return {
        ...prev,
        [clientId]: {
          ...current,
          ...Object.fromEntries(cat.metrics.map(m => [m.id, !allOn])),
        },
      }
    })
  }

  const activeNav = NAV_ITEMS.find(n => n.id === activeTab)!
  const needsClient = activeNav.scoped && !activeClient

  return (
    <div className="flex-1 p-3 min-w-0 overflow-hidden">
      <div
        className="h-full rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 8px 40px rgb(0,0,0,0.4)' }}
      >

        {/* Header */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-5 border-b" style={{ borderColor: '#f0f0f0' }}>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Preferensi platform dan pengaturan per-klien
          </p>
        </div>

        {/* Body — left nav + content */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">

          {/* Left nav */}
          <nav
            aria-label="Settings sections"
            className="flex lg:flex-col gap-1 p-3 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto flex-shrink-0 border-b lg:border-b-0 lg:border-r lg:w-[230px]"
            style={{ borderColor: '#f0f0f0' }}
          >
            {NAV_ITEMS.map(item => {
              const isActive = activeTab === item.id
              const isSoon = !!item.soon

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isSoon}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => !isSoon && setActiveTab(item.id)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left transition-all duration-200 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                  style={{
                    background: isActive ? 'var(--color-accent-primary)' : 'transparent',
                    color: isActive ? 'var(--color-accent-primary-fg)' : isSoon ? '#b0b0b0' : 'var(--color-text-muted)',
                    cursor: isSoon ? 'not-allowed' : 'pointer',
                    minHeight: 42,
                  }}
                >
                  <item.Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm whitespace-nowrap" style={{ fontWeight: isActive ? 600 : 500 }}>
                      {item.label}
                    </span>
                    <span className="hidden lg:block text-[10.5px] truncate" style={{ color: isActive ? 'rgba(26,26,26,0.6)' : '#a3a3a3' }}>
                      {item.desc}
                    </span>
                  </span>
                  {isSoon && (
                    <span
                      className="text-[9px] font-semibold rounded px-1 py-0.5 leading-none flex-shrink-0"
                      style={{ color: '#a3a3a3', border: '1px solid #dcdcdc' }}
                    >
                      SOON
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Content area */}
          <main className="flex-1 overflow-y-auto min-w-0" style={{ background: '#f8f8f8' }}>
            <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">

              {/* Chip klien aktif — hanya untuk tab yang scoped */}
              {activeNav.scoped && activeClient && (
                <ActiveClientChip name={activeClient.name} type={activeClient.type} />
              )}

              {/* Empty state kalau tab scoped tapi belum ada klien */}
              {needsClient && <NoClientState />}

              {activeTab === 'general' && <GeneralTab />}

              {activeTab === 'coa' && activeClient && (
                <MasterCoaTab key={activeClient.id} clientId={activeClient.id} />
              )}

              {activeTab === 'analytics' && activeClient && (
                <AnalyticsDisplayTab
                  key={activeClient.id}
                  clientName={activeClient.name}
                  visibility={metricsByClient[activeClient.id] ?? defaultVisibility()}
                  onToggleMetric={id => toggleMetric(activeClient.id, id)}
                  onToggleCategory={id => toggleCategory(activeClient.id, id)}
                />
              )}

            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
