// VAT on a cost Capital Rooms pays for a landlord (5 Nov 2026, migration 263). Each landlord has a chosen treatment:
//   'disbursement' — passed on at cost: the landlord is charged exactly the receipt total; the VAT inside it stays the
//                    landlord's (we never reclaim it). HMRC VAT Notice 700 s.25. The default, and the only option
//                    until Capital Rooms is VAT registered.
//   'recharge'     — we reclaim the receipt's VAT and charge the landlord the net cost plus VAT at our rate — what a
//                    VAT-registered landlord can reclaim. With VAT on the receipt the landlord pays the same total; a
//                    receipt with no VAT (an unregistered seller) costs the landlord VAT on top.
// Pure sums, used by the screens (to show what will be charged) and by lib/expenses/create (to save it).

export type VatTreatment = 'disbursement' | 'recharge'
export const VAT_TREATMENTS: { key: VatTreatment; label: string; hint: string }[] = [
  { key: 'disbursement', label: 'At cost (disbursement)', hint: 'They pay exactly what the receipt says. We don’t reclaim the VAT. Best for landlords who aren’t VAT registered.' },
  { key: 'recharge', label: 'Recharge with VAT', hint: 'We reclaim the receipt’s VAT and charge net + VAT, so a VAT-registered landlord can reclaim it. Only once Capital Rooms is VAT registered.' },
]

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** The VAT inside a receipt total at `rate`% — e.g. £15.99 at 20% → £2.67. */
export const vatInside = (total: number, rate = 20) => r2(total * rate / (100 + rate))

/** What the landlord is charged, and the VAT we charge on it, for a receipt total and the VAT shown on the receipt. */
export function chargeFor(receiptTotal: number, vatOnReceipt: number, treatment: VatTreatment, rate = 20): { charged: number; net: number; vatCharged: number } {
  const total = r2(receiptTotal), vin = r2(Math.max(0, Math.min(vatOnReceipt || 0, total)))
  if (treatment === 'disbursement') return { charged: total, net: r2(total - vin), vatCharged: 0 }
  const net = r2(total - vin)
  // a fully standard-rated receipt is recharged at exactly its total (so £15.99 stays £15.99, not £15.98 by rounding)
  if (vin > 0 && Math.abs(vin - vatInside(total, rate)) <= 0.01) return { charged: total, net, vatCharged: vin }
  const vatCharged = r2(net * rate / 100)
  return { charged: r2(net + vatCharged), net, vatCharged }
}
