// Publish (13 Nov 2026, migration 285) — write a piece once, choose who gets it and where.
// Built the way good CRMs do it: one piece → a version per channel (full email, PDF letter, short text with a link,
// push title and line, website post, social image and caption); audiences that are lists (all landlords, landlords in
// these areas) plus people picked; draft → test to yourself → approve → send now or on a date; a log of every send;
// marketing opt-outs honoured on every channel, with an unsubscribe in every email and text (PECR).
// Sending runs in batches (runSend) so a long mail-out never times out: the screen or the hourly job carries on where
// the last batch stopped — nobody is sent the same thing twice (publication_sends).
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reportPacks, reportCommentary, reportHtml, reportPdf, reportTitle, landlordAreas, comparison } from '@/lib/rents/report'
import { sendEmail } from '@/lib/sendEmail'
import { sendSms, toE164 } from '@/lib/sms'
import { tryPush, insertNotifications } from '@/lib/serverNotify'
import { dearLine, dearFromText, landlordName } from '@/lib/people'
import { demoPropertyIds } from '@/lib/demoProperties'
import { blocksHtml, blocksMarkdown, TEMPLATES, type Block } from '@/lib/publish/blocks'
import { themeByKey } from '@/lib/email/themes'

export const SITE_URL = 'https://capitalrooms.co.uk'
export const LONDON = 'E12000007'
export type ChannelKey = 'email' | 'pdf' | 'sms' | 'push' | 'website' | 'social'
export const CHANNELS: { key: ChannelKey; label: string; note: string }[] = [
  { key: 'email', label: 'Email', note: 'The full version, with the figures' },
  { key: 'pdf', label: 'PDF letter', note: 'On our letterhead — attached to the email, or download to post' },
  { key: 'sms', label: 'Text', note: 'Short, with a link to read it all' },
  { key: 'push', label: 'App notification', note: 'To landlords with the app — and in their app inbox' },
  { key: 'website', label: 'Website', note: 'A post on capitalrooms.co.uk (News & advice)' },
  { key: 'social', label: 'Instagram & Facebook', note: 'An image and caption to post' },
]
export const LISTS: { key: string; label: string }[] = [
  { key: 'all_landlords', label: 'All our landlords' },
  { key: 'landlords_in_areas', label: 'Landlords with properties in these areas' },
]

export interface Pub {
  id: string; kind: 'market_update' | 'announcement'; title: string; period: string | null; areas: string[]
  intro: string | null; body: string | null; sms_text: string | null; push_title: string | null; push_body: string | null; social_caption: string | null
  audience: { lists?: string[]; people?: { name: string | null; email: string | null; phone: string | null; personId?: string | null }[]; ownAreas?: boolean }
  channels: Partial<Record<ChannelKey, boolean>>
  status: string; scheduled_for: string | null; website_slug: string | null; website_published_at: string | null; cache: Record<string, string>
  image?: string | null
  preheader?: string | null
  blocks?: Block[]
  template?: string | null
  ab?: { subjectB?: string; testShare?: number; decideAfterHours?: number; winner?: 'A' | 'B'; decidedAt?: string; startedAt?: string; why?: string }
}
export interface Person { personId: string | null; name: string | null; email: string | null; phone: string | null; landlord: boolean; dear: string }

