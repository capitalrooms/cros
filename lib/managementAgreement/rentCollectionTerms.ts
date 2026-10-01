// Terms for the "Rent collection & client account" agreement: the client company manages the properties and
// tenants; Capital Rooms collects rent, pays agreed fixed outgoings, protects/releases deposits and reports.
// Shared by the agreement screens (client) and the PDF generator (server) — keep this file free of server imports.

export interface RentCollectionTerms {
  signatoryName: string        // person signing for the client, e.g. the company director
  signatoryRole: string        // e.g. "Director"
  serviceFee: string           // as typed, e.g. "£450 per month for all three properties"
  floatAmount: number          // working float held in the client account
  floatTopUpDays: number       // days the client has to pay a shortfall
  fixedOutgoings: string[]     // Schedule 2, one per line, e.g. "Thames Water — 12 St David's Square"
  inspectionMonths: number     // inspection interval
  visitFee: number             // per visit outside lettings and inspections
  lettingFee: string           // as typed
  excludedMatters: string      // matters before commencement that stay with the client (optional)
}

export const RENT_COLLECTION_DEFAULTS: RentCollectionTerms = {
  signatoryName: '',
  signatoryRole: 'Director',
  serviceFee: '',
  floatAmount: 1500,
  floatTopUpDays: 7,
  fixedOutgoings: [],
  inspectionMonths: 6,
  visitFee: 50,
  lettingFee: 'Price agreed in writing before each letting',
  excludedMatters: '',
}

export function rentCollectionTermsFrom(v: unknown): RentCollectionTerms {
  const t = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof RentCollectionTerms, unknown>>
  const d = RENT_COLLECTION_DEFAULTS
  const num = (x: unknown, fallback: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : fallback)
  const str = (x: unknown, fallback: string, max = 2000) => (typeof x === 'string' ? x.trim().slice(0, max) : fallback)
  return {
    signatoryName: str(t.signatoryName, d.signatoryName, 200),
    signatoryRole: str(t.signatoryRole, d.signatoryRole, 100) || d.signatoryRole,
    serviceFee: str(t.serviceFee, d.serviceFee, 300),
    floatAmount: num(t.floatAmount, d.floatAmount),
    floatTopUpDays: num(t.floatTopUpDays, d.floatTopUpDays) || d.floatTopUpDays,
    fixedOutgoings: (Array.isArray(t.fixedOutgoings) ? t.fixedOutgoings : [])
      .map(x => String(x).trim()).filter(Boolean).slice(0, 50),
    inspectionMonths: num(t.inspectionMonths, d.inspectionMonths) || d.inspectionMonths,
    visitFee: num(t.visitFee, d.visitFee),
    lettingFee: str(t.lettingFee, d.lettingFee, 300) || d.lettingFee,
    excludedMatters: str(t.excludedMatters, d.excludedMatters),
  }
}

/** What's missing before the agreement can be produced; empty when ready. */
export function rentCollectionProblems(t: RentCollectionTerms): string[] {
  const p: string[] = []
  if (!t.signatoryName) p.push('Enter who signs for the client')
  if (!t.serviceFee) p.push('Enter the service fee')
  if (!t.fixedOutgoings.length) p.push('List at least one agreed fixed outgoing')
  return p
}
