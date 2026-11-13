// The task bar's planner (13 Nov 2026, Harry: "a quick task search bar in admin where we could literally say what we want
// to do … then it shows you the options before sending"). What was typed → Claude looks people, properties, rooms,
// contractors and areas up with read-only tools → it answers, asks which one, or proposes actions. A proposal is only a
// filled-in card: NOTHING is sent or saved here. The office checks the card, edits it, and confirms — and the confirm goes
// through the same CROS route the matching screen uses (components/admin/TaskBar), with the same sign-in and checks.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { ZONES } from '@/lib/adminNav'
import { reportPacks, reportCommentary } from '@/lib/rents/report'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const name = (p: any) => [p?.salutation, p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || p?.email || ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export type Action =
  | { kind: 'message'; title: string; recipients: { name: string; email: string | null; phone: string | null; personId?: string | null }[]; subject: string; message: string; email: boolean; sms: boolean; statementTenancyId?: string | null }
  | { kind: 'house_message'; title: string; propertyId: string; propertyName: string; roomId?: string | null; roomName?: string | null; subject: string; message: string; channels: string }
  | { kind: 'wifi'; title: string; propertyId: string; propertyName: string; network: string; password: string; supplier?: string | null; serviceId?: string | null }
  | { kind: 'quotes'; title: string; roomId: string; roomName: string; propertyName: string; job: string; details: string; when: 'empty' | 'asap'; contractors: { id: string; name: string }[]; others: { name: string; email: string; phone?: string }[]; message?: string }
  | { kind: 'market_report'; title: string; codes: string[]; areaNames: string[]; focus: string; to: { name: string; email: string } | null; landlordId?: string | null; commentary?: string }
  | { kind: 'expense'; title: string; propertyId: string; propertyName: string; description: string; amount: number; expense_date: string; supplier?: string | null; invoice_number?: string | null }
  | { kind: 'publish'; title: string; brief: string; tone: 'friendly' | 'professional' | 'celebratory' | 'important'; withMarket: boolean }
  | { kind: 'open'; title: string; href: string }
export interface Plan { message: string; choices: string[]; actions: Action[] }

// ── read-only lookups ────────────────────────────────────────────────────────────────────────────────────────────
async function currentTenancies(s: SupabaseClient, personIds: string[]) {
  if (!personIds.length) return new Map<string, any>()
  const { data } = await s.from('tenancies').select('id, person_id, co_tenant_id, start_date, end_date, rent_amount, property_id, room_id, rooms(name), properties(name, address)')
    .or(`person_id.in.(${personIds.join(',')}),co_tenant_id.in.(${personIds.join(',')})`).is('let_cancelled_at', null).order('start_date', { ascending: false })
  const t = today(), out = new Map<string, any>()
  for (const id of personIds) {
    const mine = ((data ?? []) as any[]).filter(x => x.person_id === id || x.co_tenant_id === id)
    const pick = mine.find(x => x.start_date <= t && (!x.end_date || x.end_date >= t)) ?? mine.find(x => x.start_date > t) ?? mine[0]
    if (pick) out.set(id, { tenancyId: pick.id, status: pick.start_date > t ? 'moving in' : pick.end_date && pick.end_date < t ? 'past tenant' : 'current', property: pick.properties?.name ?? pick.properties?.address, propertyId: pick.property_id, room: pick.rooms?.name ?? null, roomId: pick.room_id, rent: pick.rent_amount, start: pick.start_date, end: pick.end_date })
  }
  return out
}

const clean = (q: unknown) => String(q ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)

async function findPeople(s: SupabaseClient, q: string, role?: string) {
  const like = `%${clean(q)}%`
  let req = s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, phone, role')
    .or([`first_name.ilike.${like}`, `last_name.ilike.${like}`, `full_name.ilike.${like}`, `email.ilike.${like}`, `company.ilike.${like}`].join(',')).limit(10)
  if (role) req = req.eq('role', role)
  const { data } = await req
  const people = (data ?? []) as any[]
  const ten = await currentTenancies(s, people.filter(p => p.role === 'tenant').map(p => p.id))
  return people.map(p => ({ id: p.id, name: name(p), role: p.role, company: p.company ?? undefined, email: p.email, phone: p.phone, tenancy: ten.get(p.id) }))
}

async function findProperty(s: SupabaseClient, q: string) {
  const like = `%${clean(q)}%`
  const { data: props } = await s.from('properties').select('id, name, address, postcode, landlord_id').or(`name.ilike.${like},address.ilike.${like},postcode.ilike.${like}`).limit(4)
  const out = []
  for (const p of (props ?? []) as any[]) {
    const [{ data: rooms }, { data: ll }, { data: wifi }, { data: lets }] = await Promise.all([
      s.from('rooms').select('id, name').eq('property_id', p.id),
      p.landlord_id ? s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, phone').eq('id', p.landlord_id).maybeSingle() : Promise.resolve({ data: null }),
      s.from('property_services').select('id, supplier, wifi_network').eq('property_id', p.id).eq('kind', 'internet').is('ended_at', null).limit(1),
      s.from('tenancies').select('person_id, room_id, start_date, end_date').eq('property_id', p.id).is('let_cancelled_at', null).lte('start_date', today()).or(`end_date.is.null,end_date.gte.${today()}`),
    ]) as any[]
    const ids = [...new Set(((lets ?? []) as any[]).map(l => l.person_id).filter(Boolean))]
    const { data: tenants } = ids.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, email, phone').in('id', ids) : { data: [] }
    const byId = new Map(((tenants ?? []) as any[]).map(t => [t.id, t]))
    out.push({
      id: p.id, name: p.name || p.address, address: [p.address, p.postcode].filter(Boolean).join(', '),
      landlord: ll ? { id: ll.id, name: name(ll), company: ll.company ?? undefined, email: ll.email, phone: ll.phone } : null,
      internet: (wifi ?? [])[0] ? { serviceId: wifi[0].id, supplier: wifi[0].supplier, network: wifi[0].wifi_network } : null,
      rooms: ((rooms ?? []) as any[]).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })).map(r => {
        const here = ((lets ?? []) as any[]).filter(l => l.room_id === r.id).map(l => byId.get(l.person_id)).filter(Boolean)
        return { id: r.id, name: r.name, tenants: here.map((t: any) => ({ id: t.id, name: name(t), email: t.email, phone: t.phone })) }
      }),
      wholePropertyTenants: ((lets ?? []) as any[]).filter(l => !l.room_id).map(l => byId.get(l.person_id)).filter(Boolean).map((t: any) => ({ id: t.id, name: name(t), email: t.email, phone: t.phone })),
    })
  }
  return out
}

