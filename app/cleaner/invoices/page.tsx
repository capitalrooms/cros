'use client'

// Cleaners make their invoices in CROS — see components/SupplierInvoices.tsx.
import { use } from 'react'
import Logo from '@/components/Logo'
import BackButton from '@/app/components/BackButton'
import SupplierInvoices from '@/components/SupplierInvoices'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

export default function InvoicesPage({ searchParams }: { searchParams: PageSearchParams }) {
  const as = one(use(searchParams).as) ?? null
  return (
    <div className="min-h-screen bg-neutral-100">
      <nav className="bg-neutral-900 text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BackButton href={`/cleaner${as ? `?as=${as}` : ''}`} />
          <Logo variant="emblem" height={26} invert />
          <span className="w-10" />
        </div>
      </nav>
      <main className="mx-auto max-w-2xl px-4 py-5">
        <h1 className="mb-1 text-2xl font-extrabold text-neutral-900">Invoices</h1>
        <p className="mb-4 text-sm text-neutral-600">One invoice for your cleans over a period, sent to Capital Rooms.</p>
        <SupplierInvoices viewAs={as} />
      </main>
    </div>
  )
}
