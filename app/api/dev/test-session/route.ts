import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// DEV ONLY: Test session for workflow demonstration
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Test session only available in development' },
      { status: 403 }
    )
  }

  try {
    const { role } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get test user by role
    const emailMap: Record<string, string> = {
      cleaner: 'cleaner+test@capitalrooms.co.uk',
      tenant: 'tenant1+test@capitalrooms.co.uk',
      admin: 'admin+test@capitalrooms.co.uk',
    }

    const testEmail = emailMap[role] || emailMap.tenant

    // Get the person record
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, email, full_name, first_name, last_name, role')
      .eq('email', testEmail)
      .single()

    if (personError || !person) {
      return NextResponse.json(
        { error: 'Test user not found', details: personError?.message },
        { status: 404 }
      )
    }

    // Create a mock session (for dev purposes)
    const mockSession = {
      access_token: `test_token_${person.id}`,
      refresh_token: `test_refresh_${person.id}`,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: person.id,
        email: person.email,
        user_metadata: {
          name: person.name,
          role: person.role,
        },
      },
    }

    return NextResponse.json({
      success: true,
      session: mockSession,
      user: person,
      message: `Test session created for ${person.name} (${role})`,
    })
  } catch (error) {
    console.error('Test session error:', error)
    return NextResponse.json(
      { error: 'Failed to create test session' },
      { status: 500 }
    )
  }
}
