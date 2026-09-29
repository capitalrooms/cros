/**
 * GET  /api/admin/property-tasks   — list tasks
 *   ?property_id=<uuid>            — filter by property (omit for all)
 *   ?status=open|completed|all     — default: open
 *   ?responsible=me                — filter to tasks where responsible='Me'
 *   ?due_before=<ISO-date>         — tasks/certs due before this date (for horizon filter)
 *
 * POST /api/admin/property-tasks   — create task
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'

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

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const s = service()
  const { searchParams } = new URL(req.url)
  const propertyId  = searchParams.get('property_id')
  const statusParam = searchParams.get('status') || 'open'
  const responsible = searchParams.get('responsible')
  const dueBefore   = searchParams.get('due_before')

  let q = s
    .from('property_tasks')
    .select(`
      *,
      properties(id, name, address),
      rooms(id, name),
      created_by_person:people!property_tasks_created_by_fkey(id, first_name, last_name, full_name)
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (propertyId)  q = q.eq('property_id', propertyId)
  if (statusParam !== 'all') q = q.eq('status', statusParam === 'completed' ? 'completed' : 'open')
  if (responsible === 'me')  q = q.ilike('responsible', 'me')
  if (dueBefore)   q = q.lte('due_date', dueBefore)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tasks: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { property_id, room_id, description, notes, responsible, due_date } = body

  if (!property_id || !description?.trim()) {
    return NextResponse.json({ error: 'property_id and description are required' }, { status: 400 })
  }

  const s = service()
  const { data, error } = await s
    .from('property_tasks')
    .insert({
      property_id,
      room_id:     room_id || null,
      description: description.trim(),
      notes:       notes?.trim() || null,
      responsible: responsible?.trim() || null,
      due_date:    due_date || null,
      status:      'open',
      created_by:  user.assignment?.id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data }, { status: 201 })
}
