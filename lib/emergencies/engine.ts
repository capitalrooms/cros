// The emergency engine (migration 203). Server only, service client.
//
//   start      a tenant's emergency job → 999 advice, "first thing tomorrow", or texts to the emergency list
//   respond    a contractor answers from their link: can attend (when, call-out fee) or can't
//   tick       every minute: close answer windows and choose, chase silence, check in after the visit
//   choose     confirm one contractor, stand the others down, update the job and tell the house
//   report     the contractor's check-in: on site / fixed / made safe / not fixed / late / can't come
//   office     the office can hold it, pick someone else, ask again, resolve or cancel at any point
//
// Each step writes to emergency_events, so the office can open it late and see exactly where it stands.
// Status changes are conditional updates, so two ticks running at once can never both confirm someone.

import { inTenantRoom } from '@/lib/repairs/where'
import { placeLabel, isWholeLet } from '@/lib/lettings/letWording'
import crypto from 'node:crypto'
import { readKeySafe } from '@/lib/access/keySafe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms'
// texts to contractors come from the name CAPITAL RMS — they answer by tapping the link, never by replying
const NAME = { asName: true }
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { tellContractor as tellPerson } from '@/lib/contractorContact'
import { KINDS, BATHROOM_ABOVE_RULE, type EmergencyKind } from './guide'

type S = SupabaseClient
// links in texts and emails always point at the live site (15 Nov 2026: a test raised from a local copy texted Gary a
// 192.168.x.x link that only worked on the office network — he was stuck on "Loading…")
export const SITE = /^https:\/\/(?!localhost|127\.|192\.168\.|10\.)/.test(process.env.NEXT_PUBLIC_APP_URL ?? '') ? process.env.NEXT_PUBLIC_APP_URL! : 'https://capitalrooms.co.uk'
const OFFICE_ROLES = ['administrator', 'admin']
const OPEN = ['collecting', 'awaiting_office', 'assigned', 'on_site', 'needs_return', 'office_handling', 'morning', 'call_999']

// ── small helpers ────────────────────────────────────────────────────────────

export const ukTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '').replace(':00', '')
export const ukDay = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
const ukWhen = (d: string | Date) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const that = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  return that === today ? ukTime(d) : `${ukTime(d)} ${ukDay(d)}`
}
const londonHour = () => Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }))
const gbp = (n: number | null | undefined) => n == null ? 'fee not given' : `£${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`
const pname = (p: any) => p ? ([p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || 'Contractor') : 'Contractor'
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const token = () => crypto.randomBytes(18).toString('base64url')
const link = (t: string) => `${SITE}/e/${t}`
const tellContractor = (p: any, personId: string, msg: { text: string; title: string; body: string; url: string; tag: string }) =>
  tellPerson(p, personId, { ...msg, link: `${SITE}${msg.url}` })
const reached = (r: { via: string[]; error?: string }) => r.via.length ? ` (${r.via.join(', ')})` : ` (couldn’t reach them: ${r.error})`

export interface Settings { auto: boolean; windowMin: number; costLimit: number; overLimit: 'wait' | 'send_after_15'; followupMin: number; tenantUpdates: boolean }
export async function settings(s: S): Promise<Settings> {
  const { data } = await s.from('system_settings').select('key, value').like('key', 'emergency_%')
  const m = new Map(((data ?? []) as any[]).map(r => [r.key, String(r.value)]))
  return {
    auto: (m.get('emergency_auto') ?? 'true') === 'true',
    windowMin: Math.max(2, Number(m.get('emergency_window_min') ?? 30) || 30),
    costLimit: Number(m.get('emergency_cost_limit') ?? 150) || 150,
    overLimit: m.get('emergency_over_limit') === 'wait' ? 'wait' : 'send_after_15',
    followupMin: Math.max(15, Number(m.get('emergency_followup_min') ?? 60) || 60),
    tenantUpdates: (m.get('emergency_tenant_updates') ?? 'true') === 'true',
  }
}

export async function log(s: S, emergencyId: string, kind: string, note: string, by: string | null = 'CROS') {
  await s.from('emergency_events').insert({ emergency_id: emergencyId, kind, note, by_text: by })
}

async function load(s: S, id: string) {
  const { data } = await s.from('emergencies')
    .select('*, properties(id, name, address, postcode), rooms(name, location_in_house), people!reporter_id(id, salutation, first_name, last_name, full_name, phone)')
    .eq('id', id).maybeSingle() as { data: any }
  // where the room is in the house, with its name (14 Nov 2026) — a contractor sent at night can find it
  if (data?.rooms?.name && data.rooms.location_in_house && !isWholeLet(null, data.rooms.name)) data.rooms.name = `${data.rooms.name} (${data.rooms.location_in_house})`
  // the key safe code lives apart from the property record (lib/access/keySafe)
  if (data?.properties) data.properties.key_safe_code = await readKeySafe(s as any, data.property_id ?? data.properties.id)
  return data
}
const addressOf = (em: any) => {
  const name = firstLine(em.properties?.name)
  const addr = String(em.properties?.address ?? '').split(/\n|,\s*/).map(x => x.trim()).filter(x => x && x.toLowerCase() !== name.toLowerCase())
  const pc = String(em.properties?.postcode ?? '').replace(/\s+/g, '').toUpperCase()
  const hasPc = !!pc && addr.some(x => x.replace(/\s+/g, '').toUpperCase().includes(pc))
  return [isWholeLet(null, em.rooms?.name) ? '' : em.rooms?.name, name, ...addr, hasPc ? '' : em.properties?.postcode].filter(Boolean).join(', ')   // never "Whole Property, …"
}
// before someone is confirmed, contractors only see the street and postcode district
const areaOf = (em: any) => {
  const street = firstLine(em.properties?.name).replace(/^(flat|room|unit)\s*\w+,?\s*/i, '').replace(/^\d+[a-z]?\s+/i, '')
  const district = String(em.properties?.postcode ?? em.properties?.address ?? '').match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/i)?.[1]?.toUpperCase() ?? ''
  return [street, district].filter(Boolean).join(', ') || 'London'
}

// ── who to tell ──────────────────────────────────────────────────────────────

async function office(s: S) {
  const { data } = await s.from('people').select('id, phone').in('role', OFFICE_ROLES)
  return (data ?? []) as { id: string; phone: string | null }[]
}
/** Push + in-app to the office; a text as well when someone has to act. */
export async function alertOffice(s: S, em: any, title: string, body: string, text = false) {
  const people = await office(s)
  const url = `/admin/emergencies?id=${em.id}`
  await insertNotifications(s, people.map(p => p.id), { title, body, type: 'emergency', link: url }, { propertyId: em.property_id, roomId: em.room_id })
  await sendServerPush({ personIds: people.map(p => p.id), title, body, url, tag: `emergency-${em.id}` })
  if (text) for (const p of people) if (p.phone) await sendSms(p.phone, `CROS: ${title}. ${body} ${SITE}${url}`)
  await s.from('emergencies').update({ office_alerted_at: new Date().toISOString() }).eq('id', em.id)
}

async function household(s: S, em: any): Promise<string[]> {
  if (!em.property_id) return em.reporter_id ? [em.reporter_id] : []
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data } = await s.from('tenancies').select('person_id, co_tenant_id').eq('property_id', em.property_id).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  return [...new Set([em.reporter_id, ...((data ?? []) as any[]).flatMap(t => [t.person_id, t.co_tenant_id])].filter(Boolean))]   // joint tenants too
}
/** Tell the house what's happening (push + in-app). Respects the emergency_tenant_updates setting. */
async function tellHouse(s: S, em: any, title: string, body: string) {
  const set = await settings(s)
  if (!set.tenantUpdates) { await log(s, em.id, 'tenants', `Not sent to the house (tenant updates are off): “${body}”`); return }
  const ids = await household(s, em)
  if (!ids.length) return
  // which emergency, in the heading: "We’re on it — Burst pipe or water leak" (15 Nov 2026)
  const what = KINDS[em.kind as EmergencyKind]?.label ?? em.title
  if (what && !title.includes(what)) title = `${title} — ${what}`
  // tapping it opens their emergency screen: where it stands and what to do meanwhile (15 Nov 2026)
  await insertNotifications(s, ids, { title, body, type: 'maintenance', link: `/tenant/emergency/${em.id}` }, { propertyId: em.property_id, roomId: em.room_id })
  await sendServerPush({ personIds: ids, title, body, url: `/tenant/emergency/${em.id}`, tag: `emergency-${em.id}` })
  await log(s, em.id, 'tenants', `Told the house: “${body}”`)
}

/** " Until tomorrow: …" — how to manage overnight if no one can come tonight */
const tonight = (info?: { overnight?: string[] }) => info?.overnight?.length ? ` Until then: ${info.overnight.join(' ')}` : ''

