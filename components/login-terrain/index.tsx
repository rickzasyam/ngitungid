'use client'

import dynamic from 'next/dynamic'

// ISOLASI MUAT — inti dari kenapa file ini ada.
//
// `three` ±500KB. Kalau ia di-import statis dari halaman login, ia masuk ke
// JS AWAL rute /login dan form harus menunggu unduh + parse + eksekusi
// seluruhnya sebelum bisa diketik. next/dynamic({ ssr: false }) memindahkannya
// ke chunk TERPISAH yang tidak ikut di bundel awal rute: form dirender dan
// hidup dari bundel yang sudah ada, kanvas menyusul kapan pun ia siap.
//
// ssr:false juga syarat kebenaran, bukan cuma performa: TerrainCanvas menguji
// WebGL lewat document saat render pertama, dan itu tidak ada di server.
//
// `loading` sengaja null: tidak ada spinner, tidak ada placeholder yang
// bergeser. Sebelum kanvas datang, panel kirinya sudah menampilkan kisi titik
// CSS — persis tampilan fallback-nya, jadi tidak ada kedipan tata letak.
const TerrainCanvas = dynamic(() => import('./terrain-canvas'), {
  ssr: false,
  loading: () => null,
})

export function LoginTerrain() {
  return <TerrainCanvas />
}
