// Next.js 16 me-rename konvensi "middleware.ts" jadi "proxy.ts" (fungsi yang
// di-export juga "middleware" -> "proxy"). File bernama middleware.ts akan
// di-silent-ignore tanpa error di versi ini — lihat:
// https://nextjs.org/docs/messages/middleware-to-proxy
export { auth as proxy } from '@/lib/auth'

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)'],
}
