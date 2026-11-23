'use client'
// Every rent charge and payment on one tenancy since it began — the pro rata first month, every month after, and the
// money in and out — so the office can check it before acting (Harry, 22 Nov 2026). Read-only. Uses the same statement
// of account as the letting file (lib/finance/tenantAccount), which runs from the tenancy's start date.
import type { AccountLine } from '@/lib/finance/tenantAccount'

const gbp = (n: number | null) => n == null ? '' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ukDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function TenancyPayments({ account }: { account: { lines: AccountLine[]; charged: number; paid: number; balance: number } | null }) {
  if (!account) return <p className="text-sm text-neutral-500">No rent account found for this tenancy.</p>
  const rows = account.lines
  return (
    <section className="rounded-xl border border-neutral-200">
      <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-neutral-100 px-md py-sm">
        <h3 className="text-sm font-bold text-neutral-900">Every payment on this tenancy</h3>
        <p className="text-xs text-neutral-600">Charged {gbp(account.charged)} · Paid {gbp(account.paid)} · <b>{account.balance > 0.005 ? `Owed ${gbp(account.balance)}` : account.balance < -0.005 ? `Credit ${gbp(-account.balance)}` : 'Clear'}</b></p>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-600"><tr><th className="px-md py-xs">Date</th><th className="px-md py-xs">What</th><th className="px-md py-xs text-right">Charged</th><th className="px-md py-xs text-right">Paid</th><th className="px-md py-xs text-right">Balance</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-md py-sm text-neutral-500">No rent charges yet.</td></tr>}
            {rows.map((l, i) => (
              <tr key={i} className="border-t border-neutral-100">
                <td className="whitespace-nowrap px-md py-xs tabular-nums">{ukDate(l.date)}</td>
                <td className="px-md py-xs">{l.details}{l.reference ? <span className="text-neutral-400"> · {l.reference}</span> : null}</td>
                <td className="px-md py-xs text-right tabular-nums">{gbp(l.charged)}</td>
                <td className="px-md py-xs text-right tabular-nums text-green-800">{gbp(l.paid)}</td>
                <td className="px-md py-xs text-right tabular-nums">{gbp(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
