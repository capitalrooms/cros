// One applicant per email address (22 Oct 2026, Harry: "sometimes when sending emails to applicants it makes two or
// three applicants … these should not be possible with the same email address"). Every route that sends an invite,
// an offer or receives an application finds the person here first.
//
// Why there were duplicates: the routes looked the person up with an exact, case-sensitive match on email AND room,
// using .maybeSingle() — a different capital letter, a trailing space or another room made a new row, and once there
// were two rows .maybeSingle() errored, so every later send made yet another.
import type { SupabaseClient } from '@supabase/supabase-js'

export const STAGE_ORDER = ['invited', 'applied', 'offer_sent', 'referencing', 'referencing_passed', 'docs_uploaded', 'converted']
export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase()
const likeExact = (e: string) => e.replace(/[\\%_]/g, c => `\\${c}`)

/** The person's live application: not archived, not already a tenant; the furthest along, then the most recent. */
export async function findApplicant(s: SupabaseClient, email: unknown, cols = 'id, room_id, property_id, pipeline_stage, preferred_term, preferred_start_date, admin_notes, updated_at') {
  const e = normEmail(email)
  if (!e) return null
  const { data } = await s.from('applicants').select(cols).ilike('email', likeExact(e)).is('archived_at', null)
  const rows = ((data ?? []) as any[]).filter(r => r.pipeline_stage !== 'converted')
  rows.sort((a, b) => STAGE_ORDER.indexOf(b.pipeline_stage) - STAGE_ORDER.indexOf(a.pipeline_stage) || String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
  return rows[0] ?? null
}

/** The same person offered or applying for another room: their one application moves to it (noted on the record). */
export async function moveToRoom(s: SupabaseClient, a: { id: string; room_id: string | null; admin_notes?: string | null }, roomId: string | null | undefined, propertyId: string | null | undefined) {
  if (!roomId || a.room_id === roomId) return
  const [{ data: from }, { data: to }] = await Promise.all([
    a.room_id ? s.from('rooms').select('name, properties(name)').eq('id', a.room_id).maybeSingle() : Promise.resolve({ data: null }),
    s.from('rooms').select('name, properties(name)').eq('id', roomId).maybeSingle(),
  ])
  const label = (r: any) => r ? `${r.name}, ${String(r.properties?.name ?? '').split('\n')[0]}` : 'no room'
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const note = `${day}: moved from ${label(from)} to ${label(to)}`
  await s.from('applicants').update({ room_id: roomId, ...(propertyId ? { property_id: propertyId } : {}), admin_notes: [a.admin_notes, note].filter(Boolean).join('\n'), updated_at: new Date().toISOString() }).eq('id', a.id)
  a.room_id = roomId
}

// everything that points at an applicant, moved to the one kept when duplicates are merged
const REFERENCES: [string, string][] = [
  ['tenancies', 'applicant_id'], ['holding_deposits', 'applicant_id'], ['offers', 'applicant_id'], ['applicant_documents', 'applicant_id'],
  ['people', 'applicant_id'], ['inbox_documents', 'matched_applicant_id'], ['landlord_updates', 'applicant_id'],
]

/** Groups of live applicants sharing an email (archived and converted ones left out). */
export async function duplicateApplicants(s: SupabaseClient) {
  const { data } = await s.from('applicants').select('id, full_name, email, room_id, pipeline_stage, created_at, updated_at, submitted_at, rooms(name), properties(name)').is('archived_at', null)
  const groups = new Map<string, any[]>()
  for (const a of (data ?? []) as any[]) {
    const e = normEmail(a.email)
    if (!e || a.pipeline_stage === 'converted') continue
    groups.set(e, [...(groups.get(e) ?? []), a])
  }
  return [...groups.entries()].filter(([, v]) => v.length > 1).map(([email, rows]) => {
    rows.sort((a, b) => STAGE_ORDER.indexOf(b.pipeline_stage) - STAGE_ORDER.indexOf(a.pipeline_stage) || Number(!!b.submitted_at) - Number(!!a.submitted_at) || String(b.updated_at).localeCompare(String(a.updated_at)))
    return { email, keep: rows[0].id, rows: rows.map(r => ({ id: r.id, name: r.full_name, stage: r.pipeline_stage, room: [r.rooms?.name, String(r.properties?.name ?? '').split('\n')[0]].filter(Boolean).join(', '), created: r.created_at, applied: !!r.submitted_at })) }
  })
}

/** Merge: every reference moves to `keepId`, gaps in the kept record are filled from the others, then they're archived. */
export async function mergeApplicants(s: SupabaseClient, keepId: string, otherIds: string[], by: string) {
  const others = otherIds.filter(id => id && id !== keepId)
  if (!others.length) return { moved: 0 }
  const { data: rows } = await s.from('applicants').select('*').in('id', [keepId, ...others])
  const keep = ((rows ?? []) as any[]).find(r => r.id === keepId)
  if (!keep) throw new Error('The applicant to keep wasn’t found')
  const emails = new Set(((rows ?? []) as any[]).map(r => normEmail(r.email)))
  if (emails.size > 1) throw new Error('These applicants have different email addresses — they can’t be merged')
  // fill anything the kept record is missing from the others (newest first)
  const fill: Record<string, unknown> = {}
  const skip = new Set(['id', 'created_at', 'updated_at', 'archived_at', 'archived_reason', 'archived_by', 'pipeline_stage', 'room_id', 'property_id', 'admin_notes'])
  for (const o of ((rows ?? []) as any[]).filter(r => r.id !== keepId).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))) {
    for (const [k, v] of Object.entries(o)) if (!skip.has(k) && (keep[k] == null || keep[k] === '') && v != null && v !== '' && !(k in fill)) fill[k] = v
  }
  const note = `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })}: merged ${others.length} duplicate record${others.length === 1 ? '' : 's'} into this one`
  await s.from('applicants').update({ ...fill, admin_notes: [keep.admin_notes, note].filter(Boolean).join('\n'), updated_at: new Date().toISOString() }).eq('id', keepId)
  let moved = 0
  for (const [table, col] of REFERENCES) {
    const { data, error } = await s.from(table).update({ [col]: keepId }).in(col, others).select('id')
    if (!error) moved += (data ?? []).length
  }
  await s.from('applicants').update({ archived_at: new Date().toISOString(), archived_reason: `Merged into ${keepId}`, archived_by: by }).in('id', others)
  return { moved }
}
