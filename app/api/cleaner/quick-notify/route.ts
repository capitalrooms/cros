import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const { property_id, subject, message, notification_type } = await request.json()

    // Validate input
    if (!property_id || !subject || !message) {
      return Response.json(
        { error: 'Missing required fields: property_id, subject, message' },
        { status: 400 }
      )
    }

    // Get cookies for session
    const cookieStore = await cookies()

    // Create Supabase client with cookies for auth session
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Cookie: cookieStore.toString() } },
        auth: { persistSession: false }
      }
    )

    // Get current user from Supabase auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user assignment from people table
    const { data: assignment } = await supabase
      .from('people')
      .select('id, full_name, role')
      .eq('email', user.email)
      .single()

    if (!assignment || !assignment.id) {
      return Response.json({ error: 'User assignment not found' }, { status: 401 })
    }

    // Verify user is a cleaner
    if (assignment.role !== 'cleaner') {
      return Response.json({ error: 'Only cleaners can use this endpoint' }, { status: 403 })
    }

    // Get property
    const { data: property } = await supabase
      .from('properties')
      .select('id, name')
      .eq('id', property_id)
      .single()

    if (!property) {
      return Response.json({ error: 'Property not found' }, { status: 404 })
    }

    // Get all active tenancies for this property
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('id, tenant_id, people(id, email, opt_in_notifications)')
      .eq('property_id', property_id)
      .is('end_date', null) // Only active tenancies

    if (!tenancies || tenancies.length === 0) {
      return Response.json({ error: 'No active tenants found for this property' }, { status: 404 })
    }

    // Create notification record for each tenant
    const notifications = tenancies.map((tenancy: any) => ({
      tenant_id: tenancy.tenant_id,
      property_id: property_id,
      notification_type: 'cleaner_update',
      category: notification_type || 'general',
      subject,
      message,
      created_by: assignment.id,
      created_at: new Date().toISOString()
    }))

    // Insert notifications
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications)

    if (insertError) {
      console.error('Error inserting notifications:', insertError)
      return Response.json({ error: 'Failed to send notifications' }, { status: 500 })
    }

    // Trigger push notifications for opted-in tenants
    const optedInTenants = tenancies
      .map((t: any) => t.people)
      .filter((p: any) => p?.opt_in_notifications === true)

    if (optedInTenants.length > 0) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: optedInTenants.map((p: any) => p.id),
            title: subject,
            body: message,
            data: {
              property_id: property_id,
              notification_type: 'cleaner_update'
            }
          })
        })
      } catch (err) {
        console.error('Error sending push notifications:', err)
        // Don't fail the whole request if push notifications fail
      }
    }

    return Response.json({
      success: true,
      message: `Notification sent to ${tenancies.length} tenant(s)`,
      tenant_count: tenancies.length
    })
  } catch (error) {
    console.error('Error in /api/cleaner/quick-notify:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
