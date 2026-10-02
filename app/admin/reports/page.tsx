'use client'

import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'

interface ReportLink {
  label: string
  href?: string
  desc: string
  ready: boolean
}

const FINANCIAL: ReportLink[] = [
  { label: 'Rent Demands',             href: '/admin/reports/rent-demands',      desc: 'Rent due in a date range, with outstanding filter',          ready: true },
  { label: 'Current Tenant Balances',  href: '/admin/reports/tenant-balances',   desc: 'Live arrears and credit per active tenant',                  ready: true },
  { label: 'Making Tax Digital',       href: '/admin/reports/mtd',               desc: 'Quarterly income and expenses per landlord in HMRC’s categories', ready: true },
  { label: 'Tax Year Summary',         href: '/admin/reports/tax-year',          desc: 'April–April (or custom) income and deductions per landlord', ready: true },
  { label: 'Fees',                     href: '/admin/reports/fees',              desc: 'Management and letting fees raised in a date range',         ready: true },
  { label: 'Expenses',                 href: '/admin/reports/expenses',          desc: 'Expenses recorded by property and category',                 ready: true },
  { label: 'Deposits',                 href: '/admin/reports/deposits',          desc: 'Deposits held, protection status and scheme references',     ready: true },
  { label: 'Rent Analysis',            href: '/admin/reports/rent-analysis',     desc: 'Received vs expected breakdown by property, collection rate',ready: true },
  { label: 'Landlord Statements',      href: '/admin/accounts',                  desc: 'Monthly statements per landlord',                            ready: true },
  { label: 'Landlord Income Analysis', href: '/admin/reports/landlord-income',   desc: 'Income and deductions per landlord over time — PDF export',  ready: true },
  { label: 'Cashbook',                 href: '/admin/reports/cashbook',          desc: 'All money in and out for a selected period',                 ready: true },
]

const PROPERTY: ReportLink[] = [
  { label: 'Voids',              href: '/admin/reports/voids',        desc: 'Empty rooms and properties, days void, weekly income lost', ready: true },
  { label: 'Maintenance Jobs',   href: '/admin/reports/maintenance',   desc: 'Job history with status, priority and contractor',          ready: true },
  { label: 'Utility Expiry Dates', href: '/admin/reports/utilities',  desc: 'Gas, electrical, fire detection cert expiries',             ready: true },
]

const TENANCY: ReportLink[] = [
  { label: 'Tenancy Analysis',   href: '/admin/reports/tenancy-analysis', desc: 'Active, on notice, void counts and monthly move chart',   ready: true },
  { label: 'All Lettings',       href: '/admin/reports/all-lettings',     desc: 'Every tenancy with dates, rent, deposit and status',      ready: true },
]

function Section({ title, items }: { title: string; items: ReportLink[] }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">{title}</h2>
      <div className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
        {items.map(r => {
          if (r.ready && r.href) {
            return (
              <Link
                key={r.label}
                href={r.href}
                className="flex items-center justify-between px-xl py-md hover:bg-neutral-50 transition-colors group"
              >
                <div>
                  <p className="text-sm font-semibold text-neutral-900 group-hover:text-indigo-700 transition-colors">{r.label}</p>
                  <p className="text-xs text-neutral-400 mt-xs">{r.desc}</p>
                </div>
                <span className="text-neutral-300 group-hover:text-indigo-400 transition-colors text-lg">›</span>
              </Link>
            )
          }
          return (
            <div key={r.label} className="flex items-center justify-between px-xl py-md opacity-50">
              <div>
                <p className="text-sm font-semibold text-neutral-500">{r.label}</p>
                <p className="text-xs text-neutral-400 mt-xs">{r.desc}</p>
              </div>
              <span className="text-xs text-neutral-300 font-semibold uppercase tracking-wider">Soon</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Reports" />
      <PageHero title="Reports" subtitle="Financial, property and tenancy reports" tabs={financeTabs('reports')} />
      <div className="max-w-6xl mx-auto px-lg py-xl space-y-xl">
        <Section title="Financial" items={FINANCIAL} />
        <Section title="Property management" items={PROPERTY} />
        <Section title="Tenancy" items={TENANCY} />
      </div>
    </div>
  )
}
