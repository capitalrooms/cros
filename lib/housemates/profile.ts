// A tenant's "say hello" profile (6 Nov 2026): the answers (lib/icebreaker) and a photo they're happy to share, one
// row per person in tenant_icebreakers. Filled in from the move-in pack (/pack/<token>), the tenant app
// (/tenant/icebreaker) or by the office. Used by the landlord's emails (a round photo of their tenant, optional), the
// "meet your new housemate" email for let-only landlords, and the note to current housemates. Server-only.
// The photo lives in the private property-documents folder (profiles/<personId>/…) and is only ever handed out as a
// signed link.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_QUESTIONS, type IcebreakerAnswers } from '@/lib/icebreaker'

const BUCKET = 'property-documents'
export const MAX_PHOTO = 4 * 1024 * 1024   // the phone shrinks it first (app/pack/[token]/AboutYou) — Vercel takes 4.5 MB at most

export interface HousemateProfile { answers: IcebreakerAnswers; visible: boolean; photoUrl: string | null; hasPhoto: boolean; completedAt: string | null }

/** The profile, with the photo as a signed link good for `linkDays` (an email keeps working for a year). */
export async function profileFor(s: SupabaseClient, personId: string, linkDays = 365): Promise<HousemateProfile> {
  const { data } = await s.from('tenant_icebreakers').select('answers, visible_to_housemates, completed_at').eq('person_id', personId).maybeSingle() as { data: any }
  const answers = (data?.answers ?? {}) as IcebreakerAnswers
  let photoUrl: string | null = null
  if (answers.photo) {
    const { data: signed } = await s.storage.from(BUCKET).createSignedUrl(String(answers.photo), linkDays * 86400)
    photoUrl = signed?.signedUrl ?? null
  }
  return { answers, visible: data ? data.visible_to_housemates !== false : true, photoUrl, hasPhoto: !!photoUrl, completedAt: data?.completed_at ?? null }
}

/** Save the answers they gave — only our questions, each trimmed and kept short. The photo path is kept as it was. */
export async function saveAnswers(s: SupabaseClient, personId: string, given: Record<string, unknown>, visible: boolean): Promise<void> {
  const { data: cur } = await s.from('tenant_icebreakers').select('answers').eq('person_id', personId).maybeSingle() as { data: any }
  const answers: IcebreakerAnswers = { ...(cur?.answers ?? {}) }
  for (const q of ALL_QUESTIONS) if (q.id in given) {
    const v = String(given[q.id] ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
    if (v) answers[q.id] = v; else delete answers[q.id]
  }
  const { error } = await s.from('tenant_icebreakers').upsert({
    person_id: personId, answers, visible_to_housemates: visible, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'person_id' })
  if (error) throw new Error(error.message)
}

/** What a file really is, from its first bytes — a photo must be one, whatever it's called. */
function imageKind(b: Buffer): { ext: string; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' }
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  if (b.subarray(4, 8).toString() === 'ftyp' && /hei|mif|avif/.test(b.subarray(8, 12).toString())) return { ext: 'heic', type: 'image/heic' }
  return null
}

export async function savePhoto(s: SupabaseClient, personId: string, bytes: Buffer): Promise<void> {
  if (bytes.length > MAX_PHOTO) throw new Error('That photo is too large — please choose a smaller one')
  const kind = imageKind(bytes)
  if (!kind) throw new Error('Please choose a photo (JPG, PNG or HEIC)')
  const path = `profiles/${personId}/${Date.now()}.${kind.ext}`
  const { error } = await s.storage.from(BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false })
  if (error) throw new Error(error.message)
  const { data: cur } = await s.from('tenant_icebreakers').select('answers').eq('person_id', personId).maybeSingle() as { data: any }
  const old = cur?.answers?.photo
  const { error: e2 } = await s.from('tenant_icebreakers').upsert({
    person_id: personId, answers: { ...(cur?.answers ?? {}), photo: path }, updated_at: new Date().toISOString(),
  }, { onConflict: 'person_id' })
  if (e2) { await s.storage.from(BUCKET).remove([path]); throw new Error(e2.message) }
  if (old && old !== path) await s.storage.from(BUCKET).remove([String(old)]).catch(() => {})
}

/** The avatar they picked instead of a photo (lib/housemates/avatar), or null to clear it. */
export async function saveAvatar(s: SupabaseClient, personId: string, value: string | null): Promise<void> {
  const { data: cur } = await s.from('tenant_icebreakers').select('answers').eq('person_id', personId).maybeSingle() as { data: any }
  const answers = { ...(cur?.answers ?? {}) }
  if (value) answers.avatar = value; else delete answers.avatar
  const { error } = await s.from('tenant_icebreakers').upsert({ person_id: personId, answers, updated_at: new Date().toISOString() }, { onConflict: 'person_id' })
  if (error) throw new Error(error.message)
}

export async function removePhoto(s: SupabaseClient, personId: string): Promise<void> {
  const { data: cur } = await s.from('tenant_icebreakers').select('answers').eq('person_id', personId).maybeSingle() as { data: any }
  const old = cur?.answers?.photo
  if (!old) return
  const { photo: _gone, ...rest } = cur.answers
  await s.from('tenant_icebreakers').update({ answers: rest, updated_at: new Date().toISOString() }).eq('person_id', personId)
  await s.storage.from(BUCKET).remove([String(old)]).catch(() => {})
}
