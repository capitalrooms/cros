// Holding deposit received → tell the landlord we've secured an applicant (with a short bio) and tell the
// current housemates someone new is on the way (first name, work and interests only).
// Used by app/api/lettings/holding-deposit and components/HoldingDepositModal.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { oneWeekRent } from '@/lib/tenancy/deposit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface DepositContext {
  applicant: {
    id: string; full_name: string; email: string | null; profession: string | null; bio: string | null
    profession_description: string | null; interests: string | null; sociability: string | null
    house_preferences: string | null; preferred_start_date: string | null; preferred_term: string | null
    offered_rent: number | null; rent_offer_type: string | null; pipeline_stage: string | null
    offer_id: string | null; converted_person_id: string | null; room_id: string; property_id: string
  }
  roomName: string
  propertyName: string
  propertyAddress: string
  billsIncluded: boolean | null
  rent: number | null
  startDate: string | null
  offerId: string | null
  offerStatus: string | null
  landlord: { id: string; greeting: string; email: string[]; name: string } | null
}

export async function loadDepositContext(svc: SupabaseClient, applicantId: string): Promise<DepositContext | null> {
  const { data: a } = await svc.from('applicants')
    .select('id, full_name, email, profession, bio, profession_description, interests, sociability, house_preferences, preferred_start_date, preferred_term, offered_rent, rent_offer_type, pipeline_stage, offer_id, converted_person_id, room_id, property_id, rooms(name, current_asking_rent), properties(name, address, bills_included, landlord_id)')
    .eq('id', applicantId).maybeSingle() as { data: any }
  if (!a) return null

  // The offer this applicant came through: the linked one, else the latest for their email and room
  let offer: any = null
  if (a.offer_id) ({ data: offer } = await svc.from('offers').select('id, status, advertised_rent, move_in_date').eq('id', a.offer_id).maybeSingle())
  if (!offer && a.email) {
    ({ data: offer } = await svc.from('offers').select('id, status, advertised_rent, move_in_date')
      .eq('room_id', a.room_id).ilike('applicant_email', a.email).order('created_at', { ascending: false }).limit(1).maybeSingle())
  }

  let landlord: DepositContext['landlord'] = null
  if (a.properties?.landlord_id) {
    const { data: l } = await svc.from('people')
      .select('id, first_name, last_name, full_name, salutation, email, joint_first_name, joint_email')
      .eq('id', a.properties.landlord_id).maybeSingle() as { data: any }
    if (l) landlord = {
      id: l.id,
      greeting: [l.first_name, l.joint_first_name].filter(Boolean).join(' and ') || l.full_name || 'Sir or Madam',
      email: [l.email, l.joint_email].filter(Boolean),
      name: [l.salutation, l.first_name, l.last_name].filter(Boolean).join(' ') || l.full_name || '',
    }
  }

  const rent = (a.rent_offer_type === 'below_asking' && a.offered_rent) ? Number(a.offered_rent)
    : Number(offer?.advertised_rent ?? a.rooms?.current_asking_rent ?? 0) || null
  return {
    applicant: a,
    roomName: a.rooms?.name ?? 'the room',
    propertyName: a.properties?.name ?? '',
    propertyAddress: a.properties?.address || a.properties?.name || '',
    billsIncluded: a.properties?.bills_included ?? null,
    rent,
    startDate: a.preferred_start_date ?? offer?.move_in_date ?? null,
    offerId: offer?.id ?? null,
    offerStatus: offer?.status ?? null,
    landlord,
  }
}

export const holdingAmount = (ctx: DepositContext) => (ctx.rent ? oneWeekRent(ctx.rent) : null)

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// ── Bios ────────────────────────────────────────────────────────────────────

const BioSchema = z.object({
  landlordBio: z.string().describe('2–3 sentences for the landlord, third person, may use their full name'),
  housemateBio: z.string().describe('1–2 friendly sentences for future housemates, first name only'),
})

