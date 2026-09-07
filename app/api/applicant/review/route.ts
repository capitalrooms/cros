import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// Service-role client — never exposed client-side
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'Missing applicant ID' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('applicants')
    .select('id, full_name, name, email, profession, bio, preferred_start_date, room_id, property_id, pipeline_stage, submitted_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Error fetching applicant:', error)
    return Response.json({ error: 'Could not find application' }, { status: 404 })
  }

  return Response.json(data)
}
