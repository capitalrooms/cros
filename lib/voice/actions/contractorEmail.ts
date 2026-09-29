/**
 * Contractor/supplier email action handler.
 * Finds contractors from active jobs or by name lookup.
 * Sends styled emails with property context.
 */

export type ContractorRecipientType = 'job_contractor' | 'contractor_by_name' | 'landlord' | 'supplier'

export interface ContractorEmailDetails {
  recipientType: ContractorRecipientType
  contractorName?: string         // e.g. "Mike the plumber", "Bob's Electrics"
  jobType?: string                // e.g. "EICR", "Gas Safety", "Plumbing"
  propertyName?: string
  propertyId?: string
  landlordName?: string
  subject: string
  body: string
  includePropertyDetails?: boolean // auto-add address/property info
}

export function validateContractorEmail(
  details: ContractorEmailDetails
): {
  valid: boolean
  error?: string
  warnings?: string[]
} {
  const warnings: string[] = []

  if (!details.subject || !details.body) {
    return { valid: false, error: 'Subject and body required' }
  }

  if (details.recipientType === 'job_contractor') {
    // Will be validated against active jobs at the API level
    if (!details.propertyId && !details.propertyName) {
      return { valid: false, error: 'Property required to find job contractor' }
    }
    if (!details.jobType) {
      warnings.push('Job type not specified — will look for any active job')
    }
  } else if (details.recipientType === 'contractor_by_name') {
    if (!details.contractorName) {
      return { valid: false, error: 'Contractor name required' }
    }
  } else if (details.recipientType === 'landlord') {
    if (!details.propertyName && !details.propertyId) {
      return { valid: false, error: 'Property required to find landlord' }
    }
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined }
}
