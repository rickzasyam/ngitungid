'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { CoaReplaceDialog, type CoaImpact } from '@/components/settings/coa-replace-dialog'
import { CoaRowForm, CoaDeleteDialog } from '@/components/settings/coa-row-editor'
import {
  FileSpreadsheet,
  Upload,
  Download,
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
  Pencil,
  Plus,
  Trash2,
  Globe,
  SlidersHorizontal,
  User,
  Users,
  UserPlus,
  Bell,
  Building2,
  KeyRound,
  Package,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useClient } from '@/lib/client-context'
import { CREATABLE_ROLES, ROLE_LABEL, type Role } from '@/lib/roles'
import { MIN_PASSWORD } from '@/lib/api/password-change'
import { visibleSettingsTabs, type SettingsTabId } from '@/lib/settings-tabs'
import { NAMA_MIN, NAMA_MAX, DESKRIPSI_MAX, type LayananRow } from '@/lib/layanan'
import { defaultMetricVisibility, type MetricId } from '@/lib/analytics/metric-visibility'
import { usePreferences } from '@/lib/preferences-context'
import type { Preferences, Language, CurrencyFormat } from '@/lib/api/preferences'

// ── Master COA — data asli dari GET /api/clients/[id]/coa ─────
type CoaAccount = {
  // Sudah dikirim GET /coa sejak awal (dipakai dropdown /coa-mapping); kini
  // ikut dipakai CRUD manual untuk menyasar baris.
  id: string
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

function formatCoaDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Metrics visibility — kategori mengikuti Analytics page ───
// id diketik MetricId (lib/analytics/metric-visibility.ts): id yang tidak
// terdaftar di sana langsung gagal tsc, jadi toggle tidak bisa dibuat untuk
// metrik yang tidak punya pemetaan ke payload ratios / drawer.
type MetricDef = { id: MetricId; label: string; desc: string }

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
    // DAR (Debt-to-Assets) DIHAPUS 2026-08-05: DAR = DER / (1 + DER), jadi
    // secara aljabar sudah terkandung di DER di section yang sama. Permenkop
    // UKM No.06/2006 pun hanya menetapkan ambang untuk DER — kartu DAR terpaksa
    // memakai ambang karangan atau tone netral permanen. Lagipula togglenya
    // selama ini tidak berefek: /analytics memang tidak pernah merender DAR.
    metrics: [
      { id: 'der', label: 'Debt-to-Equity Ratio', desc: 'Total Hutang ÷ Total Modal' },
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

// Diturunkan dari kategori supaya penyebut counter "x/16" selalu jujur pada apa
// yang benar-benar dirender di tab ini. Isinya harus sama dengan METRIC_IDS —
// dijaga tipe MetricId di MetricDef.
const ALL_METRIC_IDS = METRIC_CATEGORIES.flatMap(c => c.metrics.map(m => m.id))

// ── Settings nav ─────────────────────────────────────────────
type TabId = SettingsTabId

// Presentasi per tab. DAFTAR & aturan aksesnya sendiri hidup di
// lib/settings-tabs.ts (murni, teruji) — di sini hanya label/ikon/deskripsi,
// plus dua flag yang memang urusan tampilan:
//   `scoped` : tab berlaku per-klien (butuh klien aktif),
//   `soon`   : fiturnya belum ada, tombol di-disable.
// Menambah tab baru berarti menambahnya di lib/settings-tabs.ts DULU, sehingga
// test visibilitas memaksa keputusan akses dibuat eksplisit.
const TAB_META: Record<TabId, { label: string; desc: string; Icon: typeof Globe; scoped: boolean; soon?: boolean }> = {
  general:       { label: 'General',           desc: 'Bahasa & format nominal',     Icon: Globe,             scoped: false },
  coa:           { label: 'Master COA',        desc: 'Struktur akun klien',         Icon: FileSpreadsheet,   scoped: true },
  analytics:     { label: 'Analytics Display', desc: 'Metrik yang tampil ke klien', Icon: SlidersHorizontal, scoped: true },
  users:         { label: 'Kelola Akun',       desc: 'Buat akun tim (Owner)',       Icon: Users,             scoped: false },
  layanan:       { label: 'Layanan',           desc: 'Master jasa yang dijual',     Icon: Package,           scoped: false },
  account:       { label: 'Account',           desc: 'Password & keamanan',         Icon: User,              scoped: false },
  notifications: { label: 'Notifications',     desc: 'Email & pengingat',           Icon: Bell,              scoped: false, soon: true },
}

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
  // Nilai nyata dari PreferencesProvider (satu fetch per load app), bukan lagi
  // useState lokal yang hilang tiap pindah tab.
  const { preferences, isLoaded, savePreferences } = usePreferences()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // Simpan seluruh preferensi sekaligus (endpoint-nya mengganti, bukan patch).
  const persist = async (next: Preferences) => {
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      await savePreferences(next)
      setOkMsg('Preferensi tersimpan.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan preferensi.')
    } finally {
      setSaving(false)
    }
  }

  const language = preferences.language
  const currencyFormat = preferences.currencyFormat
  const setLanguage = (v: Language) => void persist({ ...preferences, language: v })
  const setCurrencyFormat = (v: CurrencyFormat) => void persist({ ...preferences, currencyFormat: v })

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

  // Timezone SENGAJA tidak ada di sini lagi. Setelan WIB/WITA/WIT dibatalkan
  // (bukan ditunda): empat akunting semuanya WIB dan seluruh klien Indonesia,
  // jadi ia hanya akan mempengaruhi string seperti "diupload 14:32" sambil
  // memaksa setiap formatter tanggal dijaga permanen agar tidak menggeser
  // periode akuntansi. Timestamp dirender pada satu zona tetap (WIB).
  const rows: { label: string; desc: string; control: React.ReactNode }[] = [
    {
      label: 'Language',
      // Jujur soal statusnya: nilainya tersimpan, tapi belum menerjemahkan
      // apa pun. i18n adalah pekerjaan terpisah.
      desc: 'Bahasa antarmuka — tersimpan, penerapannya menyusul',
      control: seg('Language', [{ value: 'id' as const, label: 'Bahasa Indonesia' }, { value: 'en' as const, label: 'English' }], language, setLanguage),
    },
    {
      label: 'Currency Format',
      desc: 'Format penulisan nominal — tampilan saja, nilai tidak dikonversi',
      control: seg('Currency Format', [{ value: 'idr' as const, label: 'Rp 1.234.567' }, { value: 'intl' as const, label: 'IDR 1,234,567' }], currencyFormat, setCurrencyFormat),
    },
  ]

  return (
    <SettingsCard>
      <SectionHeading
        Icon={Globe}
        accent="linear-gradient(135deg, #daf163 0%, #c8e000 100%)"
        title="Preferensi Tampilan"
        // Subtitle lama berbohong: ia menyebut "berlaku global untuk seluruh
        // platform", padahal scope-nya per-USER (kolom di tabel users).
        subtitle={readOnly ? 'Preferensi akun Anda sendiri (tampilan saja)' : 'Berlaku untuk akun Anda sendiri, bukan untuk semua orang'}
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

      {/* Status simpan — tanpa ini toggle terasa seperti tidak melakukan apa-apa. */}
      <div className="mt-1 min-h-[18px]">
        {!isLoaded ? (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Memuat preferensi…</span>
        ) : error ? (
          <span role="alert" className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</span>
        ) : saving ? (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Menyimpan…</span>
        ) : okMsg ? (
          <span role="status" className="text-xs font-medium" style={{ color: '#15803d' }}>{okMsg}</span>
        ) : null}
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
  // Langkah konfirmasi: file yang dipilih ditahan dulu, dry-run dijalankan, dan
  // baru di-commit kalau admin menekan Lanjutkan. `pending` null = tidak ada
  // dialog terbuka.
  const [pending, setPending] = useState<{
    file: File
    impact: CoaImpact
    newCount: number
    oldCount: number
    warnings: string[]
  } | null>(null)
  // CRUD manual per baris. `form` null = tertutup; `form.editing` null = tambah.
  const [form, setForm] = useState<{ editing: CoaAccount | null } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ account: CoaAccount; impact: CoaImpact } | null>(null)
  const [rowBusy, setRowBusy] = useState(false)
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
      // Selalu dry-run dulu. Untuk klien yang belum punya COA sama sekali
      // dampaknya nol dan dialog dilewati — konfirmasi cuma relevan kalau ada
      // sesuatu yang bisa rusak.
      const fd = new FormData()
      fd.append('file', file)
      fd.append('dryRun', '1')
      const res = await fetch(`/api/clients/${clientId}/coa`, { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[]; warnings?: string[]; impact?: CoaImpact; newCount?: number; oldCount?: number }
        | null
      if (!res.ok) {
        const details = payload?.details
        setError(details?.length ? details.join(' · ') : (payload?.error ?? 'Gagal memproses Master COA.'))
        return
      }
      const impact = payload?.impact
      const touchesSomething =
        !!impact && (impact.relinkedLineCount > 0 || impact.brokenLineCount > 0 || impact.historySaved + impact.historyLost > 0)
      if (impact && touchesSomething) {
        setPending({
          file,
          impact,
          newCount: payload?.newCount ?? 0,
          oldCount: payload?.oldCount ?? 0,
          warnings: payload?.warnings ?? [],
        })
        return
      }
      await commitReplace(file)
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.')
    } finally {
      setUploading(false)
    }
  }

  const commitReplace = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/clients/${clientId}/coa`, { method: 'POST', body: fd })
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; details?: string[]; warnings?: string[]; impact?: CoaImpact }
        | null
      if (!res.ok) {
        const details = payload?.details
        setError(details?.length ? details.join(' · ') : (payload?.error ?? 'Gagal upload Master COA.'))
        return
      }
      setPending(null)
      await load()
      setShowPreview(true)
      const broken = payload?.impact?.brokenLineCount ?? 0
      const notes = [...(payload?.warnings ?? [])]
      if (broken > 0) {
        notes.push(`${broken} baris kehilangan mapping — petakan ulang di COA Mapping.`)
      }
      setWarning(notes.length ? notes.join(' · ') : null)
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.')
    } finally {
      setUploading(false)
    }
  }

  // Hapus SELALU lewat dry-run dulu — laporan dampaknya datang dari server
  // (mesin yang sama dengan ganti Excel), jadi angka yang disetujui admin
  // mustahil berbeda dari yang dieksekusi.
  const askDelete = async (account: CoaAccount) => {
    setRowBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/coa/rows/${account.id}?dryRun=1`, { method: 'DELETE' })
      const payload = (await res.json().catch(() => null)) as { error?: string; impact?: CoaImpact } | null
      if (!res.ok || !payload?.impact) {
        setError(payload?.error ?? 'Gagal menghitung dampak penghapusan.')
        return
      }
      setPendingDelete({ account, impact: payload.impact })
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.')
    } finally {
      setRowBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setRowBusy(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/coa/rows/${pendingDelete.account.id}`, { method: 'DELETE' })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(payload?.error ?? 'Gagal menghapus akun.')
        return
      }
      setPendingDelete(null)
      await load()
    } catch {
      setError('Terjadi kesalahan jaringan. Coba lagi.')
    } finally {
      setRowBusy(false)
    }
  }

  const count = data?.count ?? 0
  const hasCoa = count > 0
  const previewRows = data?.accounts ?? []
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
          {/* Export — SEMUA role, termasuk klien untuk kliennya sendiri
              (aksesnya sama dengan membaca COA yang memang sudah haknya).
              Sengaja di sebelah tombol import: mengganti Master COA menimpa
              seluruh isinya, dan ini satu-satunya cara mengambil cadangan
              sebelum itu terjadi. Anchor biasa, bukan fetch — biar browser
              yang menangani unduhan & nama file dari Content-Disposition. */}
          {hasCoa && (
            <a
              href={`/api/clients/${clientId}/coa/export`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors duration-150 hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
              title="Unduh Master COA sebagai Excel — bisa di-import balik apa adanya"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </a>
          )}
          {!readOnly && hasCoa && (
            <button
              type="button"
              onClick={() => setForm({ editing: null })}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors duration-150 hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
              style={{ background: 'var(--color-muted-bg)', color: 'var(--color-text-primary)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Akun
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

      {/* Form tambah/edit baris + konfirmasi hapus — staf saja. */}
      {!readOnly && form && (
        <CoaRowForm
          clientId={clientId}
          rows={data?.accounts ?? []}
          editing={form.editing}
          onDone={async () => { setForm(null); await load() }}
          onCancel={() => setForm(null)}
        />
      )}
      {!readOnly && pendingDelete && (
        <CoaDeleteDialog
          account={pendingDelete.account}
          impact={pendingDelete.impact}
          submitting={rowBusy}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Konfirmasi ganti Master COA — hanya staf (readOnly tidak punya tombol
          Ganti sama sekali, dan tulis tetap dijaga requireAkunting di API). */}
      {!readOnly && pending && (
        <CoaReplaceDialog
          fileName={pending.file.name}
          impact={pending.impact}
          newCount={pending.newCount}
          oldCount={pending.oldCount}
          warnings={pending.warnings}
          submitting={uploading}
          onConfirm={() => commitReplace(pending.file)}
          onCancel={() => setPending(null)}
        />
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
          {/* Seluruh akun ditampilkan (dulu dipotong 8 baris). Gulir DI DALAM
              card, bukan memanjangkan halaman: 100+ baris akan menenggelamkan
              kartu Settings lain di bawahnya. Header dibuat sticky supaya nama
              kolom tetap terbaca saat menggulir. tabIndex agar area ini bisa
              digulir dengan keyboard. */}
          <div
            className="overflow-x-auto overflow-y-auto"
            style={{ maxHeight: 'min(60vh, 520px)' }}
            tabIndex={0}
            role="region"
            aria-label={`Struktur Master COA — ${count} akun`}
          >
            <table className="w-full" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  {[...['Kode', 'Nama Akun', 'Posisi', 'Kelompok', 'Sub Kelompok', 'Class CF'], ...(readOnly ? [] : ['Aksi'])].map(col => (
                    <th
                      key={col}
                      className="text-left px-4 py-2.5 font-semibold whitespace-nowrap sticky top-0"
                      style={{
                        color: 'var(--color-text-muted)',
                        fontSize: 10.5,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        // Header sticky harus OPAK — kalau transparan, baris yang
                        // lewat di belakangnya ikut terbaca.
                        background: '#fafafa',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
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
                    {/* Aksi per baris — staf saja. Role user tidak melihat kolom
                        ini sama sekali (tulis juga dijaga requireAkunting di API). */}
                    {!readOnly && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setForm({ editing: row })}
                            aria-label={`Edit akun ${row.kode} ${row.nama}`}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-150 hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => askDelete(row)}
                            disabled={rowBusy}
                            aria-label={`Hapus akun ${row.kode} ${row.nama}`}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-150 hover:bg-[#fef2f2] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                            style={{ color: '#dc2626' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[10.5px] border-t" style={{ color: 'var(--color-text-muted)', borderColor: '#f0f0f0' }}>
            Menampilkan semua {count} akun · Gulir untuk melihat seluruh struktur
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
  const [visibility, setVisibility] = useState<Record<string, boolean>>(defaultMetricVisibility)
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
        //
        // Id yang TIDAK dikenal lagi dibuang di sini (mis. baris `dar` lama yang
        // masih tertinggal di DB). Tanpa filter ini id usang ikut masuk state
        // lalu ditulis ulang tiap toggle oleh persist() di bawah, jadi baris
        // yatimnya hidup selamanya. Membuangnya di sisi baca juga berarti kita
        // tidak perlu menghapus data lama: baris usang cukup berhenti ditulis.
        const known = new Set<string>(ALL_METRIC_IDS)
        const saved = Object.fromEntries(
          Object.entries(data.visibility).filter(([id]) => known.has(id))
        )
        setVisibility({ ...defaultMetricVisibility(), ...saved })
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
                        style={{ color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: on ? 500 : 400 }}
                      >
                        {metric.label}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{metric.desc}</p>
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
  // Daftar klien untuk selector akun 'user' — pakai list yang sudah di-fetch
  // client-context (dipakai sidebar/admin-overview), jangan fetch baru.
  const { clients } = useClient()
  const [list, setList] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('akunting')
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // Nama klien untuk kolom "Klien" di tabel Akun Tim (baris role user).
  const clientNameById = (id: string | null) =>
    id ? clients.find(c => c.id === id)?.name ?? '—' : '—'

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
    setError(null)
    setOkMsg(null)
    // Lapisan tambahan DI ATAS required/minLength HTML — jaga-jaga kalau browser
    // autofill mengisi field dengan nilai tak dimaksud (kasus nyata: Nama
    // ke-autofill jadi email). Trim → whitespace-only ikut ketolak.
    if (name.trim().length < 2) { setError('Nama minimal 2 karakter.'); return }
    if (password.length < 8) { setError('Password minimal 8 karakter.'); return }
    if (role === 'user' && !clientId) { setError('Pilih klien untuk akun Klien (User).'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // clientId hanya dikirim untuk role user; staf tidak pernah kirim
        // (backend juga memaksanya null kalau ada).
        body: JSON.stringify({ name, email, password, role, clientId: role === 'user' ? clientId : undefined }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string; user?: TeamUser } | null
      if (!res.ok) throw new Error(payload?.error ?? 'Gagal membuat akun.')
      setOkMsg(`Akun "${payload?.user?.email}" (${ROLE_LABEL[role]}) berhasil dibuat.`)
      setName(''); setEmail(''); setPassword(''); setRole('akunting'); setClientId('')
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
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 5,
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
        {/* autoComplete="off" di form + input, plus name non-generik &
            new-password di field password: cegah browser autofill mengisi akun
            ORANG LAIN dgn kredensial/identitas admin (beda dari form login). */}
        <form onSubmit={submit} autoComplete="off" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle} htmlFor="u-name">NAMA</label>
              <input id="u-name" name="ngid-acc-name" autoComplete="off" style={inputStyle} value={name} onChange={e => setName(e.target.value)}
                placeholder="Nama lengkap" required minLength={2} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="u-email">EMAIL</label>
              <input id="u-email" name="ngid-acc-email" type="email" autoComplete="off" style={inputStyle} value={email}
                onChange={e => setEmail(e.target.value)} placeholder="nama@ngitungid.com" required />
            </div>
            <div>
              <label style={labelStyle} htmlFor="u-pass">PASSWORD (min 8 karakter)</label>
              <input id="u-pass" name="ngid-acc-password" type="password" autoComplete="new-password" style={inputStyle} value={password}
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

          {/* Client selector — HANYA untuk role user (klien), wajib. Data dari
              client-context (bukan fetch baru). */}
          {role === 'user' && (
            <div>
              <label style={labelStyle} htmlFor="u-client">KLIEN (akun ini terikat ke satu klien)</label>
              {clients.length === 0 ? (
                <p style={{ fontSize: 12, color: '#b45309' }}>
                  Belum ada klien. Buat klien dulu di Admin Overview sebelum membuat akun Klien.
                </p>
              ) : (
                <select
                  id="u-client"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  required
                >
                  <option value="">Pilih klien…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            <strong style={{ color: 'var(--color-text-muted)' }}>Akunting</strong> — upload, review, mapping, kelola klien, lihat semua klien.{' '}
            <strong style={{ color: 'var(--color-text-muted)' }}>Owner</strong> — semua itu, plus membuat akun & assign akunting ke klien.{' '}
            <strong style={{ color: 'var(--color-text-muted)' }}>Klien</strong> — akses read-only terikat ke satu klien: Dashboard, Analytics, Laporan (monitoring), Settings (General + Master COA, read-only).
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
          <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat akun…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>Nama</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>Role</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)' }}>Klien</th>
                </tr>
              </thead>
              <tbody>
                {list.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f6' }}>
                    <td style={{ padding: '9px 10px', fontSize: 12.5, color: '#1f2430', fontWeight: 500 }}>{u.name}</td>
                    <td style={{ padding: '9px 10px', fontSize: 12.5, color: 'var(--color-text-muted)' }}>{u.email}</td>
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
                    <td style={{ padding: '9px 10px', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                      {u.role === 'user' ? clientNameById(u.clientId) : '—'}
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

// ── Tab: Layanan (owner + finance) ───────────────────────────
// Master jasa yang dijual — GLOBAL, bukan per-klien (karena itu `scoped: false`
// dan tidak ada chip klien aktif di tab ini).
//
// TIDAK ADA TOMBOL HAPUS, dan jangan ditambahkan. Kontrak mencatat layanan apa
// yang dijual; menghapus satu baris melubangi setiap kontrak lama yang
// memuatnya. Menonaktifkan menyembunyikannya dari picker kontrak BARU sementara
// kontrak lama tetap menampilkannya normal (lib/layanan.ts).
function LayananTab() {
  const [rows, setRows] = useState<LayananRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  // null = form tertutup; { id: null } = tambah baru; { id } = edit baris itu.
  const [form, setForm] = useState<{ id: string | null; nama: string; deskripsi: string } | null>(null)

  // Muat ulang lewat penghitung, bukan memanggil fungsi ber-setState langsung
  // dari efek: setState sinkron di dalam badan efek memicu render berantai.
  // Semua setState di bawah berada SETELAH await, di dalam callback async —
  // pola yang sama dengan PreferencesProvider. Sekalian dapat pembatalan
  // (`alive`), yang tidak dimiliki tab-tab sebelah.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/layanan')
        if (!res.ok) throw new Error('Gagal memuat daftar layanan.')
        const d = (await res.json()) as { layanan: LayananRow[] }
        if (!alive) return
        setRows(d.layanan)
        setError(null)
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Gagal memuat daftar layanan.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [reloadKey])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      const isEdit = form.id !== null
      const res = await fetch(isEdit ? `/api/layanan/${form.id}` : '/api/layanan', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: form.nama, deskripsi: form.deskripsi }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(payload?.error ?? 'Gagal menyimpan layanan.')
      setOkMsg(isEdit ? 'Layanan diperbarui.' : `Layanan "${form.nama.trim()}" ditambahkan.`)
      setForm(null)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan layanan.')
    } finally {
      setSaving(false)
    }
  }

  const toggleAktif = async (row: LayananRow) => {
    setSaving(true)
    setError(null)
    setOkMsg(null)
    // Optimistic: balikkan kalau request gagal, supaya UI tidak berbohong.
    const previous = rows
    setRows(rs => rs.map(r => (r.id === row.id ? { ...r, aktif: !r.aktif } : r)))
    try {
      const res = await fetch(`/api/layanan/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktif: !row.aktif }),
      })
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(p?.error ?? 'Gagal mengubah status.')
      }
      setOkMsg(!row.aktif ? `"${row.nama}" diaktifkan.` : `"${row.nama}" dinonaktifkan — tidak muncul lagi di kontrak baru.`)
    } catch (err) {
      setRows(previous)
      setError(err instanceof Error ? err.message : 'Gagal mengubah status.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb',
    fontSize: 13, color: '#1f2430', background: 'white',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 5,
  }

  const aktifCount = rows.filter(r => r.aktif).length

  return (
    <>
      <SettingsCard>
        <SectionHeading
          Icon={Package}
          accent="linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)"
          title="Master Layanan"
          subtitle="Jasa yang dijual ke klien — dipakai bersama semua klien, bukan per-klien"
        />

        <div className="flex items-center justify-between gap-3 mt-4">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {loading ? 'Memuat…' : `${aktifCount} aktif dari ${rows.length} layanan`}
          </p>
          {!form && (
            <button
              type="button"
              onClick={() => setForm({ id: null, nama: '', deskripsi: '' })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-200 enabled:hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{ background: 'var(--color-accent-primary)', color: 'var(--color-accent-primary-fg)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Layanan
            </button>
          )}
        </div>

        {form && (
          <form onSubmit={submit} className="space-y-3 mt-4 rounded-2xl p-4" style={{ background: 'var(--color-muted-bg)' }}>
            <div>
              <label style={labelStyle} htmlFor="ly-nama">NAMA LAYANAN</label>
              <input
                id="ly-nama" style={inputStyle} value={form.nama} autoFocus required
                minLength={NAMA_MIN} maxLength={NAMA_MAX}
                onChange={e => setForm(f => (f ? { ...f, nama: e.target.value } : f))}
                placeholder="mis. Setup SCM"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="ly-desk">DESKRIPSI (opsional)</label>
              <input
                id="ly-desk" style={inputStyle} value={form.deskripsi} maxLength={DESKRIPSI_MAX}
                onChange={e => setForm(f => (f ? { ...f, deskripsi: e.target.value } : f))}
                placeholder="Penjelasan singkat isi layanan"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={() => { setForm(null); setError(null) }} disabled={saving}
                className="px-4 py-2 rounded-full text-xs font-medium transition-colors hover:bg-(--color-border-subtle) disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ background: 'white', color: 'var(--color-text-primary)' }}
              >
                Batal
              </button>
              <button
                type="submit" disabled={saving || form.nama.trim().length < NAMA_MIN}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all enabled:hover:-translate-y-px disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
                style={{
                  background: saving ? 'var(--color-muted-dark)' : 'var(--color-accent-primary)',
                  color: saving ? 'var(--color-text-muted)' : 'var(--color-accent-primary-fg)',
                }}
              >
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan…</> : form.id ? 'Simpan Perubahan' : 'Tambah'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-1 min-h-[18px]">
          {error && <span role="alert" className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</span>}
          {!error && okMsg && <span role="status" className="text-xs font-medium" style={{ color: '#15803d' }}>{okMsg}</span>}
        </div>

        {!loading && rows.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
            Belum ada layanan. Tambahkan jasa yang dijual ke klien.
          </p>
        )}

        <div className="mt-3 space-y-1.5">
          {rows.map(row => (
            <div
              key={row.id}
              className="flex items-center gap-3 px-3.5 py-3 rounded-2xl"
              style={{ background: 'var(--color-muted-bg)' }}
            >
              <div className="flex-1 min-w-0">
                {/* Nama layanan TIDAK dicoret & tidak diberi label "(dihapus)"
                    walau nonaktif — bagi kontrak lama ia memang benar-benar
                    dijual. Statusnya ditunjukkan pill terpisah di kanan. */}
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {row.nama}
                </p>
                {row.deskripsi && (
                  <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{row.deskripsi}</p>
                )}
              </div>

              <span
                className="text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0"
                style={
                  row.aktif
                    ? { background: '#f0fdf4', color: '#15803d' }
                    : { background: 'var(--color-muted-dark)', color: 'var(--color-text-muted)' }
                }
              >
                {row.aktif ? 'Aktif' : 'Nonaktif'}
              </span>

              <button
                type="button"
                onClick={() => setForm({ id: row.id, nama: row.nama, deskripsi: row.deskripsi ?? '' })}
                aria-label={`Edit ${row.nama}`}
                className="inline-flex items-center justify-center rounded-full flex-shrink-0 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary)"
                style={{ width: 32, height: 32, color: 'var(--color-text-muted)' }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Toggle aktif — TIDAK ada tombol hapus di baris ini, disengaja. */}
              <button
                type="button"
                role="switch"
                aria-checked={row.aktif}
                aria-label={`${row.aktif ? 'Nonaktifkan' : 'Aktifkan'} ${row.nama}`}
                onClick={() => void toggleAktif(row)}
                disabled={saving}
                className="flex-shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) rounded-full"
              >
                <SwitchVisual on={row.aktif} accent="var(--color-accent-primary)" />
              </button>
            </div>
          ))}
        </div>

        <p className="text-[11px] mt-4" style={{ color: 'var(--color-text-muted)' }}>
          Layanan tidak bisa dihapus. Menonaktifkan membuatnya tidak muncul lagi saat
          membuat kontrak baru, sementara kontrak lama yang memakainya tetap utuh.
        </p>
      </SettingsCard>
    </>
  )
}

// ── Tab: Account (semua role) ────────────────────────────────
// Ganti password AKUN SENDIRI. Terlihat untuk SEMUA role, termasuk klien —
// lihat lib/settings-tabs.ts. Endpoint POST /api/account/password tidak
// menerima id akun sama sekali; targetnya selalu pemilik sesi.
function AccountTab() {
  const { data: session } = useSession()
  const { role } = useClient()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  // Validasi client-side = LAPISAN TAMBAHAN, bukan pengganti. Server tetap
  // memvalidasi ulang semuanya (lib/api/password-change.ts) — di sini hanya
  // supaya user tidak perlu menunggu roundtrip untuk kesalahan yang jelas.
  const trimmedNew = newPassword.trim()
  const tooShort = trimmedNew.length > 0 && trimmedNew.length < MIN_PASSWORD
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const sameAsOld = trimmedNew.length > 0 && trimmedNew === currentPassword
  const canSubmit =
    currentPassword.length > 0 &&
    trimmedNew.length >= MIN_PASSWORD &&
    newPassword === confirmPassword &&
    !sameAsOld &&
    !saving

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(payload?.error ?? 'Gagal mengubah password.')
      setOkMsg('Password berhasil diubah. Pakai password baru saat login berikutnya.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah password.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb',
    fontSize: 13, color: '#1f2430', background: 'white',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 5,
  }
  // #b45309 di atas putih = 4.8:1 → lolos AA untuk teks normal. Jangan turunkan
  // ke amber yang lebih terang; kontras hint inline ini baru saja dirapikan.
  const hintStyle: React.CSSProperties = { fontSize: 11, marginTop: 5, color: '#b45309' }

  return (
    <>
      <SettingsCard>
        <SectionHeading
          Icon={KeyRound}
          accent="linear-gradient(135deg, #bbb3f3 0%, #a5b4fc 100%)"
          title="Ganti Password"
          subtitle="Password lama wajib dimasukkan — sesi yang aktif saja tidak cukup"
        />

        {session?.user?.email && (
          <div
            className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 mt-4"
            style={{ background: 'var(--color-muted-bg)' }}
          >
            <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
            <span className="text-xs min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
              {session.user.email}
            </span>
            <span className="text-[10.5px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              · {ROLE_LABEL[role]}
            </span>
          </div>
        )}

        {/* Hardening autofill — pelajaran dari form Buat Akun, di mana Chrome
            diam-diam mengisi field dan menghasilkan akun dengan kredensial yang
            salah. Di sini autoComplete justru harus BENAR per field (bukan
            "off"): current-password memberi tahu password manager mana yang
            lama, new-password mencegahnya menawarkan password tersimpan untuk
            dua field terakhir. name= non-generik supaya heuristik lama browser
            tidak menebak sendiri. */}
        <form onSubmit={submit} className="space-y-3 mt-4">
          <div>
            <label style={labelStyle} htmlFor="pw-current">PASSWORD LAMA</label>
            <input
              id="pw-current" name="ngid-current-password" type="password"
              autoComplete="current-password" style={inputStyle} value={currentPassword}
              onChange={e => { setCurrentPassword(e.target.value); setError(null); setOkMsg(null) }}
              placeholder="••••••••" required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle} htmlFor="pw-new">PASSWORD BARU (min {MIN_PASSWORD} karakter)</label>
              <input
                id="pw-new" name="ngid-new-password" type="password"
                autoComplete="new-password" style={inputStyle} value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError(null); setOkMsg(null) }}
                placeholder="••••••••" required minLength={MIN_PASSWORD}
                aria-describedby={tooShort || sameAsOld ? 'pw-new-hint' : undefined}
              />
              {tooShort && <p id="pw-new-hint" style={hintStyle}>Minimal {MIN_PASSWORD} karakter.</p>}
              {!tooShort && sameAsOld && (
                <p id="pw-new-hint" style={hintStyle}>Password baru harus berbeda dari password lama.</p>
              )}
            </div>
            <div>
              <label style={labelStyle} htmlFor="pw-confirm">KONFIRMASI PASSWORD BARU</label>
              <input
                id="pw-confirm" name="ngid-confirm-password" type="password"
                autoComplete="new-password" style={inputStyle} value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError(null); setOkMsg(null) }}
                placeholder="••••••••" required
                aria-describedby={mismatch ? 'pw-confirm-hint' : undefined}
              />
              {mismatch && <p id="pw-confirm-hint" style={hintStyle}>Konfirmasi belum sama dengan password baru.</p>}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-2xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
              <span role="alert" className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</span>
            </div>
          )}
          {okMsg && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-2xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#15803d' }} />
              <span role="status" className="text-xs font-medium" style={{ color: '#15803d' }}>{okMsg}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all enabled:hover:-translate-y-px disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent-primary) focus-visible:ring-offset-2"
              style={{
                background: canSubmit ? 'var(--color-accent-primary)' : 'var(--color-muted-dark)',
                color: canSubmit ? 'var(--color-accent-primary-fg)' : 'var(--color-text-disabled)',
                minHeight: 40,
              }}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…</> : 'Ubah Password'}
            </button>
          </div>
        </form>
      </SettingsCard>
    </>
  )
}

