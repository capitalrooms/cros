// Rent charges that came from a previous agent's imported statement (before 15 Oct 2026 AutoLedger raised them and
// marked them paid). That money was collected by the previous agent, so it must never count as rent CROS received —
// not on the Rent Roll, not on a statement, never towards paying a landlord (1 Nov 2026: Redstart showed November
// "5/5 paid" from its October statement). Finance › Health check clears them; this guard holds until it's pressed.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function importedChargeIds(s: SupabaseClient, chargeIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < chargeIds.length; i += 300) {
    const { data } = await s.from('landlord_statement_rooms').select('rent_charge_id').in('rent_charge_id', chargeIds.slice(i, i + 300))
    for (const r of (data ?? []) as any[]) if (r.rent_charge_id) out.add(r.rent_charge_id)
  }
  return out
}
