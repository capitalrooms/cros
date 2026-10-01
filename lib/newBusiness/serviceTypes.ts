// The services a landlord can instruct us for. Every instruction records one; the agreement
// template, fees, welcome wording and post-AML pipeline stages hang off it. AML onboarding is the
// same for all types.
export type ServiceType = 'full_management' | 'rent_collection' | 'let_only'

export interface ServiceTypeDef {
  id: ServiceType
  label: string
  summary: string
  available: boolean
}

export const SERVICE_TYPES: ServiceTypeDef[] = [
  {
    id: 'full_management',
    label: 'Full management',
    summary: 'We let and manage the property: rent collection, maintenance, compliance and statements.',
    available: true,
  },
  {
    id: 'rent_collection',
    label: 'Rent collection',
    summary: 'The client manages its properties and tenants; we collect rent into the client account, pay agreed fixed outgoings, protect and release deposits, inspect and report monthly.',
    available: true,
  },
  {
    id: 'let_only',
    label: 'Let only',
    summary: 'We market the property, find and reference the tenant, arrange the inventory, then pass the deposit and first rent (less our fee) to the landlord.',
    available: false,
  },
]

export const DEFAULT_SERVICE_TYPE: ServiceType = 'full_management'
export const serviceTypeLabel = (id?: string) => SERVICE_TYPES.find(s => s.id === id)?.label ?? 'Full management'
