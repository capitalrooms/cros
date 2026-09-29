// How a payment compares with what's owed — "paid £800, expected £825" at a glance.
export interface PaymentFit { tone: 'exact' | 'short' | 'over'; label: string; diff: number }

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function paymentFit(amount: number, owed: number): PaymentFit {
  const diff = Math.round((Number(amount) - Number(owed)) * 100) / 100
  if (Math.abs(diff) < 0.01) return { tone: 'exact', diff: 0, label: `Exactly the ${gbp(owed)} owed` }
  if (owed <= 0) return { tone: 'over', diff, label: 'Already paid up — this goes to older arrears or next month' }
  return diff < 0
    ? { tone: 'short', diff, label: `${gbp(-diff)} short of the ${gbp(owed)} owed` }
    : { tone: 'over', diff, label: `${gbp(diff)} more than the ${gbp(owed)} owed — the rest goes to older arrears or next month` }
}

export const FIT_CLASS: Record<PaymentFit['tone'], string> = {
  exact: 'text-green-700',
  short: 'text-amber-700',
  over: 'text-blue-700',
}
