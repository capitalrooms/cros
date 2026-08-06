import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: 'harry@example.com',
      password: 'TestPassword123!',
      email_confirm: true,
    })

    if (authError) {
      // User might already exist
      if (authError.message.includes('already exists')) {
        return NextResponse.json({
          success: true,
          message: 'User already exists',
          email: 'harry@example.com',
          password: 'TestPassword123!',
        })
      }
      throw authError
    }

    // Create person record
    if (authUser?.user?.id) {
      await supabase.from('people').insert({
        id: authUser.user.id,
        email: 'harry@example.com',
        full_name: 'Test Admin',
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Test user created',
      email: 'harry@example.com',
      password: 'TestPassword123!',
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Setup failed' },
      { status: 500 }
    )
  }
}
