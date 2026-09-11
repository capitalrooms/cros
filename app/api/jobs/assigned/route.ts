import { createClient, createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Auth check via browser client (reads session cookie)
    const authClient = createClient()
    const { data: user } = await authClient.auth.getUser()

    if (!user.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Service client bypasses RLS — safe because we've verified auth above
    const supabase = createServiceClient()

    // Get cleaner's person record
    const { data: cleaner } = await supabase
      .from('people')
      .select('id')
      .eq('email', user.user.email)
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
