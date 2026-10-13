// Terms for the "Rent collection & client account" agreement: the client company manages the properties and
// tenants; Capital Rooms collects rent, pays agreed fixed outgoings, protects/releases deposits and reports.
// Shared by the agreement screens (client) and the PDF generator (server) — keep this file free of server imports.

/** Which wording: the standard rent collection agreement, or the letting & rent collection version agreed with
 *  Joe Rosen for Wings Properties (13 Oct 2026 — letting is the main service, with a sole letting mandate; monthly
 *  electronic bank statements and portal uploads instead of property statements; year-end help instead of a summary). */
export type RentCollectionVersion = 'standard' | 'letting'
export const RENT_COLLECTION_VERSIONS: { id: RentCollectionVersion; label: string; hint: string }[] = [
  { id: 'standard', label: 'Rent collection only', hint: 'The client manages; we collect rent, pay agreed fixed outgoings, protect and release deposits, inspect and report' },
  { id: 'letting', label: 'Letting & rent collection — Joe Rosen final', hint: 'As agreed with Wings Properties: we let every room the client tells us will be vacant (sole mandate), then collect rent and run the client account; monthly bank statements, documents to their portal' },
]

export interface RentCollectionTerms {
  version: RentCollectionVersion
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
  version: 'standard',
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
    version: t.version === 'letting' ? 'letting' : 'standard',
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

/** Joe Rosen's agreed figures for the letting version — filled in when that version is chosen (only empty boxes). */
export const LETTING_VERSION_DEFAULTS: Partial<RentCollectionTerms> = {
  serviceFee: '5% of the rent received each month',
  floatAmount: 3000,
  lettingFee: '£400 flat fee per room (includes referencing, inventory, producing tenancy paperwork and registering the deposit)',
  fixedOutgoings: ['Water utility bills', 'Electricity and gas bills', 'Service charges', 'Internet', 'Council tax'],
}

/** Switch version, filling Joe's figures into anything still at the standard default or empty. */
export function withVersion(t: RentCollectionTerms, version: RentCollectionVersion): RentCollectionTerms {
  if (version !== 'letting') return { ...t, version }
  const d = RENT_COLLECTION_DEFAULTS, j = LETTING_VERSION_DEFAULTS
  return {
    ...t, version,
    serviceFee: t.serviceFee || j.serviceFee!,
    floatAmount: t.floatAmount === d.floatAmount || !t.floatAmount ? j.floatAmount! : t.floatAmount,
    lettingFee: !t.lettingFee || t.lettingFee === d.lettingFee ? j.lettingFee! : t.lettingFee,
    fixedOutgoings: t.fixedOutgoings.filter(Boolean).length ? t.fixedOutgoings : j.fixedOutgoings!,
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
