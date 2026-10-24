// The names of document types, for every screen that lists documents (24 Oct 2026 — several lists showed raw codes
// such as "gas_safety_certificate"). docTypeLabel never shows a code: an unlisted type still reads as words.
/** A type's name — any code without a label still reads as words ("boiler_service" → "Boiler service"). */
export const docTypeLabel = (t: string | null | undefined) => (t && DOC_TYPE_LABELS[t]) || (t ? t.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Document')
export { fullDatesIn } from '@/lib/fullDates'

export const DOC_TYPE_LABELS: Record<string, string> = {
  tenancy_agreement: 'Tenancy Agreement',
  gas_safety: 'Gas Safety Certificate',
  electrical_cert: 'EICR',
  epc: 'EPC',
  fire_risk_assessment: 'Fire Risk Assessment',
  inventory: 'Inventory',
  right_to_rent: 'Right to Rent',
  deposit_certificate: 'Deposit Certificate',
  how_to_rent: 'How to Rent Guide',
  reference_report: 'Reference Report',
  id_proof: 'ID Proof',
  employment_letter: 'Employment Letter',
  floor_plan: 'Floor Plan',
  insurance_policy: 'Insurance Policy',
  hmo_licence: 'HMO Licence',
  management_agreement: 'Management Agreement',
  evacuation_plan: 'Evacuation Plan',
  emergency_contacts: 'Emergency Contacts',
  house_rules: 'House Rules',
  safety_info: 'Safety Information',
  utility_info: 'Utilities Info',
  other: 'Other',
  // types in use that had no label, so their raw codes showed (24 Oct 2026)
  gas_safety_certificate: 'Gas Safety Certificate',
  electrical_eicr: 'EICR',
  fire_alarm_certificate: 'Fire Alarm Certificate',
  emergency_lighting_certificate: 'Emergency Lighting Certificate',
  pat_test: 'PAT Test Certificate',
  council_correspondence: 'Council Correspondence',
  property_photo: 'Property Photo',
  landlord_statement_tenant: 'Landlord Statement',
  tenant_reference: 'Tenant Reference',
  safety_check_sheet: 'Safety Check Sheet',
  utility_bill: 'Utility Bill',
}
