import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Review and accept/reject a data correction suggestion
 * POST /api/properties/data-corrections/review
 *
 * Body: { correction_id, action: 'accept' | 'reject', admin_notes?: string }
 * Returns: { success, correction }
 */

interface ReviewRequest {
  correction_id: string
  action: 'accept' | 'reject'
  admin_notes?: string
}

export async function POST(req: NextRequest) {
  try {
    const { correction_id, action, admin_notes } = (await req.json()) as ReviewRequest

    if (!correction_id || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing correction_id or invalid action' },
        { status: 400 }
      )
    }

    // Get auth token from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    // Create a Supabase client and set the auth token
    const supabaseClient = createClient()

    // Verify the token by getting the user
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user assignment
    const { data: assignment, error: assignmentError } = await supabaseClient
      .from('people')
      .select('*')
      .eq('email', authUser.email)
      .single()

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const user = { user: authUser, assignment }

    // Use service role for admin operations
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const supabase = createClient({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseKey: serviceKey
    })

    // Get the correction
    const { data: correction, error: fetchError } = await supabase
      .from('property_data_corrections')
      .select('*')
      .eq('id', correction_id)
      .single()

    if (fetchError || !correction) {
      return NextResponse.json({ error: 'Correction not found' }, { status: 404 })
    }

    if (action === 'accept') {
      // Update the property extended details with the accepted value
      const updateData: any = {
        [correction.field_name]: correction.suggested_value,
        manually_edited: false
      }

      // Special handling for bin days (they're separate fields)
      if (correction.field_name.startsWith('bin_')) {
        updateData.bin_schedule_last_fetched = new Date().toISOString()
      }

      // Special handling for GP fields
      if (correction.field_name.startsWith('nearest_gp_') || correction.field_name.startsWith('gp_')) {
        updateData.gp_data_last_fetched = new Date().toISOString()
      }

      // Special handling for valuation
      if (
        correction.field_name === 'single_let_rental_value' ||
        correction.field_name === 'hmo_total_value'
      ) {
        updateData.valuation_last_updated = new Date().toISOString()
      }

      console.log('Updating property extended details with:', updateData)
      const { error: updateError } = await supabase
        .from('property_extended_details')
        .update(updateData)
        .eq('property_id', correction.property_id)

      if (updateError) {
        console.error('Update error:', updateError, 'for property:', correction.property_id, 'with data:', updateData)
        return NextResponse.json(
          { error: 'Failed to update property details: ' + updateError.message },
          { status: 500 }
        )
      }
    }

    // Update correction status
    const { error: statusError } = await supabase
      .from('property_data_corrections')
      .update({
        status: action === 'accept' ? 'accepted' : 'rejected',
        reviewed_by: assignment.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: admin_notes || null
      })
      .eq('id', correction_id)

    if (statusError) {
      console.error('Status update error:', statusError)
      return NextResponse.json(
        { error: 'Failed to update correction status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Correction ${action === 'accept' ? 'accepted' : 'rejected'}`,
      correction_id,
      action
    })
  } catch (err) {
    console.error('Review error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
