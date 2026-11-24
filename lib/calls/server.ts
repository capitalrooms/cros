// The informal video call between applicant and landlord (24 Nov 2026). Server only.
// Every step reads the rules from slots.ts, so the emails, the pages and the reminders always agree.
import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { candidateSlots, slotLabel, usableSlots } from './slots'
import { landlordTimesRequest, landlordBooked, landlordFollowUp, landlordNewTimes, applicantPickTime, applicantBooked } from './emailDesign'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://capitalrooms.co.uk').replace(/\/$/, '')
const svc = () => createServiceClient() as any
const token = () => randomBytes(18).toString('base64url')
const firstName = (s: string | null | undefined) => (s || '').trim().split(/\s+/)[0] || 'there'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]!)

async function sendHtml(to: string, subject: string, body: string) {
  const html = await buildEmail(body, { kind: 'video-call', req: null })
  await deliverEmail({ to, subject, html }, { req: null }).catch(() => null)
}

async function landlordOf(id: string | null) {
  if (!id) return null
  const { data } = await svc().from('people').select('id, first_name, last_name, full_name, email, phone, salutation').eq('id', id).maybeSingle()
  return data
}

/** Staff start the call step once the holding deposit has been paid: the landlord gets the times page. */
export async function createCallRequest(args: { applicantEmail: string; applicantName: string; landlordId: string; propertyId?: string | null; roomId?: string | null; createdBy: string }) {
  const s = svc()
  const row = {
    applicant_email: args.applicantEmail.trim().toLowerCase(), applicant_name: args.applicantName.trim().slice(0, 120) || null,
    landlord_id: args.landlordId, property_id: args.propertyId ?? null, room_id: args.roomId ?? null,
    landlord_token: token(), applicant_token: token(), created_by: args.createdBy,
  }
  const { data, error } = await s.from('video_call_requests').insert(row).select('*').single()
  if (error) throw new Error(error.message)
  const landlord = await landlordOf(row.landlord_id)
  if (landlord?.email) {
    await sendHtml(landlord.email, 'Please tick when you are free for a short video call',
      landlordTimesRequest({ firstName: firstName(landlord.first_name), applicantFirst: firstName(row.applicant_name || ''), link: `${BASE}/call/landlord/${data.landlord_token}` }))
  }return data
}

export async function landlordState(tok: string, now = new Date()) {
  const { data: r } = await svc().from('video_call_requests').select('*').eq('landlord_token', tok).maybeSingle()
  if (!r) return null
  return {
    status: r.status, applicantFirstName: firstName(r.applicant_name), offered: candidateSlots(now).map(iso => ({ iso, label: slotLabel(iso) })),
    ticked: usableSlots(r.landlord_slots ?? [], now), chosen: r.chosen_slot ? { iso: r.chosen_slot, label: slotLabel(r.chosen_slot) } : null,
    outcome: r.outcome, rounds: r.rounds,
  }
}

/** The landlord ticks their free times. The first save offers them to the applicant. */
export async function landlordSaveTimes(tok: string, picked: string[], now = new Date()) {
  const s = svc()
  const { data: r } = await s.from('video_call_requests').select('*').eq('landlord_token', tok).maybeSingle()
  if (!r) return { error: 'This link is not valid.', status: 404 }
  if (r.status === 'booked') return { error: 'The call is already booked. Ask the office to change it.', status: 409 }
  const allowed = new Set(candidateSlots(now))
  const clean = [...new Set(picked)].filter(p => allowed.has(p)).sort()
  if (!clean.length) return { error: 'Tick at least one time.', status: 400 }
  const first = r.status === 'awaiting_landlord_times' || r.status === 'needs_new_times'
  const { error } = await s.from('video_call_requests').update({
    landlord_slots: clean, status: 'times_offered', offered_at: first ? now.toISOString() : r.offered_at, updated_at: now.toISOString(),
  }).eq('id', r.id)
  if (error) return { error: error.message, status: 500 }
  if (first && r.applicant_email) {
    const landlord = await landlordOf(r.landlord_id)
    const name = firstName(landlord?.first_name)
    await sendHtml(r.applicant_email, 'Your offer: pick a time for a short call',
      applicantPickTime({ firstName: firstName(r.applicant_name), landlordFirst: name, link: `${BASE}/call/applicant/${r.applicant_token}`, options: clean.map(slotLabel) }))
  }return { ok: true, status: 200 }
}