// ── unsubscribe (no table needed to check a link: it's signed) ─────────────────────────────────────────────────────
const secret = () => process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'capital-rooms'
export const unsubToken = (addr: string) => crypto.createHmac('sha256', secret()).update(addr.trim().toLowerCase()).digest('hex').slice(0, 24)
export const unsubLink = (addr: string) => `${SITE_URL}/unsubscribe?a=${encodeURIComponent(addr.trim().toLowerCase())}&t=${unsubToken(addr)}`

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const paras = (t: string | null) => String(t ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
/** the email look chosen for this piece (lib/email/themes) — the Christmas one for a seasonal greeting, and so on */
export const lookFor = (p: Pub) => (p.channels as any)?.look ? themeByKey((p.channels as any).look) : undefined
export const webLink = (p: Pub) => p.website_published_at && p.website_slug ? `${SITE_URL}/blogs/${p.website_slug}` : null

// ── audiences ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function resolveAudience(s: SupabaseClient, p: Pub): Promise<{ people: Person[]; optedOut: Person[] }> {
  const lists = p.audience?.lists ?? []
  const out: Person[] = []
  if (lists.includes('all_landlords') || lists.includes('landlords_in_areas')) {
    // landlords with at least one real (not practice) property
    const demo = await demoPropertyIds(s)
    const { data: props } = await s.from('properties').select('id, landlord_id').not('landlord_id', 'is', null)
    const ids = [...new Set(((props ?? []) as any[]).filter(x => !demo.has(x.id)).map(x => x.landlord_id))]
    const { data: ll } = ids.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, phone, joint_salutation, joint_first_name, joint_last_name, role').in('id', ids) : { data: [] as any[] }
    let chosen = ((ll ?? []) as any[]).filter(x => x.role !== 'inactive')
    if (lists.includes('landlords_in_areas') && !lists.includes('all_landlords') && p.areas.length) {
      const keep: any[] = []
      for (const x of chosen) { const a = await landlordAreas(s, x.id).catch(() => []); if (a.some(c => p.areas.includes(c))) keep.push(x) }
      chosen = keep
    }
    for (const x of chosen) out.push({ personId: x.id, name: landlordName(x), email: x.email ? String(x.email).toLowerCase() : null, phone: x.phone ?? null, landlord: true, dear: dearLine(x) })
  }
  for (const x of p.audience?.people ?? []) {
    out.push({ personId: x.personId ?? null, name: x.name ?? null, email: x.email ? String(x.email).toLowerCase() : null, phone: x.phone ?? null, landlord: !!x.personId, dear: x.name ? `Dear ${dearFromText(x.name)},` : 'Hello,' })
  }
  // one each (by email, then phone, then person)
  const seen = new Set<string>(), uniq: Person[] = []
  for (const x of out) { const k = x.email || toE164(x.phone) || x.personId || ''; if (!k || seen.has(k)) continue; seen.add(k); uniq.push(x) }
  // opt-outs (migration 285)
  const { data: oo } = await s.from('comms_optouts').select('email, phone, person_id').eq('kind', 'marketing') as { data: any[] | null }
  const offE = new Set((oo ?? []).map(o => String(o.email ?? '').toLowerCase()).filter(Boolean)), offP = new Set((oo ?? []).map(o => toE164(o.phone)).filter(Boolean)), offId = new Set((oo ?? []).map(o => o.person_id).filter(Boolean))
  const off = (x: Person) => (!!x.email && offE.has(x.email)) || (!!x.phone && offP.has(toE164(x.phone) as string)) || (!!x.personId && offId.has(x.personId))
  return { people: uniq.filter(x => !off(x)), optedOut: uniq.filter(off) }
}

// ── the versions ─────────────────────────────────────────────────────────────────────────────────────────────────
const footer = (addr: string | null, why: string) => `<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#7a7a72">${esc(why)}${addr ? ` If you’d rather not get these, <a href="${unsubLink(addr)}" style="color:#7a7a72">unsubscribe</a>.` : ''}</p>`
const why = (x: Person) => x.landlord ? 'You’re receiving this as a Capital Rooms landlord.' : 'You’re receiving this because you’re in touch with Capital Rooms.'

