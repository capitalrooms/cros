// TypeScript types for the Capital Rooms Rental Valuation PDF generator.
// The old @react-pdf/renderer component has been replaced with pdfkit (see generatePDF.ts).

export type PriceRow = {
  label: string
  low: number
  high: number
  notes?: string
}

export type RefurbItem = {
  category: string
  description: string
  estimatedCost: number
}

export type ValuationType =
  | 'single_let_current'
  | 'single_let_improvements'
  | 'hmo_current'
  | 'hmo_improvements'

export type ValuationData = {
  type: ValuationType
  recipientName: string
  recipientAddress: string[]
  propertyAddress: string
  propertyRef?: string
  openingParagraph: string
  closingParagraph: string
  rooms: PriceRow[]
  currency?: string
  refurbTier?: 'light' | 'selective' | 'extensive'
  refurbItems?: RefurbItem[]
  refurbNotes?: string
  singleLetLow?: number
  singleLetHigh?: number
  grossYieldHmo?: number
  grossYieldSingleLet?: number
  investmentNotes?: string
  preparedBy?: string
  letterDate?: string
  disclaimer?: string
}
