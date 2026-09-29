// POST /api/admin/guides/[id]/blocks — add a block to a guide

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { heading, body: blockBody, sort_order, inline_image_url } = body

  if (!heading || !blockBody) return NextResponse.json({ error: 'heading and body are required' }, { status: 400 })

  const sb = serviceClient()

  // If no sort_order given, place at end
  let order = sort_order
  if (order == null) {
    const { data: last } = await sb
      .from('guide_blocks')
      .select('sort_order')
      .eq('guide_id', id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    order = (last?.sort_order ?? 0) + 10
  }

  const { data, error } = await sb
    .from('guide_blocks')
    .insert({ guide_id: id, heading, body: blockBody, sort_order: order, inline_image_url: inline_image_url || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ block: data }, { status: 201 })
}