// ── start ────────────────────────────────────────────────────────────────────

export async function startEmergency(s: S, opts: { ticketId: string; kind?: EmergencyKind; controlled?: boolean; reporterId?: string | null; bathroomAbove?: 'yes' | 'no' | 'unsure' | null }) {
  const { data: t } = await s.from('maintenance_tickets').select('id, title, description, category, location, property_id, room_id, reporter_id').eq('id', opts.ticketId).maybeSingle() as { data: any }
  if (!t) return { error: 'Job not found' }
  const { data: existing } = await s.from('emergencies').select('id').eq('ticket_id', t.id).maybeSingle()
  if (existing) return { id: existing.id }
  const kind: EmergencyKind = opts.kind && KINDS[opts.kind] ? opts.kind : 'other'
  const info = KINDS[kind]
  // the reporter is a people.id; tickets store auth ids for older rows, so prefer what the caller resolved
  const reporterId = opts.reporterId ?? null
  const status = !info.trade ? 'call_999' : opts.controlled ? 'morning' : 'collecting'
  const { data: em, error } = await s.from('emergencies').insert({
    // the room only when it's in someone's room — a kitchen leak isn't "Room 1, 12 Saltwell Street" (15 Nov 2026)
    ticket_id: t.id, property_id: t.property_id, room_id: inTenantRoom({ location: t.location }) ? t.room_id : null, reporter_id: reporterId,
    kind, trade: info.trade ?? 'general', title: t.title || info.label,
    details: [t.location && !inTenantRoom({ location: t.location }) ? `Where: ${t.location}` : '', t.description].filter(Boolean).join('\n\n'), controlled: !!opts.controlled, status,
  }).select('id').single()
  if (error) return { error: error.message }
  await s.from('maintenance_tickets').update({ priority: 'emergency', updated_at: new Date().toISOString() }).eq('id', t.id)
  const full = await load(s, em.id)
  await log(s, em.id, 'reported', `Reported by the tenant: ${info.label}${opts.controlled ? ' — they say it’s under control until morning' : ''}`, 'Tenant')
  // a leak that may come from a bathroom above: everyone in the house is told straight away not to use it (Harry, 15 Nov 2026)
  if (info.askBathroomAbove && (opts.bathroomAbove === 'yes' || opts.bathroomAbove === 'unsure')) {
    await tellHouse(s, full, 'Don’t use the bathroom above the leak', BATHROOM_ABOVE_RULE)
    await log(s, em.id, 'tenants', `The tenant says ${opts.bathroomAbove === 'yes' ? 'there’s a bathroom above' : 'there may be a bathroom above'} — the house was told not to use it until the contractor has been`)
  }

  if (status === 'call_999') {
    await alertOffice(s, full, `${info.label} at ${firstLine(full.properties?.name)}`, `The tenant has been told: ${info.callServices} No contractor sent — check in with them.`, true)
    return { id: em.id, status }
  }
  if (status === 'morning') {
    await alertOffice(s, full, `${info.label} (contained) at ${firstLine(full.properties?.name)}`, 'The tenant says it’s under control until morning — book someone first thing.')
    await tellHouse(s, full, 'We’ve got your report', `Thanks for making it safe. We’ll arrange someone first thing in the morning — tell us straight away if it gets worse.${tonight(info)}`)
    return { id: em.id, status }
  }
  // the emergency list first; its backups if no one fits; then every contractor on CROS — someone is always asked
  let asked = await dispatchWave(s, full, 1)
  if (!asked) asked = await dispatchWave(s, full, 2)
  if (!asked) asked = await dispatchWave(s, full, 3)
  if (!asked) await alertOffice(s, full, `🆘 No contractor to ask — ${firstLine(full.properties?.name)}`, 'There is no contractor on CROS who can be reached. Please call round now.', true)
  await tellHouse(s, full, 'We’re on it', `We’re sorry you’re dealing with this. We’re contacting our emergency contractors now and will let you know who is coming and when. Until they arrive: ${info.steps.slice(0, 3).join(' ')}`)
  await alertOffice(s, full, `Emergency: ${info.label} at ${firstLine(full.properties?.name)}`, 'Contractors are being contacted. CROS confirms the soonest once answers are in — open it to watch or step in.')
  return { id: em.id, status }
}

// ── dispatch ─────────────────────────────────────────────────────────────────

const inHours = (from: number, to: number, h: number) => (from <= to ? h >= from && h < to : h >= from || h < to)

/** Text a wave of contractors. Wave 1: the trade, in their hours. Wave 2: backups, out-of-hours and general. Returns how many were asked. */
export async function dispatchWave(s: S, em: any, wave: number): Promise<number> {
  const set = await settings(s)
  let { data: list } = await s.from('emergency_contractors').select('*, people!person_id(*)').eq('active', true) as { data: any[] | null }
  // wave 3 (14 Nov 2026, Harry: "in the event I don't see the emergency report it should still be sent to contractors"):
  // nobody on the emergency list could come — ask every contractor on CROS who can be reached, whatever their trade
  if (wave >= 3) {
    const { data: all } = await s.from('people').select('*').eq('role', 'contractor') as { data: any[] | null }
    list = ((all ?? []) as any[]).filter(p => p.email || p.phone).map(p => ({ person_id: p.id, people: p, trades: ['general'], property_ids: [], backup_only: false, hours_from: 0, hours_to: 24, rank: 9 }))
  }
  const { data: askedRows } = await s.from('emergency_responses').select('contractor_id').eq('emergency_id', em.id)
  const asked = new Set(((askedRows ?? []) as any[]).map(r => r.contractor_id))
  const h = londonHour()
  // only contractors who cover this house (no houses chosen = every house)
  const covers = (c: any) => !(c.property_ids ?? []).length || !em.property_id || (c.property_ids ?? []).includes(em.property_id)
  const pick = ((list ?? []) as any[]).filter(c => !asked.has(c.person_id) && c.people && covers(c)).filter(c => {
    const trade = (c.trades ?? []).includes(em.trade)
    if (wave === 1) return trade && !c.backup_only && inHours(c.hours_from, c.hours_to, h)
    if (wave >= 3) return true
    return trade || (c.trades ?? []).includes('general')
  }).sort((a, b) => a.rank - b.rank)
  const windowEnds = new Date(Date.now() + set.windowMin * 60000).toISOString()
  // a confirmed one keeps its status when the office asks more people as a fallback
  const keep = ['assigned', 'on_site', 'needs_return', 'resolved', 'cancelled'].includes(em.status)
  await s.from('emergencies').update({ wave, window_ends_at: windowEnds, ...(keep ? {} : { status: 'collecting' }), updated_at: new Date().toISOString() }).eq('id', em.id)
  if (!pick.length) { await log(s, em.id, 'dispatch', `Wave ${wave}: no one on the emergency list to ask${wave === 1 ? ' for this trade right now' : ''}`); return 0 }
  const names: string[] = []
  for (const c of pick) {
    const t = token()
    const { error } = await s.from('emergency_responses').insert({ emergency_id: em.id, contractor_id: c.person_id, token: t, wave })
    if (error) continue
    const body = `CAPITAL ROOMS EMERGENCY: ${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)}. Can you attend? Tap to answer: ${link(t)}`
    const sent = await tellContractor(c.people, c.person_id, { text: body, title: 'Emergency — can you attend?', body: `${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)}`, url: `/e/${t}`, tag: `emergency-${em.id}` })
    await s.from('emergency_responses').update({ texted: sent.via.some(v => v.startsWith('text')) }).eq('token', t)
    names.push(`${pname(c.people)}${reached(sent)}`)
  }
  await log(s, em.id, 'dispatch', `Wave ${wave}: asked ${names.join(', ')} — answers close at ${ukTime(windowEnds)}`)
  return names.length
}

// ── choosing ─────────────────────────────────────────────────────────────────

const soonest = (rs: any[]) => [...rs].sort((a, b) => String(a.eta_at).localeCompare(String(b.eta_at)) || (a.rank ?? 5) - (b.rank ?? 5) || (Number(a.call_out_fee ?? 0) - Number(b.call_out_fee ?? 0)))

async function yesAnswers(s: S, emId: string) {
  const { data } = await s.from('emergency_responses').select('*, people!contractor_id(*)')
    .eq('emergency_id', emId).eq('answer', 'yes').is('stood_down_at', null) as { data: any[] | null }
  const { data: ranks } = await s.from('emergency_contractors').select('person_id, rank')
  const rank = new Map(((ranks ?? []) as any[]).map(r => [r.person_id, r.rank]))
  return ((data ?? []) as any[]).filter(r => r.eta_at).map(r => ({ ...r, rank: rank.get(r.contractor_id) ?? 5 }))
}

