import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.assignment?.role !== 'lettings') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { viewing_date, viewing_slot, visitor_name } = await request.json();

    const supabase = createClient();

    // Get the original viewing to check if date/time changed
    const { data: originalViewing } = await supabase
      .from('viewings')
      .select('viewing_date, viewing_slot')
      .eq('id', params.id)
      .single();

    // Update the viewing
    const { data, error } = await supabase
      .from('viewings')
      .update({
        viewing_date,
        viewing_slot,
        visitor_name,
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If date or time changed, trigger notification
    const dateChanged = originalViewing?.viewing_date !== viewing_date;
    const timeChanged = originalViewing?.viewing_slot !== viewing_slot;

    if (dateChanged || timeChanged) {
      // TODO: Send notification to relevant parties about the reschedule
      // This could include email to tenant, landlord, or system notification
      console.log(`Viewing ${params.id} rescheduled. Date changed: ${dateChanged}, Time changed: ${timeChanged}`);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating viewing:', error);
    return NextResponse.json(
      { error: 'Failed to update viewing' },
      { status: 500 }
    );
  }
}