/** Email (and the PDF letter) for one person. Market updates for a landlord can use their own properties' areas. */
// the inbox preview text (the grey line after the subject) — hidden in the email itself, padded so the mail app doesn't
// pull the next words in after it
const preheader = (p: Pub) => { const t = (p.preheader || p.intro || '').trim(); return t ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(t)}${'&nbsp;&zwnj;'.repeat(60)}</div>` : '' }
const header = (p: Pub) => p.image ? `<p style="margin:0 0 20px"><img src="${SITE_URL}/api/publish/image/${p.id}?size=wide&k=${encodeURIComponent(p.image)}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border-radius:14px"></p>` : ''
// ── A/B subject lines (13 Nov 2026, the Mailchimp way): a test group — split half and half between the two subjects —
// goes first; after the wait, the subject more people opened (clicks break a tie, then A) goes to everyone else.
export const abOn = (p: Pub) => !!(p.channels?.email && p.ab?.subjectB?.trim())
const bucket = (email: string) => { let h = 2166136261; for (const c of email.toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 1000 }
/** Which subject this person gets — or 'hold' while the test runs and they're not in it. */
export function abGroup(p: Pub, email: string): 'A' | 'B' | 'hold' | null {
  if (!abOn(p)) return null
  if (p.ab!.winner) return p.ab!.winner
  const b = bucket(email), share = Math.min(50, Math.max(10, p.ab!.testShare ?? 20))
  return b < share * 10 ? (b % 2 ? 'B' : 'A') : 'hold'
}
export function abPickWinner(rows: { variant: string | null; opened_at: string | null; clicked_at: string | null }[]): { winner: 'A' | 'B'; why: string } {
  const stat = (v: 'A' | 'B') => { const r = rows.filter(x => (x.variant ?? 'A') === v); return { n: r.length, o: r.filter(x => x.opened_at).length, c: r.filter(x => x.clicked_at).length } }
  const a = stat('A'), b = stat('B')
  const pct = (x: number, n: number) => n ? x / n : 0
  const line = `A ${Math.round(pct(a.o, a.n) * 100)}% opened, B ${Math.round(pct(b.o, b.n) * 100)}% opened`
  if (!a.o && !b.o && !a.c && !b.c) return { winner: 'A', why: `No opens recorded yet (is open tracking switched on?) — kept the main subject. ${line}` }
  if (pct(b.o, b.n) !== pct(a.o, a.n)) return pct(b.o, b.n) > pct(a.o, a.n) ? { winner: 'B', why: line } : { winner: 'A', why: line }
  return pct(b.c, b.n) > pct(a.c, a.n) ? { winner: 'B', why: `${line}; more clicks on B` } : { winner: 'A', why: `${line}; a tie — kept the main subject` }
}

export async function emailFor(s: SupabaseClient, p: Pub, x: Person, cache: Record<string, string>, variant?: 'A' | 'B'): Promise<{ subject: string; html: string; pdf?: { filename: string; content: string }; variant?: 'A' | 'B' }> {
  if (p.kind === 'market_update') {
    let codes = p.areas.length ? p.areas : [LONDON]
    let words = p.body ?? ''
    if (p.audience?.ownAreas && x.landlord && x.personId) {
      const own = await landlordAreas(s, x.personId).catch(() => [])
      if (own.length && own.join() !== codes.join()) {
        codes = own
        const key = own.slice().sort().join(',')
        cache[key] ??= await reportCommentary(await reportPacks(s, own), null).catch(() => '')
        words = cache[key] || words
      }
    }
    const packs = await reportPacks(s, codes)
    // the report opens with the greeting and its own first line (the piece's opening line is for the website and app)
    const html = preheader(p) + header(p) + reportHtml(packs, words, x.dear) + await blocksHtml(s, p.blocks) + (webLink(p) ? `<p><a href="${webLink(p)}">Read it on our website</a></p>` : '') + footer(x.email, why(x))
    // a landlord's own areas → the subject names them ("Newham market update — September 2026")
    const own = codes.join() !== (p.areas.length ? p.areas : [LONDON]).join()
    const month = p.period ? new Date(`${p.period}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
    const subject = own ? `${packs.map(k => k.name).join(', ').replace(/, ([^,]*)$/, ' and $1')} market update${month ? ` — ${month}` : ''}` : (p.title || reportTitle(packs))
    const pdf = p.channels?.pdf ? { filename: `Market update - ${packs.map(k => k.name).join(', ')}.pdf`.replace(/[^\w ,.-]/g, ''), content: (await reportPdf(packs, words, x.landlord ? x.name : null)).toString('base64') } : undefined
    return { subject: variant === 'B' && !own ? p.ab!.subjectB!.trim() : subject, html, pdf, variant }
  }
  const html = `${preheader(p)}${header(p)}<p>${esc(x.dear)}</p>${p.intro ? `<p><strong>${esc(p.intro)}</strong></p>` : ''}${paras(p.body).map(t => `<p>${esc(t)}</p>`).join('')}${await blocksHtml(s, p.blocks)}${webLink(p) ? `<p><a href="${webLink(p)}">Read it on our website</a></p>` : ''}${footer(x.email, why(x))}`
  return { subject: variant === 'B' ? p.ab!.subjectB!.trim() : p.title, html, variant }
}

export const smsFor = (p: Pub, x: Person) => {
  const base = (p.sms_text || `Capital Rooms: ${p.title}.`).trim()
  const link = webLink(p)
  const ph = toE164(x.phone)
  return `${base}${link ? ` ${link}` : ''}${ph ? ` Opt out: ${unsubLink(ph)}` : ''}`
}
export const pushFor = (p: Pub) => ({ title: p.push_title || p.title, body: p.push_body || p.intro || p.title, link: webLink(p) ?? '/landlord' })
export const captionFor = (p: Pub) => p.social_caption || `${p.title}\n\n${p.intro ?? ''}\n\n${webLink(p) ? `Read more: ${webLink(p)}` : 'Read more on our website — link in bio.'}\n\n#LondonRentals #LondonLandlords #PropertyManagement`

