/**
 * POST /api/let-only/notify-contacts
 *
 * Sends a fixed-template email to all let-only contacts for a given listing.
 * Used when a viewing is booked, rescheduled, or cancelled.
 *
 * Body: {
 *   listing_id: string          — let_only_listings.id
 *   event: 'booked' | 'rescheduled' | 'cancelled'
 *   viewing_date: string        — ISO date
 *   viewing_time: string        — HH:MM
 *   visitor_name?: string       — optional applicant name
 *   room_name?: string          — room being viewed
 *   sender_name: string         — logged-in staff member's name
 * }
 *
 * Uses Resend. No auth check required — called only from server-side contexts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { emailHtml, FROM, PORTAL_URL, tableRow, ctaButton } from '@/lib/emailTemplate'

const RESEND_API_KEY = process.env.RESEND_API_KEY

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')}${ampm}`
}

function buildEmailBody(params: {
  event: string
  viewing_date: string
  viewing_time: string
  visitor_name?: string
  room_name?: string
  address: string
  sender_name: string
  contact_name: string
}): { subject: string; html: string } {
  const { event, viewing_date, viewing_time, room_name, address, sender_name, contact_name } = params
  const dateStr = formatDate(viewing_date)
  const timeStr = formatTime(viewing_time)
  const roomStr = room_name ? ` (${room_name})` : ''

  let subject = ''
  let intro = ''

  if (event === 'booked') {
    subject = `Viewing booked — ${address}`
    intro = `A viewing has been booked at your property${roomStr} on <strong>${dateStr} at ${timeStr}</strong>.`
  } else if (event === 'rescheduled') {
    subject = `Viewing rescheduled — ${address}`
    intro = `A viewing at your property${roomStr} has been rescheduled to <strong>${dateStr} at ${timeStr}</strong>.`
  } else {
    subject = `Viewing cancelled — ${address}`
    intro = `A viewing at your property${roomStr} that was scheduled for <strong>${dateStr} at ${timeStr}</strong> has been cancelled.`
  }

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <p style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">Capital Rooms</p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin-bottom: 24px;" />
      <p>Hi ${contact_name},</p>
      <p>${intro}</p>
      <p style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
        📍 <strong>${address}</strong><br/>
        ${room_name ? `🚪 ${room_name}<br/>` : ''}
        📅 ${dateStr}<br/>
        🕐 ${timeStr}
      </p>
      <p>We will have a management set of keys for access — you do not need to be present. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.</p>
      <p>If you have any questions, please contact ${sender_name} at Capital Rooms.</p>
      <p style="margin-top: 24px; color: #777; font-size: 12px;">
        Capital Rooms · You're receiving this because you're a contact at this property.
      </p>
    </div>
  `

  return { subject, html }
}

export async function POST(req: NextRequest) {
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const body = await req.json()
  const { listing_id, event, viewing_date, viewing_time, visitor_name, room_name, sender_name } = body

  if (!listing_id || !event || !viewing_date || !viewing_time || !sender_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch listing + contacts using service role (bypasses RLS)
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: listing } = await service
    .from('let_only_listings')
    .select('address, postcode')
    .eq('id', listing_id)
    .single()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const { data: contacts } = await service
    .from('let_only_contacts')
    .select('full_name, first_name, last_name, email')
    .eq('listing_id', listing_id)

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No contacts to notify' })
  }

  const address = listing.postcode
    ? `${listing.address}, ${listing.postcode}`
    : listing.address

  // Send email to each contact with a valid email address
  const results = await Promise.allSettled(
    contacts
      .filter(c => c.email)
      .map(async contact => {
        const { subject, html } = buildEmailBody({
          event,
          viewing_date,
          viewing_time,
          visitor_name,
          room_name,
          address,
          sender_name,
          contact_name: contact.name,
        })

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [contact.email],
            subject,
            html,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.message || 'Resend error')
        }

        return contact.email
      })
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ sent, failed })
}
