// PATCH /api/accounts/charges/[chargeId] — closed (3 Nov 2026 finance audit). It set a rent charge's status and amount
// received directly, with no receipt number, no audit line and no double-payment check. Money in is recorded through
// the bank import / Matching or the tenant's Money tab (lib/payments/apply), which number and log every payment.
import { NextResponse } from 'next/server'

export async function PATCH() {
  return NextResponse.json({ error: 'This no longer records payments. Use Bank › Matching or the tenant’s Money tab, which give a receipt number and keep the trail.' }, { status: 410 })
}
