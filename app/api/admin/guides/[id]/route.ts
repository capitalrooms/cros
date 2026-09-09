// GET /api/admin/guides/[id] — guide detail with blocks
// PUT /api/admin/guides/[id] — update guide settings
// DELETE /api/admin/guides/[id] — soft-delete (unpublish)

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = serviceClient()

  const { data: guide, error } = await sb
    .from('tenant_guides')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: blocks } = await sb
    .from('guide_blocks')
    .select('*')
    .eq('guide_id', id)
    .order('sort_order')

  const { count: ackCount } = await sb
    .from('guide_acknowledgments')
    .select('*', { count: 'exact', head: true })
    .eq('guide_id', id)

  return NextResponse.json({ guide, blocks: blocks || [], acknowledgmentCount: ackCount ?? 0 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const allowed = ['title', 'emoji', 'sort_order', 'visibility', 'trigger_stage',
                   'acknowledgment_required', 'hero_image_url', 'is_published']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const sb = serviceClient()
  const { data, error } = await sb
    .from('tenant_guides')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guide: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = serviceClient()
  const { error } = await sb
    .from('tenant_guides')
    .update({ is_published: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ unpublished: true })
}
