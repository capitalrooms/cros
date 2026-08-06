import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TEST_USERS = [
  { email: 'admin@capitalrooms.co.uk', role: 'admin', password: 'Admin123!' },
  { email: 'cleaner@capitalrooms.co.uk', role: 'cleaner', password: 'Cleaner123!' },
  { email: 'lettings@capitalrooms.co.uk', role: 'agent', password: 'Lettings123!' },
  { email: 'tenant1@capitalrooms.co.uk', role: 'tenant', password: 'Tenant123!' },
  { email: 'tenant2@capitalrooms.co.uk', role: 'tenant', password: 'Tenant123!' },
]

export async function POST(request: NextRequest) {
  try {
    const { adminKey } = await request.json()

    // Simple admin key check (use real auth in production)
    if (adminKey !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const results: any[] = []

    for (const user of TEST_USERS) {
      try {
        // Sign up user
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: user.email,
          password: user.password,
          options: {
            data: {
              role: user.role,
            },
          },
        })

        if (signupError && !signupError.message.includes('already exists')) {
          throw signupError
        }

        // Create person record
        const { error: insertError } = await supabase.from('people').insert({
          email: user.email,
          full_name: user.role.charAt(0).toUpperCase() + user.role.slice(1),
          phone: '07123456789',
        }).select()

        results.push({
          email: user.email,
          role: user.role,
          password: user.password,
          status: 'created',
        })
      } catch (err) {
        results.push({
          email: user.email,
          role: user.role,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Test users setup complete',
      results,
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      { error: 'Setup failed' },
      { status: 500 }
    )
  }
}
