'use client'

import type { ClientInfo } from '@/lib/client-context'

// Avatar klien: tampilkan LOGO kalau ada (GET /api/clients/[id]/logo), kalau
// tidak jatuh ke inisial huruf pertama nama. Dipakai di semua tempat inisial
// klien muncul (Admin Overview, sidebar, upload, coa-mapping) supaya konsisten.
//
// hasLogo diambil dari payload GET /api/clients — jadi kita tidak menembak URL
// logo untuk klien yang tidak punya (hindari 404 + flash). ?v=updatedAt
// memaksa browser mengambil ulang setelah logo diganti (Cache-Control-nya
// private, max-age 300).
export function ClientAvatar({
  client,
  size = 40,
  rounded = 12,
  fontSize,
}: {
  client: Pick<ClientInfo, 'id' | 'name' | 'hasLogo' | 'updatedAt'>
  size?: number
  rounded?: number
  fontSize?: number
}) {
  const dim = { width: size, height: size, borderRadius: rounded }

  if (client.hasLogo) {
    return (
      <img
        src={`/api/clients/${client.id}/logo?v=${encodeURIComponent(client.updatedAt)}`}
        alt={`Logo ${client.name}`}
        width={size}
        height={size}
        className="object-cover flex-shrink-0"
        style={{ ...dim, background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center flex-shrink-0 font-bold"
      style={{
        ...dim,
        background: 'var(--color-accent-primary)',
        color: 'var(--color-bg-main)',
        fontSize: fontSize ?? Math.round(size * 0.4),
      }}
      aria-hidden="true"
    >
      {client.name.charAt(0).toUpperCase()}
    </div>
  )
}
