// A care guide for one appliance, researched on the web for its exact make and model (6 Nov 2026 — migration 269).
// The AI searches the manufacturer's own pages and manuals (never "how to fix any washing machine" filler), then writes
// a short, plain guide: the everyday things a tenant can safely do (batteries, filters, resets, what the error codes
// mean) and when to stop and report it. Saved as "ready" for the office to check; tenants and the fault-reporting AI
// only see it once it's approved. Server-only; runs in the background after the appliance is added.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { APPLIANCE_KINDS } from '@/lib/house/snap'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-5-5'

export interface CareGuide {
  found: boolean
  product: string                                   // the exact product it found, as the manufacturer names it
  summary: string
  sections: { title: string; steps: string[] }[]    // "Changing the batteries", "Cleaning the filter", "Resetting it"
  errorCodes: { code: string; meaning: string; whatToDo: string }[]
  reportIf: string[]                                // when a tenant should stop and report it
  manualUrl: string | null
  sources: { title: string; url: string }[]
}

const PROMPT = (what: string) => `You are writing a short care guide for tenants of a London rented house about one appliance: ${what}.

Use web search to find the MANUFACTURER'S OWN information for this exact make and model — the user manual or support pages (or a reputable manual archive hosting the official manual). Ignore generic "how to fix any …" articles and content farms. If you can't find this exact model, look for its model family; if you still can't, say so (found: false) rather than guessing.

Then write, in plain British English for a tenant (not an engineer):
- only things a tenant can safely do themselves: batteries, filters, resets, settings, cleaning, what lights or error codes mean;
- never anything involving gas, opening casings, wiring, or water/electrics together — those go in "reportIf";
- short numbered steps, no more than 6 per section, at most 5 sections.

Reply with ONLY this JSON (no markdown):
{"found": true|false, "product": "the exact product name as the manufacturer gives it",
 "summary": "one or two sentences: what it is and the one thing most worth knowing",
 "sections": [{"title": "e.g. Changing the batteries", "steps": ["…"]}],
 "errorCodes": [{"code": "E3", "meaning": "…", "whatToDo": "…"}],
 "reportIf": ["situations where they should stop and report it to us"],
 "manualUrl": "the official manual or support page URL, or null",
 "sources": [{"title": "…", "url": "…"}]}`

export async function researchGuide(a: { kind: string; brand: string | null; model: string | null }): Promise<CareGuide> {
  const what = [a.brand, (APPLIANCE_KINDS[a.kind] ?? 'appliance').toLowerCase(), a.model ? `model ${a.model}` : ''].filter(Boolean).join(' ')
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: PROMPT(what) }]
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'GB', city: 'London' } }] as any
  let response = await client.messages.create({ model: MODEL, max_tokens: 16000, output_config: { effort: 'medium' }, tools, messages } as any)
  // the server pauses long searches — hand its turn back and it carries on (at most 4 times)
  for (let i = 0; i < 4 && response.stop_reason === 'pause_turn'; i++) {
    messages.push({ role: 'assistant', content: response.content as any })
    response = await client.messages.create({ model: MODEL, max_tokens: 16000, output_config: { effort: 'medium' }, tools, messages } as any)
    messages.pop()
  }
  if (response.stop_reason === 'refusal') throw new Error('The research was declined')
  // the pages it actually looked at — kept even if the JSON leaves some out
  const seen: { title: string; url: string }[] = []
  for (const b of response.content as any[]) if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r?.url) seen.push({ title: String(r.title ?? r.url).slice(0, 120), url: String(r.url) })
  const text = (response.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('').trim()
  let j: any
  try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) } catch { throw new Error('The research didn’t come back in a readable form') }
  const s = (v: any, n = 400) => String(v ?? '').trim().slice(0, n)
  const url = (v: any) => /^https?:\/\//.test(String(v ?? '')) ? String(v).slice(0, 500) : null
  const sources = (Array.isArray(j.sources) ? j.sources : []).map((x: any) => ({ title: s(x?.title, 120), url: url(x?.url) })).filter((x: any) => x.url)
  return {
    found: !!j.found, product: s(j.product, 120) || what, summary: s(j.summary, 500),
    sections: (Array.isArray(j.sections) ? j.sections : []).slice(0, 5).map((x: any) => ({ title: s(x?.title, 80), steps: (Array.isArray(x?.steps) ? x.steps : []).slice(0, 6).map((t: any) => s(t, 300)).filter(Boolean) })).filter((x: any) => x.title && x.steps.length),
    errorCodes: (Array.isArray(j.errorCodes) ? j.errorCodes : []).slice(0, 15).map((x: any) => ({ code: s(x?.code, 20), meaning: s(x?.meaning, 200), whatToDo: s(x?.whatToDo, 300) })).filter((x: any) => x.code),
    reportIf: (Array.isArray(j.reportIf) ? j.reportIf : []).slice(0, 6).map((t: any) => s(t, 200)).filter(Boolean),
    manualUrl: url(j.manualUrl),
    sources: sources.length ? sources.slice(0, 6) : seen.slice(0, 4),
  }
}

/** Research and save the guide for one appliance (status ready / not_found / failed). Safe to run in the background. */
export async function researchAndSave(s: SupabaseClient, applianceId: string): Promise<void> {
  const { data: a } = await s.from('property_appliances').select('id, kind, brand, model').eq('id', applianceId).maybeSingle() as { data: any }
  if (!a || (!a.brand && !a.model)) { await s.from('property_appliances').update({ guide_status: 'not_found', guide_at: new Date().toISOString() }).eq('id', applianceId); return }
  await s.from('property_appliances').update({ guide_status: 'researching', guide_at: new Date().toISOString() }).eq('id', applianceId)
  try {
    const g = await researchGuide(a)
    await s.from('property_appliances').update({ guide: g, guide_status: g.found && g.sections.length ? 'ready' : 'not_found', guide_at: new Date().toISOString(), guide_approved_at: null, guide_approved_by: null }).eq('id', applianceId)
  } catch (e: any) {
    console.warn('care guide:', e?.message)
    await s.from('property_appliances').update({ guide_status: 'failed', guide_at: new Date().toISOString() }).eq('id', applianceId)
  }
}

/** The approved guide as plain text, for the fault-reporting AI. */
export function guideText(g: CareGuide | null | undefined): string {
  if (!g) return ''
  return [g.product, g.summary, ...g.sections.map(x => `${x.title}: ${x.steps.join(' ')}`),
    g.errorCodes.length ? `Error codes: ${g.errorCodes.map(e => `${e.code} = ${e.meaning} (${e.whatToDo})`).join('; ')}` : '',
    g.reportIf.length ? `Report it if: ${g.reportIf.join('; ')}` : ''].filter(Boolean).join('\n')
}