async function contractors(s: SupabaseClient) {
  const { data } = await s.from('people').select('id, salutation, first_name, last_name, full_name, company, email').eq('role', 'contractor')
  return ((data ?? []) as any[]).filter(p => !/@example\.com$/i.test(p.email ?? '')).map(p => ({ id: p.id, name: name(p), company: p.company ?? undefined }))
}

// money in and out on landlord statements and logged expenses — "when did we last charge a TV licence at Rotherhithe?"
async function moneyHistory(s: SupabaseClient, search: string, property?: string) {
  let ids: string[] | null = null
  if (property?.trim()) { const { data } = await s.from('properties').select('id').or(`name.ilike.%${clean(property)}%,address.ilike.%${clean(property)}%`).limit(5); ids = ((data ?? []) as any[]).map(p => p.id); if (!ids.length) return { note: 'No property matches that name.' } }
  const words = clean(search).split(/\s+/).filter(w => w.length > 1).slice(0, 4)
  const like = (col: string) => words.map(w => `${col}.ilike.%${w.replace(/(ence|ense|ance)$/i, '')}%`).join(',')
  let l = s.from('statement_line_items').select('description, amount, statement_date, period_start, category, room_label, properties(name)').order('statement_date', { ascending: false }).limit(40)
  let e = s.from('recharge_expenses').select('description, amount, expense_date, supplier, status, properties(name)').order('expense_date', { ascending: false }).limit(40)
  if (words.length) { l = l.or(like('description')); e = e.or(like('description')) }
  if (ids) { l = l.in('property_id', ids); e = e.in('property_id', ids) }
  const [{ data: lines }, { data: exps }] = await Promise.all([l, e])
  return {
    note: 'Records start in April 2026 — anything earlier isn\'t on CROS. Statement lines are what appeared on the landlord statements; expenses are what the office logged.',
    statementLines: ((lines ?? []) as any[]).map(x => ({ date: x.statement_date, property: x.properties?.name, description: x.description, amount: x.amount, room: x.room_label ?? undefined })),
    expenses: ((exps ?? []) as any[]).map(x => ({ date: x.expense_date, property: x.properties?.name, description: x.description, amount: x.amount, supplier: x.supplier ?? undefined, status: x.status })),
  }
}

