// Certificate expiry columns on `properties`, with the label admins know them by.
// Shared by the phone Today and Money screens so both count the same certificates as the desktop dashboard.
export const PROPERTY_CERTIFICATES: [column: string, label: string][] = [
  ['gas_safe_cert_expiry', 'Gas safety'],
  ['electrical_cert_expiry', 'EICR'],
  ['license_expiry', 'HMO licence'],
  ['insurance_expiry', 'Insurance'],
  ['fire_detection_expiry', 'Fire detection'],
  ['emergency_lighting_expiry', 'Emergency lighting'],
  ['pat_test_expiry', 'PAT test'],
  ['fire_risk_assessment_expiry', 'Fire risk assessment'],
  ['epc_expiry', 'EPC'],
]
