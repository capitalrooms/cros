/**
 * POST /api/tenant/housemate-concern-route
 * AI routing for "Something else" housemate concerns.
 * Returns: { type: 'capital_rooms' | 'house_note', draft?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { concern, prompt: customPrompt } = await req.json()
  if (!concern?.trim()) {
    return NextResponse.json({ error: 'concern required' }, { status: 400 })
  }

  // Auth check
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token) {
    const service = serviceClient()
    const { data: authData } = await service.auth.getUser(token)
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    // Fall back to sending to Capital Rooms if no API key
    return NextResponse.json({ type: 'capital_rooms' })
  }

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const userContent = customPrompt || `You help route tenant concerns in a shared house (HMO). Read this concern and decide:

CONCERN: "${concern}"

Rules:
- If it's PERSONAL (directed at a specific person, involves conflict, safety, abuse, discrimination, or anything requiring confidentiality) → route to Capital Rooms.
- If it's GENERAL (a communal reminder that could apply to the whole house without naming anyone) → propose an anonymous house reminder.

Respond with JSON only, no markdown:
{ "type": "capital_rooms" }
OR
{ "type": "house_note", "draft": "A friendly, anonymous reminder for the notice board (max 60 words, no names)" }

The draft should be warm and non-accusatory, written as a general house reminder.`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: userContent,
      }],
    })

    const text = (msg.content[0] as any).text?.trim() || '{}'
    const result = JSON.parse(text)
    return NextResponse.json(result)
  } catch {
    // On AI failure, default to Capital Rooms
    return NextResponse.json({ type: 'capital_rooms' })
  }
}
