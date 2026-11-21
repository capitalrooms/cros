// POST /api/supplier/tidy-wording (Nov 2026)
// A contractor or cleaner types or dictates a short note about a job, quote or invoice line; this returns the same
// words written as clear, professional English. It never adds facts, amounts, dates or names that weren't said.
// The person sees the result and chooses whether to use it: nothing is replaced automatically.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: Record<string, string> = {
  job: 'a note about the work done on a repair job',
  quote: 'a description of work being quoted',
  line: 'an invoice line description',
  note: 'a note to the client on an invoice',
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || !(c.role === 'contractor' || c.role === 'cleaner' || isStaff(c))) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }
  const b = await req.json().catch(() => ({})) as any
  const text = String(b.text ?? '').trim().slice(0, 2000)
  const kind = KINDS[String(b.kind ?? '')] ? String(b.kind) : 'note'
  if (text.length < 3) return NextResponse.json({ error: 'Write or say a few words first.' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ text, changed: false, note: 'Tidying is not available right now.' })

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 400,
    system: [
      'You tidy up short notes written by tradespeople in the UK.',
      `The note is ${KINDS[kind]}.`,
      'Rewrite it as clear, polite, professional British English, in plain words, in the first person where it fits.',
      'Keep every fact exactly: names, amounts, dates, quantities, part names. Do not add anything that was not said.',
      'If the note is already clear, return it with only spelling and grammar fixed.',
      'Return only the rewritten text. No quotes, no preface.',
    ].join(' '),
    messages: [{ role: 'user', content: text }],
  }).catch(() => null)

  const out = ((msg?.content ?? []).find(b => b.type === 'text')?.text ?? '').trim()
  if (!out) return NextResponse.json({ error: 'That didn’t tidy up. Your words are still here, try again.' }, { status: 502 })
  return NextResponse.json({ text: out, changed: out !== text })
}
