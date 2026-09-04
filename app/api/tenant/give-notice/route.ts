import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { FROM } from '@/lib/emailTemplate'

/** POST — tenant submits standard notice via portal
 *  Body: { tenancyId, personId, intendedMoveOutDate }
 *  Rules: move-out must be at least notice_period_months from today
 *         (fetched from the property; defaults to 2 months)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenancyId, personId, intendedMoveOutDate } = await req.json()
  if (!tenancyId || !intendedMoveOutDate) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch the tenancy + property notice period
  const { data: tenancy, error: fetchErr } = await supabase
    .from('tenancies')
    .select(`
      id, person_id, status, end_date,
      rooms(name),
      properties(id, address, notice_period_months)
    `)
    .eq('id', tenancyId)
    .maybeSingle()

  if (fetchErr || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  // Verify ownership (or admin override)
  const role = (user.assignment as any)?.role || ''
  const isAdmin = ['administrator', 'admin'].includes(role)
  if (!isAdmin && tenancy.person_id !== personId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Already on notice
  if (tenancy.status === 'on_notice') {
    return NextResponse.json({ error: 'Tenancy is already on notice' }, { status: 409 })
  }

  // Enforce minimum notice period
  const noticePeriodMonths = (tenancy.properties as any)?.notice_period_months ?? 2
  const today = new Date()
  const minMoveOut = new Date(today)
  minMoveOut.setMonth(minMoveOut.getMonth() + noticePeriodMonths)
  const proposed = new Date(intendedMoveOutDate)

  if (proposed < minMoveOut) {
    return NextResponse.json({
      error: `Move-out date must be at least ${noticePeriodMonths} month${noticePeriodMonths !== 1 ? 's' : ''} from today (earliest: ${minMoveOut.toISOString().split('T')[0]})`,
    }, { status: 422 })
  }

  // Record notice on tenancy
  const todayStr = today.toISOString().split('T')[0]
  const { error: updateErr } = await supabase
    .from('tenancies')
    .update({
      status: 'on_notice',
      notice_received_date: todayStr,
      end_date: intendedMoveOutDate,
    })
    .eq('id', tenancyId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Update room status
  const { data: roomData } = await supabase
    .from('tenancies')
    .select('room_id')
    .eq('id', tenancyId)
    .single()

  if (roomData?.room_id) {
    await supabase.from('rooms').update({ status: 'on_notice' }).eq('id', roomData.room_id)
  }

  // Notify admin by email
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@capitalrooms.co.uk'
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const roomName = (tenancy.rooms as any)?.name || 'a room'
    const propertyAddress = (tenancy.properties as any)?.address || ''
    const moveOutFormatted = new Date(intendedMoveOutDate).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: adminEmail,
        subject: `Notice given — ${roomName}, ${propertyAddress}`,
        html: `<p>A tenant has submitted notice via the portal.</p>
          <ul>
            <li><strong>Room:</strong> ${roomName}, ${propertyAddress}</li>
            <li><strong>Notice given:</strong> ${todayStr}</li>
            <li><strong>Intended move-out:</strong> ${moveOutFormatted}</li>
          </ul>
          <p>Please review in <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'}/admin/tenancy-management">Tenancy Management</a> and send the checkout email once you have confirmed the pro-rata rent.</p>`,
      }),
    }).catch(e => console.error('Admin notify failed:', e))
  }

  return NextResponse.json({ ok: true, noticeReceivedDate: todayStr, moveOutDate: intendedMoveOutDate })
}
