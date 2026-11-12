// Who lives in a let-only house (12 Nov 2026, Harry): the landlord tells us — we email them asking, they reply, we
// paste the reply in (lib/letOnly/roomList) — and CROS keeps each person (let_only_occupants, reference only, never a
// tenancy). Used to text and email them when a viewing is booked or moved, to greet them by name, and — where the
// landlord confirmed the tenant is happy — to describe the household on adverts ("a 27-year-old male software
// developer"), never naming anyone. Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Occupant {
  id: string; propertyId: string; roomId: string; roomName: string; name: string; phone: string | null; email: string | null
  occupation: string | null; age: number | null; gender: string | null; share: boolean; moveIn: string | null; source: string | null
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
/** an age given on a date counts on from there */
export const ageNow = (age: number | null, noted: string | null) => {
  if (!age) return null
  if (!noted) return age
  const years = Math.floor((Date.parse(today()) - Date.parse(noted)) / (365.25 * 86400000))
  return age + Math.max(0, years)
}

export async function occupantsOf(s: SupabaseClient, propertyId: string): Promise<Occupant[]> {
  let { data, error } = await s.from('let_only_occupants').select('id, property_id, room_id, name, phone, email, occupation, age, age_noted_on, gender, share_on_adverts, move_in, source, rooms(name)')
    .eq('property_id', propertyId).is('ended_at', null) as { data: any[] | null; error: any }
  if (error) ({ data } = await s.from('let_only_occupants').select('id, property_id, room_id, name, phone, email, move_in, source, rooms(name)').eq('property_id', propertyId).is('ended_at', null) as { data: any[] | null })   // before migration 278
  return (data ?? []).map(o => ({
    id: o.id, propertyId: o.property_id, roomId: o.room_id, roomName: o.rooms?.name ?? 'Room', name: o.name, phone: o.phone ?? null, email: o.email ?? null,
    occupation: o.occupation ?? null, age: ageNow(o.age ?? null, o.age_noted_on ?? null), gender: o.gender ?? null, share: o.share_on_adverts === true,
    moveIn: o.move_in ?? null, source: o.source ?? null,
  })).sort((a, b) => a.roomName.localeCompare(b.roomName, 'en', { numeric: true }))
}

/** "a 27-year-old male software developer" — only the parts the landlord gave */
export function describe(o: { occupation: string | null; age: number | null; gender: string | null }): string {
  const g = o.gender && /^(m|male|man)$/i.test(o.gender) ? 'male' : o.gender && /^(f|female|woman)$/i.test(o.gender) ? 'female' : o.gender || ''
  const job = (o.occupation ?? '').trim()
  const bits = [o.age ? `${o.age}-year-old` : '', g, job ? job.charAt(0).toLowerCase() + job.slice(1) : (g || o.age ? 'professional' : '')].filter(Boolean).join(' ')
  return bits ? `${/^[aeiou8]/i.test(bits) || /^(18|11)-/.test(bits) ? 'an' : 'a'} ${bits}` : ''
}

/** The email asking the landlord who lives there — they reply, and we paste the reply in. */
export function askLandlordEmail(o: { dear: string; house: string; rooms: string[]; senderFirst: string }): { subject: string; text: string } {
  const lines = o.rooms.map(r => `${r}: first name — mobile — email — what they do — age — male/female — happy to be mentioned on adverts (no names)? yes/no`)
  return {
    subject: `Who lives at ${o.house}?`,
    text: `${o.dear}

So we can give your tenants notice before any viewings at ${o.house}, could you reply with who lives in each room? Just fill in what you have — the mobile number matters most, as we text a heads-up before every viewing.

${lines.join('\n')}

What they do, their age and male/female help us describe the household on the advert (for example “you’d be sharing with a 27-year-old male software developer”). We never put names or contact details on adverts, and only mention people you’ve told us are happy to be mentioned.

If anyone has moved out, or a room is empty, just say. Thank you!

${o.senderFirst}`,
  }
}
