import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const applicantId = searchParams.get('applicantId')

  if (!applicantId) {
    return NextResponse.json({ error: 'Missing applicantId' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('applicants')
    .select('id, full_name, first_name, email, profession, preferred_start_date, bio, pipeline_stage, submitted_at, room_id, property_id, rooms(name), properties(name, address)')
    .eq('id', applicantId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  return NextResponse.json({ applicant: data })
}
