// POST /api/admin/statements/[id]/categorise
// Reads a statement's expenses JSONB, AI-categorises each line,
// and upserts into statement_line_items. Safe to call multiple times
// (dedup hash prevents duplicates). Called after statement save.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES, UNMATCHED_SLUG } from '@/lib/expense-categories'
import crypto from 'crypto'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function dedupHash(propertyId: string, date: string, description: string, amount: number) {
  return crypto.createHash('sha256')
    .update(`${propertyId}|${date}|${description.trim().toLowerCase()}|${amount}`)
    .digest('hex').slice(0, 32)
}

async function categoriseBatch(
  rows: Array<{ description: string; amount: number }>,
  categoryList: string
): Promise<Array<{ category: string; room_id: string | null; confidence: number }>> {
  const client = new Anthropic()
  const items = rows.map((r, i) => `${i + 1}. "${r.description}" £${r.amount}`).join('\n')

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Categorise these UK HMO property expense line items. Pick the best slug from the list.
If genuinely ambiguous, use: other

Categories:\n${categoryList}

Items:\n${items}

Respond JSON array only, in order: [{"category":"<slug>","confidence":<0-1>}, ...]`,
      }],
    })

    const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
    const match = text.match(/\[[\s\S]*\]/)
    const parsed: Array<{category: string; confidence: number}> = match ? JSON.parse(match[0]) : []

    return rows.map((_, i) => {
      const raw = parsed[i]?.category || UNMATCHED_SLUG
      const confidence = parsed[i]?.confidence ?? 0.5
      if (raw.includes(':')) {
        const [slug, roomId] = raw.split(':')
        return { category: slug, room_id: roomId || null, confidence }
      }
      return { category: raw, room_id: null, confidence }
    })
  } catch {
    return rows.map(() => ({ category: UNMATCHED_SLUG, room_id: null, confidence: 0 }))
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin', 'lettings'].includes(user.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serviceClient()
  const { id } = params

  // Fetch the statement
  const { data: stmt, error: stmtErr } = await supabase
    .from('landlord_statements')
    .select('id, property_id, landlord_id, statement_date, period_start, period_end, expenses')
    .eq('id', id)
    .single()

  if (stmtErr || !stmt) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

  const expenses: Array<{ description: string; amount: number }> = stmt.expenses || []
  if (!expenses.length) return NextResponse.json({ inserted: 0, skipped: 0 })

  // Fetch rooms for this property
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, room_number')
    .eq('property_id', stmt.property_id)

  const categoryList = [
    ...PROPERTY_WIDE_CATEGORIES.map(c => `${c.slug} — ${c.label}`),
    ...(rooms || []).flatMap(r =>
      ROOM_SPECIFIC_CATEGORY_TYPES.map(t =>
        `${t.slug}:${r.id} — Room ${r.room_number || r.name} ${t.label}`
      )
    ),
    `${UNMATCHED_SLUG} — Other / Not Matched`,
  ].join('\n')

  // Categorise in batches of 20
  const BATCH = 20
  const allCats: Array<{ category: string; room_id: string | null; confidence: number }> = []
  for (let i = 0; i < expenses.length; i += BATCH) {
    const batch = expenses.slice(i, i + BATCH)
    allCats.push(...await categoriseBatch(batch, categoryList))
  }

  const dateStr = (stmt.statement_date || stmt.period_start || new Date().toISOString()).split('T')[0]
  let inserted = 0, skipped = 0

  for (let i = 0; i < expenses.length; i++) {
    const exp = expenses[i]
    const cat = allCats[i]
    const category_type = cat.category.startsWith('room_') ? 'room_specific' : 'property_wide'

    const row = {
      statement_id: stmt.id,
      property_id: stmt.property_id,
      landlord_id: stmt.landlord_id,
      description: exp.description,
      amount: exp.amount,
      category: cat.category,
      category_type,
      room_id: cat.room_id,
      ai_category: cat.category,
      ai_confidence: cat.confidence,
      admin_confirmed: false,
      statement_date: dateStr,
      period_start: stmt.period_start ? stmt.period_start.split('T')[0] : dateStr,
      period_end: stmt.period_end ? stmt.period_end.split('T')[0] : dateStr,
      source: 'manual',
      dedup_hash: dedupHash(stmt.property_id, dateStr, exp.description, exp.amount),
    }

    const { error: insErr } = await supabase.from('statement_line_items').insert(row)
    if (insErr) {
      if (insErr.code === '23505') skipped++ // duplicate
      // else silently skip — don't fail the whole batch
    } else {
      inserted++
    }
  }

  return NextResponse.json({ inserted, skipped })
}
