// GET /api/admin/guides — list all guides with block counts and acknowledgment counts
// POST /api/admin/guides — create a new guide

import { NextRequest, NextResponse } from 'next/server'
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

export async function GET() {
  const sb = serviceClient()

  const { data: guides, error } = await sb
    .from('tenant_guides')
    .select(`
      id, slug, title, emoji, sort_order, visibility, trigger_stage,
      acknowledgment_required, hero_image_url, is_published, created_at,
      guide_blocks(count),
      guide_acknowledgments(count)
    `)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guides: guides || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { slug, title, emoji, sort_order, visibility, trigger_stage, acknowledgment_required } = body

  if (!slug || !title) return NextResponse.json({ error: 'slug and title are required' }, { status: 400 })

  const sb = serviceClient()
  const { data, error } = await sb
    .from('tenant_guides')
    .insert({ slug, title, emoji: emoji || '📖', sort_order: sort_order || 0, visibility: visibility || 'essential',
              trigger_stage: trigger_stage || null, acknowledgment_required: acknowledgment_required || false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guide: data }, { status: 201 })
}
