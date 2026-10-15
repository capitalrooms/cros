// Key safe codes (15 Oct 2026). A code opens the HOUSE only — never a tenant's room (memory: property access
// arrangements). Codes live in their own table, property_access_codes (migration 224), which only the office can read
// directly; everyone else gets a code from the server, and only when they're allowed one:
//   · a contractor with a booked job there, or who has just told the tenants they're popping by (lib/access/visits)
//   · the contractor chosen for an emergency (lib/emergencies)
// Before migration 224 runs, codes are still on properties.key_safe_code, so both are read here.
import type { SupabaseClient } from '@supabase/supabase-js'

const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(e.message ?? '')))

export async function readKeySafe(s: SupabaseClient, propertyId: string | null | undefined): Promise<string | null> {
  if (!propertyId) return null
  const { data, error } = await s.from('property_access_codes').select('key_safe_code').eq('property_id', propertyId).maybeSingle()
  if (!error && (data as any)?.key_safe_code) return String((data as any).key_safe_code)
  if (error && !missingTable(error)) return null
  // not moved yet (or never set in the new table): the old column
  const { data: p } = await s.from('properties').select('key_safe_code').eq('id', propertyId).maybeSingle()
  return (p as any)?.key_safe_code ? String((p as any).key_safe_code) : null
}

export async function writeKeySafe(s: SupabaseClient, propertyId: string, code: string | null, by: string | null): Promise<{ ok: boolean; error?: string }> {
  const value = code?.trim() || null
  const { error } = await s.from('property_access_codes').upsert({ property_id: propertyId, key_safe_code: value, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: 'property_id' })
  if (!error) {
    // keep the old column empty once the code lives in the locked table
    await s.from('properties').update({ key_safe_code: null }).eq('id', propertyId).not('key_safe_code', 'is', null)
    return { ok: true }
  }
  if (!missingTable(error)) return { ok: false, error: error.message }
  const { error: e2 } = await s.from('properties').update({ key_safe_code: value }).eq('id', propertyId)
  return e2 ? { ok: false, error: e2.message } : { ok: true }
}
