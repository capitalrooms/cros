// How much holding deposit counts towards a tenant's move-in money — ONE answer for every calculation (5 Nov 2026,
// Harry: a colleague allocated final funds wrongly in the old system because the holding deposit wasn't on it yet).
//
// The register (holding_deposits, HOLD… with receipts) is the record. Tenancies also carry a typed figure
// (holding_deposit_received) — kept in step with the register, and used on its own only for lets from before CROS,
// where the deposit was taken in the old system and never registered.
//
// `problem` is set whenever the figure can't be trusted, and move-in figures must not go out until it's cleared:
//   · the register and the typed figure disagree
//   · the offer says a deposit was paid (or the applicant is reserved) but nothing is in the register
//   · a deposit is still in the register for this applicant but isn't linked to the tenancy
import type { SupabaseClient } from '@supabase/supabase-js'

export interface HoldingAnswer {
  amount: number
  source: 'register' | 'typed' | 'none'
  holds: { id: string; number: string | null; amount: number; status: string; received: string | null }[]
  problem: string | null
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** For a tenancy (by id), or for an applicant who doesn't have one yet (by applicantId). */
export async function holdingFor(s: SupabaseClient, o: { tenancyId?: string | null; applicantId?: string | null }): Promise<HoldingAnswer> {
  let typed = 0, applicantId = o.applicantId ?? null
  if (o.tenancyId) {
    const { data: t } = await s.from('tenancies').select('holding_deposit_received, applicant_id').eq('id', o.tenancyId).maybeSingle()
    typed = r2(Number((t as any)?.holding_deposit_received || 0))
    applicantId = applicantId ?? (t as any)?.applicant_id ?? null
  }
  // the register: this tenancy's deposits, and the applicant's (one taken before the tenancy existed)
  const ors = [o.tenancyId ? `tenancy_id.eq.${o.tenancyId}` : null, applicantId ? `applicant_id.eq.${applicantId}` : null].filter(Boolean).join(',')
  const { data: rows, error } = ors ? await s.from('holding_deposits').select('id, hold_no, amount, status, received_on, tenancy_id').or(ors) : { data: [] as any[], error: null }
  if (error && /holding_deposits|does not exist|schema cache/i.test(error.message)) {
    return { amount: typed, source: typed ? 'typed' : 'none', holds: [], problem: null }   // before migration 198: the typed figure is all there is
  }
  const live = ((rows ?? []) as any[]).filter(h => h.status === 'held' || h.status === 'applied')
  const holds = live.map(h => ({ id: h.id, number: h.hold_no ?? null, amount: r2(Number(h.amount)), status: h.status, received: h.received_on ?? null }))
  const registered = r2(holds.reduce((n, h) => n + h.amount, 0))

  let problem: string | null = null
  if (o.tenancyId && live.some(h => !h.tenancy_id)) problem = `Holding deposit ${live.filter(h => !h.tenancy_id).map(h => h.hold_no).join(', ')} is recorded for this applicant but not linked to the tenancy — open it from the letting file to link it.`
  else if (registered && typed && Math.abs(registered - typed) > 0.009) problem = `The holding deposit on record (${holds.map(h => h.number).filter(Boolean).join(', ')}: ${gbp(registered)}) doesn’t match the ${gbp(typed)} typed on the tenancy. Check which is right before any move-in figures go out.`
  else if (!registered && applicantId) {
    // a deposit looks paid but nothing is in the register
    const [{ data: off }, { data: ap }] = await Promise.all([
      s.from('offers').select('status').eq('applicant_id', applicantId).eq('status', 'deposit_paid').limit(1),
      s.from('applicants').select('pipeline_stage').eq('id', applicantId).maybeSingle(),
    ])
    if (((off ?? []) as any[]).length || ['reserved', 'deposit_paid'].includes(String((ap as any)?.pipeline_stage))) {
      problem = typed
        ? null   // a let from before the register: the typed figure stands
        : 'The offer shows a holding deposit was paid, but none is recorded. Record it on the letting file (Holding deposit) before any move-in figures go out.'
    }
  }
  if (registered) return { amount: registered, source: 'register', holds, problem }
  return { amount: typed, source: typed ? 'typed' : 'none', holds, problem }
}
