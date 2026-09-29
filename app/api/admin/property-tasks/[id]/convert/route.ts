/**
 * POST /api/admin/property-tasks/[id]/convert
 *
 * Feature 4: Convert a property task into a maintenance ticket.
 * Creates a maintenance_ticket from the task's description/notes,
 * links the ticket back to the task (task.ticket_id), and sets
 * task.status = 'converted'.
 *
 * Built with Feature 6 (quoting) in mind: the ticket_id FK on
 * property_tasks means a quote request can reference either the
 * task or its resulting ticket later.
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = user.assignment?.role
  if (role !== 'administrator' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: taskId } = await params
  const body = await req.json()
  // Optional overrides from the conversion form
  const { priority = 'medium', category = 'general', location } = body

  const s = service()

  // 1. Fetch the task
  const { data: task, error: taskErr } = await s
    .from('property_tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (taskErr || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  if (task.status === 'converted') {
    return NextResponse.json({ error: 'Task already converted', ticket_id: task.ticket_id }, { status: 409 })
  }

  // 2. Create the maintenance ticket
  const { data: ticket, error: ticketErr } = await s
    .from('maintenance_tickets')
    .insert({
      property_id:  task.property_id,
      room_id:      task.room_id || null,
      title:        task.description,
      description:  task.notes || task.description,
      priority,
      category,
      location:     location || null,
      status:       'reported',
      admin_note:   'Created from a property task',
    })
    .select()
    .single()

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: ticketErr?.message || 'Failed to create ticket' }, { status: 500 })
  }

  // 3. Update the task: link the ticket, mark as converted
  const { error: updateErr } = await s
    .from('property_tasks')
    .update({
      ticket_id: ticket.id,
      status:    'converted',
    })
    .eq('id', taskId)

  if (updateErr) {
    // Non-fatal: ticket created, just the link didn't save — log and continue
    console.error('[convert-task] Failed to update task status:', updateErr.message)
  }

  return NextResponse.json({ ok: true, ticket_id: ticket.id, ticket })
}
