import { createClient } from '@/lib/supabase';
import { getCommsLive } from '@/lib/comms'
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!await getCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  try {
    const { ticketId, hasReturnVisit, returnVisitDate } = await request.json();

    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId required' }, { status: 400 });
    }

    const supabase = createClient();

    // Get job details
    const { data: ticket } = await supabase
      .from('maintenance_tickets')
      .select(
        `
        id,
        title,
        property_id,
        room_id,
        return_visit_reason,
        return_visit_date_estimate,
        properties(name, id),
        rooms(name)
      `
      )
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Get property tenants
    const { data: tenancies } = await supabase
      .from('tenancies')
      .select('tenant_id, tenant:tenant_id(id, auth_id)')
      .eq('property_id', ticket.property_id);

    if (!tenancies) {
      return NextResponse.json({
        success: true,
        message: 'No tenants to notify',
      });
    }

    // Prepare notification message
    let title = '✅ Work Complete';
    let body = `${ticket.title} at ${ticket.properties?.name} is now complete.`;

    if (hasReturnVisit && returnVisitDate) {
      body = `${ticket.title} is complete, but we need a follow-up visit on ${new Date(
        returnVisitDate
      ).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}. We'll be in touch to book it.`;
    } else if (hasReturnVisit) {
      body = `${ticket.title} is complete, but we need a follow-up visit. We'll be in touch to book it.`;
    }

    // Send notifications to all tenants (via canonical notifications table schema).
    // Note: people.id (not auth.uid) is what notifications.user_id references.
    const notifications = tenancies
      .filter((t) => t.people?.id) // filter out any without a valid person record
      .map((t) => ({
        user_id: t.people!.id, // FK to people(id), not auth.uid
        title,
        body,
        type: 'job_complete',
        link: `/tenant`,
        read: false,
      }));

    if (notifications.length > 0) {
      const { error: notifyError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifyError) {
        console.error('Failed to send notifications:', notifyError);
        // Non-blocking error - continue
      }
    }

    // Optional: Send push notifications if opt-in
    for (const tenancy of tenancies) {
      if (!tenancy.tenant?.auth_id) continue;

      // Check notification preference
      const { data: notifSettings } = await supabase
        .from('notification_settings')
        .select('push_notifications, email_notifications')
        .eq('user_id', tenancy.tenant.auth_id)
        .single();

      if (notifSettings?.push_notifications) {
        // Send push notification (would integrate with web push service)
        // Example: sendWebPush(tenancy.tenant.auth_id, title, body);
        console.log(`Push notification queued for ${tenancy.tenant.auth_id}`);
      }

      if (notifSettings?.email_notifications) {
        // Send email notification (would integrate with email service)
        // Example: sendEmail(tenancy.tenant.email, title, body);
        console.log(`Email notification queued for ${tenancy.tenant.auth_id}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Notifications sent',
      notificationsSent: notifications.length,
    });
  } catch (error) {
    console.error('Error in notify-job-complete:', error);
    // Non-blocking error
    return NextResponse.json({
      success: true,
      message: 'Job completed (notification delivery failed)',
    });
  }
}
