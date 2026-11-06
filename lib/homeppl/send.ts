// "Send to Homeppl" from the letting file (6 Nov 2026). Server-only.
//   sendToHomeppl(s, tenancyId, by, { preview: true }) → what would be sent (shown to staff to confirm), nothing sent
//   sendToHomeppl(s, tenancyId, by)                    → creates the rental application at Homeppl, which emails the
//                                                        tenant (and guarantor) their referencing link straight away
// Always the FULL check — the most comprehensive tenant reference (Harry: "I always choose the most comprehensive").
// Refused when the tenant already has a live check at Homeppl, so nobody is invited (or billed) twice.
import type { SupabaseClient } from '@supabase/supabase-js'
import { hp, checkTypes, validationsByEmail, currentValidation } from './client'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'

const TITLES = /^(mr|mrs|miss|ms|mx|dr|prof|sir|lady|lord)\.?$/i
function splitName(full: string): { first_name: string; last_name: string; middle_name?: string } | null {
  const w = full.trim().split(/\s+/).filter(x => !TITLES.test(x))
  if (w.length < 2) return null
  return { first_name: w[0], last_name: w[w.length - 1], ...(w.length > 2 ? { middle_name: w.slice(1, -1).join(' ') } : {}) }
}
/** UK numbers as Homeppl stores them: +447…  */
export function intlPhone(p: string | null | undefined): string {
  const d = String(p ?? '').replace(/[^\d+]/g, '')
  if (!d) return ''
  if (d.startsWith('+')) return d
  if (d.startsWith('00')) return `+${d.slice(2)}`
  if (d.startsWith('0')) return `+44${d.slice(1)}`
  if (d.startsWith('44')) return `+${d}`
  return d
}
function addressOf(p: { address?: string | null; name?: string | null; postcode?: string | null }) {
  const lines = String(p.address || p.name || '').split(/\n|,/).map(x => x.trim()).filter(Boolean)
  const postcode = (p.postcode || lines.find(l => /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(l)) || '').toUpperCase()
  const body = lines.filter(l => l.toUpperCase() !== postcode)
  const flat = body[0]?.match(/^(flat|apartment|unit)\s+(\S+)$/i)?.[2] ?? null
  const streetLine = flat ? body[1] : body[0]
  const m = streetLine?.match(/^(\d+[a-z]?)\s+(.+)$/i)
  const city = body.find(l => /^london$/i.test(l)) ?? (body.length > 1 ? body[body.length - 1] : 'London')
  return {
    formatted_address: [...body, postcode].filter(Boolean).join(', '),
    ...(m ? { street_number: m[1], street: m[2] } : streetLine ? { street: streetLine } : {}),
    ...(flat ? { flat_number: flat } : {}),
    city, postal_code: postcode, country: 'GB',
  }
}

export interface SendPlan {
  tenant: string; email: string; phone: string; moveIn: string; rent: number; address: string; room: string | null
  guarantor: string | null; check: 'FULL'
}

export async function sendToHomeppl(s: SupabaseClient, tenancyId: string, byEmail: string | null, o: { preview?: boolean } = {}): Promise<{ plan: SendPlan; sent: boolean; applicationUuid?: string }> {
  const { data: t } = await s.from('tenancies').select('id, rent_amount, start_date, let_cancelled_at, referencing_sent_at, applicant_id, lease_reference, rooms(name), properties(name, address, postcode), people:person_id(first_name, middle_name, last_name, email, phone)').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) throw new Error('Tenancy not found')
  if (t.let_cancelled_at) throw new Error('This let fell through — nothing to send')
  const p = t.people ?? {}
  const missing = [!p.first_name && 'first name', !p.last_name && 'surname', !p.email && 'email', !p.phone && 'mobile', !t.rent_amount && 'rent', !t.start_date && 'move-in date'].filter(Boolean)
  if (missing.length) throw new Error(`Add the tenant’s ${missing.join(', ')} first`)
  const { data: ap } = t.applicant_id ? await s.from('applicants').select('guarantor_needed, guarantor_name, guarantor_email, guarantor_phone').eq('id', t.applicant_id).maybeSingle() as { data: any } : { data: null }
  const g = ap?.guarantor_name ? splitName(ap.guarantor_name) : null
  if (ap?.guarantor_name && (!g || !ap.guarantor_email || !ap.guarantor_phone)) throw new Error('The guarantor needs a full name, email and mobile on the applicant’s record before sending')

  const existing = currentValidation(await validationsByEmail(p.email, p.last_name, p.first_name))
  if (existing && !String(existing.status).startsWith('CANCELLED'))
    throw new Error(`${p.first_name} ${p.last_name} already has a check at Homeppl (${existing.status.toLowerCase()}, started ${existing.created.slice(0, 10)}) — nothing sent`)

  const addr = addressOf(t.properties ?? {})
  const rent = Number(t.rent_amount)
  const plan: SendPlan = {
    tenant: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' '), email: p.email, phone: intlPhone(p.phone),
    moveIn: t.start_date, rent, address: addr.formatted_address, room: t.rooms?.name && !/whole/i.test(t.rooms.name) ? t.rooms.name : null,
    guarantor: g ? `${ap.guarantor_name} · ${ap.guarantor_email} · ${intlPhone(ap.guarantor_phone)}` : null, check: 'FULL',
  }
  if (o.preview) return { plan, sent: false }

  const full = (await checkTypes()).FULL
  if (!full) throw new Error('Homeppl didn’t offer the FULL check for this account')
  const body = {
    property_details: {
      address: addr, rent, currency: 'GBP', payment_term: 'Monthly', tenancy_term: null,
      comment: plan.room ? `${plan.room} (room in a shared house)` : null,
      affiliate_reference: String(t.lease_reference || t.id).slice(0, 255),
    },
    tenant_details: [{
      first_name: p.first_name, last_name: p.last_name, ...(p.middle_name ? { middle_name: p.middle_name } : {}),
      email: p.email, phone: plan.phone, move_in_date: t.start_date, rent_payment: 0, share_of_rent: rent, check_type_tag: full,
      ...(g ? { guarantor: { ...g, email: ap.guarantor_email, phone: intlPhone(ap.guarantor_phone) } } : {}),
    }],
  }
  const r = await hp('/api/v3/applications/', { method: 'POST', body: JSON.stringify(body) })
  const made = await r.json().catch(() => ({}))
  const today = new Date().toISOString().slice(0, 10)
  if (!t.referencing_sent_at) await s.from('tenancies').update({ referencing_sent_at: today }).eq('id', tenancyId)
  await logTenancyEvent(s, tenancyId, 'homeppl_sent', `Sent to Homeppl (full check)${g ? ' with guarantor' : ''} — Homeppl emails ${p.first_name}${g ? ' and the guarantor' : ''} the referencing link`, byEmail)
  return { plan, sent: true, applicationUuid: made?.uuid }
}
