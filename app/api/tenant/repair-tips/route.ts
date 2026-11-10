// Quick things to try before a repair is booked (9 Nov 2026). Any issue type, from what the tenant wrote. Advisory
// only (memory: AI triage must never block): the report form always lets them carry on, and if this is slow or
// fails the form just moves on. Only safe, tool-free steps; anything risky → no tips, book the repair.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireSignedIn } from '@/lib/portalAuth'
import { AI_MODEL } from '@/lib/ai-classify'
import { approvedGuide } from '@/lib/house/applianceGuide'

export const dynamic = 'force-dynamic'
const client = new Anthropic()
// a long line is cut at a word, never mid-word (10 Nov 2026: "…and restarted the m")
const clip = (v: unknown, n: number) => { const t = String(v ?? '').trim(); return t.length <= n ? t : `${t.slice(0, t.lastIndexOf(' ', n - 1))}…` }

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const description = String(b.description ?? '').slice(0, 1200).trim()
  if (description.length < 6) return NextResponse.json({ tips: null })
  const guide = b.applianceId ? await approvedGuide(String(b.applianceId)).catch(() => null) : null
  const prompt = `A tenant in a UK rented home is reporting a repair. Suggest up to 4 quick, SAFE things they could try first, if any.

Category: ${String(b.category ?? '').slice(0, 60)}
Where: ${String(b.location ?? '').slice(0, 60)}
What they wrote: "${description}"
${b.details ? `Their answers: ${String(b.details).slice(0, 600)}\n` : ''}${guide ? `The office's checked guide for this appliance:\n${guide}\n` : ''}
Rules:
- Only steps anyone can do safely with no tools beyond a cloth or a coin: resetting a tripped switch, checking a plug or fuse spur switch, topping up boiler pressure with the filling loop, bleeding a radiator with a key, clearing a plughole, cleaning a filter, checking the thermostat or timer, restarting an appliance.
- NEVER suggest touching gas, wiring, sockets, the fuse board beyond flipping a tripped switch, ladders, roofs, mould removal with chemicals, or anything structural.
- If there's any sign of danger (gas smell, burning, sparks, water near electrics, flooding, no heating in cold weather for vulnerable people, a door that won't lock), return no tips.
- If nothing sensible can be tried, return no tips. Don't pad it out.
- Plain UK English, short steps, no jargon.

Reply with JSON only:
{"tips": null}
or
{"tips": {"headline": "one short sentence (under 20 words) on what it might be", "steps": ["step", "step"], "stopIf": "one short sentence (under 30 words) on when to stop and just report it"}}`
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000)
    const r = await client.messages.create({ model: AI_MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }, { signal: ctrl.signal })
    clearTimeout(t)
    const text = r.content[0]?.type === 'text' ? r.content[0].text : ''
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const tips = json?.tips
    if (!tips || !Array.isArray(tips.steps) || !tips.steps.length) return NextResponse.json({ tips: null })
    return NextResponse.json({ tips: { headline: clip(tips.headline, 220), steps: tips.steps.slice(0, 5).map((x: unknown) => clip(x, 320)), stopIf: clip(tips.stopIf, 320) } })
  } catch { return NextResponse.json({ tips: null }) }
}
