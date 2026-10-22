// A tenant's own documents in the app (22 Oct 2026, Harry: "if people never wanted an email again and it was all to be
// sent to their app where they have all docs saved would we be ready?"). Everything is opened through a fresh 5-minute
// private link, so nothing a tenant keeps here ever stops working the way emailed links do.
//   Your tenancy      — the move-in pack documents (agreement, check-in balance, deposit …) and the signed agreement
//   Your rent         — statement of account (made fresh each time)
//   Letters & receipts — letters, invoices and receipts made for their tenancy and addressed to them
//   House certificates — the latest gas, electrical, fire, EPC and HMO licence documents for the house
import type { SupabaseClient } from '@supabase/supabase-js'
import { HOUSE_DOCS } from '@/lib/houseDocs'
import { PACK_BUCKET } from '@/lib/movein/email'

export interface TenantDoc { id: string; group: string; label: string; date: string | null; note?: string }
type Source = { kind: 'pack'; path: string } | { kind: 'url'; url: string } | { kind: 'gd'; path: string } | { kind: 'statement'; tenancyId: string }

const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const TENANCY_TYPES = new Set(['tenancy_agreement', 'deposit_certificate', 'prescribed_information', 'inventory', 'how_to_rent', 'check_in_report'])

/** The tenancy shown: the one they live in now, else their most recent. */
async function tenancyOf(s: SupabaseClient, personId: string) {
  const today = ukToday()
  const { data } = await s.from('tenancies').select('id, property_id, start_date, end_date, let_cancelled_at')
    .or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`).order('start_date', { ascending: false })
  const lets = ((data ?? []) as any[]).filter(t => !t.let_cancelled_at)
  return lets.find(t => t.start_date <= today && (!t.end_date || t.end_date >= today)) ?? lets[0] ?? null
}

/** Every document this tenant can open, and where each one lives (kept on the server — ids are opaque). */
export async function tenantDocuments(s: SupabaseClient, personId: string, email: string): Promise<{ docs: TenantDoc[]; sources: Map<string, Source> }> {
  const docs: TenantDoc[] = []
  const sources = new Map<string, Source>()
  const t = await tenancyOf(s, personId)
  if (!t) return { docs, sources }
  const add = (id: string, d: Omit<TenantDoc, 'id'>, src: Source) => { if (!sources.has(id)) { docs.push({ id, ...d }); sources.set(id, src) } }

  const [{ data: packs }, { data: pdocs }, { data: gdocs }, { data: prop }, { data: houseDocs }] = await Promise.all([
    s.from('tenancy_packs').select('id, documents, sent_at, status').eq('tenancy_id', t.id).neq('status', 'withdrawn').order('sent_at', { ascending: false }).limit(1),
    s.from('property_documents').select('id, document_type, file_name, storage_url, uploaded_at').eq('tenancy_id', t.id),
    s.from('generated_documents').select('id, kind, number, title, recipient_email, storage_path, created_at').eq('tenancy_id', t.id).is('deleted_at', null).order('created_at', { ascending: false }),
    s.from('properties').select('*').eq('id', t.property_id).maybeSingle(),
    s.from('property_documents').select('id, document_type, storage_url, uploaded_at').eq('property_id', t.property_id).is('tenancy_id', null).order('uploaded_at', { ascending: false }),
  ])

  // the move-in pack: the exact files they were sent
  const pack = (packs ?? [])[0] as any
  for (const d of (pack?.documents ?? []) as any[]) {
    if (!d.available || d.group === 'Safety certificates') continue   // certificates come from the house, newest first, below
    if (d.path) add(`pack:${pack.id}:${d.key}`, { group: 'Your tenancy', label: d.label, date: pack.sent_at }, { kind: 'pack', path: d.path })
    else if (d.url && !String(d.url).startsWith('/')) add(`pack:${pack.id}:${d.key}`, { group: 'Your tenancy', label: d.label, date: pack.sent_at }, { kind: 'url', url: d.url })
  }
  // documents filed against their tenancy that are theirs to keep (never referencing or ID checks)
  for (const d of (pdocs ?? []) as any[]) {
    if (!TENANCY_TYPES.has(d.document_type) || !d.storage_url) continue
    const label = d.document_type === 'tenancy_agreement' ? 'Tenancy agreement (signed)' : String(d.document_type).replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())
    add(`pd:${d.id}`, { group: 'Your tenancy', label, date: d.uploaded_at }, { kind: 'url', url: d.storage_url })
  }
  add(`soa:${t.id}`, { group: 'Your rent', label: 'Statement of account', date: null, note: 'Every rent charge and payment, up to today' }, { kind: 'statement', tenancyId: t.id })
  // letters, receipts and invoices for this tenancy that were addressed to them (not the landlord's)
  const me = email.toLowerCase()
  for (const d of (gdocs ?? []) as any[]) {
    if (!d.storage_path || String(d.recipient_email ?? '').toLowerCase().split(/[,;\s]+/).indexOf(me) < 0) continue
    const label = d.kind === 'letter' ? d.title : `${d.kind === 'receipt' ? 'Receipt' : 'Invoice'} ${d.number ?? ''}`.trim()
    add(`gd:${d.id}`, { group: 'Letters & receipts', label, date: d.created_at }, { kind: 'gd', path: d.storage_path })
  }
  // the house's latest certificate of each kind
  for (const h of HOUSE_DOCS) {
    const doc = ((houseDocs ?? []) as any[]).find(x => h.types.includes(String(x.document_type)) && x.storage_url)
    if (!doc) continue
    const due = h.expiry && (prop as any)?.[h.expiry] ? String((prop as any)[h.expiry]).slice(0, 10) : null
    add(`house:${doc.id}`, { group: 'House certificates', label: h.label, date: doc.uploaded_at, note: due ? `Valid until ${new Date(`${due}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` : undefined }, { kind: 'url', url: doc.storage_url })
  }
  return { docs, sources }
}

export { PACK_BUCKET }
