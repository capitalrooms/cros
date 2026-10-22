// Who else gets a copy of what we send a landlord, and how they like to hear from us (migration 239): the landlord's
// own copy-in list (an accountant …) plus the property's CC emails. Tolerant before the migration has run.
import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactPref = 'app_and_email' | 'app_only' | 'email_only'
export const CONTACT_PREF_LABEL: Record<ContactPref, string> = {
  app_and_email: 'App and email', app_only: 'App only — keeps everything in the app', email_only: 'Email only',
}

export async function landlordCopyTo(s: SupabaseClient, landlordId: string | null | undefined, propertyId?: string | null): Promise<{ cc: string[]; pref: ContactPref }> {
  const [{ data: p }, { data: prop }] = await Promise.all([
    landlordId ? s.from('people').select('*').eq('id', landlordId).maybeSingle() : Promise.resolve({ data: null }),
    propertyId ? s.from('properties').select('cc_emails').eq('id', propertyId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const own = Array.isArray((p as any)?.correspondence_cc) ? ((p as any).correspondence_cc as { email?: string }[]).map(c => String(c.email ?? '')) : []
  const fromProperty = String((prop as any)?.cc_emails ?? '').split(/[,;\s]+/)
  const cc = [...new Set([...own, ...fromProperty].map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]
  const pref = (['app_and_email', 'app_only', 'email_only'].includes((p as any)?.contact_pref) ? (p as any).contact_pref : 'app_and_email') as ContactPref
  return { cc, pref }
}
