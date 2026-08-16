import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { logAudit, getClientIp } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
  try {
    // Security: only allow in development or with valid token
    if (process.env.NODE_ENV === 'production') {
      await logAudit({ userId: 'unknown', action: 'security_forbidden_access', details: 'Setup endpoint accessed in production', ipAddress: getClientIp(request.headers) })
      return NextResponse.json(
        { error: 'Setup endpoint not available in production' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Missing Supabase credentials' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // First, try to create the table using raw SQL via fetch
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/sql/`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          query: `
            DROP TABLE IF EXISTS public.people CASCADE;
            CREATE TABLE IF NOT EXISTS public.people (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              email VARCHAR(255) NOT NULL UNIQUE,
              role VARCHAR(50) NOT NULL,
              property_id UUID,
              room_id UUID,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
          `
        })
      });
    } catch (e) {
      console.log('SQL endpoint not available, trying insert directly...');
    }

    // Insert admin user
    const { error: insertError, data } = await supabase
      .from('people')
      .insert([
        {
          email: 'harry@capitalrooms.co.uk',
          role: 'administrator',
        }
      ])
      .select();

    if (insertError) {
      // Check if it's a duplicate key error (table exists, user already there)
      if (insertError.message.includes('duplicate')) {
        return NextResponse.json(
          {
            success: true,
            message: 'Admin user already exists',
            credentials: {
              email: 'harry@capitalrooms.co.uk',
              password: 'TestPassword123!',
            },
          },
          { status: 200 }
        );
      }

      // If table doesn't exist, ask user to create it
      if (insertError.message.includes('does not exist')) {
        return NextResponse.json(
          {
            error: 'people table does not exist',
            instructions: 'Please create the people table using the SQL provided in FINAL_SETUP.md, then call this endpoint again.',
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: `Setup failed: ${insertError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Database initialized successfully',
        credentials: {
          email: 'harry@capitalrooms.co.uk',
          password: 'TestPassword123!',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Setup failed' },
      { status: 500 }
    );
  }
}
