// "Add from photos" (6 Nov 2026, Harry: upload a screenshot of the WiFi settings, or 20 photos of appliances, pick the
// house, approve, and it becomes the house information the tenants see). Server-only. The pictures themselves are never
// kept (Harry: "we don't really need to keep the photo … just get manufacturer and model") — only what's read from them.
//   readSnap(bytes)          — AI reads one photo: WiFi, an appliance's rating plate, a meter, the boiler, the fuse box…
//   suggestHouse(s, snap)    — which house it's probably for: a WiFi network already on file, or an address
//   purchaseMatches(s, …)    — expenses and statement lines at that house that could be when it was bought (its age)
//                              in the picture. Never decides — the office picks.
//   applySnaps(s, house, …)  — what the office approved: WiFi → the internet account / house information (one copy,
//                              lib/properties/services), appliances → property_appliances, everything else → house
//                              information items.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { syncHouseInfo } from '@/lib/properties/services'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const APPLIANCE_KINDS: Record<string, string> = {
  washing_machine: 'Washing machine', washer_dryer: 'Washer-dryer', tumble_dryer: 'Tumble dryer', dishwasher: 'Dishwasher',
  fridge_freezer: 'Fridge freezer', fridge: 'Fridge', freezer: 'Freezer', oven: 'Oven', hob: 'Hob', cooker: 'Cooker',
  extractor: 'Extractor hood', microwave: 'Microwave', boiler: 'Boiler', water_heater: 'Water heater', shower: 'Electric shower',
  heater: 'Heater', other: 'Appliance',
}
export const SNAP_KINDS = ['wifi', 'appliance', 'meter', 'fuse_box', 'stopcock', 'smoke_alarm', 'bins', 'other', 'unreadable'] as const
export type SnapKind = typeof SNAP_KINDS[number]

export interface Snap {
  kind: SnapKind
  title: string                      // "WiFi — CommunityFibre10Gb_B2B9C", "Bosch dishwasher SMS2ITW08G"
  wifi?: { network: string | null; password: string | null; provider: string | null }
  appliance?: { kind: string; brand: string | null; model: string | null }
  meter?: { fuel: 'electricity' | 'gas' | 'water' | 'other'; serial: string | null; reading: string | null; mpan_mprn: string | null }
  info?: { label: string; value: string }   // fuse box, stopcock, smoke alarm, bins, other: a house-information line
  address: string | null             // any address visible in the picture
  confidence: 'high' | 'medium' | 'low'
}

const PROMPT = `You are helping a London letting agent record what's in a rented house from a photo or screenshot.
Look at the image and return ONLY JSON (no markdown) in this shape:
{
 "kind": "wifi" | "appliance" | "meter" | "fuse_box" | "stopcock" | "smoke_alarm" | "bins" | "other" | "unreadable",
 "title": short plain title, e.g. "WiFi — <network name>" or "<Brand> <type> <model>",
 "wifi": { "network": string|null, "password": string|null, "provider": string|null },          // only for wifi (phone WiFi settings screenshots, router stickers)
 "appliance": { "kind": one of washing_machine|washer_dryer|tumble_dryer|dishwasher|fridge_freezer|fridge|freezer|oven|hob|cooker|extractor|microwave|boiler|water_heater|shower|heater|other,
                "brand": the manufacturer or null, "model": the model number or null },   // rating plates, model stickers, the front of an appliance
 "meter": { "fuel": "electricity"|"gas"|"water"|"other", "serial": string|null, "reading": string|null, "mpan_mprn": string|null },
 "info": { "label": short label e.g. "Fuse box", "Stopcock", "Smoke alarms", "Bin day", "value": one or two plain sentences a tenant would find useful },
 "address": any postal address visible in the image, else null,
 "confidence": "high" | "medium" | "low"
}
Rules: copy model numbers and passwords EXACTLY as printed (case, symbols). Never guess a value you can't read — use null.
For a provider's router sticker the provider is the brand on it. A model number is the "Model"/"Type"/"E-Nr"/"Mod." value, not the serial.
Leave out the objects that don't apply.`

