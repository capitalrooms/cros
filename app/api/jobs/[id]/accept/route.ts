import { createServiceClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Bearer token auth (cookie-based auth is broken in this Next.js version)
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authSb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await authSb.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { clean_date, clean_time } = await request.json()

    if (!clean_date) {
      return NextResponse.json(
        { error: 'clean_date is required' },
        { status: 400 }
      )
    }

    // Service client bypasses RLS
    const supabase = createServiceClient()

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
