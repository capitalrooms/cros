// Rightmove documents (12 Nov 2026) — what a landlord gives us so a property can go on Rightmove through OpenRent:
// a signed letter of authority, proof of ownership and photo ID (migration 282). The letter is written for them
// (letterPdf) — they print it or copy it out by hand, sign, and send a photo. Server-only.
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { landlordName } from '@/lib/people'

export const OWNERSHIP_TYPES: { key: string; label: string }[] = [
  { key: 'land_registry', label: 'Land Registry title' },
  { key: 'insurance', label: 'Insurance certificate' },
  { key: 'solicitor', label: 'Signed letter from a solicitor (completion letter, or confirming ownership)' },
  { key: 'mortgage', label: 'Mortgage letter' },
]
export const BUCKET = 'landlord-docs'
// stored as <folder>/<type>_<time>_<rand>.<ext>; id_document and proof_of_ownership are encrypted (lib/files/fileCrypt)
export const DOC_TYPES: Record<'letter' | 'ownership' | 'id', string> = { letter: 'other_document', ownership: 'proof_of_ownership', id: 'id_document' }
export const COLUMN: Record<'letter' | 'ownership' | 'id', string> = { letter: 'letter_path', ownership: 'ownership_path', id: 'id_path' }
export const newToken = () => crypto.randomBytes(18).toString('base64url')
export const folderFor = (token: string) => `rm-${token}`
export const oneLine = (a: string | null | undefined) => String(a ?? '').replace(/\s*\n\s*/g, ', ').trim()