export async function readSnap(bytes: Buffer, mime: string): Promise<Snap> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI reading isn’t set up (ANTHROPIC_API_KEY)')
  const r = await anthropic.messages.create({
    model: AI_MODEL_SMART, max_tokens: 900,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: (/png/.test(mime) ? 'image/png' : /webp/.test(mime) ? 'image/webp' : 'image/jpeg') as any, data: bytes.toString('base64') } },
      { type: 'text', text: PROMPT },
    ] }],
  })
  const text = r.content.map(c => (c as any).text ?? '').join('').trim().replace(/^```(?:json)?|```$/g, '')
  let j: any
  try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { return { kind: 'unreadable', title: 'Couldn’t read this one', address: null, confidence: 'low' } }
  const kind: SnapKind = (SNAP_KINDS as readonly string[]).includes(j.kind) ? j.kind : 'other'
  const str = (v: any) => (v == null || v === '' ? null : String(v).trim().slice(0, 200))
  return {
    kind, title: String(j.title ?? '').slice(0, 120) || 'Photo',
    ...(kind === 'wifi' ? { wifi: { network: str(j.wifi?.network), password: str(j.wifi?.password), provider: str(j.wifi?.provider) } } : {}),
    ...(kind === 'appliance' ? { appliance: { kind: APPLIANCE_KINDS[j.appliance?.kind] ? j.appliance.kind : 'other', brand: str(j.appliance?.brand), model: str(j.appliance?.model) } } : {}),
    ...(kind === 'meter' ? { meter: { fuel: ['electricity', 'gas', 'water'].includes(j.meter?.fuel) ? j.meter.fuel : 'other', serial: str(j.meter?.serial), reading: str(j.meter?.reading), mpan_mprn: str(j.meter?.mpan_mprn) } } : {}),
    ...(['fuse_box', 'stopcock', 'smoke_alarm', 'bins', 'other'].includes(kind) && j.info ? { info: { label: String(j.info.label ?? '').slice(0, 60) || 'Note', value: String(j.info.value ?? '').slice(0, 400) } } : {}),
    address: str(j.address), confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium',
  }
}

/** Which house a photo is probably for — a hint for the office, never a decision. */
export async function suggestHouse(s: SupabaseClient, snap: Snap): Promise<{ propertyId: string; why: string } | null> {
  const { data: props } = await s.from('properties').select('id, name, address, postcode, house_info, is_demo') as { data: any[] | null }
  const live = (props ?? []).filter(p => !p.is_demo)
  if (snap.wifi?.network) {
    const net = snap.wifi.network.toLowerCase()
    const hit = live.find(p => JSON.stringify(p.house_info ?? {}).toLowerCase().includes(net))
    if (hit) return { propertyId: hit.id, why: 'That WiFi network is already in its house information' }
    const { data: svc } = await s.from('property_services').select('property_id').ilike('wifi_network', snap.wifi.network).limit(1)
    if (svc?.[0]) return { propertyId: (svc[0] as any).property_id, why: 'That WiFi network is on its internet account' }
  }
  if (snap.address) {
    const pc = snap.address.toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0]?.replace(/\s+/g, '')
    const hit = live.find(p => pc && String(p.postcode ?? '').toUpperCase().replace(/\s+/g, '') === pc)
      ?? live.find(p => { const first = String(p.address ?? p.name ?? '').split(/[\n,]/)[0].toLowerCase().trim(); return first.length > 5 && snap.address!.toLowerCase().includes(first) })
    if (hit) return { propertyId: hit.id, why: 'The address in the picture matches it' }
  }
  return null
}

