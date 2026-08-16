import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { tenancyIds } = await request.json();

    const supabase = createClient();

    // If tenancyIds provided, generate checks for specific tenancies
    // Otherwise, generate for all active tenancies
    let tenancies;

    if (tenancyIds && Array.isArray(tenancyIds)) {
      const { data } = await supabase
        .from('tenancies')
        .select('id, tenant_id, room_id, property_id')
        .in('id', tenancyIds);
      tenancies = data;
    } else {
      // Get all active tenancies (where end_date is null or in future)
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('tenancies')
        .select('id, tenant_id, room_id, property_id')
        .or(`end_date.is.null,end_date.gte.${today}`);
      tenancies = data;
    }

    if (!tenancies || tenancies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active tenancies found',
        generated: 0,
      });
    }

    // Generate checks: alternating fire door and smoke alarm each month
    const now = new Date();
    const monthNumber = now.getMonth(); // 0-11
    const isFireDoorMonth = monthNumber % 2 === 0; // Even months = fire door

    const checkType = isFireDoorMonth ? 'fire_door' : 'smoke_alarm';
    const checks = tenancies.map((t: any) => ({
      tenancy_id: t.id,
      property_id: t.property_id,
      room_id: t.room_id,
      check_type: checkType,
      frequency: 'monthly',
      request_sent_at: now.toISOString(),
    }));

    // Insert checks, avoiding duplicates by checking if one already exists for this month
    const { data: inserted, error } = await supabase
      .from('tenant_self_checks')
      .insert(checks)
      .select('id');

    if (error && !error.message.includes('duplicate')) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${checks.length} ${checkType} checks`,
      generated: (inserted || []).length,
      checkType,
    });
  } catch (error) {
    console.error('Error generating safety checks:', error);
    return NextResponse.json(
      { error: 'Failed to generate checks: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
