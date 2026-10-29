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

// Reminders Harry has switched off (29 Oct 2026: "I should be able to silence fire risk assessments"). A silenced type
// still shows on Compliance and the property; it just stops appearing in Today, the dashboard's "Waiting on you",
// Money and the reminder pushes. system_settings 'cert_reminders_off' = comma-separated expiry columns.
export const CERT_REMINDERS_OFF = 'cert_reminders_off'
export const isCertColumn = (c: string) => PROPERTY_CERTIFICATES.some(([col]) => col === c)
export async function quietCertificates(s: { from: (t: string) => any }): Promise<Set<string>> {
  try {
    const { data } = await s.from('system_settings').select('value').eq('key', CERT_REMINDERS_OFF).maybeSingle()
    return new Set(String(data?.value ?? '').split(',').map(x => x.trim()).filter(isCertColumn))
  } catch { return new Set() }
}
/** Should we chase this house about this certificate? Not for a type switched off, and not for the HMO licence
 *  while an application is with the council (the house is covered meanwhile — lib/compliance/hmoLicence). */
export const chaseCert = (p: { licence_application_submitted_at?: string | null }, col: string, quiet: Set<string>) =>
  !quiet.has(col) && !(col === 'license_expiry' && p.licence_application_submitted_at)
