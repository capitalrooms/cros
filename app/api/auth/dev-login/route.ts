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
      .select('id, email, full_name, role')
      .eq('email', email)
      .single()

    if (personError || !person) {
      return NextResponse.json(
        { error: 'User not found', details: personError?.message },
        { status: 404 }
      )
    }

    // Get or create auth user
    const { data: authUsers, error: listError } = await supabase.auth.admin?.listUsers?.()
      || { data: null, error: { message: 'Admin API not available' } }

    if (!authUsers) {
      // Fallback: return person data with mock session for dev
      return NextResponse.json({
        success: true,
        message: 'Dev login successful',
        user: {
          id: person.id,
          email: person.email,
          user_metadata: {
            full_name: person.full_name,
            role: person.role,
          },
        },
        dev_session: true,
      })
    }

    // Check if auth user exists
    const authUser = authUsers.find((u: any) => u.email === email)
    if (!authUser) {
      // For dev: return success anyway
      return NextResponse.json({
        success: true,
        message: 'Dev login successful (auth user not in Supabase yet)',
        user: {
          id: person.id,
          email: person.email,
          user_metadata: {
            full_name: person.full_name,
            role: person.role,
          },
        },
        dev_session: true,
      })
    }

    // Try to sign in
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: 'TestPassword123!',
    })

    if (signInData?.session) {
      return NextResponse.json({
        success: true,
        message: 'Logged in',
        session: signInData.session,
        user: person,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Dev login successful',
      user: person,
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
