// Who you'd live with, on an advert (12 Nov 2026, Harry: "populate the marketing adverts with information about the
// housemates which they have uploaded"). Built from the "say hello" answers of tenants who live in the house's OTHER
// rooms today and ticked "show a short intro on adverts" (migration 277 — a separate yes from sharing with
// housemates). Never their name, never their photo, never contact details: their avatar, what they do, where they're
// from, weekends, early bird / night owl, and how they are with housemates. Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAvatar, avatarBg } from '@/lib/housemates/avatar'
import { occupantsOf, describe } from '@/lib/letOnly/occupants'

export interface HousemateIntro { emoji: string; bg: string; does: string | null; from: string | null; weekends: string[]; rhythm: string | null; vibe: string | null
  /** "Male, 27" — let-only housemates, as the landlord gave it (12 Nov 2026) */
  who?: string | null; line?: string | null }

const clean = (v: unknown, max = 80) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null }
// a tenant may have typed a name or contact into "what do you do" — keep the advert nameless and contact-free
const safe = (v: string | null) => v && !/@|https?:|www\.|\d{5,}/i.test(v) ? v : null

export async function housemateIntros(s: SupabaseClient, propertyId: string, exceptRoomId: string): Promise<HousemateIntro[]> {
  // a let-only house: the people the landlord told us about and said are happy to be mentioned (lib/letOnly/occupants)
  const { data: house } = await s.from('properties').select('letting_type').eq('id', propertyId).maybeSingle() as { data: any }
  if (house?.letting_type === 'let_only') {
    const occ = (await occupantsOf(s, propertyId)).filter(o => o.share && o.roomId !== exceptRoomId)
    return occ.map((o, i) => {
      const g = o.gender && /^m/i.test(o.gender) ? 'Male' : o.gender && /^f/i.test(o.gender) ? 'Female' : null
      return { emoji: ['🙂', '😊', '😎', '🤓', '🌻', '🎧'][i % 6], bg: avatarBg(null), does: o.occupation, from: null, weekends: [], rhythm: null, vibe: null,
        who: [g, o.age ? String(o.age) : null].filter(Boolean).join(', ') || null, line: describe(o) || null }
    }).filter(h => h.does || h.who)
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data: lets } = await s.from('tenancies').select('person_id, co_tenant_id, room_id, end_date, let_cancelled_at')
    .eq('property_id', propertyId).lte('start_date', today) as { data: any[] | null }
  const people = [...new Set((lets ?? []).filter(t => !t.let_cancelled_at && (!t.end_date || t.end_date >= today) && t.room_id && t.room_id !== exceptRoomId)
    .flatMap(t => [t.person_id, t.co_tenant_id]).filter(Boolean))]
  if (!people.length) return []
  const { data, error } = await s.from('tenant_icebreakers').select('person_id, answers, show_on_adverts').in('person_id', people).eq('show_on_adverts', true) as { data: any[] | null; error: any }
  if (error) return []   // before migration 277: nobody has said yes yet
  return (data ?? []).map(r => {
    const a = r.answers ?? {}
    const av = parseAvatar(a.avatar)
    return {
      emoji: av?.emoji ?? '🙂', bg: avatarBg(av),
      does: safe(clean(a.about_me)), from: safe(clean(a.from, 60)),
      weekends: String(a.weekends ?? '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4),
      rhythm: clean(a.rhythm, 40), vibe: clean(a.house_vibe, 60),
    }
  }).filter(h => h.does || h.from || h.weekends.length || h.rhythm || h.vibe)
}

/** The housemates as plain lines, for the AI that writes the adverts. */
export const introLines = (hs: HousemateIntro[]) => hs.map(h => h.line ? h.line : [h.does, h.from && `from ${h.from}`, h.weekends.length && `weekends: ${h.weekends.join(', ').toLowerCase()}`, h.rhythm?.toLowerCase(), h.vibe && `with housemates: ${h.vibe.toLowerCase()}`].filter(Boolean).join('; '))