/** The answer window has closed (or everyone has answered): choose, ask the office, or widen the net. */
export async function decide(s: S, emId: string, reason = 'Answers closed') {
  const em = await load(s, emId)
  if (!em || em.status !== 'collecting') return
  const set = await settings(s)
  const yes = await yesAnswers(s, emId)
  const within = yes.filter(r => r.call_out_fee == null || Number(r.call_out_fee) <= set.costLimit)
  if (!set.auto) {
    await s.from('emergencies').update({ status: 'awaiting_office', updated_at: new Date().toISOString() }).eq('id', emId).eq('status', 'collecting')
    await log(s, emId, 'waiting', `${reason}: ${yes.length} can attend — automatic choosing is off, waiting for the office`)
    await alertOffice(s, em, `Choose a contractor — ${firstLine(em.properties?.name)}`, `${yes.length} can attend. Open it to pick one.`, true)
    return
  }
  if (within.length) return choose(s, emId, soonest(within)[0].id, 'CROS', `${reason}: the soonest within the £${set.costLimit} limit`)
  if (yes.length) {
    const best = soonest(yes)[0]
    const moved = await s.from('emergencies').update({ status: 'awaiting_office', updated_at: new Date().toISOString() }).eq('id', emId).eq('status', 'collecting').select('id')
    if (!moved.data?.length) return
    await log(s, emId, 'waiting', `${reason}: the soonest is ${pname(best.people)} by ${ukWhen(best.eta_at)} for ${gbp(best.call_out_fee)} — over the £${set.costLimit} limit, so the office is asked${set.overLimit === 'send_after_15' ? ' (goes ahead in 15 minutes if no one answers)' : ''}`)
    await alertOffice(s, em, `Approve call-out — ${firstLine(em.properties?.name)}`, `${pname(best.people)} can come by ${ukWhen(best.eta_at)} for ${gbp(best.call_out_fee)} (over your £${set.costLimit} limit).${set.overLimit === 'send_after_15' ? ' Going ahead in 15 minutes unless you change it.' : ''}`, true)
    return
  }
  // no one can come yet — widen the net: backups, then every contractor on CROS
  for (let w = (em.wave ?? 1) + 1; w <= 3; w++) {
    const n = await dispatchWave(s, em, w)
    if (n) {
      const who = w >= 3 ? 'every contractor on CROS' : 'the backups and general contractors'
      await log(s, emId, 'waiting', `${reason}: no one could come — asked ${who} too`)
      await alertOffice(s, em, `No contractor yet — ${firstLine(em.properties?.name)}`, `No one on the list could come. CROS has asked ${who}; you may want to call round.`, true)
      return
    }
  }
  const moved = await s.from('emergencies').update({ status: 'awaiting_office', updated_at: new Date().toISOString() }).eq('id', emId).eq('status', 'collecting').select('id')
  if (!moved.data?.length) return
  await log(s, emId, 'waiting', `${reason}: no contractor available — handed to the office`)
  await alertOffice(s, em, `🆘 No contractor available — ${firstLine(em.properties?.name)}`, 'Nobody on the emergency list can come. Please call round; the tenant has the overnight steps.', true)
  const steps = KINDS[em.kind as EmergencyKind]?.steps ?? []
  await tellHouse(s, em, 'Still arranging someone', `We’re still trying to get someone to you and haven’t forgotten. Until then: ${steps.slice(0, 3).join(' ')}${tonight(KINDS[em.kind as EmergencyKind])}`)
}

