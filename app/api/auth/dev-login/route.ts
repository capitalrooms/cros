import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// DEV ONLY: Test login for development (bypasses email verification)
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Dev login only in development' },
      { status: 403 }
    )
  }

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get person record
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, email, full_name, first_name, last_name, role')
      .eq('email', email)
      .single()

    if (personError || !person) {
      return NextResponse.json(
        { error: 'User not found', details: personError?.message },
        { status: 404 }
      )
    }

    // For dev: just return the person data as a successful login
    // (The admin listUsers API might not be available in all Supabase configs)
    return NextResponse.json({
      success: true,
      message: 'Dev login successful',
      user: {
        id: person.id,
        email: person.email,
        user_metadata: {
          name: person.name,
          role: person.role,
        },
      },
      dev_session: true,
    })
  } catch (error) {
    console.error('Dev login error:', error)
    return NextResponse.json(
      { error: 'Login error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
