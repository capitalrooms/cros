// Ask (14 Nov 2026, "Garden Ask"): the Ask bar on the tenant, cleaner and contractor apps. A question about the house
// (or the job) is answered from that property's own details in CROS — bin days, house info, heating, cleaning notes,
// visits — never from guesses. Each person only gets facts they're allowed:
//   · a tenant: their own house, their own rent and visits
//   · a cleaner: the houses they clean (no codes, no tenants' details)
//   · a contractor: the houses where they have a job (no codes, no tenants' details beyond "Room 4, first floor")
// Codes are never given out here: a tenant opens them in House info, cleaners and contractors get the key safe when
// they tap "I've arrived" (lib/access/arrival).
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const SECRET = /key ?safe|alarm|code|pin\b|lock ?box|padlock/i

export const ACTIONS = {
  tenant: { report_repair: ['Report a repair', '/tenant/maintenance'], emergency: ['Emergency', '/tenant/emergency'], message: ['Message the office', '/tenant/inbox'], house_info: ['House info', '/tenant/property-info'], notices: ['Notice board', '/tenant/notices'], bins: ['Bins weren’t collected?', '/tenant/ask?bins=1'] },
  cleaner: { today: ['Today’s cleans', '/cleaner'], supplies: ['Supplies running low', '/cleaner?supplies=1'], message: ['Message the office', '/cleaner/profile'] },
  contractor: { jobs: ['My jobs', '/contractor'], message: ['Message the office', '/contractor/profile'] },
} as const
type Role = keyof typeof ACTIONS

const Answer = z.object({
  answer: z.string().describe('The reply: 1–4 short sentences in plain British English. Bold the key fact with **double asterisks**. No greeting.'),
  source: z.string().describe('Where it came from in a few words, e.g. "From the house guide" or "From the council’s bin schedule". Empty if you could not answer.'),
  actions: z.array(z.string()).describe('0–2 action keys from the allowed list that would help next.'),
  answered: z.boolean().describe('false if the details did not contain the answer'),
  open_id: z.string().describe('If the answer is about one particular job, clean or repair listed in the details, its id (the value after "id:") so they can open it. Empty otherwise.'),
})
export type AskReply = { answer: string; source: string; actions: { label: string; href: string }[]; answered: boolean }

function houseFacts(p: any, opts: { secrets: boolean }) {
  const info = ((p?.house_info?.items ?? []) as any[]).filter(i => i?.label && i?.value)
    .map(i => (SECRET.test(`${i.label}`) || (i.sensitive && !opts.secrets) || SECRET.test(`${i.value}`) && !opts.secrets) ? `${i.label}: (private — ${opts.secrets ? 'tap it in House info to see it' : 'shown on arrival'})` : `${i.label}: ${i.value}`)
  const sched = Array.isArray(p?.bin_schedule) ? (p.bin_schedule as any[]).filter(d => d.date >= today()).slice(0, 6).map(d => `${d.date}: ${(d.collections ?? []).map((c: any) => c.name).join(', ')}`).join('; ') : ''
  return [
    `PROPERTY: ${p.name}${p.address && p.address !== p.name ? `, ${p.address}` : ''}${p.postcode ? ` ${p.postcode}` : ''}`,
    p.bin_collection_day ? `Bin day (as recorded by the office): ${p.bin_collection_day}${p.bin_collection_info ? ` — ${p.bin_collection_info}` : ''}` : '',
    sched ? `Council bin schedule (looked up ${String(p.bin_checked_at ?? '').slice(0, 10)}): ${sched}` : '',
    p.council_name ? `Council: ${p.council_name}${p.council_website ? ` (${p.council_website})` : ''}` : '',
    p.heating_schedule ? `Heating: ${JSON.stringify(p.heating_schedule)}` : '',
    p.communal_notes ? `Shared areas: ${p.communal_notes}` : '',
    p.clean_day ? `House clean: usually ${p.clean_day}${p.clean_time ? ` at ${String(p.clean_time).slice(0, 5)}` : ''}` : '',
    p.appliances ? `Appliances: ${typeof p.appliances === 'string' ? p.appliances : JSON.stringify(p.appliances).slice(0, 800)}` : '',
    p.fire_safety_notes ? `Fire safety: ${p.fire_safety_notes}` : '',
    info.length ? `House info:\n- ${info.join('\n- ')}` : '',
  ].filter(Boolean).join('\n')
}

