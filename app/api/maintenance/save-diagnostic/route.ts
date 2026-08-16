import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      tenant_id,
      tenancy_id,
      property_id,
      room_id,
      category,
      initial_description,
      ai_questions,
      user_answers,
      ai_recommendation,
      ai_guidance,
      user_choice,
    } = await request.json();

    // Validate required fields
    if (!tenant_id || !property_id || !category || !initial_description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Insert into maintenance_diagnostic_attempts table
    const { data, error } = await supabase
      .from('maintenance_diagnostic_attempts')
      .insert([
        {
          tenant_id,
          tenancy_id,
          property_id,
          room_id,
          category,
          initial_description,
          ai_questions,
          user_answers,
          ai_recommendation,
          ai_guidance,
          user_choice,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save diagnostic' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: data?.id,
      message: 'Diagnostic saved successfully'
    });
  } catch (error) {
    console.error('Error saving diagnostic:', error);
    return NextResponse.json(
      { error: 'Failed to save diagnostic' },
      { status: 500 }
    );
  }
}