async function findArea(s: SupabaseClient, q: string) {
  const { data } = await s.from('ons_rents').select('area_code, area_name, region').ilike('area_name', `%${clean(q)}%`).limit(6)
  return (data ?? []) as any[]
}

// every field any action can carry, flat — which ones apply to which kind is in ACTIONS below
const S = { type: 'string' } as const, B = { type: 'boolean' } as const
const person = { type: 'object', properties: { name: S, email: S, phone: S, personId: S } }
const ACTION_PROPS = {
  kind: { type: 'string', enum: ['message', 'house_message', 'wifi', 'quotes', 'market_report', 'expense', 'publish', 'open'] },
  title: { type: 'string', description: 'What the card does, e.g. "Email Sarah Khan about the cleaner"' },
  recipients: { type: 'array', items: person }, subject: S, message: S, email: B, sms: B, statementTenancyId: S,
  propertyId: S, propertyName: S, roomId: S, roomName: S, channels: { type: 'string', enum: ['push_email', 'email_only', 'push_email_sms', 'sms_only'] },
  network: S, password: S, supplier: S, serviceId: S,
  job: S, details: S, when: { type: 'string', enum: ['empty', 'asap'] }, contractors: { type: 'array', items: { type: 'object', properties: { id: S, name: S } } }, others: { type: 'array', items: { type: 'object', properties: { name: S, email: S, phone: S } } },
  codes: { type: 'array', items: S }, areaNames: { type: 'array', items: S }, focus: S, to: { type: 'object', properties: { name: S, email: S } }, landlordId: S,
  description: S, amount: { type: 'number' }, expense_date: S, invoice_number: S,
  brief: S, tone: { type: 'string', enum: ['friendly', 'professional', 'celebratory', 'important'] }, withMarket: B,
  href: S,
}

const TOOLS: Anthropic.Tool[] = [
  { name: 'find_people', description: 'Look up people on CROS by name, email or company: tenants (with their current tenancy, property, room and tenancy id), landlords, contractors, staff, applicants.', input_schema: { type: 'object', properties: { query: { type: 'string' }, role: { type: 'string', enum: ['tenant', 'landlord', 'contractor', 'administrator', 'lettings', 'cleaner', 'applicant'] } }, required: ['query'] } },
  { name: 'find_property', description: 'Look up a property by name, street, or postcode. Returns its id, landlord, rooms with who lives in each now, whole-property tenants, and its internet account if any.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "Crownfield" or "44 Claverton"' } }, required: ['query'] } },
  { name: 'list_contractors', description: 'Every contractor on CROS (id, name, company).', input_schema: { type: 'object', properties: {} } },
  { name: 'money_history', description: 'Search money on landlord statements and logged expenses by words in the description (e.g. "tv licence", "management fee", "plumber"), optionally for one property. Newest first, with dates and amounts.', input_schema: { type: 'object', properties: { search: { type: 'string' }, property: { type: 'string' } }, required: ['search'] } },
  { name: 'find_area', description: 'Find the official area code for a London borough or other area (for market reports).', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  {
    name: 'respond', description: 'Your final reply. Always end with this — once.',
    input_schema: {
      type: 'object', required: ['message'],
      properties: {
        message: { type: 'string', description: 'One or two short sentences to the office: what you have set up, the answer to their question, or what you need to know.' },
        choices: { type: 'array', items: { type: 'string' }, description: 'When it is ambiguous (two people match, which property?) — short replies they can tap, e.g. "Sarah Khan, Room 2, 44 Claverton Street". Empty otherwise.' },
        actions: { type: 'array', description: 'The proposed actions, in order. Each is a card the office checks and confirms. Leave empty when answering a question or asking which one.', items: { type: 'object', required: ['kind', 'title'], additionalProperties: false, properties: ACTION_PROPS } },
      },
    },
  },
]