export default function SettingsPage() {
  // Tidak pakai useRequireClient: tab General bersifat platform-level dan harus
  // tetap bisa diakses tanpa klien aktif — tab scoped punya empty state sendiri.
  const { activeClient, isOwner, isInternal, canDoAccounting, role } = useClient()
  const [activeTab, setActiveTab] = useState<TabId>('general')

  // Visibility metrik sekarang dimiliki AnalyticsDisplayTab (persisted ke
  // client_metric_visibility), bukan lagi state lokal di page ini.

  // Aturan visibilitas per-role ada di lib/settings-tabs.ts (murni & teruji),
  // bukan di sini. Role 'user' (klien) melihat General + Master COA (read-only)
  // + Account — Account WAJIB terlihat karena semua orang harus bisa mengganti
  // password sendiri. Analytics Display / Kelola Akun / Notifications tetap
  // tersembunyi total (bukan di-disable).
  const navItems = visibleSettingsTabs(role).map(id => ({ id, ...TAB_META[id] }))
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
                    <span className="hidden lg:block text-[10.5px] truncate" style={{ color: isActive ? 'rgba(26,26,26,0.7)' : 'var(--color-text-muted)' }}>
                      {item.desc}
                    </span>
                  </span>
                  {isSoon && (
                    <span
                      className="text-[9px] font-semibold rounded px-1 py-0.5 leading-none flex-shrink-0"
                      style={{ color: 'var(--color-text-muted)', border: '1px solid #dcdcdc' }}
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

              {activeNav.id === 'general' && <GeneralTab readOnly={!isInternal} />}

              {activeNav.id === 'users' && isOwner && <UsersTab />}

              {activeNav.id === 'layanan' && <LayananTab />}

              {activeNav.id === 'account' && <AccountTab />}

              {activeTab === 'coa' && activeClient && (
                <MasterCoaTab key={activeClient.id} clientId={activeClient.id} readOnly={!canDoAccounting} />
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
