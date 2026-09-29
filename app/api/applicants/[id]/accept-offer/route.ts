import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/serverAuth'
import { createServerClient } from '@/lib/supabase'
import { senderFields } from '@/lib/email/sender'
import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { oneWeekRent } from '@/lib/tenancy/deposit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'
const ACCOUNT_NAME = 'Capital Rooms Ltd'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}



export async function POST(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const serverClient = await createServerClient()
  const user = await getCurrentUser(serverClient)
  const role = (user?.assignment as any)?.role || ''
  if (!user || !['administrator', 'admin', 'lettings'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const applicantId = params.id

  // Load applicant + room + property
  const { data: applicant, error: aErr } = await supabase
    .from('applicants')
    .select('id, full_name, email, phone, room_id, property_id, pipeline_stage, rooms(id, name, current_asking_rent, properties(name, address, property_code))')
    .eq('id', applicantId)
    .single()

  if (aErr || !applicant) {
    return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
  }

  const room = (applicant.rooms as any)
  const property = room?.properties
  const monthly = room?.current_asking_rent || 0
  const weekly = weeklyRent(monthly)
  const payRef = holdingDepositRef(property?.name || property?.address || null, room?.name || null)
  const firstName = applicant.full_name?.split(' ')[0] || 'there'
  const roomName = room?.name || 'the room'
  const propAddress = property?.address || property?.name || ''
  const reserveUrl = `${APP_URL}/applicant/reserve?roomId=${applicant.room_id}&propertyId=${applicant.property_id}`

  // the same "search is over" email as Send Offer Letter — one version everywhere
  const html = await buildSearchIsOverEmail({
    applicantName: firstName, roomName, propertyAddress: propAddress, propertyCity: 'London',
    advertisedRent: Number(monthly), applicationUrl: reserveUrl, holdingDeposit: oneWeekRent(Number(monthly)), holdingRef: payRef,
  }, request)

  const subject = `Your offer has been accepted — secure ${roomName} now`

  // Send email
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const emailRes = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(await senderFields(request)), to: [applicant.email], subject, html }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  // Advance pipeline stage to offer_sent
  await supabase
    .from('applicants')
    .update({ pipeline_stage: 'offer_sent', updated_at: new Date().toISOString() })
    .eq('id', applicantId)

  return NextResponse.json({ success: true, emailSent: applicant.email, reserveUrl })
}