// words that name each kind in an expense ("New Bosch washing machine — Currys") — and words that say it was a repair, not a purchase
const KIND_WORDS: Record<string, RegExp> = {
  washing_machine: /washing\s*machine|washer(?!\s*-?\s*dryer)/i, washer_dryer: /washer\s*-?\s*dryer/i, tumble_dryer: /tumble|dryer/i, dishwasher: /dish\s*washer/i,
  fridge_freezer: /fridge|freezer/i, fridge: /fridge/i, freezer: /freezer/i, oven: /oven|cooker/i, hob: /\bhob\b/i, cooker: /cooker|oven/i,
  extractor: /extractor|cooker\s*hood/i, microwave: /microwave/i, boiler: /boiler/i, water_heater: /water\s*heater|immersion/i, shower: /shower/i, heater: /heater|radiator/i,
}
const BOUGHT = /\bnew\b|replace|purchase|bought|supply|supplied|install|delivery|currys|ao\.com|argos|john lewis|amazon/i
const REPAIR = /repair|service|fix|call[- ]?out|engineer|\bparts?\b|clean/i

export interface PurchaseMatch { source: 'expense' | 'statement'; id: string; date: string; amount: number; description: string; score: number }

/** Expenses and imported statement lines at this house that could be when this appliance was bought — best first. */
export async function purchaseMatches(s: SupabaseClient, propertyId: string, ap: { kind: string; brand: string | null; model: string | null }): Promise<PurchaseMatch[]> {
  const word = KIND_WORDS[ap.kind]
  if (!word) return []
  const [{ data: ex }, { data: st }] = await Promise.all([
    s.from('recharge_expenses').select('id, description, supplier, notes, amount, expense_date').eq('property_id', propertyId).is('voided_at', null),
    s.from('statement_line_items').select('id, description, amount, statement_date').eq('property_id', propertyId),
  ])
  const score = (text: string) => {
    if (!word.test(text)) return -1
    let n = 1
    if (ap.brand && text.toLowerCase().includes(ap.brand.toLowerCase())) n += 3
    if (ap.model && text.toLowerCase().replace(/\s/g, '').includes(ap.model.toLowerCase().replace(/\s/g, ''))) n += 4
    if (BOUGHT.test(text)) n += 2
    if (REPAIR.test(text) && !BOUGHT.test(text)) n -= 2
    return n
  }
  const out: PurchaseMatch[] = [
    ...((ex ?? []) as any[]).map(e => ({ source: 'expense' as const, id: e.id, date: e.expense_date, amount: Math.abs(Number(e.amount)), description: [e.description, e.supplier].filter(Boolean).join(' — '), score: score(`${e.description} ${e.supplier ?? ''} ${e.notes ?? ''}`) })),
    ...((st ?? []) as any[]).map(l => ({ source: 'statement' as const, id: l.id, date: l.statement_date, amount: Math.abs(Number(l.amount)), description: String(l.description ?? ''), score: score(String(l.description ?? '')) })),
  ].filter(m => m.score > 0 && m.date)
  // a purchase costs something — small lines are parts or call-outs
  return out.filter(m => m.amount >= 60).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 4)
}

export interface Approved { snap: Snap; location?: string | null; roomId?: string | null; visible: boolean; bought?: { source: 'expense' | 'statement'; id: string; date: string; note: string } | null }