const PROP_COLS = 'id, name, address, postcode, bin_collection_day, bin_collection_info, council_name, council_website, heating_schedule, communal_notes, clean_day, clean_time, appliances, fire_safety_notes, house_info'
async function props(s: SupabaseClient, ids: string[]) {
  if (!ids.length) return []
  // the looked-up bin schedule arrives with migration 289 — read it separately so its absence breaks nothing
  const [{ data }, { data: bins }] = await Promise.all([
    s.from('properties').select(PROP_COLS).in('id', ids),
    s.from('properties').select('id, bin_schedule, bin_checked_at').in('id', ids),
  ])
  return ((data ?? []) as any[]).map(p => ({ ...p, ...(((bins ?? []) as any[]).find(b => b.id === p.id) ?? {}) }))
}

/** Everything this person may be told, as plain text for the model. */
export async function factsFor(s: SupabaseClient, role: Role, personId: string): Promise<string> {
  const t = today()
  if (role === 'tenant') {
    const { data: ten } = await s.from('tenancies').select('id, property_id, room_id, rent_amount, rent_due_day, start_date, rooms(name, location_in_house)')
      .or(`person_id.eq.${personId},co_tenant_id.eq.${personId}`).is('let_cancelled_at', null).lte('start_date', t).or(`end_date.is.null,end_date.gte.${t}`).order('start_date', { ascending: false }).limit(1).maybeSingle() as { data: any }
    if (!ten) return 'This person has no current tenancy on CROS.'
    const [p] = await props(s, [ten.property_id])
    const [{ data: jobs }, { data: cleans }] = await Promise.all([
      s.from('maintenance_tickets').select('title, category, booked_date, booked_slot, status, room_id').eq('property_id', ten.property_id).gte('booked_date', t).not('status', 'in', '(completed,cancelled)').order('booked_date').limit(6),
      s.from('cleans').select('clean_date, clean_time, status').eq('property_id', ten.property_id).gte('clean_date', t).not('status', 'in', '(cancelled)').order('clean_date').limit(4),
    ])
    const { data: mine } = await s.from('maintenance_tickets').select('id, title, category, status, created_at, booked_date').eq('reporter_id', personId).order('created_at', { ascending: false }).limit(15)
    return [houseFacts(p, { secrets: true }),
      `THEIR ROOM: ${ten.rooms?.name ?? 'the whole property'}${ten.rooms?.location_in_house ? ` (${ten.rooms.location_in_house})` : ''}`,
      ten.rent_amount ? `THEIR RENT: £${ten.rent_amount} a month${ten.rent_due_day ? `, due on day ${ten.rent_due_day} of each month` : ''}` : '',
      `NOTICE: a rolling tenancy (Renters' Rights rules) — the tenant gives 2 months' notice. No fixed or minimum terms.`,
      `VISITS BOOKED: ${((jobs ?? []) as any[]).map(j => `${j.booked_date} ${j.booked_slot ?? ''} ${j.title || j.category}${j.room_id === ten.room_id ? ' (their room)' : ''}`).join('; ') || 'none'}`,
      `CLEANS BOOKED: ${((cleans ?? []) as any[]).map(c => `${c.clean_date}${c.clean_time ? ` ${String(c.clean_time).slice(0, 5)}` : ''}`).join('; ') || 'none'}`,
      `THEIR REPAIR REQUESTS (newest first): ${((mine ?? []) as any[]).map(j => `[id:${j.id}] ${String(j.created_at).slice(0, 10)} ${j.title || j.category} — ${String(j.status).replace(/_/g, ' ')}${j.booked_date ? `, visit ${j.booked_date}` : ''}`).join('; ') || 'none'}`,
    ].filter(Boolean).join('\n')
  }
  if (role === 'cleaner') {
    const { data: cl } = await s.from('cleans').select('id, property_id, clean_date, clean_time, status').eq('cleaner_id', personId).gte('clean_date', new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)).order('clean_date')
    const ids = [...new Set(((cl ?? []) as any[]).map(c => c.property_id).filter(Boolean))].slice(0, 12)
    const list = await props(s, ids)
    const { data: notes } = ids.length ? await s.from('property_cleaning_notes').select('property_id, note_title, note_content').in('property_id', ids).eq('is_completed', false).eq('is_deleted', false).limit(40) : { data: [] }
    return [`THEIR CLEANS (last 2 months and coming up): ${((cl ?? []) as any[]).slice(-20).map(c => `[id:${c.id}] ${c.clean_date} ${String(c.clean_time ?? '').slice(0, 5)} ${list.find(p => p.id === c.property_id)?.name ?? ''} — ${c.status}`).join('; ') || 'none booked'}`,
      ...list.map(p => [houseFacts(p, { secrets: false }), ...((notes ?? []) as any[]).filter(n => n.property_id === p.id).map(n => `Cleaning note: ${n.note_title}${n.note_content ? ` — ${n.note_content}` : ''}`)].join('\n'))].join('\n\n')
  }
  const { data: jobs } = await s.from('maintenance_tickets').select('id, title, description, category, property_id, booked_date, booked_slot, status, created_at, rooms(name, location_in_house)').eq('contractor_id', personId).order('created_at', { ascending: false }).limit(40)
  const ids = [...new Set(((jobs ?? []) as any[]).map(j => j.property_id).filter(Boolean))].slice(0, 10)
  const list = await props(s, ids)
  return [`TODAY: ${t}`, `THEIR JOBS, newest first (open and finished): ${((jobs ?? []) as any[]).map(j => `[id:${j.id}] ${j.title || j.category}${j.description && j.description !== j.title ? ` (${String(j.description).slice(0, 80)})` : ''} — ${String(j.status).replace(/_/g, ' ')} — at ${list.find(p => p.id === j.property_id)?.name ?? ''}${j.rooms?.name ? ` — ${j.rooms.name}${j.rooms.location_in_house ? ` (${j.rooms.location_in_house})` : ''}` : ''}${j.booked_date ? ` on ${j.booked_date} ${j.booked_slot ?? ''}` : ' (not booked yet)'}`).join('; ') || 'none'}`,
    ...list.map(p => houseFacts(p, { secrets: false }))].join('\n\n')
}

