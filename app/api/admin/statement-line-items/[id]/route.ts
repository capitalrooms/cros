// PATCH /api/admin/statement-line-items/[id]
// Admin corrects category for a line item. Update is silent — landlord just
// sees correct data next visit; no change event is surfaced.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ALL_CATEGORY_SLUGS } from '@/lib/expense-categories'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { category, category_type, room_id, room_label } = body

  // Validate category slug (strip :room: suffix if sent)
  const slugBase = (category || '').split(':')[0]
  if (!ALL_CATEGORY_SLUGS.includes(slugBase) && slugBase !== 'other') {
    return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 })
  }

  const supabase = serviceClient()
  const { error } = await supabase
    .from('statement_line_items')
    .update({
      category: slugBase,
      category_type: category_type || (slugBase.startsWith('room_') ? 'room_specific' : 'property_wide'),
      room_id: room_id || null,
      room_label: room_label || null,
      admin_confirmed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
