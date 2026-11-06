// What an applicant asks us to provide or change (6 Nov 2026, Harry: "If they said I need a new £5,000 desk and we
// auto accept it, it is not good"). The filter:
//   · nothing asked for                       → they can reserve straight away
//   · items from our list (our standard ones) → fine without review only when the office has said so for that item
//                                               (Settings › Room requests — system_settings 'apply_requests_ok')
//   · anything in their own words             → always reviewed: we can't know what it costs
// An offer below the asking rent is reviewed too. A reviewed offer can't go on to pay the holding deposit until the
// office accepts it.
import type { SupabaseClient } from '@supabase/supabase-js'

export const REQUEST_ITEMS = [
  { key: 'desk', label: 'A desk' },
  { key: 'desk_chair', label: 'A desk chair' },
  { key: 'wardrobe', label: 'A wardrobe or clothes rail' },
  { key: 'drawers', label: 'A chest of drawers' },
  { key: 'bedside_table', label: 'A bedside table' },
  { key: 'mirror', label: 'A mirror' },
  { key: 'blinds', label: 'Curtains or blinds' },
  { key: 'mattress', label: 'A new mattress' },
  { key: 'bigger_bed', label: 'A bigger bed' },
] as const
export const REQUEST_LABEL: Record<string, string> = Object.fromEntries(REQUEST_ITEMS.map(i => [i.key, i.label]))
export const OK_SETTING = 'apply_requests_ok'

export interface Requests { items: string[]; other: string }

export async function requestsOk(s: SupabaseClient): Promise<string[]> {
  const { data } = await s.from('system_settings').select('value').eq('key', OK_SETTING).maybeSingle()
  try { const v = JSON.parse(String((data as any)?.value ?? '[]')); return Array.isArray(v) ? v.filter(k => REQUEST_LABEL[k]) : [] } catch { return [] }
}

/** Does this offer need the office to look at it before they can pay? And why, in plain words. */
export function reviewFor(r: Requests, ok: string[], belowAsking: boolean): { review: boolean; reasons: string[] } {
  const reasons: string[] = []
  const notOk = r.items.filter(k => REQUEST_LABEL[k] && !ok.includes(k))
  if (notOk.length) reasons.push(`asked for ${notOk.map(k => REQUEST_LABEL[k].replace(/^A /, 'a ')).join(', ')}`)
  if (r.other.trim()) reasons.push(`asked: “${r.other.trim().slice(0, 140)}${r.other.trim().length > 140 ? '…' : ''}”`)
  if (belowAsking) reasons.push('offered below the asking rent')
  return { review: reasons.length > 0, reasons }
}

/** The one line kept on the application (room_requirements) — what they asked for, items first. */
export const requestsLine = (r: Requests) => [...r.items.map(k => REQUEST_LABEL[k]).filter(Boolean), r.other.trim()].filter(Boolean).join('; ')
