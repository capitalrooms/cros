// PUT /api/admin/guides/[id]/blocks/[blockId] — update a block
// DELETE /api/admin/guides/[id]/blocks/[blockId] — delete a block

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const { id, blockId } = await params
  const body = await req.json()
  const allowed = ['heading', 'body', 'sort_order', 'inline_image_url']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const sb = serviceClient()
  const { data, error } = await sb
    .from('guide_blocks')
    .update(update)
    .eq('id', blockId)
    .eq('guide_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ block: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> }
) {
  const { id, blockId } = await params
  const sb = serviceClient()
  const { error } = await sb
    .from('guide_blocks')
    .delete()
    .eq('id', blockId)
    .eq('guide_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
