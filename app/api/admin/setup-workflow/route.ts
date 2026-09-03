import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get or create test users
    const testUsers = [
      { email: 'cleaner+test@capitalrooms.co.uk', role: 'cleaner', name: 'Test Cleaner', phone: '07700123456' },
      { email: 'tenant1+test@capitalrooms.co.uk', role: 'tenant', name: 'Alice Smith', phone: '07700654321' },
      { email: 'tenant2+test@capitalrooms.co.uk', role: 'tenant', name: 'Bob Johnson', phone: '07700987654' },
      { email: 'admin+test@capitalrooms.co.uk', role: 'admin', name: 'Test Admin', phone: '07700111111' },
    ]

    const userResults: any[] = []

    // Check existing users and create if needed
    for (const user of testUsers) {
      const { data: existingPerson } = await supabase
        .from('people')
        .select('id, email, role')
        .eq('email', user.email)
        .single()

      if (existingPerson) {
        userResults.push({
          email: user.email,
          role: user.role,
          status: 'exists',
          userId: existingPerson.id,
        })
      } else {
        // Create new person with role
        const { data: newPerson, error: insertError } = await supabase
          .from('people')
          .insert({
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
          })
          .select()

        if (insertError) {
          userResults.push({
            email: user.email,
            role: user.role,
            status: 'error',
            error: insertError.message,
          })
        } else {
          userResults.push({
            email: user.email,
            role: user.role,
            status: 'created',
            userId: newPerson?.[0]?.id,
          })
        }
      }
    }

    // Get or create a test property
    const { data: existingProperties } = await supabase
      .from('properties')
      .select('id, address')
      .limit(1)

    let propertyId = existingProperties?.[0]?.id

    if (!propertyId) {
      // Create a test property
      const { data: newProperty, error: propError } = await supabase
        .from('properties')
        .insert({
          address: '123 Test Street, London, E1 6AN',
          city: 'London',
          postcode: 'E1 6AN',
          bedrooms: 3,
          status: 'active',
        })
        .select()

      if (!propError && newProperty?.[0]) {
        propertyId = newProperty[0].id
      }
    }

    // Get tenant users
    const tenantEmails = testUsers
      .filter(u => u.role === 'tenant')
      .map(u => u.email)

    const { data: tenants } = await supabase
      .from('people')
      .select('id, email')
      .in('email', tenantEmails)

    // Assign tenants to property
    for (const tenant of tenants || []) {
      const { error: assignError } = await supabase
        .from('tenants')
        .upsert({
          property_id: propertyId,
          user_id: tenant.id,
        })

      if (!assignError) {
        userResults.push({
          action: 'tenant_assigned',
          email: tenant.email,
          propertyId: propertyId,
        })
      }
    }

    // Create a cleaning job
    const { data: cleaner } = await supabase
      .from('people')
      .select('id')
      .eq('email', 'cleaner+test@capitalrooms.co.uk')
      .single()

    if (propertyId && cleaner?.id) {
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('property_id', propertyId)
        .eq('job_type', 'cleaning')
        .limit(1)

      if (!existingJobs || existingJobs.length === 0) {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)

        const { data: newJob, error: jobError } = await supabase
          .from('jobs')
          .insert({
            property_id: propertyId,
            job_type: 'cleaning',
            description: 'Regular weekly clean',
            scheduled_date: tomorrow.toISOString(),
            status: 'pending',
            contractor_id: cleaner.id,
          })
          .select()

        if (!jobError && newJob?.[0]) {
          userResults.push({
            action: 'job_created',
            jobId: newJob[0].id,
            status: 'pending',
            date: tomorrow.toISOString(),
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Workflow setup complete',
      property: { id: propertyId, address: '123 Test Street' },
      users: userResults,
      testCredentials: {
        cleaner: 'cleaner+test@capitalrooms.co.uk / TestPassword123!',
        tenant1: 'tenant1+test@capitalrooms.co.uk / TestPassword123!',
        tenant2: 'tenant2+test@capitalrooms.co.uk / TestPassword123!',
        admin: 'admin+test@capitalrooms.co.uk / TestPassword123!',
      },
    })
  } catch (error) {
    console.error('Workflow setup error:', error)
    return NextResponse.json(
      { error: 'Setup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
