// Work out each property's standard management fee, and any tenancy on a different fee, from the latest landlord
// statement imported for it (the fees actually charged per room). Used by Health Check to fill fees in properly.
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveFee, describeFee, type ManagementFee } from '@/lib/fees/managementFee'

export interface FeeFix { kind: 'property' | 'tenancy'; id: string; label: string; from: string; to: string; set: Record<string, unknown> }

const r2 = (n: number) => Math.round(n * 100) / 100
type Fee = { type: 'pct_received' | 'fixed'; pct: number | null; fixed: number | null }
const same = (a: Fee, b: ManagementFee) => a.type === (b.type === 'pct_charged' ? 'x' : b.type) && (a.type === 'fixed' ? a.fixed === b.fixed : a.pct === b.pct)
const text = (f: Fee) => f.type === 'fixed' ? `£${f.fixed?.toFixed(2)} a month` : `${f.pct}% of rent received`

export async function feeFixesFromStatements(s: SupabaseClient): Promise<FeeFix[]> {
  const [{ data: sts }, { data: props }] = await Promise.all([
    s.from('landlord_statements').select('id, property_id, statement_date, statement_reference').order('statement_date', { ascending: false }),
    s.from('properties').select('*'),
  ])
  const latest = new Map<string, any>()
  for (const st of (sts ?? []) as any[]) if (!latest.has(st.property_id)) latest.set(st.property_id, st)
  if (!latest.size) return []
  const { data: lines } = await s.from('landlord_statement_rooms')
    .select('statement_id, tenancy_id, room_number, tenant_name, rent_income, management_fee, tenancies(id, management_fee_type, management_fee_pct, management_fee_fixed)')
    .in('statement_id', [...latest.values()].map(x => x.id))
  const fixes: FeeFix[] = []
  for (const p of (props ?? []) as any[]) {
    const st = latest.get(p.id)
    if (!st) continue
    const rows = ((lines ?? []) as any[]).filter(l => l.statement_id === st.id && Number(l.rent_income) > 0)
    // each room's fee as charged: a clean % (to the half per cent) of the rent, otherwise a fixed £ amount
    const feeOf = (l: any): Fee => {
      const pct = Number(l.management_fee) / Number(l.rent_income) * 100
      const half = Math.round(pct * 2) / 2
      return Math.abs(pct - half) < 0.06 ? { type: 'pct_received', pct: half, fixed: null } : { type: 'fixed', pct: null, fixed: r2(Number(l.management_fee)) }
    }
    const pcts = rows.map(feeOf).filter(f => f.type === 'pct_received').map(f => f.pct as number)
    if (!pcts.length) continue
    const counts = new Map<number, number>(); pcts.forEach(x => counts.set(x, (counts.get(x) ?? 0) + 1))
    const standard: Fee = { type: 'pct_received', pct: [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0], fixed: null }
    const propFee = resolveFee(null, p)
    const pname = String(p.name || '').split('\n')[0]
    if (!same(standard, propFee)) fixes.push({ kind: 'property', id: p.id, label: `${pname} — standard fee`, from: describeFee(propFee), to: text(standard),
      set: { management_fee_type: 'pct_received', management_fee_pct: standard.pct, management_fee_fixed: null } })
    for (const l of rows) {
      if (!l.tenancy_id || !l.tenancies) continue
      const f = feeOf(l)
      const differs = f.type !== 'pct_received' || f.pct !== standard.pct
      const cur = resolveFee(l.tenancies, { management_fee_type: 'pct_received', management_fee_pct: standard.pct })
      if (differs && !same(f, cur)) fixes.push({ kind: 'tenancy', id: l.tenancy_id, label: `${pname} — Room ${l.room_number} (${l.tenant_name})`, from: describeFee(cur), to: `${text(f)} (as on ${st.statement_reference})`,
        set: { management_fee_type: f.type, management_fee_pct: f.pct, management_fee_fixed: f.fixed } })
      if (!differs && cur.source === 'tenancy') fixes.push({ kind: 'tenancy', id: l.tenancy_id, label: `${pname} — Room ${l.room_number} (${l.tenant_name})`, from: describeFee(cur), to: 'the property’s standard fee',
        set: { management_fee_type: null, management_fee_pct: null, management_fee_fixed: null } })
    }
  }
  return fixes
}
