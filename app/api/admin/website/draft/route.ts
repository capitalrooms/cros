// POST /api/admin/website/draft — write an advice post from a short brief (24 Nov 2026). Claude drafts the title,
// excerpt and body in Capital Rooms' voice, and may search the web for facts (up to three searches). It returns a
// draft only: nothing is saved or published until staff press Save in the post editor.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const CATEGORIES = ['tenants', 'landlords'] as const

// a cover in the style of the site's existing pictures (flat, simple, muted teal and cream, no text) — gpt-image-1 via OPENAI_API_KEY
async function generateCover(title: string, brief: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const prompt = `A flat, simple editorial illustration for a UK lettings advice article titled "${title}". Subject: ${brief.slice(0, 300)}. Style: clean flat vector shapes, no outlines, muted deep teal, soft cream and one warm gold accent, generous empty space, calm and reassuring. No text, no letters, no logos, no real people's faces.`
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1536x1024', n: 1, quality: 'medium' }), signal: AbortSignal.timeout(110000),
  })
  if (!r.ok) return null
  const j: any = await r.json().catch(() => null)
  const b64 = j?.data?.[0]?.b64_json
  if (!b64) return null
  const path = `posts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const s = createServiceClient() as any
  const { error } = await s.storage.from('website').upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/png', upsert: false })
  if (error) return null
  return s.storage.from('website').getPublicUrl(path).data.publicUrl as string
}

const SYSTEM = `You write advice posts for the Capital Rooms website. Capital Rooms is a London letting agent for shared houses (HMOs) and whole homes.
Voice: plain, warm, direct British English. No hype, no emojis, no jargon. Short paragraphs. Specific and practical.
Facts: only state UK law, dates, figures or statistics you are sure of, or that you found in a web search you cite. If unsure, leave it out.
Never name a real person, company or property other than Capital Rooms. Do not invent case studies.
Format the body in Markdown: a first paragraph, then ## headings where they help, bullet lists where they help. No H1.
You are also given a numbered list of cover pictures already used on the site. Pick the one whose subject best fits the post (or null if none fits). Never invent an image.
Reply with ONLY a JSON object: {"title": string, "excerpt": string (one or two sentences, under 200 characters), "body": string (Markdown, roughly 500-800 words), "sources": [string] (URLs you used, may be empty), "cover_index": number | null}.`

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { brief?: string; category?: string }
  const brief = String(b.brief ?? '').trim().slice(0, 1200)
  if (brief.length < 10) return NextResponse.json({ error: 'Describe the topic in a sentence or two.' }, { status: 400 })
  const category = (CATEGORIES as readonly string[]).includes(String(b.category)) ? String(b.category) : 'tenants'
  const audience = category === 'landlords' ? 'landlords who let property through Capital Rooms' : 'tenants renting a room or home through Capital Rooms'
  // the site's own cover pictures: the draft chooses one that fits, so new posts match the look already on the site
  const s = createServiceClient() as any
  const { data: posts } = await s.from('website_posts').select('cover_url, title, category').not('cover_url', 'is', null).order('shown_date', { ascending: false }).limit(200)
  const seen = new Set<string>()
  const covers = ((posts ?? []) as any[]).filter(p => p.cover_url && !seen.has(p.cover_url) && seen.add(p.cover_url)).slice(0, 60)
  const list = covers.map((c, i) => `${i}. ${c.title} (${c.category})`).join('\n')
  const user = `Write one advice post for ${audience}.\n\nBrief from the office:\n${brief}\n\nIf the brief needs current UK facts, search the web and use what you find.\n\nCover pictures already on the site:\n${list || '(none)'}\n\nReturn the JSON object only.`

  const call = (tools: any[] | undefined) => client.messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 4000, system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    ...(tools ? { tools } : {}),
  } as any)
  let res: any
  try {
    res = await call([{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }])
  } catch {
    // no web search available on this account: draft from the brief alone
    res = await call(undefined)
  }
  const text = (res.content as any[]).filter(c => c.type === 'text').map(c => c.text).join('').trim()
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let out: any
  try { out = JSON.parse(json) } catch { return NextResponse.json({ error: 'The draft came back in the wrong shape. Try again, or add more to the brief.' }, { status: 502 }) }
  // the web search tool wraps quoted facts in <cite> tags; the reader should see the words, not the markup
  const clean = (t: unknown) => String(t ?? '').replace(/<\/?cite[^>]*>/gi, '').replace(/[ \t]{2,}/g, ' ')
  out.title = clean(out.title)
  out.excerpt = clean(out.excerpt)
  out.body = clean(out.body)
  const title = String(out.title ?? '').trim().slice(0, 200)
  if (!title || !out.body) return NextResponse.json({ error: 'The draft was empty. Try again with more detail in the brief.' }, { status: 502 })
  const sources = Array.isArray(out.sources) ? out.sources.filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 8) : []
  const idx = Number.isInteger(out.cover_index) ? out.cover_index : null
  // a new picture in the site's style if the image service is set up; otherwise the closest existing cover
  const generated = await generateCover(title, brief).catch(() => null)
  const cover_url = generated ?? (idx != null && covers[idx] ? covers[idx].cover_url : null)
  const coverNote = generated ? 'generated' : cover_url ? 'existing' : 'none'
  return NextResponse.json({ title, excerpt: String(out.excerpt ?? '').slice(0, 300), body: String(out.body), category, sources, cover_url, coverNote })
}
