// Server-side guard for admin API routes. Browser sessions live in localStorage (not cookies), so
// admin pages send the access token as a Bearer header (see lib/adminFetch.ts).
import type { NextRequest } from 'next/server'
import { officeCaller, bearer } from '@/lib/access/server'
import { canCallApi, isAdministrator } from '@/lib/access/areas'

/** Office staff allowed this route: administrators always; others when the route is in one of their access areas
 *  (lib/access/areas — stage 2, 12 Oct 2026). Two-step sign-in, if set up, must have been completed. */
export async function requireAdmin(req: NextRequest): Promise<{ email: string; personId: string } | null> {
  const who = await officeCaller(bearer(req.headers))
  if (!who || !canCallApi(req.nextUrl.pathname, who.areas, who.role, req.method, who.annual)) return null
  return { email: who.email, personId: who.personId }
}

/** Administrators only, whatever the route: accounts, access levels, settings. */
export async function requireAdministrator(req: NextRequest): Promise<{ email: string; personId: string } | null> {
  const who = await officeCaller(bearer(req.headers))
  return who && isAdministrator(who.role) ? { email: who.email, personId: who.personId } : null
}

/** Annual financial reports (tax year, resold, MTD, agency income, company P&L): the owner, or someone the owner ticked
 *  'Annual financial reports'. Administrator status alone is not enough (19 Nov 2026). */
export async function requireAnnual(req: NextRequest): Promise<{ email: string; personId: string; isOwner: boolean } | null> {
  const who = await officeCaller(bearer(req.headers))
  return who && who.annual ? { email: who.email, personId: who.personId, isOwner: who.isOwner } : null
}

/** The owner only (19 Nov 2026): the office account and the VAT books. Stored flag, never a job title. */
export async function requireOwner(req: NextRequest): Promise<{ email: string; personId: string } | null> {
  const who = await officeCaller(bearer(req.headers))
  return who && who.isOwner ? { email: who.email, personId: who.personId } : null
}
