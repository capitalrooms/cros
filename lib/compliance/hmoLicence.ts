// HMO licence status, including "application made — waiting for the council". Once an application has been duly
// made the property is covered while the council decides (Housing Act 2004 s.72(4)(b)), so a pending application
// is not an urgent alert even if the old licence's date has passed.
export interface LicenceFields { license_expiry?: string | null; licence_application_submitted_at?: string | null; licence_application_ref?: string | null }

export type LicenceState = 'none' | 'valid' | 'soon' | 'expired' | 'applied'

export function hmoLicenceState(p: LicenceFields, today = new Date().toISOString().slice(0, 10)): { state: LicenceState; label: string; appliedLate: boolean } {
  const applied = p.licence_application_submitted_at || null
  const expiry = p.license_expiry || null
  if (applied) {
    const appliedLate = !!expiry && applied > expiry
    const d = new Date(applied + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return { state: 'applied', label: `Applied ${d} — awaiting council${p.licence_application_ref ? ` (ref ${p.licence_application_ref})` : ''}`, appliedLate }
  }
  if (!expiry) return { state: 'none', label: 'No licence recorded', appliedLate: false }
  const days = Math.floor((Date.parse(expiry) - Date.parse(today)) / 86_400_000)
  if (days < 0) return { state: 'expired', label: `Expired ${Math.abs(days)} days ago`, appliedLate: false }
  if (days <= 90) return { state: 'soon', label: `Expires in ${days} days`, appliedLate: false }
  return { state: 'valid', label: `Valid for ${days} days`, appliedLate: false }
}

/** True while an application is with the council — expiry alerts for the licence are held back. */
export const licenceApplicationPending = (p: LicenceFields) => !!p.licence_application_submitted_at

/** Properties with a licence application waiting at the council. Tolerant: before migration 196 it finds none. */
export async function pendingLicenceIds(s: { from: (t: string) => any }): Promise<Set<string>> {
  try {
    const { data, error } = await s.from('properties').select('id').not('licence_application_submitted_at', 'is', null)
    return error ? new Set() : new Set(((data ?? []) as { id: string }[]).map(r => r.id))
  } catch { return new Set() }
}
