import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/adminAuth'
import { sendEmail } from '@/lib/sendEmail'
import { senderFor } from '@/lib/email/sender'
import { EmailSendDetails, validateEmailSend } from '@/lib/voice/actions/emailSend'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { recipientType, roomName, propertyName, recipients, subject, body } =
    (await req.json()) as EmailSendDetails

  if (!subject || !body) {
    return NextResponse.json({ error: 'Subject and body required' }, { status: 400 })
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const sender = await senderFor(req)

    // Build recipient list based on type
    let emails: string[] = []

    if (recipientType === 'tenant' && roomName) {
      // Find tenant in room
      const { data: room } = await supabase
        .from('rooms')
        .select('id, name')
        .or(`name.ilike.%${roomName}%,id.eq.${roomName}`)
        .limit(1)
        .single()

      if (!room) {
        return NextResponse.json({ error: `Room not found: ${roomName}` }, { status: 404 })
      }

      const { data: tenancy } = await supabase
        .from('tenancies')
        .select('people(email)')
        .eq('room_id', room.id)
        .is('end_date', null)
        .or('notice_received_date.is.null,end_date.gte.now()')
        .limit(1)
        .single()

      if (tenancy?.people?.email) {
        emails = [tenancy.people.email]
      } else {
        return NextResponse.json({ error: `No active tenant in ${room.name}` }, { status: 404 })
      }
    } else if (recipientType === 'all_at_property' && propertyName) {
      // Find all tenants at property
      const { data: prop } = await supabase
        .from('properties')
        .select('id')
        .or(`name.ilike.%${propertyName}%`)
        .limit(1)
        .single()

      if (!prop) {
        return NextResponse.json({ error: `Property not found: ${propertyName}` }, { status: 404 })
      }

      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('people(email)')
        .eq('properties.id', prop.id)
        .or('notice_received_date.is.null,end_date.gte.now()')

      emails = (tenancies || [])
        .map((t: any) => t.people?.email)
        .filter(Boolean)
    } else if (recipientType === 'tenants_list') {
      emails = recipients || []
    }

    if (emails.length === 0) {
      return NextResponse.json({ error: 'No valid recipients found' }, { status: 400 })
    }

    // Send emails
    const results = await Promise.all(
      emails.map((email) =>
        sendEmail(email, subject, body, { req }).catch((e) => ({
          email,
          ok: false,
          error: String(e),
        }))
      )
    )

    const successful = results.filter((r) => r.ok || r.ok !== false).length
    const failed = results.filter((r) => r.ok === false)

    return NextResponse.json({
      ok: failed.length === 0,
      sent: successful,
      failed: failed.map((f: any) => ({ email: f.email, error: f.error })),
    })
  } catch (e) {
    console.error('Email send error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
