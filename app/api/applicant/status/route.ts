import { createServiceClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const applicantId = searchParams.get('id')

  if (!applicantId) {
    return Response.json({ error: 'Missing applicant ID' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('applicants')
    .select('id, full_name, email, room_id, property_id, status, submitted_at')
    .eq('id', applicantId)
    .single()

  if (error || !data) {
    return Response.json({ error: 'Application not found' }, { status: 404 })
  }

  return Response.json(data)
}
