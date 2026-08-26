import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * Generate tenant safety check prompts
 * GET /api/cron/send-safety-check-prompts?frequency=monthly
 *
 * Called monthly/quarterly to send fire door and smoke alarm check prompts to all active tenants.
 * Creates tenant_self_checks entries for each tenancy.
 *
 * Query params:
 * - frequency: 'monthly' or 'quarterly' (default: monthly)
 * - property_id: (optional) limit to specific property
 */

export async function GET(req: NextRequest) {
  try {
    // In production, this would check an API key/authorization header
    const authHeader = req.headers.get('authorization')
    const expectedKey = process.env.CRON_SECRET_KEY
    
    // Allow unauthenticated in dev, require key in production
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const frequency = (req.nextUrl.searchParams.get('frequency') || 'monthly') as 'monthly' | 'quarterly'
    const propertyId = req.nextUrl.searchParams.get('property_id')

    const supabase = createClient({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    })

    // Get all active tenancies
    let query = supabase
      .from('tenancies')
      .select('*, rooms(id, name, property_id), people(id, full_name, email)')
      .is('end_date', null) // Active tenancies only

    if (propertyId) {
      query = query.eq('rooms.property_id', propertyId)
    }

    const { data: tenancies, error: tenanciesError } = await query

    if (tenanciesError) {
      console.error('Error fetching tenancies:', tenanciesError)
      return NextResponse.json(
        { error: 'Failed to fetch tenancies' },
        { status: 500 }
      )
    }

    const checksCreated = []
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // For each tenancy, check if we should create a new check
    for (const tenancy of tenancies || []) {
      const roomId = (tenancy as any).rooms?.id
      const propertyId = (tenancy as any).rooms?.property_id
      const tenantId = (tenancy as any).tenant_id

      if (!roomId || !propertyId || !tenantId) continue

      // Check if a check already exists for this month (monthly) or quarter (quarterly)
      const lastMonthStart = new Date()
      lastMonthStart.setDate(1)
      lastMonthStart.setHours(0, 0, 0, 0)

      let checkStartDate = lastMonthStart
      if (frequency === 'quarterly') {
        const currentQuarter = Math.floor(now.getMonth() / 3)
        checkStartDate = new Date(now.getFullYear(), currentQuarter * 3, 1)
        checkStartDate.setHours(0, 0, 0, 0)
      }

      // Check if checks already exist for this period
      for (const checkType of ['fire_door', 'smoke_alarm'] as const) {
        const { data: existing } = await supabase
          .from('tenant_self_checks')
          .select('id')
          .eq('tenancy_id', (tenancy as any).id)
          .eq('check_type', checkType)
          .gte('request_sent_at', checkStartDate.toISOString())
          .limit(1)

        if (existing && existing.length > 0) {
          console.log(`Check already exists for tenancy ${(tenancy as any).id}, type ${checkType}`)
          continue
        }

        // Create new check
        const { error: insertError } = await supabase
          .from('tenant_self_checks')
          .insert({
            tenancy_id: (tenancy as any).id,
            property_id: propertyId,
            room_id: roomId,
            check_type: checkType,
            frequency,
            request_sent_at: now.toISOString(),
          })

        if (insertError) {
          console.error(`Error creating check:`, insertError)
        } else {
          checksCreated.push({
            tenancy_id: (tenancy as any).id,
            check_type: checkType,
            room: (tenancy as any).rooms?.name,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      frequency,
      checks_created: checksCreated.length,
      checks: checksCreated,
    })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