export async function answerQuestion(s: SupabaseClient, role: Role, personId: string, question: string, history: { role: 'user' | 'assistant'; content: string }[] = []): Promise<AskReply> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Ask isn’t set up yet')
  const facts = await factsFor(s, role, personId)
  const allowed = Object.entries(ACTIONS[role]).map(([k, [label]]) => `${k} (${label})`).join(', ')
  const who = role === 'tenant' ? 'a tenant living in the property' : role === 'cleaner' ? 'a cleaner who cleans these properties' : 'a contractor doing jobs at these properties'
  const system = `You answer questions in the Capital Rooms app for ${who}. Today is ${today()} (Europe/London).
Answer ONLY from the DETAILS below. If they don't contain the answer, say you don't have that yet and suggest messaging the office (set answered=false) — never guess.
- Never give a key safe, alarm or door code. ${role === 'tenant' ? 'Tell them to tap it in House info.' : 'Say it shows when they tap "I’ve arrived" on their booked visit.'}
- Gas smell, fire, flooding or anything dangerous: tell them to leave and call 999 (gas: 0800 111 999) first, then add the emergency action.
- A problem with the property (something broken, not working, leaking): only suggest a check if the DETAILS describe one (e.g. a heating schedule or appliance note) — never general tips of your own. Then suggest report_repair.
- Never show the [id:…] values in your answer; put the one you mean in open_id.
- Say "property" or "room", never "home". British English, warm and short.
Allowed action keys: ${allowed}.

DETAILS:
${facts}`
  const res = await client.beta.messages.parse({
    model: AI_MODEL_SMART, max_tokens: 800,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Answer) },
    system, messages: [...history.slice(-6), { role: 'user', content: question.slice(0, 600) }],
  } as any)
  const out = (res as any).parsed_output as z.infer<typeof Answer> | null
  if (!out) throw new Error('No answer came back — try again')
  const acts = ACTIONS[role] as Record<string, readonly [string, string]>
  const actions = out.actions.filter(k => acts[k]).slice(0, 2).map(k => ({ label: acts[k][0], href: acts[k][1] }))
  // the job, clean or repair it's talking about — only one actually listed for this person
  const id = String(out.open_id ?? '').trim()
  if (/^[0-9a-f-]{36}$/i.test(id) && facts.includes(`[id:${id}]`)) actions.unshift({ label: role === 'contractor' ? 'Open the job' : role === 'cleaner' ? 'Open the clean' : 'Open the request', href: role === 'contractor' ? `/contractor/job/${id}` : role === 'cleaner' ? `/cleaner/clean/${id}` : `/tenant/visit/${id}` })
  return { answer: out.answer, source: out.source, answered: out.answered, actions: actions.slice(0, 2) }
}
