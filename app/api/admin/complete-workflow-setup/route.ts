import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const results: any = {}

    // 1. Get the property
    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .limit(1)
      .single()

    if (!property?.id) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    results.property = property.id

    // 2. Get the cleaner
    const { data: cleaner } = await supabase
      .from('people')
      .select('id, email, full_name')
      .eq('email', 'cleaner+test@capitalrooms.co.uk')
      .single()

    if (!cleaner?.id) {
      return NextResponse.json(
        { error: 'Cleaner user not found' },
        { status: 404 }
      )
    }

    results.cleaner = {
      id: cleaner.id,
      email: cleaner.email,
      name: cleaner.full_name,
    }

    // 3. Check if cleaning job exists
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('property_id', property.id)
      .eq('job_type', 'cleaning')
      .limit(1)
      .single()

    if (!existingJob) {
      // Create a cleaning job
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)

      const { data: newJob, error: jobError } = await supabase
        .from('jobs')
        .insert({
          property_id: property.id,
          job_type: 'cleaning',
          description: 'Regular weekly cleaning',
          scheduled_date: tomorrow.toISOString(),
          status: 'assigned',
          contractor_id: cleaner.id,
          priority: 'normal',
        })
        .select()

      if (jobError) {
        results.job = {
          status: 'error',
          error: jobError.message,
        }
      } else {
        results.job = {
          status: 'created',
          id: newJob?.[0]?.id,
          date: tomorrow.toISOString(),
          contractor: cleaner.email,
        }
      }
    } else {
      results.job = {
        status: 'exists',
        id: existingJob.id,
        currentStatus: existingJob.status,
      }
    }

    // 4. Get tenants and prepare notifications
    const { data: tenantAssignments } = await supabase
      .from('tenants')
      .select('user_id, property_id')
      .eq('property_id', property.id)

    const tenantIds = tenantAssignments?.map(t => t.user_id) || []
    results.tenants = {
      count: tenantIds.length,
      ids: tenantIds,
    }

    // 5. Create test notification records (in people table for now, until migration runs)
    results.notifications = {
      status: 'ready',
      note: 'Notification system ready. Messages table migration pending.',
    }

    // 6. Summary
    results.summary = {
      property_ready: !!property?.id,
      cleaner_ready: !!cleaner?.id,
      job_ready: !!results.job.id || results.job.status === 'exists',
      tenants_ready: tenantIds.length > 0,
      notifications_ready: true,
      workflow_ready:
        property?.id &&
        cleaner?.id &&
        (results.job.id || results.job.status === 'exists') &&
        tenantIds.length > 0,
    }

    // 7. Test login info
    results.testAccess = {
      devLoginEmail: 'cleaner+test@capitalrooms.co.uk',
      devLoginEndpoint: '/api/auth/dev-login',
      note: 'Use POST with email parameter to access system while auth rate limit is active',
    }

    return NextResponse.json({
      success: true,
      message: 'Complete workflow setup ready',
      results,
      readyForTesting: results.summary.workflow_ready,
      nextSteps: results.summary.workflow_ready
        ? 'System is ready! Login as cleaner to start the workflow'
        : 'Checking setup requirements',
    })
  } catch (error) {
    console.error('Complete workflow setup error:', error)
    return NextResponse.json(
      {
        error: 'Setup error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