const ACTIONS = `ACTIONS you can propose (fields exactly as named):
- message — email and/or text to particular people (tenants, landlords, contractors, applicants, anyone with an email or mobile): recipients [{name, email, phone, personId}], subject, message (no "Hi …" greeting and no sign-off — both are added), email true/false, sms true/false, statementTenancyId (set it to attach that tenancy's statement of account PDF — their full rent payment history; email only).
- house_message — everyone living at a property now (or one room): propertyId, propertyName, roomId?, roomName?, subject, message, channels one of push_email | email_only | push_email_sms | sms_only.
- wifi — save the internet/WiFi details for a property (shown to its tenants in their house info): propertyId, propertyName, network, password, supplier?, serviceId (the existing internet account's id, if find_property returned one).
- quotes — ask chosen contractors to quote for work in a room: roomId, roomName, propertyName, job (short title e.g. "Repaint Room 2"), details, when ("empty" = while the room is empty, or "asap"), contractors [{id, name}] (on CROS), others [{name, email, phone}] (anyone else, by email — typed in the request), message? (a note to them). If they name contractors who aren't on CROS without an email, ask for the email.
- market_report — the local market report (official ONS rents by bedrooms + Land Registry prices, up to 3 areas) with written commentary, emailed with a PDF: codes [area codes from find_area], areaNames, focus (what it should concentrate on and any point to make — e.g. "1-bed rents, for a new landlord wanting a valuation; say a nicely furnished property would likely let above the average"), to {name, email} (or null to just preview), landlordId if they're a landlord on CROS.
- expense — add a landlord expense to a property: propertyId, propertyName, description, amount (£), expense_date (YYYY-MM-DD), supplier?, invoice_number?.
- publish — draft an announcement or newsletter in Publish (email/text/app/website/social) for the office to finish: brief (the notes), tone friendly | professional | celebratory | important, withMarket true/false.
- open — take them to a CROS screen or record: href (a screen below, /admin/properties/<id>, /admin/lettings/<tenancyId>).`

function system(by: string) {
  const screens = ZONES.flatMap(z => z.subnav.map(i => `${i.label} (${z.label}) ${i.href}`)).join('; ')
  return `You are the task bar in CROS, Capital Rooms' property management system (a London lettings and management agency of HMO rooms and whole properties). The office types what they want done; you look things up with the tools, then reply with "respond" — once.
Today is ${today()}. You're helping ${by}.

How to work:
- Look people and properties up with the tools before proposing anything. Never invent an id, email address, phone number, amount or date. Use only what the tools return or what was typed.
- "The tenant of X" / "room 2 at X": find_property, then use the person in that room. Several people match or nobody does: ask with short "choices", propose nothing yet.
- Fill every field you can and write the message text fully, ready to send, in British English — warm, plain, short. Say "property" or "room", never "home". No fixed or minimum terms (Renters' Rights rules). Leave a [placeholder in square brackets] only for a fact you genuinely don't have.
- A request can need several actions (e.g. save the WiFi AND tell the tenants) — propose them in order. A question ("when does Sarah's tenancy end?", "who lives at Crownfield?") — answer it in "message" from what the tools return; add an "open" action to the record when useful.
- Nothing is sent by you: every action is a card they check and confirm. So don't ask "shall I?" — propose it, with every field for that kind filled in. Never say "done" or "sent" — say what you've set up for them to check.
- Don't guess anyone's pronouns from their name — use their name or they/them.
- Never reveal key safe codes or alarm codes. If asked for something outside the actions, say what you can do instead and offer to open the right screen.

${ACTIONS}

SCREENS: ${screens}`
}

