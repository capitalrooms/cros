// POST /api/admin/market/ask { question, areas?: [codes] } — "Ask the data" (12 Nov 2026, Harry: "if we asked the AI why
// 13.3% decline in Tower Hamlets what would it say … a search function where you ask the ONS data"). The areas named
// in the question (or the ones on screen) are looked up — rents, prices, trends, our rooms — and the AI answers from
// those figures, then searches recent news for possible reasons, kept apart and marked as such. Office staff.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { areaPack, packText } from '@/lib/rents/areaPack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'The AI key isn’t set up' }, { status: 503 })
  const b = await req.json().catch(() => ({}))
  const question = String(b.question ?? '').trim().slice(0, 600)
  if (question.length < 5) return NextResponse.json({ error: 'Ask a question' }, { status: 400 })
  const s = createServiceClient()
  // the areas: any named in the question, then the ones on screen; four at most
  const { data: all } = await s.from('ons_rents').select('area_code, area_name')
  const q = question.toLowerCase()
  const named = ((all ?? []) as any[]).filter(a => q.includes(String(a.area_name).toLowerCase())).sort((a, b) => b.area_name.length - a.area_name.length)
  const codes = [...new Set([...named.map(a => a.area_code), ...(Array.isArray(b.areas) ? b.areas.map(String) : [])])].slice(0, 4)
  if (!codes.length) codes.push('E12000007')   // London as a whole
  const packs = (await Promise.all(codes.map(c => areaPack(s as any, c, { ours: true })))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof areaPack>>>[]
  const { data: ldn } = await s.from('ons_rents').select('rent_all, change_all').eq('area_code', 'E12000007').maybeSingle() as { data: any }
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

  const prompt = `You are Capital Rooms' market analyst (a London letting agent for house shares and whole homes). Today is ${today}. Answer the office's question.

THE FIGURES (official, use these numbers exactly):
${packs.map(packText).join('\n\n')}
${ldn ? `\nLondon as a whole: average rent £${ldn.rent_all} (${ldn.change_all}% on a year).` : ''}

Rules:
- Start with "What the figures show": the direct answer, using the numbers above. Never invent a figure.
- Then "Possible reasons": search recent UK news if useful. These are explanations, not facts proven by the data — say so, and name where each comes from. Keep to the 2–4 most likely.
- Then "What it means for landlords": 2–3 practical lines.
- Notes: rents are whole homes (no rooms) unless it says Capital Rooms' own; house prices are by type of home, not bedrooms; recent house price months are early estimates and get revised.
- British English, plain and short (under 300 words). Use "## " for the three headings and "- " for bullets. No tables.

Question: ${question}`

  const client = new Anthropic()
  const run = async (tools: boolean) => client.messages.create({
    model: AI_MODEL_SMART, max_tokens: 1800,
    ...(tools ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB', city: 'London' } } as any] } : {}),
    messages: [{ role: 'user', content: prompt }],
  })
  let res
  try { res = await run(true) } catch { res = await run(false) }
  const blocks = res.content as any[]
  const answer = blocks.filter(x => x.type === 'text').map(x => x.text).join('').trim()
  const sources = [...new Map(blocks.filter(x => x.type === 'text').flatMap(x => (x.citations ?? []) as any[]).filter(c => c.url).map(c => [c.url, { url: c.url, title: c.title ?? c.url }])).values()].slice(0, 6)
  return NextResponse.json({ answer, sources, areas: packs.map(p => ({ code: p.code, name: p.name })) })
}
