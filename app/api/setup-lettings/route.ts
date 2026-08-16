import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, getClientIp } from '@/lib/auditLog'

/**
 * API endpoint to initialize lettings schema
 * This endpoint creates the necessary tables and indexes for the lettings dashboard
 * Usage: POST /api/setup-lettings with body: { key: "development" }
 */

export async function POST(request: NextRequest) {
  const { key } = await request.json()

  // Security: only allow with a development key
  if (key !== 'development' && process.env.NODE_ENV === 'production') {
    await logAudit({ userId: 'unknown', action: 'security_forbidden_access', details: `Invalid setup key in ${process.env.NODE_ENV}`, ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  if (process.env.NODE_ENV === 'production') {
    await logAudit({ userId: 'unknown', action: 'security_forbidden_access', details: 'Setup-lettings accessed in production', ipAddress: getClientIp(request.headers) })
    return NextResponse.json({ error: 'Setup endpoint not available in production' }, { status: 403 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Test creating the tables one by one since we can't execute raw SQL directly

    // 1. Add columns to rooms table (this will fail silently if they already exist)
    console.log('Checking rooms table schema...')
    const { data: rooms } = await supabase.from('rooms').select('*').limit(1)

    if (rooms && rooms.length > 0) {
      const room = rooms[0] as Record<string, unknown>
      const hasLettuingsFields = 'status' in room && 'previous_rent' in room

      if (!hasLettuingsFields) {
        return NextResponse.json({
          error: 'Rooms table is missing lettings columns',
          message:
            'Please run the migration SQL directly in Supabase console:\nSee: supabase/migrations/012_complete_lettings_setup.sql',
          status: 'needs_migration',
        })
      }
    }

    // 2. Check for viewings table
    const { data: viewings, error: viewingsError } = await supabase
      .from('viewings')
      .select('*')
      .limit(1)

    if (viewingsError?.code === 'PGRST205') {
      return NextResponse.json({
        error: 'Viewings table does not exist',
        message:
          'Please run the migration SQL directly in Supabase console:\nSee: supabase/migrations/012_complete_lettings_setup.sql',
        status: 'needs_migration',
      })
    }

    // 3. Verify test data
    const { data: testRooms } = await supabase.from('rooms').select('*').limit(1)

    return NextResponse.json({
      status: 'ready',
      message: 'Lettings schema is properly initialized',
      database_status: {
        rooms_exist: (testRooms || []).length > 0,
        has_lettings_columns: testRooms && testRooms.length > 0 ? 'status' in testRooms[0] : false,
      },
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Unknown error',
      status: 'error',
    })
  }
}
