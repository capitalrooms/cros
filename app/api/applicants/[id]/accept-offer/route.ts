import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { hiName, personFromText } from '@/lib/people'
import { deliverEmail } from '@/lib/sendEmail'
import { oneLine } from '@/lib/lettings/letWording'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/serverAuth'
import { createServerClient } from '@/lib/supabase'

import { holdingDepositRef } from '@/lib/offers/holdingRef'
import { buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { oneWeekRent } from '@/lib/tenancy/deposit'
import { loadDepositContext } from '@/lib/lettings/holdingDeposit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'
const ACCOUNT_NAME = 'Capital Rooms Ltd'

// (weekly rent = lib/tenancy/deposit oneWeekRent, to the penny — the old local version rounded to whole pounds)



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
    .select('id, full_name, salutation, first_name, last_name, email, phone, room_id, property_id, pipeline_stage, rooms(id, name, current_asking_rent, properties(name, address, property_code))')
    .eq('id', applicantId)
    .single()

  if (aErr || !applicant) {
    return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
  }

  const room = (applicant.rooms as any)
  const property = room?.properties
  // the rent agreed on the offer (lib/lettings/holdingDeposit agreedRent) — never the advertised rent
  const ctx = await loadDepositContext(supabase as any, applicantId)
  // the agreed rent (lib/lettings/holdingDeposit agreedRent); when there is genuinely none on file the screen asks
  // you for it — never a dead end that sends them back to the application form (15 Oct 2026)
  const body = await request.json().catch(() => ({}))
  const typed = Number(body?.rent) > 0 && Number(body.rent) < 100000 ? Math.round(Number(body.rent) * 100) / 100 : null
  const monthly = ctx?.rent ?? typed ?? 0
  if (!monthly) return NextResponse.json({ error: 'What monthly rent has been agreed?', needRent: true }, { status: 409 })
  const weekly = oneWeekRent(monthly)
  const payRef = holdingDepositRef(property?.name || property?.address || null, room?.name || null)
  const firstName = hiName((applicant as any).first_name ? applicant as any : personFromText(applicant.full_name))   // lib/people
  const roomName = room?.name || 'the room'
  const propAddress = oneLine(property?.address || property?.name)
  const whole = !!ctx?.whole   // a whole house or flat — property words (lib/lettings/letWording)
  const reserveUrl = `${APP_URL}/applicant/reserve?roomId=${applicant.room_id}&propertyId=${applicant.property_id}&a=${applicant.id}`

  // the same "search is over" email as Send Offer Letter — one version everywhere
  const html = await buildSearchIsOverEmail({
    applicantName: firstName, roomName, propertyAddress: propAddress, propertyCity: 'London',
    advertisedRent: Number(monthly), applicationUrl: reserveUrl, holdingDeposit: oneWeekRent(Number(monthly)), holdingRef: payRef, whole,
    // what they asked for on their offer — never a minimum term (Harry, 17 Oct 2026)
    moveInDate: ctx?.startDate ?? null, term: ctx?.applicant?.preferred_term ?? null, billsIncluded: ctx?.billsIncluded ?? null,
  }, request)

  const subject = oneLine(`Your offer has been accepted — secure ${whole ? 'the property' : roomName} now`)

  // Send email
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const emailRes = await deliverEmail({ to: [applicant.email], subject, html }, { req: request })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    console.error('Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  // Pin the rent we've just quoted on an offer record, so the reserve page and the holding deposit always use this
  // figure — even if the room's advert changes later
  let offerId = ctx?.offerId ?? null
  if (!offerId) {
    const { data: o } = await supabase.from('offers').insert({
      room_id: applicant.room_id, property_id: applicant.property_id, applicant_email: applicant.email,
      applicant_name: applicant.full_name || null, advertised_rent: monthly, request_deposit: true,
      application_token: randomBytes(32).toString('hex'), token_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      applicant_id: applicant.id, status: 'sent', sent_at: new Date().toISOString(),
    }).select('id').single()
    offerId = (o as any)?.id ?? null
  } else if (!(ctx?.rent) && typed) {
    await supabase.from('offers').update({ advertised_rent: typed }).eq('id', offerId)
  }

  // Advance pipeline stage to offer_sent
  await supabase
    .from('applicants')
    .update({ pipeline_stage: 'offer_sent', ...(offerId ? { offer_id: offerId } : {}), updated_at: new Date().toISOString() })
    .eq('id', applicantId)

  return NextResponse.json({ success: true, emailSent: applicant.email, reserveUrl })
}
