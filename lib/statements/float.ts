// The float on a statement (migration 195): keep money back until the property's float reaches its target, or use
// the float to cover a month where fees and expenses are more than the rent. Pure, so the preview on screen and
// the server that makes the statement always agree.
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface FloatPlan { retained: number; used: number; net: number; short: number }

/** preNet = rent − fees − expenses, before any float. */
export function planFloat(preNet: number, target: number, balance: number, skipTopUp = false): FloatPlan {
  const pre = r2(preNet), t = Math.max(0, r2(target)), b = Math.max(0, r2(balance))
  if (pre < 0) {
    const used = r2(Math.min(b, -pre))
    return { retained: 0, used, net: r2(pre + used), short: r2(Math.max(0, -(pre + used))) }
  }
  const retained = skipTopUp ? 0 : r2(Math.min(Math.max(0, t - b), pre))
  return { retained, used: 0, net: r2(pre - retained), short: 0 }
}
