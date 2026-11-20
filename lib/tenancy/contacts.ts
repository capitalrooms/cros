// The contacts step (19 Nov 2026): after a tenancy agreement is read, list the people whose email or phone is still
// missing, so the office can add them (or find them in Homeppl) before the tenancy is saved.
export interface TenantContactInput { name: string; email?: string | null; phone?: string | null }
export interface MissingContact { name: string; missing: ('email' | 'phone')[] }

export function missingContacts(tenants: TenantContactInput[]): MissingContact[] {
  return tenants.flatMap(t => {
    const missing: ('email' | 'phone')[] = []
    if (!String(t.email ?? '').trim()) missing.push('email')
    if (!String(t.phone ?? '').trim()) missing.push('phone')
    return missing.length ? [{ name: t.name, missing }] : []
  })
}

export interface AgreementTenant { name: string; email: string; phone: string }

/** The tenants the agreement reader found, in order. A reader result with only one person still gives one tenant. */
export function tenantsFromAgreement(x: any): AgreementTenant[] {
  if (Array.isArray(x?.tenants) && x.tenants.length) {
    return x.tenants
      .filter((t: any) => t && String(t.name ?? '').trim())
      .map((t: any) => ({ name: String(t.name).trim(), email: String(t.email ?? '').trim(), phone: String(t.phone ?? '').trim() }))
  }
  return x?.person_name ? [{ name: String(x.person_name).trim(), email: String(x.person_email ?? '').trim(), phone: String(x.person_phone ?? '').trim() }] : []
}