/** Confirm one contractor: they get the full address and access; everyone else is stood down; the job and the house are updated. */
export async function choose(s: S, emId: string, responseId: string, by: string, why: string) {
  const set = await settings(s)
  const allowed = by === 'CROS' ? ['collecting', 'awaiting_office'] : OPEN
  const { data: r } = await s.from('emergency_responses').select('*, people!contractor_id(*)').eq('id', responseId).eq('emergency_id', emId).maybeSingle() as { data: any }
  if (!r || !r.eta_at) return { error: 'That contractor hasn’t said when they can come' }
  if (r.outcome === 'cant_attend') return { error: `${pname(r.people)} has said they can’t attend this one` }
  const before = await load(s, emId)
  const followup = new Date(new Date(r.eta_at).getTime() + set.followupMin * 60000).toISOString()
  const { data: won } = await s.from('emergencies').update({
    status: 'assigned', chosen_response_id: r.id, eta_at: r.eta_at, call_out_fee: r.call_out_fee,
    followup_due_at: followup, followup_sent_at: null, followup_reminded_at: null, updated_at: new Date().toISOString(),
    ...(by !== 'CROS' ? { office_by: by } : {}),
  }).eq('id', emId).in('status', allowed).select('id')
  if (!won?.length) return { error: 'It has already been dealt with' }
  const em = await load(s, emId)
  await s.from('emergency_responses').update({ chosen_at: new Date().toISOString(), stood_down_at: null }).eq('id', r.id)

  // someone else was confirmed before (the office changed it): stand them down
  if (before?.chosen_response_id && before.chosen_response_id !== r.id) {
    const { data: prev } = await s.from('emergency_responses').select('id, token, contractor_id, people!contractor_id(*)').eq('id', before.chosen_response_id).maybeSingle() as { data: any }
    if (prev) {
      await s.from('emergency_responses').update({ stood_down_at: new Date().toISOString() }).eq('id', prev.id)
      await tellContractor(prev.people, prev.contractor_id, { text: `CAPITAL ROOMS: change of plan — the emergency near ${areaOf(em)} is now covered by someone else. Please don't attend. Thank you.`, title: 'Change of plan — no need to attend', body: `The emergency near ${areaOf(em)} is covered by someone else.`, url: `/e/${prev.token}`, tag: `emergency-${emId}` })
    }
  }
  // the chosen contractor: full details
  const tenant = em.people
  const lines = [
    `CAPITAL ROOMS — CONFIRMED. Please attend: ${KINDS[em.kind as EmergencyKind]?.label ?? em.title}`,
    `Where: ${addressOf(em)}`,
    `Expected by ${ukWhen(r.eta_at)} — tap “I’m here” when you arrive. Running late? Tell us on the link. Not there ${NO_SHOW_MIN} minutes after this time with no word, and we send someone else.`,
    tenant ? `Tenant: ${pname(tenant)}${tenant.phone ? ` ${tenant.phone}` : ''}` : '',
    em.properties?.key_safe_code ? `Front door key safe: ${em.properties.key_safe_code}` : '',
    `Details & updates: ${link(r.token)}`,
  ].filter(Boolean)
  const sms = await tellContractor(r.people, r.contractor_id, { text: lines.join('\n'), title: 'Emergency confirmed', body: `${addressOf(em)} — by ${ukWhen(r.eta_at)}`, url: `/e/${r.token}`, tag: `emergency-${emId}` })
  // everyone else asked: thanks, it's covered
  const { data: others } = await s.from('emergency_responses').select('id, token, answer, contractor_id, people!contractor_id(*)').eq('emergency_id', emId).neq('id', r.id).is('stood_down_at', null) as { data: any[] | null }
  for (const o of others ?? []) {
    await s.from('emergency_responses').update({ stood_down_at: new Date().toISOString() }).eq('id', o.id)
    if (o.answer !== 'no') await tellContractor(o.people, o.contractor_id, { text: `CAPITAL ROOMS: thanks — the emergency near ${areaOf(em)} is now covered. No need to attend.`, title: 'Covered — no need to attend', body: `The emergency near ${areaOf(em)} is now covered. Thank you.`, url: `/e/${o.token}`, tag: `emergency-${emId}` })
  }
  // the job
  if (em.ticket_id) {
    const day = new Date(r.eta_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    const hhmm = new Date(r.eta_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' })
    const { data: tk } = await s.from('maintenance_tickets').select('admin_note').eq('id', em.ticket_id).maybeSingle() as { data: any }
    await s.from('maintenance_tickets').update({
      contractor_id: r.contractor_id, status: 'assigned', booked_date: day, booked_slot: `by ${hhmm}`, priority: 'emergency',
      approved_at: new Date().toISOString(),
      admin_note: [tk?.admin_note, `[${ukDay(new Date())}] Emergency: ${pname(r.people)} confirmed by ${by}, due ${ukWhen(r.eta_at)}, call-out ${gbp(r.call_out_fee)}`].filter(Boolean).join('\n'),
      updated_at: new Date().toISOString(),
    }).eq('id', em.ticket_id)
  }
  await log(s, emId, 'confirmed', `${pname(r.people)} confirmed — due by ${ukWhen(r.eta_at)}, call-out ${gbp(r.call_out_fee)}. ${why}${sms.via.length ? ` — sent by ${sms.via.join(', ')}` : ` (couldn’t reach them: ${sms.error} — call them)`}`, by)
  // coming tomorrow: how to manage until then
  const notToday = new Date(r.eta_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) !== new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await tellHouse(s, em, 'Help is on the way', `A contractor is booked and hoping to be with you by ${ukWhen(r.eta_at)}. If they’re not there by then, we’ll chase them — and send someone else if we need to.${notToday ? tonight(KINDS[em.kind as EmergencyKind]) : ''}`)
  await alertOffice(s, em, `Emergency covered — ${firstLine(em.properties?.name)}`, `${pname(r.people)} due by ${ukWhen(r.eta_at)} for ${gbp(r.call_out_fee)}. CROS will check in at ${ukWhen(followup)}.`)
  return { ok: true }
}

// ── the contractor's link ────────────────────────────────────────────────────

export async function byToken(s: S, t: string) {
  const { data: r } = await s.from('emergency_responses').select('*').eq('token', t).maybeSingle() as { data: any }
  if (!r) return null
  const em = await load(s, r.emergency_id)
  return em ? { r, em } : null
}

/** What the contractor sees: the area only until they're confirmed; everything once they are. */
export function viewFor(r: any, em: any) {
  const chosen = em.chosen_response_id === r.id
  const info = KINDS[em.kind as EmergencyKind]
  return {
    kind: info?.label ?? em.title, title: em.title, details: chosen ? em.details : null,
    area: areaOf(em), address: chosen ? addressOf(em) : null,
    tenant: chosen && em.people ? { name: pname(em.people), phone: em.people.phone ?? null } : null,
    keySafe: chosen ? em.properties?.key_safe_code ?? null : null,
    stage: chosen ? (['resolved', 'cancelled'].includes(em.status) ? 'closed' : 'chosen') : r.stood_down_at || !['collecting', 'awaiting_office'].includes(em.status) ? 'covered' : r.answer ? 'answered' : 'ask',
    answer: r.answer, eta: r.eta_at, fee: r.call_out_fee, note: r.note,
    report: { onSite: r.on_site_at, outcome: r.outcome, part: r.part_needed, fixCost: r.fix_cost, returnDate: r.return_date, returnSlot: r.return_slot, at: r.reported_at },
    emStatus: em.status,
    // why there's no need to attend: someone else is going, the tenant made it safe till morning, or it was called off
    why: em.status === 'morning' ? 'made_safe' : em.status === 'cancelled' ? 'cancelled' : 'covered',
  }
}

export async function respond(s: S, t: string, a: { answer: 'yes' | 'no'; etaAt?: string | null; fee?: number | null; note?: string }) {
  const got = await byToken(s, t)
  if (!got) return { error: 'This link has expired' }
  const { r, em } = got
  if (r.stood_down_at || !['collecting', 'awaiting_office'].includes(em.status)) return { covered: true }
  if (a.answer === 'yes' && !a.etaAt) return { error: 'Say when you can be there' }
  await s.from('emergency_responses').update({
    answer: a.answer, answered_at: new Date().toISOString(), eta_at: a.answer === 'yes' ? a.etaAt : null,
    call_out_fee: a.answer === 'yes' && a.fee != null && !Number.isNaN(a.fee) ? a.fee : null, note: a.note?.slice(0, 500) || null,
  }).eq('id', r.id)
  const { data: who } = await s.from('people').select('salutation, first_name, last_name, full_name, company').eq('id', r.contractor_id).maybeSingle()
  await log(s, em.id, 'answer', a.answer === 'yes'
    ? `${pname(who)}: can be there by ${ukWhen(a.etaAt!)}, call-out ${gbp(a.fee)}${a.note ? ` — “${a.note}”` : ''}`
    : `${pname(who)}: can’t attend${a.note ? ` — “${a.note}”` : ''}`, pname(who))
  // a late "yes" after the office was asked because no one could come: take it straight away if it's within the limit
  if (em.status === 'awaiting_office' && a.answer === 'yes') {
    const set = await settings(s)
    if (set.auto && !em.office_by && (a.fee == null || a.fee <= set.costLimit)) {
      const { data: anyYes } = await s.from('emergency_responses').select('id').eq('emergency_id', em.id).eq('answer', 'yes').neq('id', r.id).limit(1)
      if (!anyYes?.length) await choose(s, em.id, r.id, 'CROS', 'First to answer after no one else could come')
    } else {
      await alertOffice(s, em, `New answer — ${firstLine(em.properties?.name)}`, `${pname(who)} can come by ${ukWhen(a.etaAt!)} for ${gbp(a.fee)}.`)
    }
    return { ok: true }
  }
  // everyone asked has answered: no need to wait for the window
  const { data: pending } = await s.from('emergency_responses').select('id').eq('emergency_id', em.id).is('answer', null).is('stood_down_at', null).limit(1)
  if (!pending?.length) await decide(s, em.id, 'Everyone asked has answered')
  return { ok: true }
}

export async function report(s: S, t: string, a: {
  outcome: 'on_site' | 'fixed' | 'made_safe' | 'not_fixed' | 'running_late' | 'cant_attend'
  note?: string; part?: string; fixCost?: number | null; returnDate?: string | null; returnSlot?: string | null; newEta?: string | null
}) {
  const got = await byToken(s, t)
  if (!got) return { error: 'This link has expired' }
  const { r, em } = got
  if (em.chosen_response_id !== r.id) return { error: 'You’re not booked for this one' }
  const set = await settings(s)
  const now = new Date().toISOString()
  const { data: who } = await s.from('people').select('salutation, first_name, last_name, full_name, company').eq('id', r.contractor_id).maybeSingle()
  const name = pname(who)
  const note = a.note?.trim().slice(0, 1000) || null

  if (a.outcome === 'on_site') {
    await s.from('emergency_responses').update({ on_site_at: now }).eq('id', r.id)
    await s.from('emergencies').update({ status: 'on_site', followup_due_at: new Date(Date.now() + set.followupMin * 60000).toISOString(), followup_sent_at: null, followup_reminded_at: null, updated_at: now }).eq('id', em.id)
    if (em.ticket_id) await s.from('maintenance_tickets').update({ arrived_at: now }).eq('id', em.ticket_id)
    await log(s, em.id, 'on_site', `${name} is on site${note ? ` — “${note}”` : ''}`, name)
    await tellHouse(s, em, 'The contractor has arrived', 'The contractor is at the property now.')
    return { ok: true }
  }
  if (a.outcome === 'running_late') {
    if (!a.newEta) return { error: 'Say when you’ll be there now' }
    await s.from('emergency_responses').update({ eta_at: a.newEta, outcome: 'running_late', outcome_note: note }).eq('id', r.id)
    await s.from('emergencies').update({ eta_at: a.newEta, followup_due_at: new Date(new Date(a.newEta).getTime() + set.followupMin * 60000).toISOString(), followup_sent_at: null, followup_reminded_at: null, updated_at: now }).eq('id', em.id)
    await log(s, em.id, 'late', `${name} is running late — now due by ${ukWhen(a.newEta)}${note ? ` — “${note}”` : ''}`, name)
    await tellHouse(s, em, 'A little later than planned', `The contractor is running late and now hopes to be with you by ${ukWhen(a.newEta)}. Sorry for the wait — if they’re not there by ${ukTime(plus(a.newEta, NO_SHOW_MIN))}, we’ll send someone else.`)
    return { ok: true }
  }
  if (a.outcome === 'cant_attend') {
    await s.from('emergency_responses').update({ outcome: 'cant_attend', outcome_note: note, stood_down_at: now, reported_at: now }).eq('id', r.id)
    const wave = (em.wave ?? 1) + 1
    await s.from('emergencies').update({ status: 'collecting', chosen_response_id: null, wave, window_ends_at: new Date(Date.now() + set.windowMin * 60000).toISOString(), updated_at: now }).eq('id', em.id)
    await log(s, em.id, 'dropped', `${name} can no longer attend${note ? ` — “${note}”` : ''}. Finding someone else.`, name)
    // ask again everyone who said yes before — they were stood down when this contractor was confirmed
    const { data: before } = await s.from('emergency_responses').select('id, token, contractor_id, people!contractor_id(*)')
      .eq('emergency_id', em.id).eq('answer', 'yes').neq('id', r.id).is('outcome', null) as { data: any[] | null }
    const reasked: string[] = []
    for (const o of before ?? []) {
      await s.from('emergency_responses').update({ answer: null, answered_at: null, eta_at: null, call_out_fee: null, stood_down_at: null, wave }).eq('id', o.id)
      const sent = await tellContractor(o.people, o.contractor_id, { text: `CAPITAL ROOMS EMERGENCY: the contractor booked for ${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)} can't make it now. Can you still come? Tap to answer: ${link(o.token)}`, title: 'Can you still come?', body: `${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)}`, url: `/e/${o.token}`, tag: `emergency-${em.id}` })
      reasked.push(`${pname(o.people)}${reached(sent)}`)
    }
    if (reasked.length) await log(s, em.id, 'dispatch', `Asked again: ${reasked.join(', ')} (they said yes earlier)`)
    const fresh = await dispatchWave(s, await load(s, em.id), wave)
    await alertOffice(s, em, `Contractor dropped out — ${firstLine(em.properties?.name)}`, `${name} can’t make it. CROS has asked ${reasked.length + fresh ? `${reasked.length + fresh} contractor${reasked.length + fresh === 1 ? '' : 's'} again` : 'no one — there’s no one else on the list'}; it confirms the soonest in ${set.windowMin} minutes.`, true)
    if (!reasked.length && !fresh) await decide(s, em.id, `${name} dropped out`)
    return { ok: true }
  }

  // fixed / made safe / not fixed
  await s.from('emergency_responses').update({
    outcome: a.outcome, outcome_note: note, part_needed: a.part?.trim() || null, fix_cost: a.fixCost ?? null,
    return_date: a.returnDate || null, return_slot: a.returnSlot || null, reported_at: now, on_site_at: r.on_site_at ?? now,
  }).eq('id', r.id)
  const { data: tk } = em.ticket_id ? await s.from('maintenance_tickets').select('admin_note').eq('id', em.ticket_id).maybeSingle() as { data: any } : { data: null }
  const stamp = (txt: string) => [tk?.admin_note, `[${ukDay(new Date())}] ${txt}`].filter(Boolean).join('\n')

  if (a.outcome === 'fixed') {
    await s.from('emergencies').update({ status: 'resolved', resolved_at: now, updated_at: now }).eq('id', em.id)
    if (em.ticket_id) await s.from('maintenance_tickets').update({ status: 'completed', completed_at: now, return_needed: false, admin_note: stamp(`Emergency fixed by ${name}${note ? ` — ${note}` : ''}`), updated_at: now }).eq('id', em.ticket_id)
    await log(s, em.id, 'fixed', `${name}: fixed${note ? ` — “${note}”` : ''}`, name)
    await tellHouse(s, em, 'Sorted', 'The problem has been fixed. Thanks for your patience — let us know if anything isn’t right.')
    await alertOffice(s, em, `Emergency fixed — ${firstLine(em.properties?.name)}`, `${name} has fixed it.${note ? ` ${note}` : ''}`)
    return { ok: true }
  }
  // made safe / not fixed → coming back
  const back = a.returnDate ? `${ukDay(`${a.returnDate}T12:00:00Z`)}${a.returnSlot ? ` ${a.returnSlot.replace('-', '–')}` : ''}` : null
  await s.from('emergencies').update({ status: 'needs_return', updated_at: now }).eq('id', em.id)
  if (em.ticket_id) await s.from('maintenance_tickets').update({
    status: 'assigned', return_needed: true, return_reason: [a.part ? `Part: ${a.part}` : '', note].filter(Boolean).join(' — ') || (a.outcome === 'made_safe' ? 'Made safe, needs a proper fix' : 'Not fixed'),
    return_date: a.returnDate || null, booked_date: a.returnDate || null, booked_slot: a.returnSlot || null, arrived_at: null,
    quote_amount: a.fixCost ?? null,
    admin_note: stamp(`Emergency ${a.outcome === 'made_safe' ? 'made safe' : 'not fixed'} by ${name}${a.part ? `; part needed: ${a.part}` : ''}${a.fixCost != null ? `; proper fix ${gbp(a.fixCost)}` : ''}${back ? `; back ${back}` : ''}`),
    updated_at: now,
  }).eq('id', em.ticket_id)
  await log(s, em.id, a.outcome, `${name}: ${a.outcome === 'made_safe' ? 'made safe' : 'not fixed'}${a.part ? ` — needs ${a.part}` : ''}${a.fixCost != null ? `, proper fix ${gbp(a.fixCost)}` : ''}${back ? `, back ${back}` : ', return date to agree'}${note ? ` — “${note}”` : ''}`, name)
  await tellHouse(s, em, a.outcome === 'made_safe' ? 'Made safe for now' : 'Update on the repair',
    `${a.outcome === 'made_safe' ? 'It’s been made safe for now.' : 'It couldn’t be fully fixed tonight.'}${back ? ` They’ll be back on ${back} to finish.` : ' We’ll confirm when they’re coming back.'}`)
  await alertOffice(s, em, `Needs a return visit — ${firstLine(em.properties?.name)}`, `${name}: ${a.part ? `needs ${a.part}. ` : ''}${a.fixCost != null ? `Proper fix ${gbp(a.fixCost)}. ` : ''}${back ? `Back ${back}.` : 'No return date yet.'}`, a.fixCost != null)
  return { ok: true }
}

// ── a booked contractor who doesn't turn up (15 Nov 2026, Harry: "what happens if it says they are visiting but they
// never turn up … the contractor went completely offline — that is what I am trying to protect against … the process
// cannot break down"). Fully automatic; nobody in the office has to be awake.
//   T = the time the contractor last gave us (their answer, or their latest "running late" — which restarts the clock)
//   Arrived = the contractor taps "I'm here" OR the tenant taps "Yes, they're here". Nothing else counts.
//   · T        not arrived → the house is asked "Has the contractor arrived?"; the contractor is nudged
//   · T + 20   not arrived → final text to the contractor: "running late? tell us when — if you're not there by T+45
//              we'll send someone else"; the house is told we're chasing; the office is texted
//   · T + 45   not arrived → reopened: the contractor is stood down and told; everyone else who hasn't said no is asked
//              again ("can you still come — when, and for how much?", their last fee filled in) plus the next wave; the
//              soonest is confirmed as usual; the house is told. Nobody answers → the waves widen to every contractor and
//              the office is texted, exactly as the first time round.
//   A tenant's "No one has come yet" is logged and answered with when we'll send someone else; it never waits on them —
//   silence from both sides counts as a no-show.
export const ARRIVAL_ASK_MIN = 0
export const LATE_CHASE_MIN = 20
export const NO_SHOW_MIN = 45
const plus = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60000).toISOString()

async function chosenOf(s: S, em: any) {
  if (!em.chosen_response_id) return null
  const { data } = await s.from('emergency_responses').select('*, people!contractor_id(*)').eq('id', em.chosen_response_id).maybeSingle() as { data: any }
  return data
}
async function eventSince(s: S, emId: string, kind: string, since: string) {
  const { data } = await s.from('emergency_events').select('id').eq('emergency_id', emId).eq('kind', kind).gte('at', since).limit(1)
  return !!data?.length
}

/** At their time: ask the house whether they've come, nudge the contractor. */
export async function askArrival(s: S, emId: string) {
  const em = await load(s, emId)
  if (!em || em.status !== 'assigned') return { error: 'Nothing to ask' }
  const r = await chosenOf(s, em)
  if (r) await tellContractor(r.people, r.contractor_id, { text: `CAPITAL ROOMS: you’re due at ${addressOf(em)} now. Tap “I’m here” when you arrive, or “I’m running late” with a new time: ${link(r.token)}`, title: 'You’re due now', body: `${addressOf(em)} — tap “I’m here” when you arrive`, url: `/e/${r.token}`, tag: `emergency-${em.id}` })
  await log(s, em.id, 'arrival_ask', `Due now — asked the house whether the contractor has arrived${r ? ' and nudged the contractor' : ''}`)
  await tellHouse(s, em, 'Has the contractor arrived?', `They were hoping to be with you by ${ukWhen(em.eta_at)}. Tap to tell us whether they’ve arrived — if they don’t turn up, we’ll send someone else by ${ukTime(plus(em.eta_at, NO_SHOW_MIN))}.`)
  return { ok: true }
}

/** 20 minutes past their time: the final text to the contractor. */
export async function chaseLate(s: S, emId: string, by = 'CROS') {
  const em = await load(s, emId)
  if (!em || em.status !== 'assigned') return { error: 'Nothing to chase' }
  const r = await chosenOf(s, em)
  if (!r) return { error: 'No contractor booked' }
  const cutoff = ukTime(plus(em.eta_at, NO_SHOW_MIN))
  const sent = await tellContractor(r.people, r.contractor_id, {
    text: `CAPITAL ROOMS: the tenants at ${addressOf(em)} were expecting you by ${ukWhen(em.eta_at)}. Are you running late? Tell us when you’ll be there: ${link(r.token)} — if you’re not there by ${cutoff} and we haven’t heard, we’ll send the job to another contractor.`,
    title: 'Running late? Tell us when', body: `${addressOf(em)} — not there by ${cutoff} and we send someone else`, url: `/e/${r.token}`, tag: `emergency-${em.id}`,
  })
  await log(s, em.id, 'late_chase', `${pname(r.people)} hasn’t arrived — final text sent${reached(sent)}; someone else at ${cutoff} if still nothing`, by)
  await tellHouse(s, em, 'Chasing your contractor', `They haven’t arrived yet, so we’re chasing them. If they’re not with you by ${cutoff}, we’ll send someone else. Tell us the moment they arrive.`)
  await alertOffice(s, em, `Contractor not there yet — ${firstLine(em.properties?.name)}`, `${pname(r.people)} was due by ${ukWhen(em.eta_at)} and hasn’t arrived. CROS has chased them and sends someone else at ${cutoff} if there’s still nothing.`, true)
  return { ok: true }
}

export async function noShow(s: S, emId: string, why: string, by = 'CROS', mode: 'no_show' | 'not_fixed' = 'no_show') {
  const em = await load(s, emId)
  if (!em || !['assigned', 'on_site'].includes(em.status)) return { error: 'Nothing to replace' }
  const r = await chosenOf(s, em)
  if (!r) return { error: 'No contractor booked' }
  const set = await settings(s)
  const now = new Date().toISOString()
  await s.from('emergency_responses').update({ outcome: mode, outcome_note: why, stood_down_at: now, reported_at: now }).eq('id', r.id)
  if (mode === 'not_fixed') await tellContractor(r.people, r.contractor_id, { text: `CAPITAL ROOMS: the tenant at ${addressOf(em)} says it’s still not fixed, so we’re asking another contractor. Please tell us what you did and what’s left: ${link(r.token)}`, title: 'Still not fixed — tell us what’s left', body: `${addressOf(em)} — the tenant says it’s not fixed`, url: `/e/${r.token}`, tag: `emergency-${em.id}` })
  else await tellContractor(r.people, r.contractor_id, { text: `CAPITAL ROOMS: we couldn’t reach you about the emergency at ${addressOf(em)}, so we’re sending someone else. Please don’t attend now unless we contact you again. If you’re actually there, call the office straight away.`, title: 'We’re sending someone else', body: `${addressOf(em)} — please don’t attend now`, url: `/e/${r.token}`, tag: `emergency-${em.id}` })
  const wave = (em.wave ?? 1) + 1
  await s.from('emergencies').update({ status: 'collecting', chosen_response_id: null, wave, window_ends_at: new Date(Date.now() + set.windowMin * 60000).toISOString(), updated_at: now }).eq('id', em.id)
  await log(s, em.id, 'no_show', mode === 'not_fixed' ? `Not fixed after ${pname(r.people)}’s visit (${why}). Finding someone else.` : `${pname(r.people)} didn’t turn up (${why}). Finding someone else.`, by)
  // everyone else asked who didn't say no — the soonest of them is confirmed in the usual way
  const { data: others } = await s.from('emergency_responses').select('id, token, answer, outcome, contractor_id, people!contractor_id(*)').eq('emergency_id', em.id).neq('id', r.id) as { data: any[] | null }
  const what = KINDS[em.kind as EmergencyKind]?.label ?? em.title
  const reasked: string[] = []
  for (const o of (others ?? []).filter(o => o.answer !== 'no' && !o.outcome && o.people)) {
    await s.from('emergency_responses').update({ answer: null, answered_at: null, eta_at: null, stood_down_at: null, wave }).eq('id', o.id)
    const sent = await tellContractor(o.people, o.contractor_id, { text: `CAPITAL ROOMS EMERGENCY: ${mode === 'not_fixed' ? `the ${what.toLowerCase()} near ${areaOf(em)} still isn’t fixed` : `the contractor booked for the ${what.toLowerCase()} near ${areaOf(em)} hasn’t turned up`}. Can you still come — when, and for how much? Tap to answer: ${link(o.token)}`, title: 'Can you come now?', body: `${what} near ${areaOf(em)}`, url: `/e/${o.token}`, tag: `emergency-${em.id}` })
    reasked.push(`${pname(o.people)}${reached(sent)}`)
  }
  if (reasked.length) await log(s, em.id, 'dispatch', `Asked again: ${reasked.join(', ')}`)
  const fresh = await dispatchWave(s, await load(s, em.id), wave)
  await tellHouse(s, em, 'We’re sending someone else', `We’re really sorry — ${mode === 'not_fixed' ? 'it’s still not fixed' : 'the contractor hasn’t turned up and we couldn’t reach them'}, so we’re finding someone else now. We’ll message you the moment they’re booked. Until then: ${(KINDS[em.kind as EmergencyKind]?.steps ?? []).slice(0, 3).join(' ')}`)
  await alertOffice(s, em, `${mode === 'not_fixed' ? 'Not fixed' : 'No-show'} — sending someone else — ${firstLine(em.properties?.name)}`, `${pname(r.people)}: ${why}. CROS has asked ${reasked.length + fresh || 'no one — nobody else is on the list. Call round'}${reasked.length + fresh ? ' contractors' : ''}.`, true)
  if (!reasked.length && !fresh) await decide(s, em.id, 'No-show')
  return { ok: true }
}

/** The clock runs every minute (pg_cron). If it has stopped, whoever opens an emergency screen runs it — so a dead
 *  scheduler can't leave an emergency stuck with nobody watching. */
export async function tickIfStale(s: S) {
  const { data } = await s.from('system_settings').select('value').eq('key', 'emergency_last_tick').maybeSingle() as { data: any }
  const last = data?.value ? new Date(String(data.value)).getTime() : 0
  if (Date.now() - last > 3 * 60000) await tick(s).catch(() => null)
}

// ── the clock ────────────────────────────────────────────────────────────────

export async function tick(s: S) {
  const now = new Date()
  const iso = now.toISOString()
  const set = await settings(s)
  const done: string[] = []
  await s.from('system_settings').upsert({ key: 'emergency_last_tick', value: iso }, { onConflict: 'key' })

  // 1. answer windows that have closed
  const { data: due } = await s.from('emergencies').select('id').eq('status', 'collecting').lte('window_ends_at', iso)
  for (const e of (due ?? []) as any[]) { await decide(s, e.id); done.push(`decided ${e.id}`) }

  // 2. over the cost limit, office silent for 15 minutes → go ahead (if that's the setting)
  if (set.auto && set.overLimit === 'send_after_15') {
    const cutoff = new Date(now.getTime() - 15 * 60000).toISOString()
    const { data: waiting } = await s.from('emergencies').select('id, office_by').eq('status', 'awaiting_office').lte('office_alerted_at', cutoff)
    for (const e of (waiting ?? []) as any[]) {
      if (e.office_by) continue
      const yes = await yesAnswers(s, e.id)
      if (yes.length) { await choose(s, e.id, soonest(yes)[0].id, 'CROS', 'No reply from the office in 15 minutes, so went ahead'); done.push(`approved ${e.id}`) }
    }
  }

  // 3. check in with the contractor after they were due
  const { data: checkins } = await s.from('emergencies').select('id, chosen_response_id').in('status', ['assigned', 'on_site']).lte('followup_due_at', iso).is('followup_sent_at', null)
  for (const e of (checkins ?? []) as any[]) {
    const { data: claimed } = await s.from('emergencies').update({ followup_sent_at: iso }).eq('id', e.id).is('followup_sent_at', null).select('id')
    if (!claimed?.length) continue
    const em = await load(s, e.id)
    const { data: r } = await s.from('emergency_responses').select('token, contractor_id, people!contractor_id(*)').eq('id', e.chosen_response_id).maybeSingle() as { data: any }
    if (!r) continue
    const sent = await tellContractor(r.people, r.contractor_id, { text: `CAPITAL ROOMS: how's it going at ${addressOf(em)}? Are you there, is it done — and if not, what's needed and when can you come back? Tap to tell us (1 minute): ${link(r.token)}`, title: 'How did it go?', body: `${addressOf(em)} — tap to update`, url: `/e/${r.token}`, tag: `emergency-${e.id}` })
    await log(s, e.id, 'check_in', `Asked ${pname(r.people)} for an update${reached(sent)}`)
    done.push(`checked in ${e.id}`)
  }

  // 3b. booked and past their time without "I'm here" / the tenant's yes: ask the house at T, final text at T+20,
  //     send someone else at T+45 (each once per T — "running late" gives a new T)
  const { data: booked } = await s.from('emergencies').select('id, eta_at').eq('status', 'assigned').lte('eta_at', iso)
  for (const e of (booked ?? []) as any[]) {
    if (!e.eta_at) continue
    const late = (now.getTime() - new Date(e.eta_at).getTime()) / 60000
    if (late >= NO_SHOW_MIN) { if (!(await eventSince(s, e.id, 'no_show', e.eta_at))) { await noShow(s, e.id, `not there ${Math.round(late)} minutes after their time, and no word`); done.push(`no-show ${e.id}`) } }
    else if (late >= LATE_CHASE_MIN) { if (!(await eventSince(s, e.id, 'late_chase', e.eta_at))) { await chaseLate(s, e.id); done.push(`chased ${e.id}`) } }
    else if (late >= ARRIVAL_ASK_MIN && !(await eventSince(s, e.id, 'arrival_ask', e.eta_at))) { await askArrival(s, e.id); done.push(`asked house ${e.id}`) }
  }

  // 3c. nobody could come and the office hasn't stepped in: ask everyone again every 30 minutes (up to 8 times), and the
  //     house is reminded we haven't forgotten. Made safe till morning: from 8am (or 30 minutes after, in the day) ask
  //     for someone today. The office can always take over; nothing waits on them.
  const londonHour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }))
  const { data: stuck } = await s.from('emergencies').select('id, status, office_by, updated_at').in('status', ['awaiting_office', 'morning']).is('office_by', null)
  for (const e of (stuck ?? []) as any[]) {
    if (new Date(e.updated_at).getTime() > now.getTime() - 30 * 60000) continue
    const em = await load(s, e.id)
    if (!em) continue
    if (e.status === 'morning') {
      if (londonHour < 8 || londonHour >= 20) continue
      if (await eventSince(s, e.id, 'morning_dispatch', new Date(now.getTime() - 12 * 3600000).toISOString())) continue
      await log(s, e.id, 'morning_dispatch', 'Made safe earlier — asking for someone today')
      let n = await reaskStoodDown(s, em, 'morning')
      for (let w = 1; !n && w <= 3; w++) n = await dispatchWave(s, { ...em, status: 'morning' }, w)
      if (n) await tellHouse(s, em, 'Booking someone today', 'We’re asking our contractors to come and fix it properly today — we’ll message you when someone is booked.')
      else await alertOffice(s, em, `No one to book — ${firstLine(em.properties?.name)}`, 'It was made safe overnight but no contractor is available to fix it. Please call round.', true)
      done.push(`morning ${e.id}`)
      continue
    }
    // awaiting the office with nobody able to come (an over-limit answer is handled by step 2)
    if ((await yesAnswers(s, e.id)).length) continue
    const { data: tries } = await s.from('emergency_events').select('id').eq('emergency_id', e.id).eq('kind', 'retry')
    if ((tries?.length ?? 0) >= 8) continue
    await log(s, e.id, 'retry', `Still no one — asking again (${(tries?.length ?? 0) + 1} of 8)`)
    const n = await reaskStoodDown(s, em, 'retry')
    if (!n) await s.from('emergencies').update({ updated_at: iso }).eq('id', e.id)   // try again in 30 minutes
    await tellHouse(s, em, 'Still arranging someone', `We haven’t forgotten you — we’re still asking contractors. Until then: ${(KINDS[em.kind as EmergencyKind]?.steps ?? []).slice(0, 3).join(' ')}`)
    done.push(`retried ${e.id}`)
  }

  // 4. no reply to the check-in after 30 minutes → remind once and tell the office
  const quiet = new Date(now.getTime() - 30 * 60000).toISOString()
  const { data: silent } = await s.from('emergencies').select('id, chosen_response_id').in('status', ['assigned', 'on_site']).lte('followup_sent_at', quiet).is('followup_reminded_at', null)
  for (const e of (silent ?? []) as any[]) {
    const { data: claimed } = await s.from('emergencies').update({ followup_reminded_at: iso }).eq('id', e.id).is('followup_reminded_at', null).select('id')
    if (!claimed?.length) continue
    const em = await load(s, e.id)
    const { data: r } = await s.from('emergency_responses').select('token, contractor_id, people!contractor_id(*)').eq('id', e.chosen_response_id).maybeSingle() as { data: any }
    if (r) await tellContractor(r.people, r.contractor_id, { text: `CAPITAL ROOMS: quick reminder — please tell us how the emergency went: ${link(r.token)}`, title: 'Reminder — how did it go?', body: 'Please tell us how the emergency went', url: `/e/${r.token}`, tag: `emergency-${e.id}` })
    await log(s, e.id, 'check_in', `No update from ${pname(r?.people)} yet — reminded them and told the office`)
    await alertOffice(s, em, `No update from the contractor — ${firstLine(em.properties?.name)}`, `${pname(r?.people)} hasn’t said how it went. Worth a call.`, true)
    done.push(`reminded ${e.id}`)
  }
  return done
}

