import { createClient } from '@/lib/supabase'
import { buildOfferLetterEmail, buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { randomBytes } from 'crypto'

export async function POST(request: Request) {
  const supabase = createClient()

  try {
    const data = await request.json()

    // Validate required fields
    if (!data.roomId || !data.propertyId || !data.applicantEmail) {
      return Response.json(
        { error: 'Missing required fields: roomId, propertyId, applicantEmail' },
        { status: 400 }
      )
    }

    // Fetch room and property details for the email
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name, property_id')
      .eq('id', data.roomId)
      .single()

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, name, address')
      .eq('id', data.propertyId)
      .single()

    // Generate unique token for this applicant
    const applicationToken = randomBytes(32).toString('hex')
    const tokenExpiresAt = new Date()
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30) // Token valid for 30 days

    // Store room and property data for email building
    const selectedRoomData = roomData
    const selectedProperty = propertyData

    // Try to create the offer record
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        room_id: data.roomId,
        property_id: data.propertyId,
        applicant_email: data.applicantEmail,
        applicant_name: data.applicantName || null,
        advertised_rent: data.advertisedRent || null,
        move_in_date: data.moveInDate || null,
        request_deposit: data.requestDeposit || false,
        application_token: applicationToken,
        token_expires_at: tokenExpiresAt.toISOString(),
        sent_by: data.userId || null,
      })
      .select()

    if (offerError) {
      console.error('Error creating offer:', offerError)
      // Check if it's an auth/RLS error
      if (offerError.code === 'PGRST301' || offerError.code === '42501') {
        return Response.json(
          { error: 'Unauthorized - insufficient permissions' },
          { status: 403 }
        )
      }
      return Response.json(
        { error: 'Failed to create offer' },
        { status: 500 }
      )
    }

    // Generate application link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const applicationUrl = `${appUrl}/applicant/apply?token=${applicationToken}&roomId=${data.roomId}&propertyId=${data.propertyId}`

    // Prepare email based on whether we're requesting a deposit
    const holdingDeposit = data.advertisedRent ? (data.advertisedRent / 4.33) : 0

    let emailHtml: string
    if (data.requestDeposit) {
      // Option 2: "THE SEARCH IS OVER!" - ready to move forward with deposit
      emailHtml = buildSearchIsOverEmail({
        applicantName: data.applicantName,
        roomName: selectedRoomData?.name || 'Room',
        propertyAddress: selectedProperty?.address || '',
        propertyCity: selectedProperty?.name || 'London',
        advertisedRent: data.advertisedRent,
        moveInDate: data.moveInDate,
        applicationUrl,
        holdingDeposit,
      })
    } else {
      // Option 1: Standard offer letter - invite to apply
      emailHtml = buildOfferLetterEmail({
        applicantName: data.applicantName,
        roomName: selectedRoomData?.name || 'Room',
        propertyAddress: selectedProperty?.address || '',
        propertyCity: selectedProperty?.name || 'London',
        advertisedRent: data.advertisedRent,
        moveInDate: data.moveInDate,
        applicationUrl,
        holdingDeposit,
      })
    }

    console.log(`[EMAIL] Sending ${data.requestDeposit ? 'Search is Over' : 'Offer Letter'} to ${data.applicantEmail}`)
    console.log(`[EMAIL] Applicant: ${data.applicantName || 'N/A'}`)
    console.log(`[EMAIL] Room: ${selectedRoomData?.name}, Rent: £${data.advertisedRent}`)
    if (data.requestDeposit) {
      console.log(`[EMAIL] Holding deposit: £${holdingDeposit.toFixed(2)}`)
    }

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // For now, just log the HTML. In production, send via email API.
    // console.log('[EMAIL HTML]', emailHtml.substring(0, 200) + '...')

    return Response.json(
      {
        success: true,
        offerId: offer?.[0]?.id,
        applicationUrl,
        message: `Offer sent to ${data.applicantEmail}`,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Error:', err)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
