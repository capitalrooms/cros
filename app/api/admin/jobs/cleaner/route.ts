import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/jobs/cleaner — list all assigned_jobs (admin only)
export async function GET(request: NextRequest) {
  if (!(await requireStaff(request as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const supabase = createServiceClient()

    const url = new URL(request.url)
    const status = url.searchParams.get('status') // e.g. 'declined', 'pending', 'all'

    let query = supabase
      .from('assigned_jobs')
      .select('id, cleaner_id, property_id, room_id, task_type, status, notes, due_date, created_at, updated_at, properties(id, name, address), rooms(id, name)')
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    } else if (!status) {
      // Default: show pending + accepted + declined (not completed)
      query = query.in('status', ['pending', 'accepted', 'declined'])
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching cleaner jobs:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ jobs: data || [] })
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
