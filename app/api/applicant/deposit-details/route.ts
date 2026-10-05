import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { agreedRent } from '@/lib/lettings/holdingDeposit'
import { oneWeekRent } from '@/lib/tenancy/deposit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


function buildRef(applicantName: string, roomName: string | null) {
  // e.g. "HARRY B · ROOM 5" → bank reference format
  const nameParts = applicantName.trim().split(/\s+/)
  const first = nameParts[0] || ''
  const lastInitial = nameParts[1] ? nameParts[1][0] : ''
  const roomPart = (roomName || '').replace(/[^0-9]/g, '') || '?'
  return `${first.toUpperCase()} ${lastInitial.toUpperCase()} ROOM ${roomPart}`.trim()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return Response.json({ error: 'Missing applicant ID' }, { status: 400 })

  const { data: applicant, error } = await supabase
    .from('applicants')
    .select('id, full_name, email, phone, room_id, property_id, rent_offer_type, offered_rent, pipeline_stage')
    .eq('id', id)
    .single()

  if (error || !applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 })

  // Fetch room + property
  let roomName = ''
  let propAddress = ''
  let propCode: string | null = null
  let monthly: number | null = null
  let weekly: number | null = null

  if (applicant.room_id) {
    const { data: room } = await supabase
      .from('rooms')
      .select('name, current_asking_rent, properties(address, name, property_code)')
      .eq('id', applicant.room_id)
      .single()

    if (room) {
      roomName = room.name || ''
      // the rent agreed on the offer, never the advert; one week = the legal holding-deposit cap
      const { data: offer } = await supabase.from('offers').select('advertised_rent').eq('applicant_id', applicant.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      monthly  = await agreedRent(supabase as any, applicant, offer as any)
      weekly   = monthly ? oneWeekRent(monthly) : null
      const prop = room.properties as any
      propAddress = prop?.address || prop?.name || ''
      propCode    = prop?.property_code || null
    }
  }

  const payRef = buildRef(applicant.full_name, roomName)

  return Response.json({
    applicantId:    applicant.id,
    fullName:       applicant.full_name,
    email:          applicant.email,
    roomId:         applicant.room_id,
    propertyId:     applicant.property_id,
    roomName,
    propAddress,
    monthly,
    weekly,
    payRef,
    pipelineStage:  applicant.pipeline_stage,
  })
}
