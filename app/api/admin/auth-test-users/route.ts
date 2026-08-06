import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TEST_USERS = [
  { email: 'cleaner+test@capitalrooms.co.uk', password: 'TestCleaner123!' },
  { email: 'tenant1+test@capitalrooms.co.uk', password: 'TestTenant123!' },
  { email: 'tenant2+test@capitalrooms.co.uk', password: 'TestTenant123!' },
  { email: 'admin+test@capitalrooms.co.uk', password: 'TestAdmin123!' },
]

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const results: any[] = []

    for (const testUser of TEST_USERS) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: testUser.email,
          password: testUser.password,
          options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
          },
        })

        if (error && error.message.includes('already exists')) {
          results.push({
            email: testUser.email,
            status: 'already_exists',
            password: testUser.password,
          })
        } else if (error) {
          results.push({
            email: testUser.email,
            status: 'error',
            error: error.message,
          })
        } else {
          results.push({
            email: testUser.email,
            status: 'created',
            password: testUser.password,
            userId: data?.user?.id,
          })
        }
      } catch (err) {
        results.push({
          email: testUser.email,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Auth setup complete',
      results,
      testLogins: TEST_USERS.map(u => ({
        email: u.email,
        password: u.password,
      })),
    })
  } catch (error) {
    console.error('Auth setup error:', error)
    return NextResponse.json(
      { error: 'Setup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