// ── the loop ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function planTask(s: SupabaseClient, text: string, by: string, history: { role: 'user' | 'assistant'; content: string }[] = []): Promise<Plan> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI isn’t set up (ANTHROPIC_API_KEY)')
  const messages: Anthropic.MessageParam[] = [...history.slice(-6).map(h => ({ role: h.role, content: h.content })), { role: 'user', content: text.slice(0, 2000) }]
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.messages.create({ model: AI_MODEL_SMART, max_tokens: 4000, system: system(by), tools: TOOLS, tool_choice: turn === 7 ? { type: 'tool', name: 'respond' } : { type: 'any' }, messages })
    const uses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    const done = uses.find(u => u.name === 'respond')
    if (process.env.TASKBAR_DEBUG) console.log(JSON.stringify(done?.input ?? null))
    if (done) return await finish(s, done.input as any)
    if (!uses.length) return { message: res.content.filter(c => c.type === 'text').map(c => (c as any).text).join(' ').trim() || 'I couldn’t work that out — try saying it another way.', choices: [], actions: [] }
    messages.push({ role: 'assistant', content: res.content })
    const results = await Promise.all(uses.map(async u => {
      const i = u.input as any
      let out: unknown
      try {
        out = u.name === 'find_people' ? await findPeople(s, i.query, i.role)
          : u.name === 'find_property' ? await findProperty(s, i.query)
          : u.name === 'list_contractors' ? await contractors(s)
          : u.name === 'find_area' ? await findArea(s, i.query)
          : u.name === 'money_history' ? await moneyHistory(s, i.search, i.property)
          : { error: 'unknown tool' }
      } catch (e) { out = { error: e instanceof Error ? e.message : 'lookup failed' } }
      return { type: 'tool_result' as const, tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000) }
    }))
    messages.push({ role: 'user', content: results })
  }
  return { message: 'That took too many steps — try a shorter request.', choices: [], actions: [] }
}

