// "Your documents" in the landlord app (21 Oct 2026, Harry: "let only landlords could open the app to download
// [past] statements and agreements and invoices from us"). Everything for the landlord's own houses, and nothing else:
//   lettings statements — one per let-only let (made fresh from the letting file, lib/lettingsStatement)
//   tenancy agreements  — the house's documents marked as a tenancy agreement
//   invoices & letters  — what we've sent them from Letters & Invoices (not tenants' receipts)
//   certificates        — gas, electrics, EPC, HMO licence and the fire-safety set, for managed houses
import { placeLabel, isWholeLet } from '@/lib/lettings/letWording'
import type { SupabaseClient } from '@supabase/supabase-js'
import { displayName } from '@/lib/people'
import type { NextRequest } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'

export const CERT_TYPES: Record<string, string> = {
  gas_safety_certificate: 'Gas safety certificate', gas_safety: 'Gas safety certificate', electrical_eicr: 'Electrical safety report (EICR)', electrical_cert: 'Electrical safety report (EICR)', epc: 'Energy performance certificate (EPC)',
  hmo_licence: 'HMO licence', fire_alarm_certificate: 'Fire alarm certificate', emergency_lighting_certificate: 'Emergency lighting certificate',
  pat_test: 'Portable appliance test (PAT)', fire_risk_assessment: 'Fire risk assessment',
}

export interface LandlordDoc { type: 'pd' | 'gd' | 'ls'; id: string; title: string; property: string; date: string | null; extra?: string }

const house = (p: any) => String(p?.name || p?.address || 'Your property').split('\n')[0]

/** The landlord's houses (a joint landlord is on the same record). */
export async function landlordHouses(s: SupabaseClient, landlordId: string) {
  const { data } = await s.from('properties').select('id, name, address, letting_type, is_demo').eq('landlord_id', landlordId)
  return (data ?? []) as any[]
}

export async function documentsFor(s: SupabaseClient, landlordId: string) {
  const houses = await landlordHouses(s, landlordId)
  const ids = houses.map(h => h.id)
  const byId = new Map(houses.map(h => [h.id, h]))
  if (!ids.length) return { houses: [], statements: [], agreements: [], invoices: [], certificates: [] }
  const { data: me } = await s.from('people').select('email, joint_email').eq('id', landlordId).maybeSingle() as { data: any }
  const emails = [me?.email, me?.joint_email].filter(Boolean).map((e: string) => e.toLowerCase())

  const [{ data: lets }, { data: docs }, { data: gen }] = await Promise.all([
    s.from('tenancies').select('id, property_id, start_date, rent_amount, let_cancelled_at, rooms(name), people!person_id(salutation, first_name, last_name, full_name)')
      .in('property_id', ids).is('let_cancelled_at', null).order('start_date', { ascending: false }),
    s.from('property_documents').select('id, property_id, document_type, file_name, description, uploaded_at, created_at').in('property_id', ids).order('created_at', { ascending: false }),
    s.from('generated_documents').select('id, kind, number, title, property_id, recipient_email, total, created_at, emailed_at').is('deleted_at', null).in('kind', ['invoice', 'letter']).order('created_at', { ascending: false }).limit(500),
  ])

  const statements: LandlordDoc[] = ((lets ?? []) as any[])
    .filter(t => byId.get(t.property_id)?.letting_type === 'let_only' && Number(t.rent_amount) > 0)
    .map(t => ({ type: 'ls', id: t.id, title: `Lettings statement — ${displayName(t.people)}`, property: placeLabel(isWholeLet(byId.get(t.property_id)?.property_type, t.rooms?.name), t.rooms?.name, house(byId.get(t.property_id))), date: t.start_date, extra: 'moving in' }))

  const agreements: LandlordDoc[] = [], certificates: LandlordDoc[] = [], pastStatements: LandlordDoc[] = [], pastInvoices: LandlordDoc[] = []
  for (const d of (docs ?? []) as any[]) {
    const named = (fallback: string) => d.description || d.file_name || fallback
    const row: LandlordDoc = { type: 'pd', id: d.id, title: CERT_TYPES[d.document_type] ?? named('Document'), property: house(byId.get(d.property_id)), date: String(d.uploaded_at || d.created_at || '').slice(0, 10) || null }
    if (d.document_type === 'tenancy_agreement') agreements.push({ ...row, title: named('Tenancy agreement') })
    else if (d.document_type === 'management_agreement') agreements.push({ ...row, title: named('Management agreement') })
    else if (d.document_type === 'lettings_statement') pastStatements.push({ ...row, title: named('Lettings statement') })
    else if (d.document_type === 'landlord_invoice') pastInvoices.push({ ...row, title: named('Invoice') })
    else if (CERT_TYPES[d.document_type] && byId.get(d.property_id)?.letting_type !== 'let_only') certificates.push(row)
  }

  const invoices: LandlordDoc[] = ((gen ?? []) as any[])
    .filter(g => (g.property_id && byId.has(g.property_id)) || (g.recipient_email && emails.includes(String(g.recipient_email).toLowerCase())))
    .map(g => ({ type: 'gd', id: g.id, title: `${g.kind === 'invoice' ? 'Invoice' : 'Letter'}${g.number ? ` ${g.number}` : ''}${g.title ? ` — ${g.title}` : ''}`, property: g.property_id ? house(byId.get(g.property_id)) : '', date: String(g.emailed_at || g.created_at || '').slice(0, 10) || null, extra: g.total != null && g.kind === 'invoice' ? `£${Number(g.total).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : undefined }))

  return { houses: houses.map(h => ({ id: h.id, name: house(h), lettingType: h.letting_type })), statements: [...statements, ...pastStatements], agreements, invoices: [...invoices, ...pastInvoices], certificates }
}

/** Is this document one of this landlord's? (the opener checks before any file is handed out) */
export async function ownsDoc(s: SupabaseClient, landlordId: string, type: string, id: string): Promise<boolean> {
  const ids = new Set((await landlordHouses(s, landlordId)).map(h => h.id))
  if (type === 'ls') { const { data } = await s.from('tenancies').select('property_id, properties(letting_type)').eq('id', id).maybeSingle() as { data: any }; return !!data && ids.has(data.property_id) && data.properties?.letting_type === 'let_only' }
  if (type === 'pd') { const { data } = await s.from('property_documents').select('property_id').eq('id', id).maybeSingle() as { data: any }; return !!data && ids.has(data.property_id) }
  if (type === 'gd') {
    const { data } = await s.from('generated_documents').select('property_id, recipient_email, kind, deleted_at').eq('id', id).maybeSingle() as { data: any }
    if (!data || data.deleted_at || !['invoice', 'letter'].includes(data.kind)) return false
    if (data.property_id && ids.has(data.property_id)) return true
    const { data: me } = await s.from('people').select('email, joint_email').eq('id', landlordId).maybeSingle() as { data: any }
    return [me?.email, me?.joint_email].filter(Boolean).map((e: string) => e.toLowerCase()).includes(String(data.recipient_email ?? '').toLowerCase())
  }
  return false
}

/** The landlord a request is for: the signed-in landlord, or — for an administrator viewing as one — ?as=<personId>. */
export async function landlordFor(req: NextRequest): Promise<string | null> {
  const c = await requireSignedIn(req)
  if (!c) return null
  const as = req.nextUrl.searchParams.get('as')
  if (as && ['administrator', 'admin'].includes(c.role)) return as
  return c.role === 'landlord' ? c.personId : null
}
