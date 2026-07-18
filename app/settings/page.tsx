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
  Users,
  UserPlus,
  Bell,
  Building2,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { CREATABLE_ROLES, ROLE_LABEL, type Role } from '@/lib/roles'

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
type TabId = 'general' | 'coa' | 'analytics' | 'users' | 'account' | 'notifications'

// `ownerOnly`: tab disembunyikan total dari akunting. Itu cuma kenyamanan UI —
// penjaga sebenarnya ada di requireOwner() pada route API-nya, karena
// menyembunyikan tombol bukan kontrol keamanan.
const NAV_ITEMS: { id: TabId; label: string; desc: string; Icon: typeof Globe; scoped: boolean; soon?: boolean; ownerOnly?: boolean }[] = [
  { id: 'general',       label: 'General',           desc: 'Bahasa, format, timezone',      Icon: Globe,             scoped: false },
  { id: 'coa',           label: 'Master COA',        desc: 'Struktur akun klien',           Icon: FileSpreadsheet,   scoped: true },
  { id: 'analytics',     label: 'Analytics Display', desc: 'Metrik yang tampil ke klien',   Icon: SlidersHorizontal, scoped: true },
  { id: 'users',         label: 'Kelola Akun',       desc: 'Buat akun tim (Owner)',         Icon: Users,             scoped: false, ownerOnly: true },
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

// readOnly (role user/klien): kontrol dirender sebagai chip nilai statis, bukan
// SegButtons aktif — spek: user melihat General read-only, tanpa form input.
function GeneralTab({ readOnly = false }: { readOnly?: boolean }) {
  const [language, setLanguage] = useState<'id' | 'en'>('id')
  const [currencyFormat, setCurrencyFormat] = useState<'id' | 'intl'>('id')
  const [timezone, setTimezone] = useState<'wib' | 'wita' | 'wit'>('wib')

  const seg = <T extends string>(
    label: string,
    options: { value: T; label: string }[],
    value: T,
    onChange: (v: T) => void
  ): React.ReactNode =>
    readOnly ? (
      <span
        className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
        style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
      >
        {options.find(o => o.value === value)?.label ?? '—'}
      </span>
    ) : (
      <SegButtons label={label} options={options} value={value} onChange={onChange} />
    )

  const rows: { label: string; desc: string; control: React.ReactNode }[] = [
    {
      label: 'Language',
      desc: 'Bahasa antarmuka platform',
      control: seg('Language', [{ value: 'id' as const, label: 'Bahasa Indonesia' }, { value: 'en' as const, label: 'English' }], language, setLanguage),
    },
    {
      label: 'Currency Format',
      desc: 'Format penulisan nominal di seluruh laporan',
      control: seg('Currency Format', [{ value: 'id' as const, label: 'Rp 1.234.567' }, { value: 'intl' as const, label: 'IDR 1,234,567' }], currencyFormat, setCurrencyFormat),
    },
    {
      label: 'Timezone',
      desc: 'Acuan tanggal upload & periode laporan',
      control: seg('Timezone', [{ value: 'wib' as const, label: 'WIB' }, { value: 'wita' as const, label: 'WITA' }, { value: 'wit' as const, label: 'WIT' }], timezone, setTimezone),
    },
  ]

  return (
    <SettingsCard>
      <SectionHeading
        Icon={Globe}
        accent="linear-gradient(135deg, #daf163 0%, #c8e000 100%)"
        title="Preferensi Platform"
        subtitle={readOnly ? 'Preferensi global platform (tampilan saja)' : 'Berlaku global untuk seluruh platform, bukan per-klien'}
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

// readOnly (role user/klien): sembunyikan import/ganti Excel (tulis = requireAkunting
// di API), tabel struktur tetap tampil. Preview struktur = read-only untuk semua.
function MasterCoaTab({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const [data, setData] = useState<CoaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
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
    setWarning(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/clients/${clientId}/coa`, { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[]; warnings?: string[] }
        | null
      if (!res.ok) {
        const details = payload?.details
        setError(details?.length ? details.join(' · ') : (payload?.error ?? 'Gagal upload Master COA.'))
        return
      }
      await load()
      setShowPreview(true)
      setWarning(payload?.warnings?.length ? payload.warnings.join(' · ') : null)
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
      {!readOnly && (
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
      )}

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

      {/* Actions — Struktur (read-only, semua role) + Upload/Ganti (staf saja) */}
      {(hasCoa || !readOnly) && (
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
          {!readOnly && (
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
          )}
        </div>
      )}

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

      {/* Warning banner — non-blocking (mis. kode dobel disesuaikan otomatis) */}
      {warning && (
        <div
          className="mt-4 flex items-start gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in"
          style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
          <span className="text-xs font-medium" style={{ color: '#92400e' }}>{warning}</span>
        </div>
      )}

      {/* Empty state hint */}
      {!loading && !hasCoa && (
        <div
          className="mt-4 rounded-2xl px-4 py-3"
          style={{ border: '2px dashed #fde68a', background: 'linear-gradient(135deg, #fffdf0 0%, #fefce8 100%)' }}
        >
          <p className="text-xs" style={{ color: '#92400e' }}>
            {readOnly ? (
              'Master COA untuk klien ini belum disiapkan tim akunting. Struktur akun akan tampil di sini setelah diunggah.'
            ) : (
              <>
                Upload file Excel berisi kolom: <strong>Kode, Nama Akun, Posisi, Kelompok, Sub Kelompok, Class CF</strong>.
                Tanpa Master COA, hasil ekstraksi klien ini tidak bisa dipetakan.
              </>
            )}
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

function AnalyticsDisplayTab({ clientId, clientName }: {
  clientId: string
  clientName: string
}) {
  // Di-mount ulang tiap ganti klien (key={activeClient.id} di pemanggil),
  // jadi state di bawah selalu milik satu klien saja.
  const [visibility, setVisibility] = useState<Record<string, boolean>>(defaultVisibility)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${clientId}/metrics`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Gagal memuat pengaturan metrik.'))))
      .then((data: { visibility: Record<string, boolean> }) => {
        if (cancelled) return
        // Baris yang belum pernah disimpan jatuh ke default — backend hanya
        // menyimpan yang pernah di-toggle.
        setVisibility({ ...defaultVisibility(), ...data.visibility })
      })
      .catch(err => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [clientId])

  // Kirim map lengkap tiap toggle: upsert-nya idempotent, jadi dua toggle
  // beruntun tidak bisa saling meninggalkan state setengah jadi.
  const persist = async (next: Record<string, boolean>) => {
    const previous = visibility
    setVisibility(next)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/metrics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Gagal menyimpan pengaturan metrik.')
      }
    } catch (err) {
      setVisibility(previous) // rollback supaya UI tidak berbohong
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  const onToggleMetric = (metricId: string) =>
    persist({ ...visibility, [metricId]: !visibility[metricId] })

  const onToggleCategory = (catId: string) => {
    const cat = METRIC_CATEGORIES.find(c => c.id === catId)!
    const allOn = cat.metrics.every(m => visibility[m.id])
    persist({ ...visibility, ...Object.fromEntries(cat.metrics.map(m => [m.id, !allOn])) })
  }

  const visibleCount = ALL_METRIC_IDS.filter(id => visibility[id]).length

  if (loading) {
    return (
      <div className="rounded-2xl px-5 py-8 text-center" style={{ background: 'white', border: '1px solid #f0f0f0' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat pengaturan metrik…</p>
      </div>
    )
  }

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
            {error ? (
              <span role="alert" style={{ color: '#dc2626' }}>{error}</span>
            ) : saving ? (
              <span data-testid="metrics-saving">Menyimpan…</span>
            ) : (
              'Metrik yang dimatikan tidak muncul di halaman Analytics klien ini'
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold" style={{ color: '#8aa32e' }} data-testid="visible-count">
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

// ── Kelola Akun (Owner only) ─────────────────────────────────
// Provisioning akun tim dari dalam app. Sengaja BUKAN halaman register publik:
// ini internal tool, akun dibuat Owner. Guard sebenarnya ada di requireOwner()
// pada /api/users — komponen ini cuma UI-nya.
type TeamUser = {
  id: string
  email: string
  name: string
  role: Role
  clientId: string | null
  createdAt: string
}

function UsersTab() {
  const [list, setList] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('akunting')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error()
      const d: { users: TeamUser[] } = await res.json()
      setList(d.users)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string; user?: TeamUser } | null
      if (!res.ok) throw new Error(payload?.error ?? 'Gagal membuat akun.')
      setOkMsg(`Akun "${payload?.user?.email}" (${ROLE_LABEL[role]}) berhasil dibuat.`)
      setName(''); setEmail(''); setPassword(''); setRole('akunting')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb',
    fontSize: 13, color: '#1f2430', background: 'white',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5,
  }

  return (
    <>
      <SettingsCard>
        <SectionHeading
          Icon={UserPlus}
          accent="linear-gradient(135deg, #daf163 0%, #c8e000 100%)"
          title="Buat Akun Baru"
          subtitle="Hanya Owner. Password di-hash bcrypt sebelum disimpan — tidak pernah jadi teks biasa"
        />
        <form onSubmit={submit} className="space-y-3 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle} htmlFor="u-name">NAMA</label>
              <input id="u-name" style={inputStyle} value={name} onChange={e => setName(e.target.value)}
                placeholder="Nama lengkap" required minLength={2} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="u-email">EMAIL</label>
              <input id="u-email" type="email" style={inputStyle} value={email}
                onChange={e => setEmail(e.target.value)} placeholder="nama@ngitungid.com" required />
            </div>
            <div>
              <label style={labelStyle} htmlFor="u-pass">PASSWORD (min 8 karakter)</label>
              <input id="u-pass" type="password" style={inputStyle} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="u-role">ROLE</label>
              <select id="u-role" style={{ ...inputStyle, cursor: 'pointer' }} value={role}
                onChange={e => setRole(e.target.value as Role)}>
                {CREATABLE_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            <strong style={{ color: '#6b7280' }}>Akunting</strong> — upload, review, mapping, kelola klien, lihat semua klien.{' '}
            <strong style={{ color: '#6b7280' }}>Owner</strong> — semua itu, plus membuat akun & assign akunting ke klien.
          </p>

          {error && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '9px 12px', fontSize: 12 }}>
              {error}
            </div>
          )}
          {okMsg && (
            <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 10, padding: '9px 12px', fontSize: 12 }}>
              {okMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
            style={{ padding: '9px 18px', fontSize: 12.5, border: 'none', background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)', cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            {saving ? 'Membuat…' : 'Buat Akun'}
          </button>
        </form>
      </SettingsCard>

      <SettingsCard delay={60}>
        <SectionHeading
          Icon={Users}
          accent="linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)"
          title="Akun Tim"
          subtitle={`${list.length} akun terdaftar`}
        />
        <div className="mt-4" />
        {loading ? (
          <div className="flex items-center gap-2" style={{ color: '#9ca3af', fontSize: 12 }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat akun…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>Nama</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>Role</th>
                </tr>
              </thead>
              <tbody>
                {list.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f6' }}>
                    <td style={{ padding: '9px 10px', fontSize: 12.5, color: '#1f2430', fontWeight: 500 }}>{u.name}</td>
                    <td style={{ padding: '9px 10px', fontSize: 12.5, color: '#6b7280' }}>{u.email}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span
                        className="inline-flex items-center rounded-full"
                        style={{
                          padding: '2px 9px', fontSize: 10.5, fontWeight: 600,
                          background: u.role === 'owner' ? 'rgba(187,179,243,0.25)' : u.role === 'akunting' ? 'rgba(218,241,99,0.3)' : '#f0f0f0',
                          color: '#1f2430',
                        }}
                      >
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </>
  )
}

export default function SettingsPage() {
  // Tidak pakai useRequireClient: tab General bersifat platform-level dan harus
  // tetap bisa diakses tanpa klien aktif — tab scoped punya empty state sendiri.
  const { activeClient, isOwner, isStaff } = useClient()
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // Visibility metrik sekarang dimiliki AnalyticsDisplayTab (persisted ke
  // client_metric_visibility), bukan lagi state lokal di page ini.

  // Role 'user' (klien): HANYA General + Master COA (keduanya read-only). Tab
  // Analytics Display/Kelola Akun/Account/Notifications disembunyikan total —
  // bukan di-disable. Staf: semua kecuali ownerOnly untuk akunting.
  const USER_TABS: TabId[] = ['general', 'coa']
  const navItems = NAV_ITEMS.filter(n =>
    isStaff ? !n.ownerOnly || isOwner : USER_TABS.includes(n.id)
  )
  const activeNav = navItems.find(n => n.id === activeTab) ?? navItems[0]
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
            {navItems.map(item => {
              const isActive = activeNav.id === item.id
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

              {activeNav.id === 'general' && <GeneralTab readOnly={!isStaff} />}

              {activeNav.id === 'users' && isOwner && <UsersTab />}

              {activeTab === 'coa' && activeClient && (
                <MasterCoaTab key={activeClient.id} clientId={activeClient.id} readOnly={!isStaff} />
              )}

              {activeTab === 'analytics' && activeClient && (
                <AnalyticsDisplayTab
                  key={activeClient.id}
                  clientId={activeClient.id}
                  clientName={activeClient.name}
                />
              )}

            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