const str = (v: unknown, n = 4000) => String(v ?? '').trim().slice(0, n)
/** Tidy what came back into cards the screen can show; anything malformed is dropped rather than half-shown. */
async function finish(s: SupabaseClient, r: any): Promise<Plan> {
  const actions: Action[] = []
  // the model sometimes nests the fields ({ kind, title, fields: {…} }) — flatten so either shape works
  const list = (Array.isArray(r.actions) ? r.actions : typeof r.actions === 'string' ? (() => { try { return JSON.parse(r.actions) } catch { return [] } })() : [])
  for (const raw of list.slice(0, 6)) {
    const a = { ...raw, ...(raw?.fields && typeof raw.fields === 'object' ? raw.fields : {}), ...(raw?.details && typeof raw.details === 'object' ? raw.details : {}) }
    const title = str(a.title, 120) || 'Do this'
    if (a.kind === 'message') {
      const recipients = (Array.isArray(a.recipients) ? a.recipients : []).map((x: any) => ({ name: str(x.name, 120), email: str(x.email, 160) || null, phone: str(x.phone, 40) || null, personId: str(x.personId, 60) || null })).filter((x: any) => x.email || x.phone)
      if (recipients.length) actions.push({ kind: 'message', title, recipients, subject: str(a.subject, 150), message: str(a.message, 1200), email: a.email !== false, sms: !!a.sms, statementTenancyId: str(a.statementTenancyId, 60) || null })
    } else if (a.kind === 'house_message' && a.propertyId) {
      actions.push({ kind: 'house_message', title, propertyId: str(a.propertyId, 60), propertyName: str(a.propertyName, 120), roomId: str(a.roomId, 60) || null, roomName: str(a.roomName, 60) || null, subject: str(a.subject, 200), message: str(a.message, 5000), channels: ['push_email', 'email_only', 'push_email_sms', 'sms_only'].includes(a.channels) ? a.channels : 'push_email' })
    } else if (a.kind === 'wifi' && a.propertyId) {
      actions.push({ kind: 'wifi', title, propertyId: str(a.propertyId, 60), propertyName: str(a.propertyName, 120), network: str(a.network, 80), password: str(a.password, 80), supplier: str(a.supplier, 120) || null, serviceId: str(a.serviceId, 60) || null })
    } else if (a.kind === 'quotes' && a.roomId) {
      actions.push({ kind: 'quotes', title, roomId: str(a.roomId, 60), roomName: str(a.roomName, 60), propertyName: str(a.propertyName, 120), job: str(a.job, 200), details: str(a.details, 4000), when: a.when === 'asap' ? 'asap' : 'empty', contractors: (Array.isArray(a.contractors) ? a.contractors : []).map((c: any) => ({ id: str(c.id, 60), name: str(c.name, 120) })).filter((c: any) => c.id), others: (Array.isArray(a.others) ? a.others : []).map((c: any) => ({ name: str(c.name, 120), email: str(c.email, 160), phone: str(c.phone, 40) || undefined })).filter((c: any) => /@/.test(c.email)), message: str(a.message, 1000) })
    } else if (a.kind === 'market_report') {
      const codes = (Array.isArray(a.codes) ? a.codes : []).map((c: unknown) => str(c, 12)).filter(Boolean).slice(0, 3)
      if (!codes.length) continue
      const focus = str(a.focus, 400)
      const to = a.to && str(a.to.email) ? { name: str(a.to.name, 120), email: str(a.to.email, 160) } : null
      // the commentary is written now, so the card shows exactly what will be sent
      const commentary = (await reportCommentary(await reportPacks(s, codes), to?.name || null, focus, s).catch(() => '')).replace(/^(dear|hi|hello)\b[^\n]{0,60}\n+/i, '').trim()   // the email adds its own greeting
      actions.push({ kind: 'market_report', title, codes, areaNames: (Array.isArray(a.areaNames) ? a.areaNames : []).map((x: unknown) => str(x, 60)), focus, to, landlordId: str(a.landlordId, 60) || null, commentary })
    } else if (a.kind === 'expense' && a.propertyId && Number(a.amount) > 0) {
      actions.push({ kind: 'expense', title, propertyId: str(a.propertyId, 60), propertyName: str(a.propertyName, 120), description: str(a.description, 300), amount: Math.round(Number(a.amount) * 100) / 100, expense_date: /^\d{4}-\d{2}-\d{2}$/.test(a.expense_date) ? a.expense_date : today(), supplier: str(a.supplier, 120) || null, invoice_number: str(a.invoice_number, 60) || null })
    } else if (a.kind === 'publish' && str(a.brief)) {
      actions.push({ kind: 'publish', title, brief: str(a.brief, 3000), tone: ['friendly', 'professional', 'celebratory', 'important'].includes(a.tone) ? a.tone : 'friendly', withMarket: !!a.withMarket })
    } else if (a.kind === 'open' && /^\/admin(\/|$)/.test(str(a.href))) {
      actions.push({ kind: 'open', title, href: str(a.href, 300) })
    }
  }
  return { message: str(r.message, 1500), choices: (Array.isArray(r.choices) ? r.choices : []).map((c: unknown) => str(c, 160)).filter(Boolean).slice(0, 6), actions }
}
