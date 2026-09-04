import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { FROM } from '@/lib/emailTemplate'

/** POST — tenant requests to rescind their notice
 *  Body: { tenancyId, personId, note? }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tenancyId, personId, note } = await req.json()
  if (!tenancyId) return NextResponse.json({ error: 'tenancyId required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: tenancy, error: fetchErr } = await supabase
    .from('tenancies')
    .select('id, person_id, status, end_date, rooms(name), properties(address)')
    .eq('id', tenancyId)
    .maybeSingle()

  if (fetchErr || !tenancy) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })

  const role = (user.assignment as any)?.role || ''
  const isAdmin = ['administrator', 'admin'].includes(role)
  if (!isAdmin && tenancy.person_id !== personId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (tenancy.status !== 'on_notice') {
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
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM,
        to: process.env.ADMIN_EMAIL || 'admin@capitalrooms.co.uk',
        subject: `Rescind notice request — ${roomName}, ${address}`,
        html: `<p>A tenant has requested to cancel/rescind their notice.</p>
          <ul>
            <li><strong>Room:</strong> ${roomName}, ${address}</li>
            <li><strong>Current move-out date:</strong> ${moveOut}</li>
            ${note ? `<li><strong>Reason:</strong> ${note}</li>` : ''}
          </ul>
          <p>Please review and approve or reject in <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'}/admin/tenancy-management">Tenancy Management</a>.</p>`,
      }),
    }).catch(e => console.error('Admin rescind notify failed:', e))
  }

  return NextResponse.json({ ok: true })
}

/** PATCH — admin approves or rejects a rescind request
 *  Body: { tenancyId, action: 'approve' | 'reject' }
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
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
        status: 'active',
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
