import { createClient } from '@supabase/supabase-js'
import { insertNotifications } from '@/lib/serverNotify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { applicantId, screenshotNote } = await request.json()

    if (!applicantId) return Response.json({ error: 'Missing applicantId' }, { status: 400 })

    // Fetch applicant to check they exist and get name/room
    const { data: applicant, error } = await supabase
      .from('applicants')
      .select('id, full_name, room_id, pipeline_stage, rooms(name)')
      .eq('id', applicantId)
      .single()

    if (error || !applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 })

    const roomName = (applicant.rooms as any)?.name || 'the room'
    const note = screenshotNote ? `Deposit self-confirmed by applicant. ${screenshotNote}` : 'Deposit self-confirmed by applicant via application portal.'

    // Advance to referencing stage (deposit confirmed = next step is referencing)
    const stageOrder = ['invited','applied','offer_sent','referencing','referencing_passed','docs_uploaded','converted']
    const currentIdx = stageOrder.indexOf(applicant.pipeline_stage)
    const referencingIdx = stageOrder.indexOf('referencing')
    const newStage = currentIdx < referencingIdx ? 'referencing' : applicant.pipeline_stage

    await supabase
      .from('applicants')
      .update({
        pipeline_stage: newStage,
        admin_notes:    note,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', applicantId)

    // Notify admin/lettings staff
    const { data: staff } = await supabase
      .from('people')
      .select('id')
      .in('role', ['administrator', 'admin', 'lettings'])

    if (staff && staff.length > 0) {
      await insertNotifications(supabase, staff.map((s: any) => s.id), {
        title: 'Holding deposit confirmed',
        body:  `${applicant.full_name} has confirmed their holding deposit for ${roomName}.`,
        type:  'lettings',
        link:  '/admin/applicants',
      })
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('confirm-deposit error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