const BIO_SYSTEM = `You write short introductions of incoming tenants for a London house-share lettings agency.
You get what the applicant wrote about themselves on their application. Write two versions:
- landlordBio: 2–3 sentences, warm but professional, third person, for the landlord. Work, what they are like to live with, interests.
- housemateBio: 1–2 friendly sentences for the people already living in the house, using their first name only (their given name, which may be more than one word, e.g. "Tsz Ching"), never their surname. Work (in general terms), interests and what they are like to live with.
Rules for both: only use what the applicant wrote — do not invent anything. Refer to them by name or as "they"; never guess their gender from their name (use he/she only if they state their pronouns). Never include surname (in the housemate version), age, date of birth, nationality, email, phone, addresses, employer's exact address, salary, income, rent, deposit, references or any financial detail. British English. No emojis. If they gave very little, keep it short.`

export async function writeBios(ctx: DepositContext): Promise<{ landlordBio: string; housemateBio: string }> {
  const a = ctx.applicant
  const first = a.full_name.trim().split(/\s+/)[0] || 'They'
  const facts = [
    `Full name: ${a.full_name}`,
    a.profession && `Job: ${a.profession}`,
    a.profession_description && `About their work: ${a.profession_description}`,
    a.bio && `Bio: ${a.bio}`,
    a.interests && `Interests: ${a.interests}`,
    a.sociability && `Sociability: ${a.sociability.replace(/-/g, ' ')}`,
    a.house_preferences && `What matters to them in a shared house: ${a.house_preferences}`,
  ].filter(Boolean).join('\n')

  const fallback = {
    landlordBio: a.profession ? `${a.full_name} works as ${a.profession}.` : '',
    housemateBio: a.profession ? `${first} works as ${a.profession}.` : '',
  }
  if (!process.env.ANTHROPIC_API_KEY || !(a.bio || a.profession_description || a.interests)) return fallback
  try {
    const res = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(BioSchema) },
      system: BIO_SYSTEM,
      messages: [{ role: 'user', content: `<application>\n${facts}\n</application>` }],
    })
    return res.stop_reason === 'end_turn' && res.parsed_output ? res.parsed_output : fallback
  } catch (e) {
    console.error('holding deposit: bio drafting failed', e)
    return fallback
  }
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface DepositDrafts {
  landlord: { to: string[]; subject: string; message: string } | null
  housemates: { title: string; message: string; count: number }
  amount: number | null
}

export function landlordMessage(ctx: DepositContext, bio: string): { subject: string; message: string } {
  const a = ctx.applicant
  const place = [ctx.roomName, ctx.propertyAddress].filter(Boolean).join(', ')
  const bills = ctx.billsIncluded == null ? '' : ctx.billsIncluded ? ', inclusive of bills' : ', exclusive of bills'
  return {
    subject: `Applicant secured — ${place}`,
    message: [
      `Dear ${ctx.landlord?.greeting ?? 'Sir or Madam'},`,
      `Re: ${place}`,
      'We are delighted to let you know that, further to your instructions, we have secured an applicant for the above room, subject to satisfactory references and your approval.',
      'We have taken a holding deposit and have therefore taken the room off the market while references are obtained.',
      `The prospective tenant is ${a.full_name}, who will be taking the room${ctx.rent ? ` at a rent of ${gbp(ctx.rent)} pcm, payable in advance${bills}` : ''}, on an assured periodic tenancy.${ctx.startDate ? ` The tenancy is provisionally set to start on ${longDate(ctx.startDate)}.` : ''}`,
      ...(bio.trim() ? [bio.trim()] : []),
      'We hope this is to your satisfaction. Should you need any further information, please do not hesitate to contact us.',
      'Kind regards,',
    ].join('\n\n'),
  }
}

export function housemateMessage(ctx: DepositContext, bio: string): { title: string; message: string } {
  const month = ctx.startDate
    ? new Date(`${ctx.startDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    : ''
  return {
    title: 'A new housemate is on the way 🏡',
    message: `Good news — we've found someone to join you at ${ctx.propertyName || 'the house'}.${bio.trim() ? ` ${bio.trim()}` : ''}${month ? ` They're due to move in around ${month}.` : ''} Please give them a warm welcome!`,
  }
}
