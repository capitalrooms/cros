// The reserve email ("the search is over" — pay the holding deposit), the ONE version every screen sends (23 Oct 2026,
// Harry: "the invite to apply screen via available rooms and the applicant screen create different options for emails
// … Disaster!"). Applicants → Reserve and Invite to apply → Reserve only both come here, so the rent, the holding
// deposit, the wording and the offer the reserve page reads are always the same.
//
// The rent: what you type, else what's agreed on their offer (lib/lettings/holdingDeposit agreedRent), else the room's
// asking rent. Sending pins it on their offer, so the reserve page and the holding deposit use exactly that figure.
// A re-send with a different rent says plainly that it replaces the earlier email.
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hiName, personFromText } from '@/lib/people'
import { oneLine } from '@/lib/lettings/letWording'
import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { oneWeekRent } from '@/lib/tenancy/deposit'
import { loadDepositContext } from '@/lib/lettings/holdingDeposit'
import { STAGE_ORDER } from '@/lib/lettings/applicantRecord'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const cleanRent = (v: unknown) => { const n = Number(String(v ?? '').replace(/[£,\s]/g, '')); return n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null }

export interface ReserveDraft {
  to: string; subject: string; html: string; sms: string
  rent: number | null; deposit: number | null; pinned: number | null; asking: number | null
  earlier: { at: string; rent: number | null } | null; reserveUrl: string
}

/** Everything the reserve email will say for this applicant — nothing is sent or saved. */
export async function draftReserve(s: SupabaseClient, applicantId: string, typedRent: unknown, req?: Request | null): Promise<ReserveDraft | { error: string; status: number }> {
  const { data: applicant } = await s.from('applicants')
    .select('id, full_name, salutation, first_name, last_name, email, phone, room_id, property_id, rooms(id, name, current_asking_rent, properties(name, address, property_code))')
    .eq('id', applicantId).maybeSingle()
  if (!applicant) return { error: 'Applicant not found', status: 404 }
  const a: any = applicant, room = a.rooms, property = room?.properties
  const ctx = await loadDepositContext(s as any, applicantId)
  const pinned = ctx?.rent ?? null
  const asking = Number(room?.current_asking_rent) || null
  const monthly = cleanRent(typedRent) ?? pinned ?? asking
  const { data: earlierRow } = ctx?.offerId ? await s.from('offers').select('sent_at, advertised_rent').eq('id', ctx.offerId).maybeSingle() : { data: null }
  const earlier = (earlierRow as any)?.sent_at ? { at: (earlierRow as any).sent_at as string, rent: Number((earlierRow as any).advertised_rent) || null } : null
  const correction = earlier?.rent && monthly && Math.abs(earlier.rent - monthly) > 0.004
    ? `this replaces our earlier email of ${new Date(earlier.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })}. The rent is ${gbp(monthly)} a month, so your holding deposit is ${gbp(oneWeekRent(monthly))} — please use these figures.`
    : null
  const whole = !!ctx?.whole
  const roomName = room?.name || 'the room'
  const reserveUrl = `${APP_URL}/applicant/reserve?roomId=${a.room_id}&propertyId=${a.property_id}&a=${a.id}`
  const payRef = holdingDepositRef(property?.name || property?.address || null, room?.name || null)
  const firstName = hiName(a.first_name ? a : personFromText(a.full_name))
  const html = monthly ? await buildSearchIsOverEmail({
    applicantName: firstName, roomName, propertyAddress: oneLine(property?.address || property?.name), propertyCity: 'London',
    advertisedRent: monthly, applicationUrl: reserveUrl, holdingDeposit: oneWeekRent(monthly), holdingRef: payRef, whole,
    moveInDate: ctx?.startDate ?? null, term: ctx?.applicant?.preferred_term ?? null, billsIncluded: ctx?.billsIncluded ?? null, correction,
  }, req) : ''
  const subject = oneLine(correction ? `Updated: secure ${whole ? 'the property' : roomName} — corrected rent and holding deposit` : `Your offer has been accepted — secure ${whole ? 'the property' : roomName} now`)
  const sms = monthly ? `Hi ${firstName}, ${whole ? 'the property' : `${roomName}`} is ready to reserve — the holding deposit is ${gbp(oneWeekRent(monthly))} (one week of ${gbp(monthly)} a month): ${reserveUrl} — Capital Rooms` : ''
  return { to: a.email, subject, html, sms, rent: monthly, deposit: monthly ? oneWeekRent(monthly) : null, pinned, asking, earlier, reserveUrl }
}

/** After the email has gone: pin the rent on their offer and move them to "offer sent". */
export async function pinReserve(s: SupabaseClient, applicantId: string, rent: number, opts: { stage?: boolean } = {}) {
  const ctx = await loadDepositContext(s as any, applicantId)
  const { data: a } = await s.from('applicants').select('id, full_name, email, room_id, property_id, pipeline_stage').eq('id', applicantId).maybeSingle()
  if (!a) return
  const now = new Date().toISOString()
  let offerId = ctx?.offerId ?? null
  if (!offerId) {
    const { data: o } = await s.from('offers').insert({
      room_id: (a as any).room_id, property_id: (a as any).property_id, applicant_email: (a as any).email, applicant_name: (a as any).full_name || null,
      advertised_rent: rent, request_deposit: true, application_token: randomBytes(32).toString('hex'),
      token_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), applicant_id: applicantId, status: 'sent', sent_at: now,
    }).select('id').single()
    offerId = (o as any)?.id ?? null
  } else {
    await s.from('offers').update({ advertised_rent: rent, sent_at: now }).eq('id', offerId)
  }
  if (opts.stage === false) return
  // never backwards: someone already in referencing stays there
  const stage = STAGE_ORDER.indexOf((a as any).pipeline_stage) > STAGE_ORDER.indexOf('offer_sent') ? (a as any).pipeline_stage : 'offer_sent'
  await s.from('applicants').update({ pipeline_stage: stage, ...(offerId ? { offer_id: offerId } : {}), updated_at: now }).eq('id', applicantId)
}