// ── the office ───────────────────────────────────────────────────────────────

export async function officeAction(s: S, emId: string, by: string, a: { action: string; responseId?: string; note?: string; wave?: number }) {
  const em = await load(s, emId)
  if (!em) return { error: 'Not found' }
  const now = new Date().toISOString()
  switch (a.action) {
    case 'hold':
      await s.from('emergencies').update({ status: 'office_handling', office_by: by, updated_at: now }).eq('id', emId)
      await log(s, emId, 'office', `${by} took it over — CROS has stopped choosing`, by)
      return { ok: true }
    case 'resume':
      await s.from('emergencies').update({ status: 'collecting', office_by: null, window_ends_at: now, updated_at: now }).eq('id', emId)
      await log(s, emId, 'office', `${by} handed it back to CROS`, by)
      await decide(s, emId, 'Handed back by the office')
      return { ok: true }
    case 'choose':
      if (!a.responseId) return { error: 'Choose who' }
      return choose(s, emId, a.responseId, by, 'Chosen by the office')
    case 'ask_again': {
      const n = await dispatchWave(s, em, Math.max(2, (em.wave ?? 1) + 1))
      await log(s, emId, 'office', `${by} asked again — ${n} more contacted`, by)
      return { ok: true, asked: n }
    }
    case 'dispatch':   // a contained ("morning") one that now needs someone after all
      await log(s, emId, 'office', `${by} sent it out to contractors`, by)
      await dispatchWave(s, em, 1)
      return { ok: true }
    case 'resolve':
      await s.from('emergencies').update({ status: 'resolved', resolved_at: now, office_by: by, updated_at: now }).eq('id', emId)
      await log(s, emId, 'office', `${by} marked it resolved${a.note ? ` — ${a.note}` : ''}`, by)
      return { ok: true }
    case 'cancel':
      await s.from('emergencies').update({ status: 'cancelled', office_by: by, updated_at: now }).eq('id', emId)
      const { data: live } = await s.from('emergency_responses').select('id, token, contractor_id, people!contractor_id(*)').eq('emergency_id', emId).is('stood_down_at', null) as { data: any[] | null }
      for (const o of live ?? []) {
        await s.from('emergency_responses').update({ stood_down_at: now }).eq('id', o.id)
        await tellContractor(o.people, o.contractor_id, { text: `CAPITAL ROOMS: the emergency near ${areaOf(em)} has been cancelled — no need to attend. Thank you.`, title: 'Cancelled — no need to attend', body: `The emergency near ${areaOf(em)} has been cancelled.`, url: `/e/${o.token}`, tag: `emergency-${emId}` })
      }
      await log(s, emId, 'office', `${by} cancelled it${a.note ? ` — ${a.note}` : ''}`, by)
      return { ok: true }
    case 'note':
      if (!a.note?.trim()) return { error: 'Write a note' }
      await log(s, emId, 'note', a.note.trim().slice(0, 1000), by)
      return { ok: true }
  }
  return { error: 'Unknown action' }
}

