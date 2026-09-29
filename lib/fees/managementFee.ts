// Management fees — one place that decides what fee applies and how much it comes to.
// Set up the way lettings software does it: a default on the property that a tenancy can override, and three kinds:
//   pct_received  % of the rent actually received (Capital Rooms' usual basis)
//   pct_charged   % of the rent due, whether or not it's paid
//   fixed         a fixed £ amount a month
// The tenancy's own fee wins; otherwise the property's. If neither is set the fee is "not set" — never assumed.

export type FeeType = 'pct_received' | 'pct_charged' | 'fixed'
export interface ManagementFee { type: FeeType; pct: number | null; fixed: number | null; source: 'tenancy' | 'property' | 'none' }

type WithFee = { management_fee_type?: string | null; management_fee_pct?: number | string | null; management_fee_fixed?: number | string | null } | null | undefined

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

function fromRow(r: WithFee): Omit<ManagementFee, 'source'> | null {
  if (!r) return null
  const type = (r.management_fee_type as FeeType) || 'pct_received'
  const pct = num(r.management_fee_pct), fixed = num(r.management_fee_fixed)
  if (type === 'fixed') return fixed != null ? { type, pct: null, fixed } : null
  return pct != null ? { type, pct, fixed: null } : null
}

/** The fee for a tenancy: its own override, else the property default, else not set. */
export function resolveFee(tenancy: WithFee, property: WithFee): ManagementFee {
  const own = tenancy && (tenancy.management_fee_type || num(tenancy.management_fee_pct) != null || num(tenancy.management_fee_fixed) != null) ? fromRow(tenancy) : null
  if (own) return { ...own, source: 'tenancy' }
  const prop = fromRow(property)
  if (prop) return { ...prop, source: 'property' }
  return { type: 'pct_received', pct: null, fixed: null, source: 'none' }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** The fee in £ for a period, given the rent received and the rent charged for it. null = no fee set. */
export function feeAmount(fee: ManagementFee, rent: { received: number; charged: number }): number | null {
  if (fee.source === 'none') return null
  if (fee.type === 'fixed') return fee.fixed ?? null
  const base = fee.type === 'pct_charged' ? rent.charged : rent.received
  return r2(base * (fee.pct ?? 0) / 100)
}

export function describeFee(fee: ManagementFee): string {
  if (fee.source === 'none') return 'Not set'
  if (fee.type === 'fixed') return `£${(fee.fixed ?? 0).toFixed(2)} a month`
  return `${fee.pct}% of rent ${fee.type === 'pct_charged' ? 'charged' : 'received'}`
}
