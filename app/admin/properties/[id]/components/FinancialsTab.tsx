'use client'

import PropertyFinancialSummary from '@/app/components/PropertyFinancialSummary'

export default function FinancialsTab({ propertyId }: { propertyId: string }) {
  return <PropertyFinancialSummary propertyId={propertyId} />
}