// ── the tenant's own screen (15 Nov 2026, Harry: "she can also say whether they have managed to find a solution for it
// until morning") ─────────────────────────────────────────────────────────────

/** What a tenant at the house sees: never the contractor's name or number, just what's happening and what to do. */
export function tenantView(em: any) {
  const info = KINDS[em.kind as EmergencyKind]
  const stage = ['resolved', 'cancelled'].includes(em.status) ? 'closed'
    : em.status === 'on_site' ? 'on_site'
    : ['assigned', 'needs_return'].includes(em.status) ? 'booked'
    : em.status === 'morning' ? 'morning'
    : em.status === 'call_999' ? 'call_999'
    : 'finding'
  return {
    id: em.id, ticketId: em.ticket_id ?? null, kind: em.kind, label: info?.label ?? em.title, stage, status: em.status,
    reportedAt: em.created_at, eta: em.eta_at ?? null, etaText: em.eta_at ? ukWhen(em.eta_at) : null,
    // past their time and not there: the tenant can tell us no one has come
    overdue: em.status === 'assigned' && !!em.eta_at && new Date(em.eta_at).getTime() < Date.now(),
    othersAt: em.status === 'assigned' && em.eta_at ? ukTime(plus(em.eta_at, NO_SHOW_MIN)) : null,
    controlled: !!em.controlled, bathroomAbove: /bathroom or toilet above the leak/i.test(String(em.details ?? '')),
    steps: info?.steps ?? [], overnight: info?.overnight ?? [], callServices: info?.callServices ?? null,
    house: firstLine(em.properties?.name),
  }
}

