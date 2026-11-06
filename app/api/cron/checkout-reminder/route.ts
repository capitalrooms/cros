import { NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { hiName } from '@/lib/people'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { expandJoint } from '@/lib/serverNotify'
import { getTemplate, render } from '@/lib/messageTemplate'
import { buildEmail, getBusinessSettings } from '@/lib/emailWrapper'
import { hero, card, checklist, button, paraHtml, greeting } from '@/lib/email/blocks'
import { moveOutChecklist } from '@/lib/checkout/moveOut'
import { moveOutUrl, MOVE_OUT_CLEAN_RATE } from '@/lib/checkout/moveOutLink'
import { dearName } from '@/lib/people'
import { isWholeLet } from '@/lib/lettings/letWording'

import { getCommsLive } from '@/lib/comms'

const svc = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

/**
 * GET /api/cron/checkout-reminder
 * Called daily (configure in vercel.json crons or external scheduler).
 * Sends 2-week-before reminder to all tenants whose move-out is in exactly 14 days,
 * where the confirmation email was already sent but the reminder hasn't been.
 */
export async function GET(req: Request) {
  // Verify cron secret
  // Vercel's scheduler sends "Authorization: Bearer <CRON_SECRET>"; a ?secret= link still works for a manual run.
  // (Until 15 Oct 2026 only ?secret= was accepted, so every scheduled run was refused.)
  const cronSecret = process.env.CRON_SECRET
  const supplied = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || new URL(req.url).searchParams.get('secret')
  if (cronSecret && supplied !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Tenant comms kill-switch — nothing goes to tenants while comms are paused
  if (!await getCommsLive()) return NextResponse.json({ skipped: 'Tenant comms are paused' })

  const supabase = svc()

  // Target: move-out in 14 days, confirmation sent, reminder not yet sent
  const target = new Date()
  target.setDate(target.getDate() + 14)
  const targetDate = target.toISOString().split('T')[0]

  const { data: tenancies, error } = await supabase
    .from('tenancies')
    .select(`
      id, end_date, rent_amount,
      people:person_id (salutation, first_name, last_name, full_name, email),
      co:people!co_tenant_id(salutation, first_name, last_name, full_name, email),
      rooms(name),
      properties(address, property_type)
    `)
    .not('notice_received_date', 'is', null)   // on notice
    .eq('end_date', targetDate)
    .not('checkout_confirmation_sent_at', 'is', null)
    .is('checkout_reminder_sent_at', null)

  if (error) {
    console.error('checkout-reminder cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.warn('RESEND_API_KEY not set — no reminder emails sent')
    return NextResponse.json({ skipped: true, reason: 'no_resend_key' })
  }

  const tpl = await getTemplate('checkout-reminder-2weeks')
  const biz = await getBusinessSettings()
  const sent: string[] = []
  const failed: string[] = []

  for (const t of expandJoint<any>(tenancies)) {   // both tenants on a joint tenancy
    const person = (t as any).people
    const email = person?.email
    if (!email) continue

    const tenantName = hiName(person)
    const moveOutDate = new Date((t.end_date as string) + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const vars = {
      tenant_name: tenantName,
      move_out_date: moveOutDate,
      room_name: (t as any).rooms?.name || 'your room',
      property_address: (t as any).properties?.address || '',
      contact_phone: biz.phone,   // was a placeholder '+44 (0)20 XXXX XXXX' (fixed 4 Nov 2026)
    }

    const subject = tpl?.subject_line
      ? render(tpl.subject_line, vars, person)
      : `Reminder: your move-out is in 2 weeks — ${moveOutDate}`

    // the house look (lib/email/blocks, 4 Nov 2026): the date big, your wording from Message Templates (or ours), then
    // the move-out form button and the checklist
    const whole = isWholeLet((t as any).properties?.property_type, (t as any).rooms?.name)
    const html = await buildEmail([
      tpl?.template_text ? render(tpl.template_text, vars, person) : `${greeting(dearName(person))}${paraHtml(`Just a reminder that you move out in two weeks. If you haven’t yet, fill in your move-out form — and you can still book our cleaner for your last day at £${MOVE_OUT_CLEAN_RATE} an hour, taken from your deposit.`)}`,
      hero({ eyebrow: 'Your move-out date', title: moveOutDate, sub: 'Two weeks today' }),
      button(moveOutUrl(t.id), 'Open my move-out form'),
      card('Before you hand back the keys', checklist(moveOutChecklist(whole))),
      paraHtml(`Any questions, just reply to this email or call ${vars.contact_phone}.`),
    ].join('\n'), { kind: 'move-out' })

    const res = await deliverEmail({ to: email, subject, html })

    if (res.ok) {
      await supabase
        .from('tenancies')
        .update({ checkout_reminder_sent_at: new Date().toISOString() })
        .eq('id', t.id)
      sent.push(email)
    } else {
      console.error('Reminder send failed:', email, await res.text())
      failed.push(email)
    }
  }

  return NextResponse.json({ ok: true, sent, failed, targetDate })
}

// Body-only fallback — shared wrapper applies the header/footer via buildEmail()
