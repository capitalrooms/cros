// The services a landlord can instruct us for. Every instruction records one; the agreement
// template, fees, welcome wording and post-AML pipeline stages hang off it. AML onboarding is the
// same for all types.
export type ServiceType = 'full_management' | 'let_only'

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
    id: 'let_only',
    label: 'Let only',
    summary: 'We market the property, find and reference the tenant, arrange the inventory, then pass the deposit and first rent (less our fee) to the landlord.',
    available: false,
  },
]

export const DEFAULT_SERVICE_TYPE: ServiceType = 'full_management'
export const serviceTypeLabel = (id?: string) => SERVICE_TYPES.find(s => s.id === id)?.label ?? 'Full management'
