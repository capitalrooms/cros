import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    const role = user?.assignment?.role;
    if (!user || !['lettings', 'administrator', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      viewing_date,
      viewing_slot,
      visitor_name,
      visitor_email,
      visitor_phone,
      feedback,
    } = body;

    const supabase = createClient();

    // Get the original viewing to detect date/time changes
    const { data: originalViewing } = await supabase
      .from('viewings')
      .select('viewing_date, viewing_slot')
      .eq('id', params.id)
      .single();

    // Build an update from only the fields that were supplied
    const update: Record<string, unknown> = {};
    if (viewing_date !== undefined) update.viewing_date = viewing_date;
    if (viewing_slot !== undefined) update.viewing_slot = viewing_slot || null;
    if (visitor_name !== undefined) update.visitor_name = visitor_name || null;
    if (visitor_email !== undefined) update.visitor_email = visitor_email || null;
    if (visitor_phone !== undefined) update.visitor_phone = visitor_phone || null;
    if (feedback !== undefined) update.feedback = feedback || null;

    const { data, error } = await supabase
      .from('viewings')
      .update(update)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const dateChanged =
      viewing_date !== undefined && originalViewing?.viewing_date !== viewing_date;
    const timeChanged =
      viewing_slot !== undefined && originalViewing?.viewing_slot !== viewing_slot;

    return NextResponse.json({ ...data, rescheduled: dateChanged || timeChanged });
  } catch (error) {
    console.error('Error updating viewing:', error);
    return NextResponse.json(
      { error: 'Failed to update viewing' },
      { status: 500 }
    );
  }
}
