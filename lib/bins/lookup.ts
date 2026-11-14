// Bin days, looked up from the council (14 Nov 2026, Harry: "how do we make bin collection days automated reliably").
//
// How it stays reliable:
//   1. The source is the council's own schedule, read through WhenIsBins (whenisbins.com — a free UK service that
//      covers most councils and returns real dates by property: general waste, recycling, food, garden).
//   2. Each property is refreshed about once a month (the daily job does a few at a time) and the date it was checked
//      is kept and shown, so nobody trusts a stale day.
//   3. If a lookup fails, nothing is overwritten: the day the office typed in stays, and the error is kept to see.
//   4. Tenants close the loop: "the bins weren't collected" (were they out?) and "the day has changed" reach the office
//      (/api/tenant/bins), who check with the council — a missed week also triggers a fresh lookup.
// WhenIsBins asks businesses to request a free token first (hello@whenisbins.com) — set it on Vercel as
// WHENISBINS_API_TOKEN. Without it, lookups don't run and the typed-in day is used.
import type { SupabaseClient } from '@supabase/supabase-js'

const BASE = 'https://whenisbins.com/v1'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const binsReady = () => !!process.env.WHENISBINS_API_TOKEN

type Day = { date: string; collections: { name: string; waste_type?: string }[] }
const headers = () => ({ Authorization: `Bearer ${process.env.WHENISBINS_API_TOKEN}`, Accept: 'application/json', 'User-Agent': 'CapitalRoomsCROS/1.0' })

/** The door number from "Flat 4, 44 Claverton Street" → "44"; "75 Crownfield Road" → "75". */
export function houseNumber(name: string, address?: string | null): string | null {
  const text = `${name}, ${address ?? ''}`
  const m = text.replace(/flat\s*\w+\s*,?/i, '').match(/\b(\d+[a-z]?)\s+[a-z]/i)
  return m ? m[1] : null
}

function toSchedule(result: any): Day[] {
  const byDate = new Map<string, Day>()
  for (const c of (result?.collections ?? []) as any[]) for (const d of (c.dates ?? []) as string[]) {
    const day = byDate.get(d) ?? { date: d, collections: [] }
    day.collections.push({ name: c.name, waste_type: c.waste_type })
    byDate.set(d, day)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** The usual weekday, from the general-waste (else any) dates. */
export function usualDay(sched: Day[]): string | null {
  const pick = sched.filter(d => d.collections.some(c => /rubbish|general|refuse|residual|black/i.test(`${c.name} ${c.waste_type}`)))
  const dates = (pick.length ? pick : sched).map(d => new Date(d.date + 'T12:00:00Z').getUTCDay())
  if (!dates.length) return null
  const count = new Map<number, number>(); dates.forEach(d => count.set(d, (count.get(d) ?? 0) + 1))
  const [best, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0]
  return n / dates.length >= 0.6 ? DAYS[best] : null   // a clear usual day only
}

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(25_000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.detail || j?.problem || `HTTP ${r.status}`)
  return j
}

/** Look one property up (or re-read its known schedule) and save it. Never overwrites with nothing. */
export async function refreshBins(s: SupabaseClient, propertyId: string): Promise<{ ok: boolean; day?: string | null; next?: string | null; error?: string }> {
  const { data: p } = await s.from('properties').select('id, name, address, postcode, bin_collection_day, bin_property_token').eq('id', propertyId).maybeSingle() as { data: any }
  if (!p) return { ok: false, error: 'Property not found' }
  const fail = async (error: string) => { await s.from('properties').update({ bin_lookup_error: error.slice(0, 300), bin_checked_at: new Date().toISOString() }).eq('id', propertyId); return { ok: false, error } }
  if (!binsReady()) return { ok: false, error: 'Bin lookups aren’t switched on yet (WHENISBINS_API_TOKEN)' }
  try {
    let result: any = null, sourceUrl: string | null = null
    if (p.bin_property_token) {
      const sch = await getJson(`${BASE}/schedules/${encodeURIComponent(p.bin_property_token)}`).catch(() => null)
      if (sch) { result = sch.result ?? sch; sourceUrl = result?.source_url ?? null }
    }
    if (!result) {
      const pc = String(p.postcode ?? '').trim(), num = houseNumber(p.name, p.address)
      if (!pc) return fail('No postcode on the property')
      if (!num) return fail('Couldn’t tell the door number from the address')
      let lk = await getJson(`${BASE}/lookups`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${propertyId}-${new Date().toISOString().slice(0, 10)}` }, body: JSON.stringify({ postcode: pc, property: num }) })
      // some councils answer straight away, others take a little while
      for (let i = 0; i < 4 && !['done', 'failed', 'partial'].includes(lk.status); i++) lk = await getJson(`${BASE}/lookups/${lk.id}/wait`)
      if (lk.status === 'failed' || !lk.result) return fail(lk?.result?.error || 'The council lookup didn’t find this address')
      result = lk.result; sourceUrl = result.source_url ?? null
    }
    const sched = toSchedule(result)
    if (!sched.length) return fail('The council returned no dates')
    const day = usualDay(sched)
    await s.from('properties').update({
      bin_schedule: sched.slice(0, 40), bin_source: 'whenisbins', bin_source_url: sourceUrl, bin_checked_at: new Date().toISOString(), bin_lookup_error: null,
      bin_property_token: result.property_id ?? p.bin_property_token ?? null,
      ...(day ? { bin_collection_day: day } : {}),
    }).eq('id', propertyId)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    return { ok: true, day, next: sched.find(d => d.date >= today)?.date ?? null }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Lookup failed')
  }
}

/** The daily job: a handful of properties not checked for 4 weeks (or with a fresh "not collected" report). */
export async function refreshDue(s: SupabaseClient, limit = 6) {
  if (!binsReady()) return { skipped: 'no token' }
  const cutoff = new Date(Date.now() - 28 * 86400000).toISOString()
  const { data: reports } = await s.from('bin_reports').select('property_id').is('resolved_at', null).gte('created_at', new Date(Date.now() - 3 * 86400000).toISOString())
  const { data: stale } = await s.from('properties').select('id').eq('is_demo', false).or(`bin_checked_at.is.null,bin_checked_at.lt.${cutoff}`).not('postcode', 'is', null).limit(limit)
  const ids = [...new Set([...((reports ?? []) as any[]).map(r => r.property_id), ...((stale ?? []) as any[]).map(p => p.id)])].slice(0, limit)
  const out: Record<string, unknown> = {}
  for (const id of ids) out[id] = await refreshBins(s, id)
  return out
}
