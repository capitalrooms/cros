import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SUBTYPES: Record<string, string[]> = {
  info: ['General update', 'Maintenance scheduled', 'Inspection', 'Parcel / delivery', 'Guest access', 'Reminder'],
  task: ['Clean communal area', 'Take bins out', 'Sign document', 'Reply needed', 'Action required'],
}

export async function POST(req: NextRequest) {
  // signed-in users only — this calls the AI (paid per use)
  if (!(await requireSignedIn(req as any))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { raw_text, notice_type, subtype } = await req.json()

  if (!raw_text?.trim()) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  const typeLabel = notice_type === 'task' ? 'Task notice (requires action from housemates)' : 'Info notice (no action needed)'

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are helping a tenant post a notice on their shared-house communal notice board.

Notice type: ${typeLabel}${subtype ? `\nSubtype: ${subtype}` : ''}

The tenant wrote this rough note:
"${raw_text.trim()}"

Rewrite it as a clear, friendly, and concise notice suitable for housemates.
- Keep it brief (2–4 sentences max)
- Friendly tone, not bossy
- Preserve all the key facts (names, times, dates)
- For task notices, be clear about what needs doing and by when (if mentioned)
- No emojis, no bullet points, just a short paragraph
- Write in first person if appropriate ("I've booked…", "Just a heads-up…")

Return ONLY the rewritten notice text, nothing else.`,
    }],
  })

  const ai_text = response.content[0].type === 'text'
    ? response.content[0].text.trim()
    : ''

  return NextResponse.json({ ai_text })
}