/** The website post: the opening line, the figures and the words. */
export async function websiteMarkdown(s: SupabaseClient, p: Pub) {
  const parts: string[] = []
  if (p.intro) parts.push(p.intro)
  if (p.kind === 'market_update') {
    const packs = await reportPacks(s, p.areas.length ? p.areas : [LONDON])
    parts.push(comparison(packs).map(([label, vs]) => `- **${label}:** ${packs.length > 1 ? vs.map((v, i) => `${packs[i].name} ${v}`).join(' · ') : vs[0]}`).join('\n'))
  }
  parts.push(...paras(p.body))
  const extra = blocksMarkdown(p.blocks); if (extra) parts.push(extra)
  if (p.kind === 'market_update') parts.push('_Figures: ONS Price Index of Private Rents and HM Land Registry UK House Price Index (Crown copyright, Open Government Licence). A guide, not a valuation._')
  return parts.join('\n\n')
}

// ── sending, in batches ──────────────────────────────────────────────────────────────────────────────────────────
export async function runSend(s: SupabaseClient, p: Pub, budgetMs = 200_000): Promise<{ sent: number; failed: number; remaining: number; held?: number }> {
  const start = Date.now()
  const { people } = await resolveAudience(s, p)
  const { data: done } = await s.from('publication_sends').select('channel, address, person_id, status').eq('publication_id', p.id)
  const has = new Set(((done ?? []) as any[]).filter(d => d.status !== 'failed').map(d => `${d.channel}|${d.address || d.person_id}`))
  const cache = { ...(p.cache ?? {}) }
  const log = (channel: string, x: Person, address: string | null, status: string, note = '', extra: Record<string, unknown> = {}) =>
    s.from('publication_sends').insert({ publication_id: p.id, channel, person_id: x.personId, name: x.name, address, status, note: note.slice(0, 300), ...extra }).then(async r => {
      // before migration 287 the extra columns don't exist — log without them
      if (r.error && Object.keys(extra).length) await s.from('publication_sends').insert({ publication_id: p.id, channel, person_id: x.personId, name: x.name, address, status, note: note.slice(0, 300) })
    })
  let sent = 0, failed = 0, remaining = 0, held = 0
  const ch = p.channels ?? {}
  // A/B: start the clock on the first send; once the wait is over, choose the winner from opens
  if (abOn(p) && !p.ab!.winner) {
    const ab = { ...p.ab! }
    if (!ab.startedAt) { ab.startedAt = new Date().toISOString(); await s.from('publications').update({ ab }).eq('id', p.id) }
    else if (Date.now() - new Date(ab.startedAt).getTime() >= (ab.decideAfterHours ?? 4) * 3600_000) {
      const { data: rows } = await s.from('publication_sends').select('variant, opened_at, clicked_at').eq('publication_id', p.id).eq('channel', 'email').eq('status', 'sent')
      Object.assign(ab, abPickWinner((rows ?? []) as any[]), { decidedAt: new Date().toISOString() })
      await s.from('publications').update({ ab }).eq('id', p.id)
    }
    p = { ...p, ab }
  }
  if (p.status !== 'sending') await s.from('publications').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', p.id)
  for (const x of people) {
    const jobs: (() => Promise<void>)[] = []
    const group = x.email ? abGroup(p, x.email) : null
    if (group === 'hold' && ch.email && x.email && !has.has(`email|${x.email}`)) held++
    else if (ch.email && x.email && !has.has(`email|${x.email}`)) jobs.push(async () => {
      try {
        const e = await emailFor(s, p, x, cache, group === 'A' || group === 'B' ? group : undefined)
        const r = await sendEmail(x.email!, e.subject, e.html, { kind: 'publication', theme: lookFor(p), ...(e.pdf ? { attachments: [e.pdf] } : {}) })
        await log('email', x, x.email, r.ok ? 'sent' : 'failed', r.ok ? (e.pdf ? 'with the PDF' : '') : r.error ?? 'not sent', { provider_id: r.id ?? null, variant: e.variant ?? null }); r.ok ? sent++ : failed++
      } catch (err) { await log('email', x, x.email, 'failed', err instanceof Error ? err.message : 'error'); failed++ }
    })
    const phone = toE164(x.phone)
    if (ch.sms && phone && !has.has(`sms|${phone}`)) jobs.push(async () => {
      const r = await sendSms(phone, smsFor(p, x)).catch(e => ({ ok: false, error: String(e) }))
      await log('sms', x, phone, r.ok ? 'sent' : 'failed', r.ok ? '' : (r as any).error ?? ''); r.ok ? sent++ : failed++
    })
    if (ch.push && x.personId && !has.has(`push|${x.personId}`)) jobs.push(async () => {
      const m = pushFor(p)
      await insertNotifications(s, [x.personId!], { title: m.title, body: m.body, type: 'market', link: m.link } as any).catch(() => null)
      const n = await tryPush([x.personId!], m.title, m.body, m.link, true)
      await log('push', x, null, 'sent', n ? 'notification and app inbox' : 'app inbox (no app notifications switched on)'); sent++
    })
    for (const j of jobs) {
      if (Date.now() - start > budgetMs) { remaining++; continue }
      await j()
    }
  }
  await s.from('publications').update({ cache, updated_at: new Date().toISOString(), ...(remaining || held ? {} : { status: 'sent', sent_at: new Date().toISOString() }) }).eq('id', p.id)
  return { sent, failed, remaining: remaining + held, ...(held ? { held } : {}) }
}


