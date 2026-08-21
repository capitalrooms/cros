import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { clean_date, clean_time } = await request.json()

    if (!clean_date) {
      return NextResponse.json(
        { error: 'clean_date is required' },
        { status: 400 }
      )
    }

    const supabase = createClient()
    const { data: user } = await supabase.auth.getUser()

    if (!user.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Get the assigned job
    const { data: job, error: jobError } = await supabase
      .from('assigned_jobs')
      .select('*, properties(clean_frequency_weeks)')
      .eq('id', params.id)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Create a clean entry
    const { data: clean, error: cleanError } = await supabase
      .from('cleans')
      .insert({
        property_id: job.property_id,
        cleaner_id: job.cleaner_id,
        clean_date,
        clean_time: clean_time || null,
        status: 'scheduled',
        notes: `Assigned task: ${job.notes || job.task_type}`,
      })
      .select()

    if (cleanError) {
      console.error('Error creating clean:', cleanError)
      return NextResponse.json(
        { error: cleanError.message },
        { status: 400 }
      )
    }

    // Update job status to accepted
    const { error: updateError } = await supabase
      .from('assigned_jobs')
      .update({ status: 'accepted' })
      .eq('id', params.id)

    if (updateError) {
      console.error('Error updating job:', updateError)
    }

    return NextResponse.json({
      success: true,
      clean: clean?.[0],
      message: `Clean booked for ${clean_date}. You can now head out when ready!`,
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
