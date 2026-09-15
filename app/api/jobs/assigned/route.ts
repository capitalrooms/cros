import { createServiceClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Bearer token auth (cookie-based auth is broken in this Next.js version)
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Service client bypasses RLS — safe because we've verified auth above
    const supabase = createServiceClient()

    // Get cleaner's person record
    const { data: cleaner } = await supabase
      .from('people')
      .select('id')
      .eq('email', user.email)
      .single()

    if (!cleaner) {
      return NextResponse.json(
        { error: 'Person record not found' },
        { status: 404 }
      )
    }

    // Get assigned jobs for this cleaner
    const { data, error } = await supabase
      .from('assigned_jobs')
      .select('*, properties(name, address), rooms(name)')
      .eq('cleaner_id', cleaner.id)
      .in('status', ['pending', 'accepted'])
      .order('task_type', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching jobs:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      jobs: data || [],
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
