import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('propertyId')

  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
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
  const body = await request.json()
  const { propertyId, title, content, noteType } = body

  if (!propertyId || !title || !content || !noteType) {
    return NextResponse.json(
      { error: 'propertyId, title, content, and noteType required' },
      { status: 400 }
    )
  }

  if (!['cleaner', 'agent', 'admin'].includes(noteType)) {
    return NextResponse.json(
      { error: 'noteType must be one of: cleaner, agent, admin' },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get person record to verify they have permission to create notes
  const { data: person } = await supabase
    .from('people')
    .select('role')
    .eq('auth_id', user.id)
    .single()

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
      created_by: user.id,
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
