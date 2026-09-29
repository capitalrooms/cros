import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createServerClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/serverAuth'
import { buildEmail } from '@/lib/emailWrapper'
import { senderFields } from '@/lib/email/sender'

/** POST — tenant requests to rescind their notice
 *  Body: { tenancyId, personId, note? }
 */
export async function POST(req: NextRequest) {
  const serverClient = await createServerClient()
  const user = await getCurrentUser(serverClient)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenancyId, personId, note } = await req.json()
  if (!tenancyId) return NextResponse.json({ error: 'tenancyId required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: tenancy, error: fetchErr } = await supabase
    .from('tenancies')
    .select('id, person_id, co_tenant_id, notice_received_date, end_date, rooms(name), properties(address)')
    .eq('id', tenancyId)
    .maybeSingle()

  if (fetchErr || !tenancy) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })

  const role = (user.assignment as any)?.role || ''
  const me = (user.assignment as any)?.id as string | undefined   // the signed-in person — never an id sent in the request
  const mine = !!me && (tenancy.person_id === me || (tenancy as any).co_tenant_id === me)
  const isAdmin = ['administrator', 'admin'].includes(role)
  if (!isAdmin && !mine) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!tenancy.notice_received_date) {
    return NextResponse.json({ error: 'Tenancy is not currently on notice' }, { status: 409 })
  }

  if ((tenancy as any).rescind_requested_at) {
    return NextResponse.json({ error: 'A rescind request is already pending' }, { status: 409 })
  }

  // Record rescind request
  const { error: updateErr } = await supabase
    .from('tenancies')
    .update({
      rescind_requested_at: new Date().toISOString(),
      rescind_note: note || null,
    })
    .eq('id', tenancyId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Notify admin
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const roomName = (tenancy.rooms as any)?.name || 'a room'
    const address = (tenancy.properties as any)?.address || ''
    const moveOut = tenancy.end_date
      ? new Date(tenancy.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '(unknown)'
    const rescindBody = `
      <p style="margin:0 0 16px">A tenant has requested to cancel/rescind their notice.</p>
      <ul style="margin:0 0 16px;padding-left:20px;line-height:1.8">
        <li><strong>Room:</strong> ${roomName}, ${address}</li>
        <li><strong>Current move-out date:</strong> ${moveOut}</li>
        ${note ? `<li><strong>Reason:</strong> ${note}</li>` : ''}
      </ul>
      <p style="margin:0">Please review and approve or reject in <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'}/admin/tenancy-management">Tenancy Management</a>.</p>`
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        ...(await senderFields()),
        to: process.env.ADMIN_EMAIL || 'admin@capitalrooms.co.uk',
        subject: `Rescind notice request — ${roomName}, ${address}`,
        html: await buildEmail(rescindBody),
      }),
    }).catch(e => console.error('Admin rescind notify failed:', e))
  }

  return NextResponse.json({ ok: true })
}

/** PATCH — admin approves or rejects a rescind request
 *  Body: { tenancyId, action: 'approve' | 'reject' }
 */
export async function PATCH(req: NextRequest) {
  const serverClient2 = await createServerClient()
  const user = await getCurrentUser(serverClient2)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.assignment as any)?.role || ''
  if (!['administrator', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tenancyId, action } = await req.json()
  if (!tenancyId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'tenancyId and action (approve|reject) required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (action === 'approve') {
    // Revert tenancy to active, clear all notice/checkout fields
    const { error } = await supabase
      .from('tenancies')
      .update({
        end_date: null,
        notice_received_date: null,
        rescind_requested_at: null,
        rescind_note: null,
        checkout_confirmation_sent_at: null,
        checkout_reminder_sent_at: null,
      })
      .eq('id', tenancyId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Revert room status to occupied
    const { data: t } = await supabase
      .from('tenancies')
      .select('room_id')
      .eq('id', tenancyId)
      .single()

    if (t?.room_id) {
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', t.room_id)
    }

    return NextResponse.json({ ok: true, reverted: true })
  } else {
    // Reject — clear rescind request only, tenancy stays on notice
    const { error } = await supabase
      .from('tenancies')
      .update({ rescind_requested_at: null, rescind_note: null })
      .eq('id', tenancyId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reverted: false })
  }
}
