// Cadangan draf grid di IndexedDB (D51) — per (klien, akun kas).
//
// Draf 10.000 baris adalah pekerjaan berjam-jam; tab yang tertutup, browser
// yang crash, atau sesi yang kedaluwarsa tidak boleh menghapusnya. Cadangan ini
// HANYA salinan keadaan reducer (`potretCadangan`, S6) — tanpa aturan sendiri.
// Dihapus otomatis sesudah Simpan berhasil.
//
// Setiap akses dibungkus try/catch: IndexedDB bisa tidak ada (mode privat,
// kebijakan browser) atau ditolak; saat itu grid tetap jalan dan pengguna
// hanya diberi peringatan bahwa cadangan tidak tersedia.
//
// ══ DUA SLOT (CP-20, Ricko 2026-10-29) ═══════════════════════════════════
// `draf`     — autosave berkala draf yang sedang disunting.
// `tertimpa` — draf yang DIGANTI versi server lewat "Muat ulang dari server"
//              (konflik 409). Slot terpisah supaya autosave draf baru sesudah
//              muat ulang tidak menimpanya; tetap ada sampai dipulihkan atau
//              dibuang secara eksplisit.

import type { CadanganGrid } from '@/lib/mutasi-grid-state'
import type { Periode } from '@/lib/mutasi-draf'

const NAMA_DB = 'ngitungid-grid-mutasi'
const STORE = 'draf'
const VERSI = 1

export type SlotCadangan = 'draf' | 'tertimpa'

export type RekamanCadangan = {
  kunci: string
  slot: SlotCadangan
  clientId: string
  akunKasId: string
  periode: Periode
  /** ISO — kapan cadangan terakhir ditulis. */
  disimpanPada: string
  jumlahPerubahan: number
  cadangan: CadanganGrid
}

// Slot `draf` memakai kunci lama (tanpa akhiran) — cadangan yang sudah ada tetap terbaca.
const kunciCadangan = (clientId: string, akunKasId: string, slot: SlotCadangan) =>
  slot === 'draf' ? `${clientId}:${akunKasId}` : `${clientId}:${akunKasId}:${slot}`

function buka(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(NAMA_DB, VERSI)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'kunci' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function jalankan<T>(mode: IDBTransactionMode, kerja: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<{ ok: boolean; hasil: T | null }> {
  const db = await buka()
  if (!db) return { ok: false, hasil: null }
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = kerja(tx.objectStore(STORE))
      tx.oncomplete = () => {
        db.close()
        resolve({ ok: true, hasil: req ? (req.result as T) : null })
      }
      tx.onerror = () => {
        db.close()
        resolve({ ok: false, hasil: null })
      }
      tx.onabort = () => {
        db.close()
        resolve({ ok: false, hasil: null })
      }
    } catch {
      db.close()
      resolve({ ok: false, hasil: null })
    }
  })
}

/** true = tertulis. false = IndexedDB tidak tersedia/ditolak (grid memperingatkan). */
export async function tulisCadangan(r: Omit<RekamanCadangan, 'kunci' | 'slot'>, slot: SlotCadangan = 'draf'): Promise<boolean> {
  const rekaman: RekamanCadangan = { ...r, slot, kunci: kunciCadangan(r.clientId, r.akunKasId, slot) }
  return (await jalankan('readwrite', s => s.put(rekaman))).ok
}

export async function bacaCadangan(clientId: string, akunKasId: string, slot: SlotCadangan = 'draf'): Promise<RekamanCadangan | null> {
  const h = await jalankan<RekamanCadangan | undefined>('readonly', s => s.get(kunciCadangan(clientId, akunKasId, slot)))
  return h.hasil ? { ...h.hasil, slot } : null
}

export async function hapusCadangan(clientId: string, akunKasId: string, slot: SlotCadangan = 'draf'): Promise<void> {
  await jalankan('readwrite', s => s.delete(kunciCadangan(clientId, akunKasId, slot)))
}
