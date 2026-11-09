import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clientAccountingSettings } from '@/lib/db/schema'

// Pembaca setelan pembukuan per klien.
//
// ══ KETIADAAN BARIS ADALAH KEADAAN YANG PALING SERING ═════════════════════
// Baris dibuat LAZILY (saat pertama disetel), jadi mayoritas klien tidak akan
// pernah punya barisnya. `null` dari fungsi ini BUKAN kasus pinggiran — ia
// jawaban yang normal, dan pemanggil wajib memperlakukannya sama persis dengan
// baris yang ada bernilai bawaan. Predikatnya ada di lib/accounting-settings.ts
// (murni, dikunci test tiga-keadaan).

export type AccountingSettingsRow = {
  akunPpnMasukanId: string | null
  /** D59 (0021) — perantara transfer antar akun kas. */
  akunPindahBukuId: string | null
  postingBisaDiedit: boolean
}

/** Setelan klien, atau `null` bila belum pernah disetel. */
export async function loadAccountingSettings(
  clientId: string
): Promise<AccountingSettingsRow | null> {
  const [row] = await db
    .select({
      akunPpnMasukanId: clientAccountingSettings.akunPpnMasukanId,
      akunPindahBukuId: clientAccountingSettings.akunPindahBukuId,
      postingBisaDiedit: clientAccountingSettings.postingBisaDiedit,
    })
    .from(clientAccountingSettings)
    .where(eq(clientAccountingSettings.clientId, clientId))
    .limit(1)
  return row ?? null
}
