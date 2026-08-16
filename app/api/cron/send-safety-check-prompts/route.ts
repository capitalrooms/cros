import { createClient } from '@/lib/supabase';
import { tenantCommsLive } from '@/lib/comms'
import { NextRequest, NextResponse } from 'next/server';

// This endpoint should be called by a cron job (e.g., daily)
// It will send safety check prompts to tenants as needed

export async function POST(request: NextRequest) {
  // Master switch: tenant/applicant messaging is paused until go-live.
  if (!tenantCommsLive()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'tenant_comms_paused' })
  }
  try {
    // Verify cron secret (if using external cron service)
    const cronSecret = request.headers.get('x-cron-secret');
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();

    // Get all active tenancies
    const { data: tenancies, error: tenanciesError } = await supabase
      .from('tenancies')
      .select(
        `
        id,
        tenant_id,
        room_id,
        property_id,
        start_date
      `
      )
      .or('end_date.is.null,end_date.gte.' + new Date().toISOString().split('T')[0]);

    if (tenanciesError) throw tenanciesError;

    if (!tenancies || tenancies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active tenancies found',
        checksCreated: 0,
      });
    }

    let checksCreated = 0;
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // For each tenancy, check if they need prompts
    for (const tenancy of tenancies) {
      try {
        // Check for last fire door check
        const { data: lastFireDoor } = await supabase
          .from('tenant_self_checks')
          .select('request_sent_at')
          .eq('tenancy_id', tenancy.id)
          .eq('check_type', 'fire_door')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single();

        // Create monthly fire door check if needed
        if (!lastFireDoor || new Date(lastFireDoor.request_sent_at) < oneMonthAgo) {
          await supabase.from('tenant_self_checks').insert({
            tenancy_id: tenancy.id,
            property_id: tenancy.property_id,
            room_id: tenancy.room_id,
            check_type: 'fire_door',
            frequency: 'monthly',
            request_sent_at: now.toISOString(),
          });

          checksCreated++;

          // Send notification to tenant
          await sendCheckNotification(supabase, tenancy.tenant_id, 'fire_door', 'monthly');
        }

        // Check for last smoke alarm check
        const { data: lastSmoke } = await supabase
          .from('tenant_self_checks')
          .select('request_sent_at')
          .eq('tenancy_id', tenancy.id)
          .eq('check_type', 'smoke_alarm')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single();

        // Create monthly smoke alarm check if needed
        if (!lastSmoke || new Date(lastSmoke.request_sent_at) < oneMonthAgo) {
          await supabase.from('tenant_self_checks').insert({
            tenancy_id: tenancy.id,
            property_id: tenancy.property_id,
            room_id: tenancy.room_id,
            check_type: 'smoke_alarm',
            frequency: 'monthly',
            request_sent_at: now.toISOString(),
          });

          checksCreated++;

          // Send notification to tenant
          await sendCheckNotification(supabase, tenancy.tenant_id, 'smoke_alarm', 'monthly');
        }

        // Create quarterly versions (send every 3 months with photo requirement)
        const { data: lastFireDoorQuarterly } = await supabase
          .from('tenant_self_checks')
          .select('request_sent_at')
          .eq('tenancy_id', tenancy.id)
          .eq('check_type', 'fire_door')
          .eq('frequency', 'quarterly')
          .order('request_sent_at', { ascending: false })
          .limit(1)
          .single();

        if (
          !lastFireDoorQuarterly ||
          new Date(lastFireDoorQuarterly.request_sent_at) < threeMonthsAgo
        ) {
          await supabase.from('tenant_self_checks').insert({
            tenancy_id: tenancy.id,
            property_id: tenancy.property_id,
            room_id: tenancy.room_id,
            check_type: 'fire_door',
            frequency: 'quarterly',
            request_sent_at: now.toISOString(),
          });

          checksCreated++;

          // Send notification to tenant
          await sendCheckNotification(supabase, tenancy.tenant_id, 'fire_door', 'quarterly');
        }
      } catch (error) {
        console.error(`Error processing tenancy ${tenancy.id}:`, error);
        // Continue processing other tenancies even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Safety check prompts created`,
      checksCreated,
      tenantsProcessed: tenancies.length,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Failed to create safety check prompts', details: String(error) },
      { status: 500 }
    );
  }
}

async function sendCheckNotification(
  supabase: any,
  tenantId: string,
  checkType: 'fire_door' | 'smoke_alarm',
  frequency: 'monthly' | 'quarterly'
) {
  try {
    // Get tenant's notification preferences
    const { data: person } = await supabase
      .from('people')
      .select('auth_id, notification_opt_in')
      .eq('id', tenantId)
      .single();

    if (!person || !person.notification_opt_in) {
      return; // Tenant hasn't opted in to notifications
    }

    // Create notification record
    const title =
      checkType === 'fire_door' ? '🚪 Fire Door Safety Check' : '🚨 Smoke Alarm Safety Check';
    const body =
      checkType === 'fire_door'
        ? 'Please check your fire door closes properly and latches securely.'
        : 'Please test your smoke alarm to confirm it\'s working.';

    const frequencyText = frequency === 'quarterly' ? ' (includes photo)' : '';

    await supabase.from('notifications').insert({
      user_id: person.auth_id,
      title,
      body: body + frequencyText,
      type: 'safety_check',
      link: '/tenant/safety-checks',
      read: false,
      created_at: new Date().toISOString(),
    });

    // Optionally send email (if tenant has email notifications enabled)
    const { data: notifSettings } = await supabase
      .from('notification_settings')
      .select('email_notifications')
      .eq('user_id', person.auth_id)
      .single();

    if (notifSettings?.email_notifications) {
      // Send email via your email service
      // This would integrate with SendGrid, Resend, etc.
      console.log(`Would send email to tenant ${tenantId} about ${checkType} check`);
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    // Don't throw - notification failures shouldn't block the cron job
  }
}
