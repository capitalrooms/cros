import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'

/**
 * Check and report on landlord statements
 * This endpoint is for the authenticated landlord to verify their statements
 */
export async function GET() {
  try {
    const userData = await getCurrentUser()
    if (!userData || userData.assignment?.role !== 'landlord') {
      return NextResponse.json(
        { error: 'Not authenticated as landlord' },
        { status: 401 }
      )
    }

    const supabase = createClient()
    const landlordId = (userData.assignment as any).id

    // Get all statements for this landlord
    const { data: statements, error } = await supabase
      .from('landlord_statements')
      .select(
        `
        id,
        statement_reference,
        statement_date,
        period_start,
        period_end,
        gross_rent,
        management_fees,
        property_charges,
        net_to_landlord,
        properties(name, address)
      `
      )
      .eq('landlord_id', landlordId)
      .order('statement_date', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      )
    }

    // Calculate statistics
    const stats = {
      total_count: statements?.length || 0,
      total_gross_rent: statements?.reduce((sum, s) => sum + parseFloat(s.gross_rent || 0), 0) || 0,
      total_management_fees: statements?.reduce((sum, s) => sum + parseFloat(s.management_fees || 0), 0) || 0,
      total_property_charges: statements?.reduce((sum, s) => sum + parseFloat(s.property_charges || 0), 0) || 0,
      total_net_to_landlord: statements?.reduce((sum, s) => sum + parseFloat(s.net_to_landlord || 0), 0) || 0,
    }

    return NextResponse.json({
      success: true,
      landlord_id: landlordId,
      statistics: stats,
      statements: statements || [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
