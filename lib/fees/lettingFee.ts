// The let-only letting fee for a house (30 Oct 2026): the client (landlord) sets it once and it feeds down to all their
// let-only houses; a house can have its own instead. A tenancy's recorded fee (letting_fee_charged) beats both.
export type FeeRule = { pct: number | null; flat: number | null; from: 'house' | 'landlord' | null }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

export function lettingFeeRule(house: any, landlord: any): FeeRule {
  const hp = num(house?.letting_fee_pct), hf = num(house?.letting_fee_flat)
  if (hp != null || hf != null) return { pct: hp, flat: hf, from: 'house' }
  const lp = num(landlord?.letting_fee_pct), lf = num(landlord?.letting_fee_flat)
  if (lp != null || lf != null) return { pct: lp, flat: lf, from: 'landlord' }
  return { pct: null, flat: null, from: null }
}
