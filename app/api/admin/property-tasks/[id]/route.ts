/**
 * PATCH  /api/admin/property-tasks/[id]   — update task (complete, edit fields)
 * DELETE /api/admin/property-tasks/[id]   — delete task
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) return null
  const role = user.assignment?.role
  if (role !== 'administrator' && role !== 'admin') return null
  return user
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Build update object from allowed fields
  const update: Record<string, unknown> = {}
  if ('description'  in body) update.description  = body.description?.trim() || null
  if ('notes'        in body) update.notes         = body.notes?.trim() || null
  if ('responsible'  in body) update.responsible   = body.responsible?.trim() || null
  if ('due_date'     in body) update.due_date       = body.due_date || null
  if ('status'       in body) update.status         = body.status

  // Completing a task
  if (body.completed === true) {
    update.completed    = true
    update.completed_at = new Date().toISOString()
    update.completed_by = user.assignment?.id || null
    update.status       = 'completed'
  } else if (body.completed === false) {
    update.completed    = false
    update.completed_at = null
    update.completed_by = null
    update.status       = 'open'
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const s = service()
  const { data, error } = await s
    .from('property_tasks')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const s = service()
  const { error } = await s.from('property_tasks').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
