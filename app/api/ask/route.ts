// POST /api/ask — the Ask bar (14 Nov 2026). { question, history? } → { answer, source, actions, answered }.
// Tenants, cleaners and contractors, each told only what's theirs to know (lib/ask/answer). Read-only.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn } from '@/lib/portalAuth'
import { answerQuestion } from '@/lib/ask/answer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const hits = new Map<string, number[]>()   // a light limit per person: 30 questions an hour

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || !['tenant', 'cleaner', 'contractor'].includes(c.role)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const now = Date.now(), mine = (hits.get(c.personId) ?? []).filter(t => now - t < 3600_000)
  if (mine.length >= 30) return NextResponse.json({ error: 'That’s a lot of questions — try again in a little while, or message the office.' }, { status: 429 })
  hits.set(c.personId, [...mine, now])
  const b = await req.json().catch(() => ({}))
  const question = String(b.question ?? '').trim()
  if (question.length < 2) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 })
  const history = (Array.isArray(b.history) ? b.history : []).filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h.content === 'string').map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 800) }))
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  try {
    return NextResponse.json(await answerQuestion(s, c.role as any, c.personId, question, history))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That didn’t work — try again.' }, { status: 500 })
  }
}
