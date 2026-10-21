import { NextRequest, NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { createServiceClient, createServerClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/serverAuth'
import { alertLettingsRoomUp } from '@/lib/lettings/roomAlert'
import { buildEmail } from '@/lib/emailWrapper'

import { oneLine } from '@/lib/lettings/letWording'

/** POST — tenant submits standard notice via portal
 *  Body: { tenancyId, personId, intendedMoveOutDate }
 *  Rules: move-out must be at least notice_period_months from today
 *         (fetched from the property; defaults to 2 months)
 */
export async function POST(req: NextRequest) {
  const serverClient = await createServerClient()
  const user = await getCurrentUser(serverClient)
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
      id, person_id, co_tenant_id, notice_received_date, end_date,
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
  const me = (user.assignment as any)?.id as string | undefined   // the signed-in person — never an id sent in the request
  const mine = !!me && (tenancy.person_id === me || (tenancy as any).co_tenant_id === me)
  const isAdmin = ['administrator', 'admin'].includes(role)
  if (!isAdmin && !mine) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Already on notice
  if (tenancy.notice_received_date) {
    return NextResponse.json({ error: 'Tenancy is already on notice' }, { status: 409 })
  }

  // Enforce minimum notice period
  // whole days in UK time (21 Oct 2026 audit: the earliest date the screen offered was refused — it was compared with
  // "two months from this minute"). Every tenancy is periodic (Renters' Rights Act): two months' notice, any time.
  const noticePeriodMonths = 2
  const today = new Date()
  const ukToday = today.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const m = new Date(`${ukToday}T12:00:00Z`); m.setUTCMonth(m.getUTCMonth() + noticePeriodMonths)
  const earliest = m.toISOString().slice(0, 10)
  const proposedDay = String(intendedMoveOutDate).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDay)) return NextResponse.json({ error: 'Choose a move-out date' }, { status: 400 })
  if (proposedDay < earliest) {
    const nice = new Date(`${earliest}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    return NextResponse.json({
      error: `Please give at least 2 months’ notice — the earliest move-out date is ${nice}`,
    }, { status: 422 })
  }

  // Record notice on tenancy
  const todayStr = ukToday
  const { error: updateErr } = await supabase
    .from('tenancies')
    .update({
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
    await alertLettingsRoomUp(supabase, roomData.room_id, { availableFrom: intendedMoveOutDate, why: 'The tenant gave notice in the app.' })
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
    const notifyBody = `
      <p style="margin:0 0 16px">A tenant has submitted notice via the portal.</p>
      <ul style="margin:0 0 16px;padding-left:20px;line-height:1.8">
        <li><strong>Room:</strong> ${roomName}, ${propertyAddress}</li>
        <li><strong>Notice given:</strong> ${todayStr}</li>
        <li><strong>Intended move-out:</strong> ${moveOutFormatted}</li>
      </ul>
      <p style="margin:0">Please review in <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'}/admin/tenancy-management">Tenancy Management</a> and send the checkout email once you have confirmed the pro-rata rent.</p>`
    await deliverEmail({
        to: adminEmail,
        subject: oneLine(`Notice given — ${roomName}, ${propertyAddress}`),
        html: await buildEmail(notifyBody),
      }).catch(e => console.error('Admin notify failed:', e))
  }

  return NextResponse.json({ ok: true, noticeReceivedDate: todayStr, moveOutDate: intendedMoveOutDate })
}
