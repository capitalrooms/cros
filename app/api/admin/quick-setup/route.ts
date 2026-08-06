import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const results: any = {
      authAccounts: {},
      ready: false,
    }

    // Try creating auth accounts (simple retry)
    const testUsers = [
      { email: 'cleaner+test@capitalrooms.co.uk', password: 'TestCleaner123!' },
      { email: 'tenant1+test@capitalrooms.co.uk', password: 'TestTenant123!' },
      { email: 'tenant2+test@capitalrooms.co.uk', password: 'TestTenant123!' },
      { email: 'admin+test@capitalrooms.co.uk', password: 'TestAdmin123!' },
    ]

    let successCount = 0

    for (const user of testUsers) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: user.email,
          password: user.password,
          options: {
            emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
          },
        })

        if (error) {
          if (error.message.includes('already exists')) {
            results.authAccounts[user.email] = 'already_exists'
            successCount++
          } else {
            results.authAccounts[user.email] = error.message
          }
        } else {
          results.authAccounts[user.email] = 'created'
          successCount++
        }
      } catch (e) {
        results.authAccounts[user.email] = e instanceof Error ? e.message : 'Error'
      }
    }

    // Check if we have jobs
    const { data: jobs, error: jobError } = await supabase
      .from('jobs')
      .select('id, status, job_type')
      .eq('job_type', 'cleaning')
      .limit(1)

    results.job = {
      exists: !jobError && jobs && jobs.length > 0,
      ready: !jobError && jobs && jobs.length > 0,
      status: jobs?.[0]?.status || 'none',
    }

    // Check property
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('id, address')
      .limit(1)
      .single()

    results.property = {
      exists: !propError && property,
      address: property?.address || 'none',
    }

    results.ready =
      successCount >= 3 && results.job.ready && results.property.exists

    return NextResponse.json({
      success: true,
      message: 'Quick setup complete',
      summary: {
        authAccountsCreated: successCount,
        totalNeeded: testUsers.length,
        jobReady: results.job.ready,
        propertyReady: results.property.exists,
        workflowReady: results.ready,
      },
      results,
      nextSteps: results.ready
        ? 'Try logging in with: cleaner+test@capitalrooms.co.uk'
        : 'Waiting for auth rate limit to reset',
    })
  } catch (error) {
    console.error('Quick setup error:', error)
    return NextResponse.json(
      {
        error: 'Setup error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    )
  }
}
