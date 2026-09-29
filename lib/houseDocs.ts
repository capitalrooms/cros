// "New certificates" email to everyone living in a house — Harry's "Your Health & Safety Certificates" email,
// in the house style: which certificates were done, when each is next due, a link to each, sent to every
// current tenant individually (so nobody sees anyone else's email address).
import type { SupabaseClient } from '@supabase/supabase-js'
import { tableRow } from '@/lib/emailWrapper'
import { fullAddress } from '@/lib/quotes/quoteRequest'
import { parseTenancyDate, ukLongDate } from '@/lib/tenancy/firstRent'

// expiry = the property's expiry column; done + months = when only the test date is recorded, the next due
// date is that plus the usual interval (same rule as the Compliance certificates grid)
export const HOUSE_DOCS: { key: string; label: string; types: string[]; expiry?: string; done?: string; months?: number }[] = [
  { key: 'gas', label: 'Gas safety', types: ['gas_safety_certificate'], expiry: 'gas_safe_cert_expiry', done: 'gas_safe_cert_date', months: 12 },
  { key: 'eicr', label: 'Electrical safety (EICR)', types: ['electrical_eicr', 'eicr', 'electrical_certificate'], expiry: 'electrical_cert_expiry', done: 'electrical_cert_date', months: 60 },
  { key: 'fire_alarm', label: 'Fire detection', types: ['fire_alarm_certificate', 'fire_detection_certificate'], expiry: 'fire_detection_expiry', done: 'fire_detection_test_date', months: 12 },
  { key: 'emergency_lighting', label: 'Emergency lighting', types: ['emergency_lighting_certificate'], expiry: 'emergency_lighting_expiry', done: 'emergency_lighting_test_date', months: 12 },
  { key: 'pat', label: 'PAT testing', types: ['pat_test'], expiry: 'pat_test_expiry', done: 'pat_test_date', months: 12 },
  { key: 'fire_risk', label: 'Fire risk assessment', types: ['fire_risk_assessment'], expiry: 'fire_risk_assessment_expiry', done: 'fire_risk_assessment_date', months: 12 },
  { key: 'epc', label: 'Energy performance certificate (EPC)', types: ['epc'], expiry: 'epc_expiry' },
  { key: 'hmo_licence', label: 'HMO licence', types: ['hmo_licence'], expiry: 'license_expiry', done: 'license_date', months: 60 },
]

function nextDue(prop: Record<string, any>, d: (typeof HOUSE_DOCS)[number]): string | null {
  if (d.expiry && prop[d.expiry]) return String(prop[d.expiry]).slice(0, 10)
  if (!d.done || !d.months || !prop[d.done]) return null
  const x = new Date(String(prop[d.done]).slice(0, 10) + 'T12:00:00'); x.setMonth(x.getMonth() + d.months)
  return x.toISOString().slice(0, 10)
}

export interface HouseDoc { key: string; label: string; url: string | null; uploadedAt: string | null; nextDue: string | null; recent: boolean }
export interface HouseTenant { personId: string; name: string; firstName: string; email: string; room: string }

const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function loadHouse(s: SupabaseClient, propertyId: string) {
  const today = iso(new Date())
  const { data: prop } = await s.from('properties').select('*').eq('id', propertyId).maybeSingle()
  if (!prop) return null
  const [{ data: docs }, { data: lets }] = await Promise.all([
    s.from('property_documents').select('document_type, storage_url, uploaded_at').eq('property_id', propertyId).order('uploaded_at', { ascending: false }),
    s.from('tenancies').select('id, person_id, co_tenant_id, rooms(name), people!person_id(id, first_name, last_name, full_name, email)')
      .eq('property_id', propertyId).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
  ])
  const sixtyDaysAgo = iso(new Date(Date.now() - 60 * 86_400_000))
  const documents: HouseDoc[] = HOUSE_DOCS.map(d => {
    const doc = (docs ?? []).find((x: any) => d.types.includes(String(x.document_type)))
    return {
      key: d.key, label: d.label, url: doc?.storage_url ?? null, uploadedAt: doc?.uploaded_at ?? null,
      nextDue: nextDue(prop, d),
      recent: !!doc?.uploaded_at && String(doc.uploaded_at).slice(0, 10) >= sixtyDaysAgo,   // pre-ticked
    }
  })
  const seen = new Set<string>()
  const tenants: HouseTenant[] = []
  for (const t of (lets ?? []) as any[]) {
    const p = t.people
    if (!p?.email || seen.has(p.id)) continue
    seen.add(p.id)
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email
    tenants.push({ personId: p.id, name, firstName: p.first_name || name.split(' ')[0], email: p.email, room: t.rooms?.name ?? '' })
  }
  tenants.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
  return { property: { id: prop.id, name: prop.name, address: fullAddress(prop.name, prop.address, prop.postcode) }, documents, tenants }
}

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const dueText = (d: string | null) => { const x = parseTenancyDate(d); return x ? `next due ${ukLongDate(x)}` : '' }

export const defaultHouseSubject = (address: string) => `Your Health & Safety Certificates — ${address.split(',')[0]}`
export const defaultHouseMessage = 'We are pleased to let you know the following health and safety certificates have now been completed at your home.'

export function houseEmailHtml(firstName: string, address: string, docs: HouseDoc[], message: string) {
  const rows = docs.map(d => tableRow(esc(d.label),
    `${d.url ? `<a href="${esc(d.url)}" style="color:#1a1a1a;">View certificate</a>` : 'To follow'}${d.nextDue ? ` <span style="color:#78716c;font-weight:400;">· ${dueText(d.nextDue)}</span>` : ''}`)).join('')
  return `
    <p>Dear ${esc(firstName)},</p>
    ${esc(message).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
    <p><strong>${esc(address)}</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0 18px;">${rows}</table>
    <p>Should you have any questions, please do not hesitate to get in touch.</p>`
}