/** The applicant picks one of the ticked times. Both sides get the details; the landlord's number only goes out now. */
export async function applicantPick(tok: string, iso: string, now = new Date()) {
  const s = svc()
  const { data: r } = await s.from('video_call_requests').select('*').eq('applicant_token', tok).maybeSingle()
  if (!r) return { error: 'This link is not valid.', status: 404 }
  if (r.status === 'booked') return { error: 'You have already chosen a time.', status: 409 }
  const usable = new Set(usableSlots(r.landlord_slots ?? [], now))
  if (!usable.has(iso)) return { error: 'That time is no longer free. Please choose another from the list, or ask for new times.', status: 409 }
  const { error } = await s.from('video_call_requests').update({ status: 'booked', chosen_slot: iso, updated_at: now.toISOString() }).eq('id', r.id)
  if (error) return { error: error.message, status: 500 }
  const landlord = await landlordOf(r.landlord_id)
  const when = slotLabel(iso)
  if (landlord?.email) {
    await sendHtml(landlord.email, `${firstName(r.applicant_name)} has picked a time for the call`,
      landlordBooked({ firstName: firstName(landlord.first_name), applicantFirst: firstName(r.applicant_name), when }))
  }
  if (r.applicant_email) {
    await sendHtml(r.applicant_email, `Your video call with ${firstName(landlord?.first_name)}`,
      applicantBooked({ firstName: firstName(r.applicant_name), landlordFirst: firstName(landlord?.first_name), when, phone: landlord?.phone || 'the office will send the number' }))
  }return { ok: true, status: 200 }
}

/** The applicant can't make any of the times. The landlord is asked for new ones; this counts as one round. */
export async function applicantCannot(tok: string, now = new Date()) {
  const s = svc()
  const { data: r } = await s.from('video_call_requests').select('*').eq('applicant_token', tok).maybeSingle()
  if (!r) return { error: 'This link is not valid.', status: 404 }
  if (r.status === 'booked') return { error: 'The call is already booked.', status: 409 }
  const rounds = (r.rounds ?? 0) + 1
  await s.from('video_call_requests').update({ status: 'needs_new_times', rounds, updated_at: now.toISOString(), offered_at: null }).eq('id', r.id)
  const landlord = await landlordOf(r.landlord_id)
  if (landlord?.email) {
    await sendHtml(landlord.email, 'Could you suggest other times for the call?',
      landlordNewTimes({ firstName: firstName(landlord.first_name), applicantFirst: firstName(r.applicant_name), link: `${BASE}/call/landlord/${r.landlord_token}` }))
  }
  if (rounds >= 3) {
    await s.from('video_call_requests').update({ reminded_office: now.toISOString() }).eq('id', r.id)
    await officeTask(r, 'Three rounds of call times have not worked. Please call the landlord and the applicant to agree a time.')
  }
  return { ok: true, status: 200 }
}

/** The landlord's answer after the call. Recorded; the office acts on it. */
export async function landlordOutcome(tok: string, outcome: 'proceed' | 'decline' | 'notes', note: string, now = new Date()) {
  const s = svc()
  if (!['proceed', 'decline', 'notes'].includes(outcome)) return { error: 'Choose an answer.', status: 400 }
  const { data: r } = await s.from('video_call_requests').select('*').eq('landlord_token', tok).maybeSingle()
  if (!r) return { error: 'This link is not valid.', status: 404 }
  await s.from('video_call_requests').update({ outcome, outcome_note: note.trim().slice(0, 1000) || null, status: outcome === 'decline' ? 'closed' : r.status, updated_at: now.toISOString() }).eq('id', r.id)
  await officeTask(r, `Landlord answered after the call: ${outcome === 'proceed' ? 'proceed' : outcome === 'decline' ? 'decline' : 'proceed with notes'}${note.trim() ? ` — “${note.trim().slice(0, 300)}”` : ''}`)
  return { ok: true, status: 200 }
}

