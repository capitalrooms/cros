import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, canActAtProperty, isStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID, validateNotes } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized property-notes GET access', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user } = currentUser

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('propertyId')

  if (!propertyId || !validateUUID(propertyId)) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid propertyId: ${propertyId}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 })
  }

  // only people connected to this property (lib/portalAuth) — the service key skips the database's own rules
  if (!(await canActAtProperty(await requireSignedIn(request), propertyId))) return NextResponse.json({ error: 'Not your property' }, { status: 403 })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Internal admin notes are never shown to tenants/cleaners — only staff see them
  const isStaff = ['administrator', 'admin', 'lettings'].includes(String((currentUser as any)?.assignment?.role ?? ''))
  const query = () => supabase
    .from('property_notes')
    .select('*, people(full_name, first_name, last_name, email)')
    .eq('property_id', propertyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  let { data: notes, error } = await (isStaff ? query() : query().or('is_internal.is.null,is_internal.eq.false'))
  // Before migration 183 adds is_internal no internal notes can exist — fall back to the unfiltered read
  if (error?.code === '42703' && !isStaff) ({ data: notes, error } = await query())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notes })
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized property-notes POST access', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user, assignment: person } = currentUser

  const body = await request.json()
  const { propertyId, title, content, noteType, roomId } = body

  if (!propertyId || !validateUUID(propertyId) || !title || !content || !noteType) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid input - propertyId: ${propertyId}, title: ${title}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json(
      { error: 'Invalid propertyId, title, content, or noteType' },
      { status: 400 }
    )
  }

  if (!validateNotes(content)) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: 'Invalid content (XSS detected)', ipAddress: getClientIp(request.headers) })
    return NextResponse.json(
      { error: 'Content contains invalid characters' },
      { status: 400 }
    )
  }

  if (!['cleaner', 'agent', 'admin'].includes(noteType)) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid noteType: ${noteType}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json(
      { error: 'noteType must be one of: cleaner, agent, admin' },
      { status: 400 }
    )
  }

  if (roomId && !validateUUID(roomId)) {
    await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid roomId: ${roomId}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json(
      { error: 'Invalid roomId format' },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify permission for cleaner, agent, and admin roles
  if (!person || !['cleaner', 'agent', 'administrator'].includes(person.role)) {
    await logAudit({ userId: user.id, action: 'security_forbidden_access', details: `Role '${person?.role}' attempted to create property note`, ipAddress: getClientIp(request.headers) })
  }

  if (!person || !['cleaner', 'agent', 'administrator'].includes(person.role)) {
    return NextResponse.json(
      { error: 'Only cleaners, agents, and admins can post notes' },
      { status: 403 }
    )
  }

  const { data: note, error } = await supabase
    .from('property_notes')
    .insert({
      property_id: propertyId,
      room_id: roomId || null,
      created_by: person.id,
      title,
      content,
      note_type: noteType,
    })
    .select('*, people(full_name, first_name, last_name, email)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ note })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const { noteId } = body

  if (!noteId) {
    return NextResponse.json({ error: 'noteId required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // only the office, or the person who wrote the note
  const caller = await requireSignedIn(request)
  const { data: note } = await supabase.from('property_notes').select('created_by').eq('id', noteId).maybeSingle()
  if (!caller || !note || !(isStaff(caller) || note.created_by === caller.personId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Soft delete
  const { error } = await supabase
    .from('property_notes')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', noteId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
