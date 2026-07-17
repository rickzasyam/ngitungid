// Next.js 16 me-rename konvensi "middleware.ts" jadi "proxy.ts" (fungsi yang
// di-export juga "middleware" -> "proxy"). File bernama middleware.ts akan
// di-silent-ignore tanpa error di versi ini — lihat:
// https://nextjs.org/docs/messages/middleware-to-proxy
export { auth as proxy } from '@/lib/auth'

// icon.png & apple-icon.png = aset metadata App Router (dari app/icon.png).
// Tanpa dikecualikan, keduanya ikut diproteksi proxy → request favicon dari
// halaman /login (yang jelas belum punya sesi) dibalas 307 ke /login, jadi
// ikonnya tidak pernah tampil di tab saat belum login.
export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|login).*)'],
}
