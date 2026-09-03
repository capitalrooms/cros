// POST /api/admin/categorise-expense
// Given a description and optional context (property rooms), returns
// the best category slug + confidence. Used by admin statement entry,
// CSV import, and the email ingestion pipeline.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES, UNMATCHED_SLUG } from '@/lib/expense-categories'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin', 'lettings'].includes(user.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { description, amount, rooms } = body as {
    description: string
    amount?: number
    rooms?: Array<{ id?: string; name?: string; room_number?: number | string }>
  }

  if (!description?.trim()) {
    return NextResponse.json({ error: 'description required' }, { status: 400 })
  }

  const categoryList = [
    ...PROPERTY_WIDE_CATEGORIES.map(c => `${c.slug} — ${c.label} (property-wide)`),
    ...(rooms?.length
      ? rooms.flatMap(r => {
          const label = r.name || `Room ${r.room_number}`
          return ROOM_SPECIFIC_CATEGORY_TYPES.map(
            t => `${t.slug}:room:${r.id || r.room_number} — ${label} ${t.label} (room-specific)`
          )
        })
      : []),
    `${UNMATCHED_SLUG} — Other / Not Matched`,
  ].join('\n')

  const prompt = `You are categorising a property expense line item for a UK HMO (house in multiple occupation) landlord statement.

Expense description: "${description}"${amount != null ? `\nAmount: £${amount}` : ''}

Available categories (slug — label):
${categoryList}

Rules:
- Pick the SINGLE best matching category.
- If the description mentions a specific room (e.g. "Room 1", "Rm 2", "bedroom 3"), pick the room-specific category for that room if available.
- If genuinely ambiguous or not matching any category, use: other
- Do NOT guess into a wrong category. Honest "other" beats a wrong category.
- Respond with valid JSON only, no commentary:
  {"category": "<slug>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}
`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    let parsed: { category: string; confidence: number; reasoning: string }

    try {
      parsed = JSON.parse(text)
    } catch {
      // Try to extract JSON from the text
      const match = text.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : { category: UNMATCHED_SLUG, confidence: 0.5, reasoning: 'Parse error' }
    }

    // Validate that the returned slug exists (room slugs have :room: prefix)
    const slug = parsed.category || UNMATCHED_SLUG
    const confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5))
    const reasoning = parsed.reasoning || ''

    // Parse room-specific slug if present
    let finalCategory = slug
    let roomId: string | null = null
    if (slug.includes(':room:')) {
      const parts = slug.split(':room:')
      finalCategory = parts[0]
      roomId = parts[1] || null
    }

    return NextResponse.json({ category: finalCategory, room_id: roomId, confidence, reasoning })
  } catch (err) {
    console.error('categorise-expense error:', err)
    return NextResponse.json({ category: UNMATCHED_SLUG, confidence: 0, reasoning: 'AI error' })
  }
}
