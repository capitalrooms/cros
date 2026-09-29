import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/admin/jobs/cleaner/[id]/reassign — reassign to a different cleaner
export async function PATCH(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  if (!(await requireStaff(request as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = await paramsPromise
  try {
    const { cleanerId } = await request.json()
    if (!cleanerId) {
      return NextResponse.json({ error: 'cleanerId is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verify cleaner exists
    const { data: cleaner } = await supabase
      .from('people')
      .select('id, full_name, first_name, last_name, email')
      .eq('id', cleanerId)
      .eq('role', 'cleaner')
      .single()

    if (!cleaner) {
      return NextResponse.json({ error: 'Cleaner not found' }, { status: 404 })
    }

    // Reassign and reset to pending
    const { data: job, error } = await supabase
      .from('assigned_jobs')
      .update({
        cleaner_id: cleanerId,
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error reassigning job:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, job })
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