/** A new piece. A market update starts with London's latest figures, a commentary written from them, and sensible
 *  channels (email with the PDF, app notification) to all landlords — each getting their own areas. */
export async function createPublication(s: SupabaseClient, o: { kind: 'market_update' | 'announcement'; areas?: string[]; by: string; auto?: boolean; template?: string }) {
  const tpl = TEMPLATES.find(t => t.key === o.template)
  if (tpl) o = { ...o, kind: tpl.kind }
  const { data: latest } = await s.from('ons_rents').select('period').order('period', { ascending: false }).limit(1).maybeSingle() as { data: any }
  const period = latest?.period ? String(latest.period).slice(0, 7) : null
  const month = period ? new Date(`${period}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  if (o.kind === 'market_update') {
    const areas = (o.areas ?? []).slice(0, 3)
    const packs = await reportPacks(s, areas.length ? areas : [LONDON])
    const words = await reportCommentary(packs, null).catch(() => '')
    const where = packs.map(k => k.name).join(', ').replace(/, ([^,]*)$/, ' and $1')
    const r = packs[0]?.rents
    const row = {
      kind: 'market_update', title: `${where} market update — ${month}`, period, areas,
      intro: `The latest rents and prices for ${where}${o.auto ? ', ready for you to check before it goes out' : ''}.`.replace(', ready for you to check before it goes out', ''),
      body: words,
      sms_text: `Capital Rooms: ${where} rents ${r?.change_all > 0 ? 'up' : 'down'} ${Math.abs(Number(r?.change_all ?? 0)).toFixed(1)}% on a year (average £${Math.round(Number(r?.rent_all ?? 0)).toLocaleString('en-GB')} a month). Your update:`,
      push_title: `${where} market update`, push_body: `Rents ${r?.change_all > 0 ? 'up' : 'down'} ${Math.abs(Number(r?.change_all ?? 0)).toFixed(1)}% on a year — see what it means for you.`,
      social_caption: null,
      audience: { lists: ['all_landlords'], people: [], ownAreas: true },
      channels: { email: true, pdf: true, push: true, sms: false, website: false, social: false },
      created_by: o.by,
    }
    const extra = tpl ? { template: tpl.key, image: tpl.picture, blocks: tpl.blocks, channels: { ...row.channels, look: tpl.look } } : { image: 'illus:chart', blocks: [{ type: 'contact' }], channels: { ...row.channels, look: 'website' } }
    let { data, error } = await s.from('publications').insert({ ...row, ...extra }).select('id').single()
    if (error && /template|blocks|image/.test(error.message)) ({ data, error } = await s.from('publications').insert(row).select('id').single())   // before migrations 286/287
    if (error) throw new Error(error.message)
    return (data as any).id as string
  }
  const base = { kind: 'announcement', title: tpl?.title || 'New announcement', intro: '', body: '', audience: { lists: ['all_landlords'], people: [] }, channels: { email: true, push: true, look: tpl?.look ?? 'website' }, created_by: o.by }
  let { data, error } = await s.from('publications').insert({ ...base, ...(tpl ? { template: tpl.key, image: tpl.picture, blocks: tpl.blocks } : {}) }).select('id').single()
  if (error && /template|blocks|image/.test(error.message)) ({ data, error } = await s.from('publications').insert(base).select('id').single())
  if (error) throw new Error(error.message)
  const id = (data as any).id as string
  // a template with a brief is written straight away (the seasonal greeting), so it opens ready to read
  if (tpl?.brief) {
    const { writePublication } = await import('@/lib/publish/write')
    const w = await writePublication(s, { brief: tpl.brief, tone: tpl.tone, length: 'short' }).catch(() => null)
    if (w) await s.from('publications').update({ title: w.title, intro: w.intro, preheader: w.preheader, body: w.body, sms_text: w.sms_text, push_title: w.push_title, push_body: w.push_body, social_caption: w.social_caption }).eq('id', id).then(r => r, () => null)
  }
  return id
}
