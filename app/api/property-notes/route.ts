import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: notes, error } = await supabase
    .from('property_notes')
    .select('*, people(full_name, email)')
    .eq('property_id', propertyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
    .select('*, people(full_name, email)')
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

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
