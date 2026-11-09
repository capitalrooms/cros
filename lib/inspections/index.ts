// Property inspections (9 Nov 2026, migration 275). The office walks round a house, notes each area's condition with
// photos, and sends the landlord a private report link (/inspection/<token>). Photos live privately in
// property-documents (inspections/<propertyId>/…) and are only ever shown through short signed links. Server only.
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/sendEmail'
import { ctaButton, tableRow, PORTAL_URL } from '@/lib/emailWrapper'
import { dearLine } from '@/lib/people'
import { signedLinkFor } from '@/lib/files/server'
import type { EmailSender } from '@/lib/email/sender'

export type Condition = 'good' | 'fair' | 'needs_work'
export type Area = { name: string; condition: Condition | null; note: string; photos: string[] }
export const KINDS = { routine: 'Routine inspection', check_in: 'Check-in', check_out: 'Check-out', other: 'Inspection' } as const
export const CONDITION_LABEL: Record<Condition, string> = { good: 'Good', fair: 'Fair', needs_work: 'Needs work' }
export const DEFAULT_AREAS = ['Outside & entrance', 'Hallway & stairs', 'Kitchen', 'Living room', 'Bathroom', 'Bedrooms', 'Garden', 'Safety: alarms & extinguishers']
export const inspectionLink = (token: string) => `${PORTAL_URL}/inspection/${token}`
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
export const longDate = (d: string) => new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function setupError(e: { message?: string } | null) {
  if (!e) return null
  return /property_inspections|repair_approval_limit|does not exist|schema cache/.test(e.message ?? '') ? 'Inspections need migration 275 running in Supabase first.' : (e.message ?? 'Something went wrong')
}

/** Clean what the office typed into the areas list. */
export function cleanAreas(v: unknown): Area[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 40).map((a: any) => ({
    name: String(a?.name ?? '').trim().slice(0, 80) || 'Area',
    condition: (['good', 'fair', 'needs_work'] as const).includes(a?.condition) ? a.condition : null,
    note: String(a?.note ?? '').slice(0, 2000),
    photos: (Array.isArray(a?.photos) ? a.photos : []).filter((p: unknown) => typeof p === 'string' && /\/inspections\//.test(p)).slice(0, 12),
  }))
}

/** Signed links for every photo in a list of inspections (url → link). */
export async function signPhotos(rows: { areas: Area[] }[], seconds = 3600) {
  const urls = [...new Set(rows.flatMap(r => (r.areas ?? []).flatMap(a => a.photos ?? [])))]
  const out: Record<string, string> = {}
  await Promise.all(urls.map(async u => { const l = await signedLinkFor(u, seconds); if (l) out[u] = l }))
  return out
}

async function landlordFor(s: SupabaseClient, propertyId: string) {
  const { data: p } = await s.from('properties').select('name, address, landlord_id').eq('id', propertyId).maybeSingle() as { data: any }
  const { data: ll } = p?.landlord_id ? await s.from('people').select('salutation, first_name, last_name, full_name, email, joint_salutation, joint_first_name, joint_last_name, joint_email').eq('id', p.landlord_id).maybeSingle() as { data: any } : { data: null }
  const emails = [ll?.email, ll?.joint_email].map(e => String(e ?? '').trim()).filter(e => /@/.test(e))
  return { property: p, landlord: ll, emails, houseName: String(p?.name || p?.address || 'your property').split(/[,\n]/)[0] }
}
export async function landlordEmails(s: SupabaseClient, propertyId: string) { return (await landlordFor(s, propertyId)).emails }

/** Email the landlord the report link and mark it sent. */
export async function sendInspection(s: SupabaseClient, id: string, sender: EmailSender) {
  const { data: r, error } = await s.from('property_inspections').select('*').eq('id', id).maybeSingle() as { data: any; error: any }
  if (error) throw new Error(setupError(error)!)
  if (!r) throw new Error('Inspection not found.')
  const areas = (r.areas ?? []) as Area[]
  if (!r.overall) throw new Error('Choose an overall condition before sending.')
  if (!areas.some(a => a.condition)) throw new Error('Mark the condition of at least one area before sending.')
  const { landlord, emails, houseName } = await landlordFor(s, r.property_id)
  if (!emails.length) throw new Error('The landlord has no email address on file. Add one on their record first.')
  const token = r.token || randomBytes(18).toString('base64url')
  const needs = areas.filter(a => a.condition === 'needs_work').map(a => a.name)
  const body = `
    <p>${esc(landlord ? dearLine(landlord) : 'Dear Sir or Madam,')}</p>
    <p>We’ve inspected ${esc(houseName)}. Your report, with photos of each area, is ready to view.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${tableRow('Inspection', esc(KINDS[r.kind as keyof typeof KINDS] ?? 'Inspection'))}
      ${tableRow('Date', esc(longDate(r.inspected_on)))}
      ${tableRow('Overall', esc(CONDITION_LABEL[r.overall as Condition]))}
      ${needs.length ? tableRow('Needs work', esc(needs.join(', '))) : ''}
    </table>
    ${ctaButton('View the report', inspectionLink(token))}
    <p style="color:#78716c;font-size:13px;">Questions about anything in it? Just reply to this email or call us on 0207 112 9163.</p>`
  const res = await sendEmail(emails, `Inspection report: ${houseName} — ${longDate(r.inspected_on)}`, body, { kind: 'inspection-report', sender })
  if (!res.ok) throw new Error(`The email didn’t send: ${res.error}`)
  await s.from('property_inspections').update({ token, status: 'sent', sent_at: new Date().toISOString(), sent_to: emails, updated_at: new Date().toISOString() }).eq('id', id)
  return { sentTo: emails }
}

/** The landlord's view of a report, by token (marks it viewed). */
export async function inspectionView(s: SupabaseClient, token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null
  const { data: r } = await s.from('property_inspections').select('*').eq('token', token).eq('status', 'sent').maybeSingle() as { data: any }
  if (!r) return null
  if (!r.viewed_at) await s.from('property_inspections').update({ viewed_at: new Date().toISOString() }).eq('id', r.id)
  const { houseName } = await landlordFor(s, r.property_id)
  const areas = (r.areas ?? []) as Area[]
  const links = await signPhotos([{ areas }], 3600)
  return {
    houseName, kind: KINDS[r.kind as keyof typeof KINDS] ?? 'Inspection', date: longDate(r.inspected_on), by: r.inspected_by as string | null,
    overall: r.overall as Condition, summary: (r.summary ?? '') as string,
    areas: areas.filter(a => a.condition || a.note || a.photos.length).map(a => ({ ...a, photos: a.photos.map(p => links[p]).filter(Boolean) })),
  }
}
