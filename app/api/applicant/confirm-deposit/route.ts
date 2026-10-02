import { createClient } from '@supabase/supabase-js'
import { insertNotifications, tryPush } from '@/lib/serverNotify'
import { STAFF_ROLES } from '@/lib/portalAuth'

// The applicant's "I've paid the holding deposit" button on /applicant/reserve (the link in our reserve email
// carries their applicant id). It's their word, not a bank check: the offer is marked 'deposit_claimed' and the
// team is told there's a new reservation to check. Staff then press "Holding deposit received", which records it
// and tells the landlord and housemates (app/api/lettings/holding-deposit).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { applicantId, screenshotNote } = await request.json()

    if (!applicantId) return Response.json({ error: 'Missing applicantId' }, { status: 400 })

    const { data: applicant, error } = await supabase
      .from('applicants')
      .select('id, full_name, email, room_id, pipeline_stage, admin_notes, offer_id, rooms(name, properties(name))')
      .eq('id', applicantId)
      .single()

    if (error || !applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 })

    // The offer they came through (linked, else latest for their email and room)
    let offer: { id: string; status: string | null } | null = null
    if (applicant.offer_id) ({ data: offer } = await supabase.from('offers').select('id, status').eq('id', applicant.offer_id).maybeSingle())
    if (!offer && applicant.email) {
      ({ data: offer } = await supabase.from('offers').select('id, status')
        .eq('room_id', applicant.room_id).ilike('applicant_email', applicant.email)
        .order('created_at', { ascending: false }).limit(1).maybeSingle())
    }
    // Pressed twice, or already checked by us — nothing more to do
    if (offer?.status === 'deposit_claimed' || offer?.status === 'deposit_paid') return Response.json({ success: true, already: true })

    const room = applicant.rooms as any
    const roomLabel = [room?.name, room?.properties?.name].filter(Boolean).join(', ') || 'the room'
    const extra = typeof screenshotNote === 'string' ? screenshotNote.slice(0, 300).trim() : ''
    const note = `${new Date().toLocaleDateString('en-GB')}: applicant says they've paid the holding deposit${extra ? ` — "${extra}"` : ''}.`

    // Advance to referencing stage (deposit sent = next step is referencing); keep earlier notes
    const stageOrder = ['invited','applied','offer_sent','referencing','referencing_passed','docs_uploaded','converted']
    const currentIdx = stageOrder.indexOf(applicant.pipeline_stage)
    const referencingIdx = stageOrder.indexOf('referencing')
    const newStage = currentIdx < referencingIdx ? 'referencing' : applicant.pipeline_stage

    await supabase
      .from('applicants')
      .update({
        pipeline_stage: newStage,
        admin_notes:    [applicant.admin_notes, note].filter(Boolean).join('\n'),
        updated_at:     new Date().toISOString(),
      })
      .eq('id', applicantId)
    if (offer) await supabase.from('offers').update({ status: 'deposit_claimed', updated_at: new Date().toISOString() }).eq('id', offer.id)

    // Tell the office and lettings team — notification bell and push
    const { data: staff } = await supabase.from('people').select('id').in('role', STAFF_ROLES)
    const ids = (staff ?? []).map((s: any) => s.id)
    if (ids.length > 0) {
      const title = '🔑 New reservation'
      const body = `${applicant.full_name} says they've paid the holding deposit for ${roomLabel}. Check the bank, then press “Holding deposit received”.${extra ? ` Their note: ${extra}` : ''}`
      await insertNotifications(supabase, ids, { title, body, type: 'lettings', link: '/admin/applicants' }, { roomId: applicant.room_id })
      await tryPush(ids, title, body, '/admin/applicants')
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('confirm-deposit error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