/** Write what the office approved into the house. Returns a line per item saying where it went. */
export async function applySnaps(s: SupabaseClient, propertyId: string, approved: Approved[], byEmail: string | null): Promise<string[]> {
  const done: string[] = []
  const { data: prop } = await s.from('properties').select('house_info').eq('id', propertyId).maybeSingle() as { data: any }
  let items: any[] = [...((prop?.house_info?.items ?? []) as any[])]
  let infoChanged = false
  const setItem = (icon: string, label: string, value: string, sensitive = false) => {
    const i = items.findIndex(x => String(x.label).toLowerCase() === label.toLowerCase())
    const item = { icon, label, value, sensitive }
    if (i >= 0) items[i] = { ...items[i], ...item }; else items.push(item)
    infoChanged = true
  }
  for (const a of approved) {
    const sn = a.snap
    if (sn.kind === 'wifi' && sn.wifi && (sn.wifi.network || sn.wifi.password)) {
      // one copy: an internet account on Bills & services owns the WiFi details when there is one
      const { data: svc } = await s.from('property_services').select('id').eq('property_id', propertyId).eq('kind', 'internet').is('ended_at', null).limit(1)
      if (svc?.[0]) {
        await s.from('property_services').update({ ...(sn.wifi.network ? { wifi_network: sn.wifi.network } : {}), ...(sn.wifi.password ? { wifi_password: sn.wifi.password } : {}), updated_at: new Date().toISOString() }).eq('id', (svc[0] as any).id)
        if (infoChanged) { await s.from('properties').update({ house_info: { ...(prop?.house_info ?? {}), items } }).eq('id', propertyId); infoChanged = false }
        await syncHouseInfo(s, propertyId)
        const { data: fresh } = await s.from('properties').select('house_info').eq('id', propertyId).maybeSingle() as { data: any }
        items = [...((fresh?.house_info?.items ?? []) as any[])]
        done.push('WiFi — updated on the internet account and the house information')
      } else {
        items = items.filter(x => !/wi-?fi|internet|broadband/i.test(String(x.label)))
        items.unshift({ icon: '📶', label: 'WiFi', value: [sn.wifi.network && `Network: ${sn.wifi.network}`, sn.wifi.password && `Password: ${sn.wifi.password}`, sn.wifi.provider && `Provider: ${sn.wifi.provider}`].filter(Boolean).join('\n'), sensitive: !a.visible })
        infoChanged = true
        done.push('WiFi — house information')
      }
    } else if (sn.kind === 'appliance' && sn.appliance) {
      const ap = sn.appliance
      const { error } = await s.from('property_appliances').insert({
        property_id: propertyId, room_id: a.roomId ?? null, kind: ap.kind, brand: ap.brand, model: ap.model,
        location: a.location ?? null, visible_to_tenants: a.visible, added_by: byEmail,
        ...(a.bought ? { bought_on: a.bought.date, bought_note: a.bought.note.slice(0, 200), ...(a.bought.source === 'expense' ? { expense_id: a.bought.id } : { statement_line_id: a.bought.id }) } : {}),
      })
      if (error) throw new Error(/property_appliances/.test(error.message) ? 'Appliances need migration 268 running in Supabase first' : error.message)
      done.push(`${[ap.brand, APPLIANCE_KINDS[ap.kind] ?? 'Appliance', ap.model].filter(Boolean).join(' ')} — appliances`)
    } else if (sn.kind === 'meter' && sn.meter) {
      const m = sn.meter
      const label = m.fuel === 'electricity' ? 'Electricity meter' : m.fuel === 'gas' ? 'Gas meter' : m.fuel === 'water' ? 'Water meter' : 'Meter'
      setItem(m.fuel === 'gas' ? '🔥' : m.fuel === 'water' ? '💧' : '⚡', label, [a.location && `Where: ${a.location}`, m.serial && `Serial: ${m.serial}`, m.mpan_mprn && `${m.fuel === 'gas' ? 'MPRN' : 'MPAN'}: ${m.mpan_mprn}`, m.reading && `Reading ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}: ${m.reading}`].filter(Boolean).join('\n'), !a.visible)
      done.push(`${label} — house information`)
    } else if (sn.info) {
      const icon = sn.kind === 'fuse_box' ? '🔌' : sn.kind === 'stopcock' ? '🚰' : sn.kind === 'smoke_alarm' ? '🚨' : sn.kind === 'bins' ? '🗑️' : 'ℹ️'
      setItem(icon, sn.info.label, [sn.info.value, a.location && `Where: ${a.location}`].filter(Boolean).join('\n'), !a.visible)
      done.push(`${sn.info.label} — house information`)
    }
  }
  if (infoChanged) await s.from('properties').update({ house_info: { ...(prop?.house_info ?? {}), items } }).eq('id', propertyId)
  return done
}

export const applianceName = (a: { brand?: string | null; kind: string; model?: string | null }) => [a.brand, (APPLIANCE_KINDS[a.kind] ?? 'appliance').toLowerCase(), a.model].filter(Boolean).join(' ')
