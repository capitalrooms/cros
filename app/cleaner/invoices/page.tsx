'use client'

// Cleaners make their invoices in CROS — see components/SupplierInvoices.tsx.
import { use } from 'react'
import { RoleTabBar, type CleanerTab } from '@/app/components/RoleTabBar'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import SupplierInvoices from '@/components/SupplierInvoices'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

export default function InvoicesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const as = one(use(searchParams).as) ?? null
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href={`/cleaner${as ? `?as=${as}` : ''}`} />} />
      <main className="mx-auto max-w-2xl px-4 py-5">
        <h1 className="mb-1 text-2xl font-extrabold text-neutral-900">Invoices</h1>
        <p className="mb-4 text-sm text-neutral-600">One invoice for your cleans over a period, sent to Capital Rooms.</p>
        <SupplierInvoices viewAs={as} />
      </main>
      <RoleTabBar<CleanerTab> role="cleaner" active={null} />
    </div>
  )
}
