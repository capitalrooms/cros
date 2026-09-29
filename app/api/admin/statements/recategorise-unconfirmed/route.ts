// POST /api/admin/statements/recategorise-unconfirmed
// Re-runs AI categorisation on all statement line items that are either:
//   • admin_confirmed = false (not manually reviewed)
//   • ai_confidence < threshold (low confidence)
//
// Safe to call multiple times — updates in place, never inserts duplicates.
// Used after expense category changes to re-match existing items.
// Admin-only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/serverAuth'
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES, UNMATCHED_SLUG } from '@/lib/expense-categories'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Confidence threshold: items below this are treated as "low confidence" and re-run
const LOW_CONFIDENCE = 0.75

async function categoriseSingle(
  description: string,
  amount: number,
  categoryList: string
): Promise<{ category: string; room_id: string | null; confidence: number; reasoning: string }> {
  const client = new Anthropic()
  const prompt = `You are categorising a property expense for a UK HMO landlord.

Description: "${description}"${amount ? `\nAmount: £${amount}` : ''}

Categories (slug — label):
${categoryList}

Pick the SINGLE best slug. Use "other" only if nothing fits.
Respond JSON only: {"category":"<slug>","confidence":<0-1>,"reasoning":"<one sentence>"}`

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : ''
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    if (!parsed) return { category: UNMATCHED_SLUG, room_id: null, confidence: 0, reasoning: 'parse error' }

    const slug = parsed.category || UNMATCHED_SLUG
    if (slug.includes(':')) {
      const [cat, roomId] = slug.split(':')
      return { category: cat, room_id: roomId || null, confidence: parsed.confidence ?? 0.5, reasoning: parsed.reasoning || '' }
    }
    return { category: slug, room_id: null, confidence: parsed.confidence ?? 0.5, reasoning: parsed.reasoning || '' }
  } catch {
    return { category: UNMATCHED_SLUG, room_id: null, confidence: 0, reasoning: 'AI error' }
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { confidenceThreshold?: number; propertyId?: string }
  const threshold = body.confidenceThreshold ?? LOW_CONFIDENCE
  const propertyId = body.propertyId ?? null

  const sb = serviceClient()

  // Fetch all unconfirmed or low-confidence items
  let query = sb
    .from('statement_line_items')
    .select('id, description, amount, property_id, category, ai_confidence, room_id')
    .eq('admin_confirmed', false)

  if (propertyId) query = query.eq('property_id', propertyId)

  const { data: items, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter to low-confidence (or all unconfirmed if threshold = 0)
  const toRedo = (items || []).filter(item => (item.ai_confidence ?? 0) < threshold)
  if (!toRedo.length) return NextResponse.json({ updated: 0, skipped: items?.length ?? 0 })

  // Build category list (no room-specific for now — we don't have rooms per item easily)
  const categoryList = [
    ...PROPERTY_WIDE_CATEGORIES.map(c => `${c.slug} — ${c.label}`),
    `${UNMATCHED_SLUG} — Other / Not Matched`,
  ].join('\n')

  // Also fetch room-specific slugs for any items that are room-specific
  // (include room_specific categories too)
  const categoryListFull = [
    ...PROPERTY_WIDE_CATEGORIES.map(c => `${c.slug} — ${c.label}`),
    ...ROOM_SPECIFIC_CATEGORY_TYPES.map(t => `${t.slug} — ${t.label} (room-specific)`),
    `${UNMATCHED_SLUG} — Other / Not Matched`,
  ].join('\n')

  let updated = 0
  let failed = 0

  for (const item of toRedo) {
    const result = await categoriseSingle(item.description, item.amount, categoryListFull)

    const category_type = result.category.startsWith('room_') ? 'room_specific' : 'property_wide'

    const { error: updErr } = await sb
      .from('statement_line_items')
      .update({
        category:      result.category,
        category_type,
        ai_category:   result.category,
        ai_confidence: result.confidence,
        // admin_confirmed stays false — admin must still review
      })
      .eq('id', item.id)

    if (updErr) failed++
    else updated++
  }

  return NextResponse.json({
    total: items?.length ?? 0,
    eligible: toRedo.length,
    updated,
    failed,
    skipped: (items?.length ?? 0) - toRedo.length,
    message: `Re-categorised ${updated} items. ${(items?.length ?? 0) - toRedo.length} already had high confidence.`,
  })
}
