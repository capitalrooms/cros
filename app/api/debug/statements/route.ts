import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Debug endpoint to check statements in database
 */
export async function GET() {
  try {
    // Use service role to bypass RLS
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Get ALL statements (bypassing RLS)
    const { data: allStatements, error: allError } = await adminSupabase
      .from('landlord_statements')
      .select('id, statement_reference, landlord_id, property_id, gross_rent, net_to_landlord, created_at')

    // Get landlords
    const { data: landlords, error: landlordError } = await adminSupabase
      .from('people')
      .select('id, email, role')
      .eq('role', 'landlord')

    // Get properties
    const { data: properties, error: propertyError } = await adminSupabase
      .from('properties')
      .select('id, name, address')
      .limit(5)

    return NextResponse.json({
      statements: {
        count: allStatements?.length || 0,
        data: allStatements?.slice(0, 3),
      },
      landlords: {
        count: landlords?.length || 0,
        data: landlords,
      },
      properties: {
        count: properties?.length || 0,
        data: properties,
      },
      errors: {
        statements: allError?.message,
        landlords: landlordError?.message,
        properties: propertyError?.message,
      },
    })
  } catch (error) {
    return NextResponse.json({
      error: String(error),
    }, { status: 500 })
  }
}
