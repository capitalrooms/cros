'use client'

// Contractors make their invoices in CROS — see components/SupplierInvoices.tsx.
import { use } from 'react'
import { RoleTabBar, type ContractorTab } from '@/app/components/RoleTabBar'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import SupplierInvoices from '@/components/SupplierInvoices'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

export default function InvoicesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const as = one(sp.as) ?? null
  const job = one(sp.job) ?? null
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/contractor${as ? `?as=${as}` : ''}`} />} />
      <main className="mx-auto max-w-2xl px-4 py-5">
        <h1 className="mb-1 text-2xl font-extrabold text-neutral-900">Invoices</h1>
        <p className="mb-4 text-sm text-neutral-600">A professional invoice in a minute — for our jobs, and for your other clients once all our jobs are booked.</p>
        <SupplierInvoices viewAs={as} jobId={job} />
      </main>
      <RoleTabBar<ContractorTab> role="contractor" active={'invoices'} />
    </div>
  )
}
