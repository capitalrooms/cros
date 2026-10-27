// A certificate filed as a document sets the house's certificate dates (27 Oct 2026, Harry: "recently filed certs are
// showing as missing on 95 Rope Street… this is basic stuff"). The general "upload a document" drawer (property
// Documents tab, property documents page, letting file, tenant profile) saved the file only; compliance reads the
// dates on the house, so the house still showed the certificate as missing. Now any certificate filed that way — or
// already on file while the house's dates are empty — has its dates read and put on the house. A date is only ever
// moved later, never back to an older certificate. Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { scanDocument } from '@/lib/scan-engine'
import { fetchStored } from '@/lib/files/server'

type Cert = { scan: string; issue?: string; expiry: string; years: number; rating?: string }
/** property_documents.document_type → the house's columns, and how long one lasts if only the issue date is known */
export const CERT_COLUMNS: Record<string, Cert> = {
  gas_safety_certificate: { scan: 'gas_safety_certificate', issue: 'gas_safe_cert_date', expiry: 'gas_safe_cert_expiry', years: 1 },
  electrical_eicr:      { scan: 'electrical_eicr', issue: 'electrical_cert_date', expiry: 'electrical_cert_expiry', years: 5 },
  gas_safety:           { scan: 'gas_safety_certificate', issue: 'gas_safe_cert_date', expiry: 'gas_safe_cert_expiry', years: 1 },
  electrical_cert:      { scan: 'electrical_eicr', issue: 'electrical_cert_date', expiry: 'electrical_cert_expiry', years: 5 },
  epc:                  { scan: 'epc', expiry: 'epc_expiry', years: 10, rating: 'epc_rating' },
  fire_risk_assessment: { scan: 'fire_risk_assessment', issue: 'fire_risk_assessment_date', expiry: 'fire_risk_assessment_expiry', years: 1 },
  insurance_policy:     { scan: 'insurance', expiry: 'insurance_expiry', years: 1 },
  insurance:            { scan: 'insurance', expiry: 'insurance_expiry', years: 1 },
  hmo_licence:          { scan: 'hmo_licence', issue: 'license_date', expiry: 'license_expiry', years: 5 },
}
export const isCertType = (t: string) => t in CERT_COLUMNS

const ISO = /^\d{4}-\d{2}-\d{2}$/
const plusYears = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10) }

/** Put a certificate's dates on the house (only ever later). Says what changed. */
export async function applyCertDates(s: SupabaseClient, propertyId: string, docType: string, got: { issue?: string | null; expiry?: string | null; rating?: string | null }) {
  const c = CERT_COLUMNS[docType]
  if (!c || !propertyId) return { updated: false, why: 'not a certificate' }
  const issue = got.issue && ISO.test(got.issue) ? got.issue : null
  const expiry = got.expiry && ISO.test(got.expiry) ? got.expiry : issue ? plusYears(issue, c.years) : null
  if (!expiry) return { updated: false, why: 'no dates found on the certificate' }
  const { data: h } = await s.from('properties').select(`${c.expiry}`).eq('id', propertyId).maybeSingle()
  const current = (h as any)?.[c.expiry] as string | null
  if (current && String(current).slice(0, 10) >= expiry) return { updated: false, why: 'the house already has this or a later certificate' }
  const patch: Record<string, unknown> = { [c.expiry]: expiry }
  if (c.issue && issue) patch[c.issue] = issue
  if (c.rating && got.rating && /^[A-G]$/i.test(got.rating.trim())) patch[c.rating] = got.rating.trim().toUpperCase()
  const { error } = await s.from('properties').update(patch).eq('id', propertyId)
  return error ? { updated: false, why: error.message } : { updated: true, expiry }
}

/** Read a filed certificate's dates (AI, first pages) and put them on the house. */
export async function readCertDocument(s: SupabaseClient, doc: { property_id: string; document_type: string; storage_url: string; file_name?: string | null }) {
  const c = CERT_COLUMNS[doc.document_type]
  if (!c || !doc.storage_url) return { updated: false, why: 'not a certificate' }
  const r = await fetchStored(doc.storage_url)
  if (!r.ok) return { updated: false, why: `the file couldn’t be opened (${r.status})` }
  const bytes = Buffer.from(await r.arrayBuffer())
  const mime = r.headers.get('content-type') || (/\.pdf$/i.test(doc.file_name ?? '') ? 'application/pdf' : 'image/jpeg')
  const res: any = await scanDocument(bytes, mime, { knownDocType: c.scan as any })
  return applyCertDates(s, doc.property_id, doc.document_type, { issue: res?.issue_date || res?.certified_date, expiry: res?.expiry_date, rating: res?.epc_rating })
}

/** Certificates on file whose dates aren't on the house yet (e.g. filed before 27 Oct 2026): read and apply them. */
export async function healPropertyCerts(s: SupabaseClient, propertyId?: string | null, limit = 8) {
  const cols = Object.values(CERT_COLUMNS).map(c => c.expiry)
  let q = s.from('properties').select(`id, ${cols.join(', ')}`)
  if (propertyId) q = q.eq('id', propertyId)
  const { data: houses } = await q
  const out: { propertyId: string; type: string; result: any }[] = []
  for (const h of (houses ?? []) as any[]) {
    const missing = Object.entries(CERT_COLUMNS).filter(([, c]) => !h[c.expiry]).map(([t]) => t)
    if (!missing.length) continue
    const { data: docs } = await s.from('property_documents').select('property_id, document_type, storage_url, file_name, created_at')
      .eq('property_id', h.id).in('document_type', missing).order('created_at', { ascending: false })
    const latest = new Map<string, any>()
    for (const d of (docs ?? []) as any[]) if (!latest.has(d.document_type)) latest.set(d.document_type, d)
    for (const [type, d] of latest) {
      if (out.length >= limit) return out
      out.push({ propertyId: h.id, type, result: await readCertDocument(s, d).catch((e: any) => ({ updated: false, why: e?.message ?? 'read failed' })) })
    }
  }
  return out
}
