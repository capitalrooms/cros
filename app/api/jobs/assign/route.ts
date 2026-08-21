import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { property_id, room_id, cleaner_id, task_type, notes } = await request.json()

    if (!property_id || !room_id || !cleaner_id || !task_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createClient()
    const { data: admin } = await supabase.auth.getUser()

    if (!admin.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Get admin's person record
    const { data: adminPerson } = await supabase
      .from('people')
      .select('id')
      .eq('email', admin.user.email)
      .single()

    if (!adminPerson) {
      return NextResponse.json(
        { error: 'Admin record not found' },
        { status: 404 }
      )
    }

    // Create assigned job
    const { data, error } = await supabase
      .from('assigned_jobs')
      .insert({
        property_id,
        room_id,
        cleaner_id,
        assigned_by: adminPerson.id,
        task_type,
        notes: notes || null,
        status: 'pending',
      })
      .select()

    if (error) {
      console.error('Error assigning job:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      job: data?.[0],
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
