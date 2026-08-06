import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow login and public pages without auth check
  if (pathname === '/login' || pathname === '/') {
    return NextResponse.next()
  }

  // For protected routes, check if user is authenticated
  // The auth is handled by client-side checks in each page
  // This middleware just allows the request through - auth is verified in the page components
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
}
