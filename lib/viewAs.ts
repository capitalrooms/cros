'use client'
// "See their app (view as)" for the tenant app (13 Nov 2026, Harry: "clicking My requests as Danielo crashes — should we
// be able to do the whole view as in their view?"). An administrator viewing as a tenant now sees every tenant screen as
// that tenant, READ-ONLY: the person is remembered for the browser tab (sessionStorage, set by /tenant?as=…), each
// /api request from a /tenant page carries x-view-as (app/components/AuthFetchBridge), and the server honours it only
// for administrators and only on GET (lib/portalAuth requireSignedIn) — nothing can be sent or changed as them.
import { getCurrentUser } from '@/lib/auth'

export const VIEW_AS_KEY = 'cros-view-as'

/** The tenant being viewed, when on a tenant screen in this tab. */
export function viewAsId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.location.pathname.startsWith('/tenant')) return null
    const v = sessionStorage.getItem(VIEW_AS_KEY)
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
  } catch { return null }
}

export interface TenantSelf {
  personId: string
  /** ids a tenant's reports may be filed under (the person, and older ones under the sign-in id) */
  reporterIds: string[]
  firstName: string
  viewingAs: boolean
}

/** Who the tenant screens are for: the signed-in tenant, or the tenant an administrator is viewing as. null → sign in. */
export async function tenantSelf(): Promise<TenantSelf | null> {
  const data = await getCurrentUser()
  const role = data?.assignment?.role
  if (data && role === 'tenant') {
    const a: any = data.assignment
    return { personId: a.id, reporterIds: [a.id, data.user.id].filter(Boolean), firstName: a.first_name ?? '', viewingAs: false }
  }
  const va = viewAsId()
  if (data && role === 'administrator' && va) {
    const { createClient } = await import('@/lib/supabase')
    const { data: p } = await createClient().from('people').select('id, first_name, role').eq('id', va).maybeSingle() as { data: any }
    if (!p || p.role !== 'tenant') return null
    return { personId: p.id, reporterIds: [p.id], firstName: p.first_name ?? '', viewingAs: true }
  }
  return null
}

/** Throws a friendly error for anything that would act as them while viewing. */
export function blockWhileViewing(self: TenantSelf | null): string | null {
  return self?.viewingAs ? 'You’re viewing their app — this is read-only, so nothing was sent or changed.' : null
}
