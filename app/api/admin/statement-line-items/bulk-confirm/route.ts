// POST /api/admin/statement-line-items/bulk-confirm
// Confirms all line items where the AI confidence is above the threshold
// and the category is not "other" (unmatched). No Supabase console needed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.9

  const supabase = serviceClient()

  // First: count how many will be affected
  const { count: total } = await supabase
    .from('statement_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('admin_confirmed', false)
    .neq('category', 'other')
    .gte('ai_confidence', threshold)

  // Apply the bulk confirm
  const { error } = await supabase
    .from('statement_line_items')
    .update({ admin_confirmed: true, updated_at: new Date().toISOString() })
    .eq('admin_confirmed', false)
    .neq('category', 'other')
    .gte('ai_confidence', threshold)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, confirmed: total ?? 0, threshold })
}
