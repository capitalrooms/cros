import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { reason } = await request.json().catch(() => ({ reason: undefined }))

    // Use service client so this works even if the cleaner's RLS only covers their own rows
    const supabase = createServiceClient()

    // Verify the job exists
    const { data: job, error: jobError } = await supabase
      .from('assigned_jobs')
      .select('id, cleaner_id, property_id, room_id, status, notes')
      .eq('id', params.id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot decline a job with status "${job.status}"` },
        { status: 400 }
      )
    }

    // Update the job to declined
    const newNotes = reason
      ? `${job.notes ? job.notes + '\n' : ''}Declined: ${reason}`
      : job.notes

    const { error: updateError } = await supabase
      .from('assigned_jobs')
      .update({
        status: 'declined',
        notes: newNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    if (updateError) {
      console.error('Error declining job:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Job declined. Admin has been notified and will reassign.',
    })
  } catch (error) {
    console.error('Error declining job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
