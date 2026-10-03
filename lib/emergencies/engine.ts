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

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { KINDS, type EmergencyKind } from './guide'

type S = SupabaseClient
export const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const OFFICE_ROLES = ['administrator', 'admin']
const OPEN = ['collecting', 'awaiting_office', 'assigned', 'on_site', 'needs_return', 'office_handling', 'morning', 'call_999']

// ── small helpers ────────────────────────────────────────────────────────────

export const ukTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(/\s/g, '').replace(':00', '')
export const ukDay = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
const ukWhen = (d: string | Date) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const that = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  return that === today ? ukTime(d) : `${ukTime(d)} ${ukDay(d)}`
}
const londonHour = () => Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }))
const gbp = (n: number | null | undefined) => n == null ? 'fee not given' : `£${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`
const pname = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || 'Contractor') : 'Contractor'
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const token = () => crypto.randomBytes(18).toString('base64url')
const link = (t: string) => `${SITE}/e/${t}`

export interface Settings { auto: boolean; windowMin: number; costLimit: number; overLimit: 'wait' | 'send_after_15'; followupMin: number; tenantUpdates: boolean }
export async function settings(s: S): Promise<Settings> {
  const { data } = await s.from('system_settings').select('key, value').like('key', 'emergency_%')
  const m = new Map(((data ?? []) as any[]).map(r => [r.key, String(r.value)]))
  return {
    auto: (m.get('emergency_auto') ?? 'true') === 'true',
    windowMin: Math.max(2, Number(m.get('emergency_window_min') ?? 10) || 10),
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
    .select('*, properties(id, name, address, postcode, key_safe_code), rooms(name), people!reporter_id(id, first_name, last_name, full_name, phone)')
    .eq('id', id).maybeSingle() as { data: any }
  return data
}
const addressOf = (em: any) => {
  const name = firstLine(em.properties?.name)
  const addr = String(em.properties?.address ?? '').split(/\n|,\s*/).map(x => x.trim()).filter(x => x && x.toLowerCase() !== name.toLowerCase())
  const pc = String(em.properties?.postcode ?? '').replace(/\s+/g, '').toUpperCase()
  const hasPc = !!pc && addr.some(x => x.replace(/\s+/g, '').toUpperCase().includes(pc))
  return [em.rooms?.name, name, ...addr, hasPc ? '' : em.properties?.postcode].filter(Boolean).join(', ')
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
  const { data } = await s.from('tenancies').select('person_id').eq('property_id', em.property_id).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  return [...new Set([em.reporter_id, ...((data ?? []) as any[]).map(t => t.person_id)].filter(Boolean))]
}
/** Tell the house what's happening (push + in-app). Respects the emergency_tenant_updates setting. */
async function tellHouse(s: S, em: any, title: string, body: string) {
  const set = await settings(s)
  if (!set.tenantUpdates) { await log(s, em.id, 'tenants', `Not sent to the house (tenant updates are off): “${body}”`); return }
  const ids = await household(s, em)
  if (!ids.length) return
  await insertNotifications(s, ids, { title, body, type: 'maintenance', link: '/tenant' }, { propertyId: em.property_id, roomId: em.room_id })
  await sendServerPush({ personIds: ids, title, body, url: '/tenant', tag: `emergency-${em.id}` })
  await log(s, em.id, 'tenants', `Told the house: “${body}”`)
}

// ── start ────────────────────────────────────────────────────────────────────

export async function startEmergency(s: S, opts: { ticketId: string; kind?: EmergencyKind; controlled?: boolean; reporterId?: string | null }) {
  const { data: t } = await s.from('maintenance_tickets').select('id, title, description, category, property_id, room_id, reporter_id').eq('id', opts.ticketId).maybeSingle() as { data: any }
  if (!t) return { error: 'Job not found' }
  const { data: existing } = await s.from('emergencies').select('id').eq('ticket_id', t.id).maybeSingle()
  if (existing) return { id: existing.id }
  const kind: EmergencyKind = opts.kind && KINDS[opts.kind] ? opts.kind : 'other'
  const info = KINDS[kind]
  // the reporter is a people.id; tickets store auth ids for older rows, so prefer what the caller resolved
  const reporterId = opts.reporterId ?? null
  const status = !info.trade ? 'call_999' : opts.controlled ? 'morning' : 'collecting'
  const { data: em, error } = await s.from('emergencies').insert({
    ticket_id: t.id, property_id: t.property_id, room_id: t.room_id, reporter_id: reporterId,
    kind, trade: info.trade ?? 'general', title: t.title || info.label, details: t.description, controlled: !!opts.controlled, status,
  }).select('id').single()
  if (error) return { error: error.message }
  await s.from('maintenance_tickets').update({ priority: 'emergency', updated_at: new Date().toISOString() }).eq('id', t.id)
  const full = await load(s, em.id)
  await log(s, em.id, 'reported', `Reported by the tenant: ${info.label}${opts.controlled ? ' — they say it’s under control until morning' : ''}`, 'Tenant')

  if (status === 'call_999') {
    await alertOffice(s, full, `🚨 ${info.label} at ${firstLine(full.properties?.name)}`, `The tenant has been told: ${info.callServices} No contractor sent — check in with them.`, true)
    return { id: em.id, status }
  }
  if (status === 'morning') {
    await alertOffice(s, full, `⚠️ ${info.label} (contained) at ${firstLine(full.properties?.name)}`, 'The tenant says it’s under control until morning — book someone first thing.')
    await tellHouse(s, full, 'We’ve got your report', 'Thanks for making it safe. We’ll arrange someone first thing in the morning — tell us straight away if it gets worse.')
    return { id: em.id, status }
  }
  const asked = await dispatchWave(s, full, 1)
  if (!asked) await dispatchWave(s, full, 2)
  await tellHouse(s, full, 'We’re on it', `We’re sorry you’re dealing with this. We’re contacting our emergency contractors now and will let you know who is coming and when.`)
  await alertOffice(s, full, `🚨 Emergency: ${info.label} at ${firstLine(full.properties?.name)}`, 'Contractors are being texted. CROS will confirm the soonest in a few minutes — open it to watch or step in.')
  return { id: em.id, status }
}

// ── dispatch ─────────────────────────────────────────────────────────────────

const inHours = (from: number, to: number, h: number) => (from <= to ? h >= from && h < to : h >= from || h < to)

/** Text a wave of contractors. Wave 1: the trade, in their hours. Wave 2: backups, out-of-hours and general. Returns how many were asked. */
export async function dispatchWave(s: S, em: any, wave: number): Promise<number> {
  const set = await settings(s)
  const { data: list } = await s.from('emergency_contractors').select('*, people!person_id(id, first_name, last_name, full_name, company, phone, role)').eq('active', true) as { data: any[] | null }
  const { data: askedRows } = await s.from('emergency_responses').select('contractor_id').eq('emergency_id', em.id)
  const asked = new Set(((askedRows ?? []) as any[]).map(r => r.contractor_id))
  const h = londonHour()
  const pick = ((list ?? []) as any[]).filter(c => !asked.has(c.person_id) && c.people).filter(c => {
    const trade = (c.trades ?? []).includes(em.trade)
    if (wave === 1) return trade && !c.backup_only && inHours(c.hours_from, c.hours_to, h)
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
    const sms = await sendSms(c.people.phone, body)
    await sendServerPush({ personId: c.person_id, title: '🚨 Emergency — can you attend?', body: `${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)}`, url: `/e/${t}`, tag: `emergency-${em.id}` })
    await s.from('emergency_responses').update({ texted: sms.ok }).eq('token', t)
    names.push(`${pname(c.people)}${sms.ok ? '' : ` (text failed: ${sms.error})`}`)
  }
  await log(s, em.id, 'dispatch', `Wave ${wave}: asked ${names.join(', ')} — answers close at ${ukTime(windowEnds)}`)
  return names.length
}

// ── choosing ─────────────────────────────────────────────────────────────────

const soonest = (rs: any[]) => [...rs].sort((a, b) => String(a.eta_at).localeCompare(String(b.eta_at)) || (a.rank ?? 5) - (b.rank ?? 5) || (Number(a.call_out_fee ?? 0) - Number(b.call_out_fee ?? 0)))

async function yesAnswers(s: S, emId: string) {
  const { data } = await s.from('emergency_responses').select('*, people!contractor_id(id, first_name, last_name, full_name, company, phone)')
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
    await alertOffice(s, em, `🚨 Choose a contractor — ${firstLine(em.properties?.name)}`, `${yes.length} can attend. Open it to pick one.`, true)
    return
  }
  if (within.length) return choose(s, emId, soonest(within)[0].id, 'CROS', `${reason}: the soonest within the £${set.costLimit} limit`)
  if (yes.length) {
    const best = soonest(yes)[0]
    const moved = await s.from('emergencies').update({ status: 'awaiting_office', updated_at: new Date().toISOString() }).eq('id', emId).eq('status', 'collecting').select('id')
    if (!moved.data?.length) return
    await log(s, emId, 'waiting', `${reason}: the soonest is ${pname(best.people)} by ${ukWhen(best.eta_at)} for ${gbp(best.call_out_fee)} — over the £${set.costLimit} limit, so the office is asked${set.overLimit === 'send_after_15' ? ' (goes ahead in 15 minutes if no one answers)' : ''}`)
    await alertOffice(s, em, `💷 Approve call-out — ${firstLine(em.properties?.name)}`, `${pname(best.people)} can come by ${ukWhen(best.eta_at)} for ${gbp(best.call_out_fee)} (over your £${set.costLimit} limit).${set.overLimit === 'send_after_15' ? ' Going ahead in 15 minutes unless you change it.' : ''}`, true)
    return
  }
  // no one can come yet
  if (em.wave < 2) {
    const n = await dispatchWave(s, em, 2)
    if (n) {
      await log(s, emId, 'waiting', `${reason}: no one could come — asked the backups and general contractors too`)
      await alertOffice(s, em, `⏳ No contractor yet — ${firstLine(em.properties?.name)}`, 'No one on the list could come. CROS has asked the backups; you may want to call round.', true)
      return
    }
  }
  const moved = await s.from('emergencies').update({ status: 'awaiting_office', updated_at: new Date().toISOString() }).eq('id', emId).eq('status', 'collecting').select('id')
  if (!moved.data?.length) return
  await log(s, emId, 'waiting', `${reason}: no contractor available — handed to the office`)
  await alertOffice(s, em, `🆘 No contractor available — ${firstLine(em.properties?.name)}`, 'Nobody on the emergency list can come. Please call round; the tenant has the overnight steps.', true)
  const steps = KINDS[em.kind as EmergencyKind]?.steps ?? []
  await tellHouse(s, em, 'Still arranging someone', `We’re still trying to get someone to you and haven’t forgotten. Until then: ${steps.slice(0, 3).join(' ')}`)
}

/** Confirm one contractor: they get the full address and access; everyone else is stood down; the job and the house are updated. */
export async function choose(s: S, emId: string, responseId: string, by: string, why: string) {
  const set = await settings(s)
  const allowed = by === 'CROS' ? ['collecting', 'awaiting_office'] : OPEN
  const { data: r } = await s.from('emergency_responses').select('*, people!contractor_id(id, first_name, last_name, full_name, company, phone)').eq('id', responseId).eq('emergency_id', emId).maybeSingle() as { data: any }
  if (!r || !r.eta_at) return { error: 'That contractor hasn’t said when they can come' }
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
    const { data: prev } = await s.from('emergency_responses').select('id, token, people!contractor_id(phone)').eq('id', before.chosen_response_id).maybeSingle() as { data: any }
    if (prev) {
      await s.from('emergency_responses').update({ stood_down_at: new Date().toISOString() }).eq('id', prev.id)
      await sendSms(prev.people?.phone, `CAPITAL ROOMS: change of plan — the emergency near ${areaOf(em)} is now covered by someone else. Please don't attend. Thank you.`)
    }
  }
  // the chosen contractor: full details
  const tenant = em.people
  const lines = [
    `CAPITAL ROOMS — CONFIRMED. Please attend: ${KINDS[em.kind as EmergencyKind]?.label ?? em.title}`,
    `Where: ${addressOf(em)}`,
    `Expected by ${ukWhen(r.eta_at)}`,
    tenant ? `Tenant: ${pname(tenant)}${tenant.phone ? ` ${tenant.phone}` : ''}` : '',
    em.properties?.key_safe_code ? `Front door key safe: ${em.properties.key_safe_code}` : '',
    `Details & updates: ${link(r.token)}`,
  ].filter(Boolean)
  const sms = await sendSms(r.people?.phone, lines.join('\n'))
  await sendServerPush({ personId: r.contractor_id, title: '✅ Emergency confirmed', body: `${addressOf(em)} — by ${ukWhen(r.eta_at)}`, url: `/e/${r.token}`, tag: `emergency-${emId}` })
  // everyone else asked: thanks, it's covered
  const { data: others } = await s.from('emergency_responses').select('id, answer, people!contractor_id(phone)').eq('emergency_id', emId).neq('id', r.id).is('stood_down_at', null) as { data: any[] | null }
  for (const o of others ?? []) {
    await s.from('emergency_responses').update({ stood_down_at: new Date().toISOString() }).eq('id', o.id)
    if (o.answer !== 'no') await sendSms(o.people?.phone, `CAPITAL ROOMS: thanks — the emergency near ${areaOf(em)} is now covered. No need to attend.`)
  }
  // the job
  if (em.ticket_id) {
    const day = new Date(r.eta_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    const { data: tk } = await s.from('maintenance_tickets').select('admin_note').eq('id', em.ticket_id).maybeSingle() as { data: any }
    await s.from('maintenance_tickets').update({
      contractor_id: r.contractor_id, status: 'assigned', booked_date: day, booked_slot: null, priority: 'emergency',
      approved_at: new Date().toISOString(),
      admin_note: [tk?.admin_note, `[${ukDay(new Date())}] Emergency: ${pname(r.people)} confirmed by ${by}, due ${ukWhen(r.eta_at)}, call-out ${gbp(r.call_out_fee)}`].filter(Boolean).join('\n'),
      updated_at: new Date().toISOString(),
    }).eq('id', em.ticket_id)
  }
  await log(s, emId, 'confirmed', `${pname(r.people)} confirmed — due by ${ukWhen(r.eta_at)}, call-out ${gbp(r.call_out_fee)}. ${why}${sms.ok ? '' : ` (text to them failed: ${sms.error} — call them)`}`, by)
  await tellHouse(s, em, 'Help is on the way', `A contractor is on the way and expected around ${ukWhen(r.eta_at)}. We’re sorry for the trouble — we’ll keep you posted.`)
  await alertOffice(s, em, `✅ Emergency covered — ${firstLine(em.properties?.name)}`, `${pname(r.people)} due by ${ukWhen(r.eta_at)} for ${gbp(r.call_out_fee)}. CROS will check in at ${ukWhen(followup)}.`)
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
  const { data: who } = await s.from('people').select('first_name, last_name, full_name, company').eq('id', r.contractor_id).maybeSingle()
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
      await alertOffice(s, em, `📩 New answer — ${firstLine(em.properties?.name)}`, `${pname(who)} can come by ${ukWhen(a.etaAt!)} for ${gbp(a.fee)}.`)
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
  const { data: who } = await s.from('people').select('first_name, last_name, full_name, company').eq('id', r.contractor_id).maybeSingle()
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
    await tellHouse(s, em, 'A little later than planned', `The contractor is running late and now expects to be with you around ${ukWhen(a.newEta)}. Sorry for the wait.`)
    return { ok: true }
  }
  if (a.outcome === 'cant_attend') {
    await s.from('emergency_responses').update({ outcome: 'cant_attend', outcome_note: note, stood_down_at: now, reported_at: now }).eq('id', r.id)
    const wave = (em.wave ?? 1) + 1
    await s.from('emergencies').update({ status: 'collecting', chosen_response_id: null, wave, window_ends_at: new Date(Date.now() + set.windowMin * 60000).toISOString(), updated_at: now }).eq('id', em.id)
    await log(s, em.id, 'dropped', `${name} can no longer attend${note ? ` — “${note}”` : ''}. Finding someone else.`, name)
    // ask again everyone who said yes before — they were stood down when this contractor was confirmed
    const { data: before } = await s.from('emergency_responses').select('id, token, contractor_id, people!contractor_id(phone, first_name, last_name, full_name, company)')
      .eq('emergency_id', em.id).eq('answer', 'yes').neq('id', r.id).is('outcome', null) as { data: any[] | null }
    const reasked: string[] = []
    for (const o of before ?? []) {
      await s.from('emergency_responses').update({ answer: null, answered_at: null, eta_at: null, call_out_fee: null, stood_down_at: null, wave }).eq('id', o.id)
      const sms = await sendSms(o.people?.phone, `CAPITAL ROOMS EMERGENCY: the contractor booked for ${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)} can't make it now. Can you still come? Tap to answer: ${link(o.token)}`)
      await sendServerPush({ personId: o.contractor_id, title: '🚨 Can you still come?', body: `${KINDS[em.kind as EmergencyKind]?.label ?? em.title} near ${areaOf(em)}`, url: `/e/${o.token}`, tag: `emergency-${em.id}` })
      reasked.push(`${pname(o.people)}${sms.ok ? '' : ` (text failed: ${sms.error})`}`)
    }
    if (reasked.length) await log(s, em.id, 'dispatch', `Asked again: ${reasked.join(', ')} (they said yes earlier)`)
    const fresh = await dispatchWave(s, await load(s, em.id), wave)
    await alertOffice(s, em, `⚠️ Contractor dropped out — ${firstLine(em.properties?.name)}`, `${name} can’t make it. CROS has asked ${reasked.length + fresh ? `${reasked.length + fresh} contractor${reasked.length + fresh === 1 ? '' : 's'} again` : 'no one — there’s no one else on the list'}; it confirms the soonest in ${set.windowMin} minutes.`, true)
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
    await alertOffice(s, em, `✅ Emergency fixed — ${firstLine(em.properties?.name)}`, `${name} has fixed it.${note ? ` ${note}` : ''}`)
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
  await alertOffice(s, em, `🔧 Needs a return visit — ${firstLine(em.properties?.name)}`, `${name}: ${a.part ? `needs ${a.part}. ` : ''}${a.fixCost != null ? `Proper fix ${gbp(a.fixCost)}. ` : ''}${back ? `Back ${back}.` : 'No return date yet.'}`, a.fixCost != null)
  return { ok: true }
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
    const { data: r } = await s.from('emergency_responses').select('token, contractor_id, people!contractor_id(phone, first_name, last_name, full_name)').eq('id', e.chosen_response_id).maybeSingle() as { data: any }
    if (!r) continue
    const sms = await sendSms(r.people?.phone, `CAPITAL ROOMS: how's it going at ${addressOf(em)}? Are you there, is it done — and if not, what's needed and when can you come back? Tap to tell us (1 minute): ${link(r.token)}`)
    await sendServerPush({ personId: r.contractor_id, title: 'How did it go?', body: `${addressOf(em)} — tap to update`, url: `/e/${r.token}`, tag: `emergency-${e.id}` })
    await log(s, e.id, 'check_in', `Asked ${pname(r.people)} for an update${sms.ok ? '' : ` (text failed: ${sms.error})`}`)
    done.push(`checked in ${e.id}`)
  }

  // 4. no reply to the check-in after 30 minutes → remind once and tell the office
  const quiet = new Date(now.getTime() - 30 * 60000).toISOString()
  const { data: silent } = await s.from('emergencies').select('id, chosen_response_id').in('status', ['assigned', 'on_site']).lte('followup_sent_at', quiet).is('followup_reminded_at', null)
  for (const e of (silent ?? []) as any[]) {
    const { data: claimed } = await s.from('emergencies').update({ followup_reminded_at: iso }).eq('id', e.id).is('followup_reminded_at', null).select('id')
    if (!claimed?.length) continue
    const em = await load(s, e.id)
    const { data: r } = await s.from('emergency_responses').select('token, people!contractor_id(phone, first_name, last_name, full_name)').eq('id', e.chosen_response_id).maybeSingle() as { data: any }
    if (r) await sendSms(r.people?.phone, `CAPITAL ROOMS: quick reminder — please tell us how the emergency went: ${link(r.token)}`)
    await log(s, e.id, 'check_in', `No update from ${pname(r?.people)} yet — reminded them and told the office`)
    await alertOffice(s, em, `⏰ No update from the contractor — ${firstLine(em.properties?.name)}`, `${pname(r?.people)} hasn’t said how it went. Worth a call.`, true)
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
      const { data: live } = await s.from('emergency_responses').select('id, people!contractor_id(phone)').eq('emergency_id', emId).is('stood_down_at', null) as { data: any[] | null }
      for (const o of live ?? []) {
        await s.from('emergency_responses').update({ stood_down_at: now }).eq('id', o.id)
        await sendSms(o.people?.phone, `CAPITAL ROOMS: the emergency near ${areaOf(em)} has been cancelled — no need to attend. Thank you.`)
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
