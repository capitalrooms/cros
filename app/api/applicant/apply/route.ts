import { createClient } from '@/lib/supabase'

export async function POST(request: Request) {
  const supabase = createClient()

  try {
    const data = await request.json()

    // Validate required fields
    if (!data.fullName || !data.email || !data.roomId) {
      return Response.json(
        { error: 'Missing required fields: fullName, email, roomId' },
        { status: 400 }
      )
    }

    // Insert applicant record
    const { data: applicant, error } = await supabase
      .from('applicants')
      .insert({
        full_name: data.fullName,
        email: data.email,
        phone: data.phone || null,
        date_of_birth: data.dateOfBirth || null,
        current_address: data.currentAddress || null,
        profession: data.profession || null,
        salary: data.salary || null,
        linkedin_url: data.linkedinUrl || null,
        preferred_start_date: data.preferredStartDate || null,
        preferred_term: data.preferredTerm || null,
        bio: data.bio || null,
        interests: data.interests || null,
        sociability: data.sociability || null,
        previous_addresses: data.previousAddresses || [],
        room_id: data.roomId,
        property_id: data.propertyId,
      })
      .select()

    if (error) {
      console.error('Error inserting applicant:', error)
      return Response.json(
        { error: 'Failed to submit application' },
        { status: 500 }
      )
    }

    return Response.json(
      {
        success: true,
        applicantId: applicant?.[0]?.id,
        message: 'Application submitted successfully',
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
