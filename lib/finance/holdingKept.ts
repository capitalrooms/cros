// A holding deposit the applicant forfeited (they withdrew, or failed referencing) is kept for the landlord, less our
// referencing fee. The fee is £25.00 by default (Harry, 22 Nov 2026) — change it here once landlords' agreements set
// their own amount. Used by the client ledger and the client account, so the two always agree.
export const HOLDING_KEPT_FEE = 25

/** Our fee out of a kept holding deposit: the default, never more than the deposit itself. */
export const keptFee = (amount: number) => Math.min(HOLDING_KEPT_FEE, Math.max(0, Number(amount) || 0))