const fullAddress = (p: any) => { const a = oneLine(p?.address || p?.name); return p?.postcode && !a.toUpperCase().includes(String(p.postcode).toUpperCase()) ? `${a}, ${p.postcode}` : a }
/** "A", "A and B", "A, B and C" */
export const listWords = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** A document CROS already holds — a landlord-docs path (onboarding) or a stored file URL (the property's documents). */
export interface OnFile { label: string; path?: string; url?: string }
const OWNERSHIP_DOC_TYPES = ['title_register', 'insurance', 'insurance_policy', 'buildings_insurance', 'mortgage_statement']
const shortDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : ''

/**
 * What we already have for this landlord (12 Nov 2026 — Harry: "if they have onboarded and provided some of those docs
 * already CROS should know"): photo ID and proof of ownership from their onboarding form, and any title / insurance /
 * mortgage document filed on each property. The office chooses which to use; the landlord is then only asked for the rest.
 */
export async function docsOnFile(s: SupabaseClient, landlordId: string | null | undefined, propertyIds: string[]): Promise<{ id: OnFile | null; ownership: Record<string, OnFile> }> {
  const out: { id: OnFile | null; ownership: Record<string, OnFile> } = { id: null, ownership: {} }
  if (!landlordId) return out
  const [{ data: onb }, { data: pdocs }] = await Promise.all([
    s.from('landlord_onboarding').select('form_data, created_at, updated_at').eq('landlord_people_id', landlordId).order('created_at', { ascending: false }).limit(5),
    propertyIds.length ? s.from('property_documents').select('property_id, document_type, storage_url, uploaded_at').in('property_id', propertyIds).in('document_type', OWNERSHIP_DOC_TYPES).order('uploaded_at', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]) as [{ data: any[] | null }, { data: any[] | null }]
  for (const r of onb ?? []) {
    const docs = r.form_data?.documents ?? {}, when = shortDate(r.updated_at || r.created_at)
    const first = (k: string) => (Array.isArray(docs[k]) ? docs[k] : []).find((x: unknown) => typeof x === 'string') as string | undefined
    if (!out.id && first('id_document')) out.id = { label: `Photo ID from their onboarding${when ? ` (${when})` : ''}`, path: first('id_document') }
    const own = first('proof_of_ownership')
    if (own) for (const pid of propertyIds) out.ownership[pid] ??= { label: `Proof of ownership from their onboarding${when ? ` (${when})` : ''}`, path: own }
  }
  // a document filed on the property itself is the better match, so it wins over the onboarding one
  const seen = new Set<string>()
  for (const d of pdocs ?? []) {
    if (seen.has(d.property_id) || !d.storage_url) continue
    seen.add(d.property_id)
    const label = ({ title_register: 'Land Registry title', mortgage_statement: 'Mortgage letter' } as Record<string, string>)[d.document_type] ?? 'Insurance certificate'
    out.ownership[d.property_id] = { label: `${label} on the property’s documents${d.uploaded_at ? ` (${shortDate(d.uploaded_at)})` : ''}`, url: d.storage_url }
  }
  return out
}

/** A request with every property it covers (migration 283) — one letter, ID once, proof of ownership for each. */
export async function requestByToken(s: SupabaseClient, token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null
  const { data } = await s.from('portal_authority_requests').select('*, people!landlord_id(salutation, first_name, last_name, full_name, company, email)').eq('token', token).maybeSingle() as { data: any }
  if (!data) return null
  const ids: string[] = (data.property_ids?.length ? data.property_ids : [data.property_id]).filter(Boolean)
  const { data: props } = await s.from('properties').select('id, name, address, postcode').in('id', ids) as { data: any[] | null }
  const properties = ids.map(id => (props ?? []).find(p => p.id === id)).filter(Boolean).map((p: any) => {
    const own = data.ownership?.[p.id] ?? (p.id === data.property_id && data.ownership_path ? { type: data.ownership_type, path: data.ownership_path } : null)
    const onFile: OnFile | null = data.on_file?.ownership?.[p.id] ?? null
    return { id: p.id, address: fullAddress(p), street: oneLine(p.address || p.name).split(',')[0], ownershipType: own?.type ?? null, ownershipPath: own?.path ?? null, onFile, done: !!own?.path || !!onFile }
  })
  const idOnFile: OnFile | null = data.on_file?.id ?? null
  return { row: data, properties, idOnFile, idDone: !!data.id_path || !!idOnFile, address: listWords(properties.map(p => p.address)), landlord: data.people ? landlordName(data.people) : '' }
}

/** The letter of authority, written for the landlord to sign — plain, as their own letter (not on our letterhead). */
export interface ESign { png: Buffer; name: string; at: Date; ip: string; device: string }
export async function letterPdf(o: { landlord: string; address: string; addresses?: string[]; signed?: ESign }): Promise<Buffer> {
  const many = (o.addresses?.length ?? 0) > 1
  // @ts-ignore pdfkit ships without types here
  const PDFKit = (await import('pdfkit')).default
  const doc = new PDFKit({ size: 'A4', margin: 64, info: { Title: 'Letter of authority', Author: o.landlord || 'Landlord' } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const W = 595.28 - 128
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  doc.font('Helvetica').fontSize(11).fillColor('#111')
  doc.text(today, { align: 'right' }).moveDown(2)
  doc.text('To: OpenRent Ltd and Rightmove plc').moveDown(1.5)
  doc.font('Helvetica-Bold').fontSize(14).text('Letter of authority').moveDown(0.3)
  if (!many) doc.font('Helvetica-Bold').fontSize(11).text(o.address).moveDown(1.5)
  else doc.moveDown(0.5)
  doc.font('Helvetica').fontSize(11.5)
  if (many) {
    doc.text(`I, ${o.landlord || '______________________________'}, confirm that I am the owner of the following properties:`, { width: W, lineGap: 4 }).moveDown(0.5)
    for (const a of o.addresses!) doc.font('Helvetica-Bold').text(`•  ${a}`, 80, doc.y, { width: W - 16, lineGap: 3 })
    doc.font('Helvetica').moveDown(0.8)
    doc.text('I authorise Capital Rooms Ltd, of Hoxton Mix, 66 Paul Street, London EC2A 4NA, to advertise these properties to let on my behalf on Rightmove, OpenRent and other property portals, and to arrange viewings and lettings as my agent.', 64, doc.y, { width: W, lineGap: 4 }).moveDown()
  } else {
    doc.text(`I, ${o.landlord || '______________________________'}, confirm that I am the owner of the property at ${o.address}.`, { width: W, lineGap: 4 }).moveDown()
    doc.text('I authorise Capital Rooms Ltd, of Hoxton Mix, 66 Paul Street, London EC2A 4NA, to advertise this property to let on my behalf on Rightmove, OpenRent and other property portals, and to arrange viewings and the letting as my agent.', { width: W, lineGap: 4 }).moveDown()
  }
  doc.text('Copies of my proof of ownership and photo identification are provided with this letter.', { width: W, lineGap: 4 }).moveDown(3)
  const line = (label: string, value?: string) => { const y = doc.y; doc.text(label, 64, y); if (value) doc.font('Helvetica-Bold').text(value, 164, y).font('Helvetica'); doc.moveTo(160, y + 14).lineTo(64 + W, y + 14).lineWidth(0.8).strokeColor('#111').stroke(); doc.y = y; doc.moveDown(2.4) }
  if (o.signed) {
    // signed on screen (12 Nov 2026): the signature drawn by the landlord, their typed name, the time, and a record of
    // how it was signed — the evidence a signing service would otherwise keep
    const y = doc.y
    doc.text('Signed', 64, y + 30)
    doc.image(o.signed.png, 164, y - 6, { fit: [260, 60] })
    doc.moveTo(160, y + 44).lineTo(64 + W, y + 44).lineWidth(0.8).strokeColor('#111').stroke()
    doc.y = y + 62
    const when = o.signed.at.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    line('Full name', o.signed.name)
    line('Date', o.signed.at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }))
    doc.moveDown(1)
    doc.fontSize(8.5).fillColor('#555').text(`Signed electronically by ${o.signed.name} on ${when} (UK time), who typed their full name, drew this signature and confirmed they own the ${many ? 'properties' : 'property'} and give this authority. Signed from IP address ${o.signed.ip}${o.signed.device ? ` on ${o.signed.device}` : ''}, using a link sent to the landlord’s email address by Capital Rooms.`, 64, doc.y, { width: W, lineGap: 2 })
  } else {
    line('Signed')
    line('Full name')
    line('Date')
  }
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}
