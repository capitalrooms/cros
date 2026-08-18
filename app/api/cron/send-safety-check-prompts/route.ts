import { createServiceClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Cron job: Send monthly/quarterly fire door and smoke alarm checks to tenants
 * Triggered daily or on-demand; creates new tenant_self_checks entries for due checks
 */

const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Trusted cron route: service client bypasses RLS (no user session here).
  const supabase = createServiceClient()

  try {
    // Get all active tenancies
    const { data: tenancies, error: tenanciesError } = await supabase
      .from('tenancies')
      .select('id, person_id, room_id, property_id, start_date')
      .or('end_date.is.null,end_date.gte.now()')

    if (tenanciesError) throw tenanciesError
    if (!tenancies || tenancies.length === 0) {
      return NextResponse.json({ message: 'No active tenancies', processed: 0 })
    }

    let created = 0
    const today = new Date().toISOString().split('T')[0]

    for (const tenancy of tenancies) {
      // Check: Monthly fire door check (every month from start_date)
      const monthlyFireDoorCheck = await supabase
        .from('tenant_self_checks')
        .select('id')
        .eq('tenancy_id', tenancy.id)
        .eq('check_type', 'fire_door')
        .eq('frequency', 'monthly')
        .gte('request_sent_at', `${today}T00:00:00Z`)
        .lt('request_sent_at', `${today}T23:59:59Z`)
        .single()

      if (!monthlyFireDoorCheck.data) {
        // Check if last check was > 30 days ago
        const { data: lastCheck } = await supabase
          .from('tenant_self_checks')
          .select('request_sent_at')
          .eq('tenancy_id', tenancy.id)
          .eq('check_type', 'fire_door')
          .eq('frequency', 'monthly')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single()

        const lastCheckDate = lastCheck ? new Date(lastCheck.request_sent_at) : new Date(tenancy.start_date)
        const daysSince = (new Date().getTime() - lastCheckDate.getTime()) / (1000 * 60 * 60 * 24)

        if (daysSince >= 30) {
          await supabase.from('tenant_self_checks').insert({
            tenancy_id: tenancy.id,
            property_id: tenancy.property_id,
            room_id: tenancy.room_id,
            check_type: 'fire_door',
            frequency: 'monthly',
            request_sent_at: new Date().toISOString(),
            response_received_at: null,
            tenant_response: null,
          })
          created++
        }
      }

      // Check: Quarterly smoke alarm check
      const quarterlyCheck = await supabase
        .from('tenant_self_checks')
        .select('id')
        .eq('tenancy_id', tenancy.id)
        .eq('check_type', 'smoke_alarm')
        .eq('frequency', 'quarterly')
        .gte('request_sent_at', `${today}T00:00:00Z`)
        .lt('request_sent_at', `${today}T23:59:59Z`)
        .single()

      if (!quarterlyCheck.data) {
        // Check if last check was > 90 days ago
        const { data: lastCheck } = await supabase
          .from('tenant_self_checks')
          .select('request_sent_at')
          .eq('tenancy_id', tenancy.id)
          .eq('check_type', 'smoke_alarm')
          .eq('frequency', 'quarterly')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single()

        const lastCheckDate = lastCheck ? new Date(lastCheck.request_sent_at) : new Date(tenancy.start_date)
        const daysSince = (new Date().getTime() - lastCheckDate.getTime()) / (1000 * 60 * 60 * 24)

        if (daysSince >= 90) {
          await supabase.from('tenant_self_checks').insert({
            tenancy_id: tenancy.id,
            property_id: tenancy.property_id,
            room_id: tenancy.room_id,
            check_type: 'smoke_alarm',
            frequency: 'quarterly',
            request_sent_at: new Date().toISOString(),
            response_received_at: null,
            tenant_response: null,
          })
          created++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${created} safety check prompts`,
      processed: tenancies.length,
      created,
    })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
