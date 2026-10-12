// Server-side guard for admin API routes. Browser sessions live in localStorage (not cookies), so
// admin pages send the access token as a Bearer header (see lib/adminFetch.ts).
import type { NextRequest } from 'next/server'
import { officeCaller, bearer } from '@/lib/access/server'
import { canCallApi, isAdministrator } from '@/lib/access/areas'

/** Office staff allowed this route: administrators always; others when the route is in one of their access areas
 *  (lib/access/areas — stage 2, 12 Oct 2026). Two-step sign-in, if set up, must have been completed. */
export async function requireAdmin(req: NextRequest): Promise<{ email: string; personId: string } | null> {
  const who = await officeCaller(bearer(req.headers))
  if (!who || !canCallApi(req.nextUrl.pathname, who.areas, who.role)) return null
  return { email: who.email, personId: who.personId }
}

/** Administrators only, whatever the route: accounts, access levels, settings. */
export async function requireAdministrator(req: NextRequest): Promise<{ email: string; personId: string } | null> {
  const who = await officeCaller(bearer(req.headers))
  return who && isAdministrator(who.role) ? { email: who.email, personId: who.personId } : null
}