/** Office task: a line on the applicant's file and an email to the office inbox. */
async function officeTask(r: any, text: string) {
  await sendHtml('management@capitalrooms.co.uk', `Video call: ${firstName(r.applicant_name)}`,
    `<p>${esc(text)}</p><p>Applicant: ${esc(r.applicant_name || r.applicant_email)}</p>`)
}

/** The scheduled pass: reminders and the post-call question. Idempotent (each step is stamped). */
export async function runCallReminders(now = new Date()) {
  const s = svc()
  const sent = { applicantReminder: 0, officeReminder: 0, followUp: 0 }
  const { data: rows } = await s.from('video_call_requests').select('*').in('status', ['times_offered', 'booked']).limit(200)
  for (const r of (rows ?? []) as any[]) {
    // 1. six hours after the first email, nobody has picked yet: remind the applicant, with suggestions for the next working day
    if (r.status === 'times_offered' && r.offered_at && !r.reminded_applicant && now.getTime() - new Date(r.offered_at).getTime() >= 6 * 3600 * 1000) {
      const options = usableSlots(r.landlord_slots ?? [], now).slice(0, 3).map(slotLabel)
      if (r.applicant_email) await sendHtml(r.applicant_email, 'A reminder: pick a time for your call',
        `<p>Hello ${esc(firstName(r.applicant_name))},</p><p>You haven't picked a time for your call yet. ${options.length ? `Some times still free are: ${esc(options.join('; '))}.` : ''}</p><p><a href="${BASE}/call/applicant/${r.applicant_token}">Choose a time</a></p>`)
      await s.from('video_call_requests').update({ reminded_applicant: now.toISOString() }).eq('id', r.id)
      sent.applicantReminder++
    }
    // 2. two working days (about 48 hours here) with no pick: the office gets a task, nothing is cancelled
    if (r.status === 'times_offered' && r.offered_at && !r.reminded_office && now.getTime() - new Date(r.offered_at).getTime() >= 48 * 3600 * 1000) {
      await officeTask(r, 'The applicant has not picked a call time after two working days. Nothing has been cancelled; please follow up.')
      await s.from('video_call_requests').update({ reminded_office: now.toISOString() }).eq('id', r.id)
      sent.officeReminder++
    }
    // 3. twenty minutes after the booked call: ask the landlord whether to proceed
    if (r.status === 'booked' && r.chosen_slot && !r.followup_sent && now.getTime() >= new Date(r.chosen_slot).getTime() + 20 * 60000) {
      const landlord = await landlordOf(r.landlord_id)
      if (landlord?.email) await sendHtml(landlord.email, `How did it go with ${firstName(r.applicant_name)}?`,
        landlordFollowUp({ firstName: firstName(landlord.first_name), applicantFirst: firstName(r.applicant_name), link: `${BASE}/call/landlord/${r.landlord_token}` }))
      await s.from('video_call_requests').update({ followup_sent: now.toISOString() }).eq('id', r.id)
      sent.followUp++
    }
  }
  return sent
}

export async function applicantState(tok: string, now = new Date()) {
  const { data: r } = await svc().from('video_call_requests').select('*').eq('applicant_token', tok).maybeSingle()
  if (!r) return null
  const landlord = await landlordOf(r.landlord_id)
  return {
    status: r.status, firstName: firstName(r.applicant_name), landlordFirstName: firstName(landlord?.first_name),
    options: usableSlots(r.landlord_slots ?? [], now).map(iso => ({ iso, label: slotLabel(iso) })),
    chosen: r.chosen_slot ? slotLabel(r.chosen_slot) : null,
  }
}