/** It got worse after being made safe: ask again the contractors who were stood down (not anyone who said no). Same
 *  link as before — their answer page opens fresh. Returns how many were asked. */
async function reaskStoodDown(s: S, em: any, why: 'worse' | 'morning' | 'retry' = 'worse'): Promise<number> {
  const { data: rows } = await s.from('emergency_responses').select('id, token, answer, outcome, stood_down_at, contractor_id, people!contractor_id(*)')
    .eq('emergency_id', em.id) as { data: any[] | null }
  // stood down (made safe) — or, on a retry, never answered — and not anyone who said no or let us down
  const again = ((rows ?? []) as any[]).filter(r => r.answer !== 'no' && !r.outcome && r.people && (r.stood_down_at || why === 'retry'))
  if (!again.length) return 0
  const set = await settings(s)
  const windowEnds = new Date(Date.now() + set.windowMin * 60000).toISOString()
  if (['morning', 'collecting', 'awaiting_office'].includes(em.status) && (why !== 'worse' || em.status !== 'awaiting_office'))
    await s.from('emergencies').update({ status: 'collecting', window_ends_at: windowEnds, updated_at: new Date().toISOString() }).eq('id', em.id)
  const what = KINDS[em.kind as EmergencyKind]?.label ?? em.title
  const names: string[] = []
  for (const r of again) {
    await s.from('emergency_responses').update({ stood_down_at: null, answer: null, answered_at: null, eta_at: null, call_out_fee: null }).eq('id', r.id)
    const msg = why === 'worse'
      ? { text: `CAPITAL ROOMS EMERGENCY — needed again: the ${what.toLowerCase()} near ${areaOf(em)} has got worse after all. Can you attend? Tap to answer: ${link(r.token)}`, title: 'Needed again — can you attend?', body: `${what} near ${areaOf(em)} has got worse` }
      : why === 'morning'
        ? { text: `CAPITAL ROOMS: the ${what.toLowerCase()} near ${areaOf(em)} was made safe overnight and still needs fixing today. Can you come — when, and for how much? Tap to answer: ${link(r.token)}`, title: 'Can you come today?', body: `${what} near ${areaOf(em)} — made safe, needs fixing today` }
        : { text: `CAPITAL ROOMS EMERGENCY — still need someone for the ${what.toLowerCase()} near ${areaOf(em)}. Can you attend? Tap to answer: ${link(r.token)}`, title: 'Still need someone — can you attend?', body: `${what} near ${areaOf(em)}` }
    const sent = await tellContractor(r.people, r.contractor_id, { ...msg, url: `/e/${r.token}`, tag: `emergency-${em.id}` })
    names.push(`${pname(r.people)}${reached(sent)}`)
  }
  await log(s, em.id, 'dispatch', `${why === 'worse' ? 'Got worse' : why === 'morning' ? 'Morning' : 'Still no one'} — asked again: ${names.join(', ')} — answers close at ${ukTime(windowEnds)}`)
  return names.length
}

export async function tenantAction(s: S, emId: string, by: { personId: string; name: string }, action: 'contained' | 'worse' | 'no_show' | 'arrived' | 'sorted' | 'not_fixed', note?: string) {
  const em = await load(s, emId)
  if (!em) return { error: 'Not found' }
  if (['resolved', 'cancelled'].includes(em.status)) return { error: 'This emergency is closed — report a new one if something’s wrong.' }
  const now = new Date().toISOString()
  const extra = note?.trim() ? ` — “${note.trim().slice(0, 300)}”` : ''
  if (action === 'contained') {
    await log(s, emId, 'tenants', `${by.name}: made safe until morning${extra}`, by.name)
    if (['collecting', 'awaiting_office'].includes(em.status)) {
      // nobody confirmed yet: stand the contractors down and book someone first thing
      await s.from('emergencies').update({ status: 'morning', controlled: true, updated_at: now }).eq('id', emId)
      const { data: live } = await s.from('emergency_responses').select('id, token, contractor_id, people!contractor_id(*)').eq('emergency_id', emId).is('stood_down_at', null) as { data: any[] | null }
      for (const o of live ?? []) {
        await s.from('emergency_responses').update({ stood_down_at: now }).eq('id', o.id)
        await tellContractor(o.people, o.contractor_id, { text: `CAPITAL ROOMS: the tenant has made the problem near ${areaOf(em)} safe until morning — no need to attend tonight. Thank you.`, title: 'Made safe — no need to attend tonight', body: `The tenant has made it safe until morning.`, url: `/e/${o.token}`, tag: `emergency-${emId}` })
      }
      await alertOffice(s, em, `Made safe until morning — ${firstLine(em.properties?.name)}`, `${by.name} says it’s safe until morning${extra}. Contractors stood down — book someone first thing.`)
      await tellHouse(s, em, 'Thanks — made safe until morning', `Thanks for sorting it for now. We’ll arrange someone first thing in the morning — tell us straight away if it gets worse.${tonight(KINDS[em.kind as EmergencyKind])}`)
    } else {
      await alertOffice(s, em, `Tenant says it’s safe until morning — ${firstLine(em.properties?.name)}`, `${by.name} says it’s safe until morning${extra}. A contractor is still booked — call them if you’d rather move the visit.`)
    }
    return { ok: true }
  }
  if (action === 'sorted') {
    await log(s, emId, 'tenants', `${by.name}: it’s sorted${extra}`, by.name)
    if (['assigned', 'on_site', 'needs_return'].includes(em.status)) {
      await s.from('emergencies').update({ status: 'resolved', resolved_at: now, updated_at: now }).eq('id', emId)
      await alertOffice(s, em, `Sorted — ${firstLine(em.properties?.name)}`, `${by.name} says it’s sorted${extra}. The contractor still logs the job and invoices as usual.`)
    }
    return { ok: true }
  }
  if (action === 'not_fixed') {
    await log(s, emId, 'tenants', `${by.name}: the contractor has been and it’s not fixed${extra}`, by.name)
    if (em.status === 'on_site') return noShow(s, emId, `the tenant says it’s not fixed and they’ve gone${extra}`, by.name, 'not_fixed')
    await alertOffice(s, em, `Not fixed — ${firstLine(em.properties?.name)}`, `${by.name} says it’s not fixed${extra}.`, true)
    return { ok: true }
  }
  if (action === 'arrived') {
    await log(s, emId, 'tenants', `${by.name}: the contractor has arrived${extra}`, by.name)
    if (em.status !== 'assigned') return { ok: true }
    const set = await settings(s)
    await s.from('emergencies').update({ status: 'on_site', followup_due_at: new Date(Date.now() + set.followupMin * 60000).toISOString(), followup_sent_at: null, followup_reminded_at: null, updated_at: now }).eq('id', emId)
    if (em.chosen_response_id) await s.from('emergency_responses').update({ on_site_at: now }).eq('id', em.chosen_response_id).is('on_site_at', null)
    return { ok: true }
  }
  if (action === 'no_show') {
    await log(s, emId, 'tenants', `${by.name}: no one has turned up${extra}`, by.name)
    if (em.status !== 'assigned') return { ok: true }
    // the contractor has until T+45 (they may have told us they're late); after that the tenant's no reopens it now
    if (em.eta_at && Date.now() < new Date(plus(em.eta_at, NO_SHOW_MIN)).getTime()) {
      if (Date.now() >= new Date(em.eta_at).getTime() && !(await eventSince(s, emId, 'late_chase', em.eta_at))) await chaseLate(s, emId, by.name)
      return { ok: true, sendOthersAt: ukTime(plus(em.eta_at, NO_SHOW_MIN)) }
    }
    return noShow(s, emId, `the tenant says no one has come${extra}`, by.name)
  }
  // worse
  await log(s, emId, 'tenants', `${by.name}: it’s got worse${extra}`, by.name)
  await alertOffice(s, em, `⚠️ Getting worse — ${firstLine(em.properties?.name)}`, `${by.name} says it’s got worse${extra}.`, true)
  // still finding someone, but the ones stood down when it was made safe haven't heard it's got worse — ask them again
  if (['collecting', 'awaiting_office'].includes(em.status)) await reaskStoodDown(s, em)
  if (em.status === 'morning') {
    await s.from('emergencies').update({ controlled: false, updated_at: now }).eq('id', emId)
    // first, the contractors we stood down when it was made safe — they're still the right people (15 Nov 2026: they were
    // skipped as "already asked", so nobody on the emergency list heard it had got worse)
    let asked = await reaskStoodDown(s, em)
    if (!asked) asked = await dispatchWave(s, { ...em, status: 'morning' }, 1)
    if (!asked) asked = await dispatchWave(s, em, 2)
    if (!asked) asked = await dispatchWave(s, em, 3)
    await tellHouse(s, em, 'We’re on it', `Sorry it’s got worse. We’re contacting our emergency contractors now. Until they arrive: ${(KINDS[em.kind as EmergencyKind]?.steps ?? []).slice(0, 3).join(' ')}`)
  }
  return { ok: true }
}
