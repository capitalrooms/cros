import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getTemplate, render } from '@/lib/messageTemplate'
import { FROM } from '@/lib/emailTemplate'

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
  const auth = req.headers ? new URL(req.url).searchParams.get('secret') : null
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = svc()

  // Target: move-out in 14 days, confirmation sent, reminder not yet sent
  const target = new Date()
  target.setDate(target.getDate() + 14)
  const targetDate = target.toISOString().split('T')[0]

  const { data: tenancies, error } = await supabase
    .from('tenancies')
    .select(`
      id, end_date, rent_amount,
      people:person_id (first_name, last_name, full_name, email),
      rooms(name),
      properties(address)
    `)
    .eq('status', 'on_notice')
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
  const sent: string[] = []
  const failed: string[] = []

  for (const t of tenancies ?? []) {
    const person = (t as any).people
    const email = person?.email
    if (!email) continue

    const tenantName = person.first_name || person.full_name || 'Tenant'
    const moveOutDate = new Date((t.end_date as string) + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const vars = {
      tenant_name: tenantName,
      move_out_date: moveOutDate,
      room_name: (t as any).rooms?.name || 'your room',
      property_address: (t as any).properties?.address || '',
      contact_phone: '+44 (0)20 XXXX XXXX',
    }

    const subject = tpl?.subject_line
      ? render(tpl.subject_line, vars)
      : `Reminder: your move-out is in 2 weeks — ${moveOutDate}`

    const html = tpl?.template_text
      ? `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto">${render(tpl.template_text, vars)}</body></html>`
      : fallbackReminderHtml(vars)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: FROM, to: email, subject, html }),
    })

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

function fallbackReminderHtml(vars: Record<string, string>) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:32px;max-width:600px;margin:0 auto">
    <h2 style="margin:0 0 18px">Moving out soon</h2>
    <p>Hi ${vars.tenant_name},</p>
    <p>Just a reminder that your move-out date is <strong>${vars.move_out_date}</strong> — two weeks from today.</p>
    <h3>Checkout checklist</h3>
    <ul>
      <li>Clear all personal belongings from your room and communal storage</li>
      <li>Leave the room clean and in the condition it was when you moved in</li>
      <li>Return all keys by midday on your move-out date</li>
      <li>Cancel any direct debits for rent</li>
      <li>Update your address with HMRC, banks, and subscriptions</li>
    </ul>
    <p>Any questions? Call us on ${vars.contact_phone}.</p>
  </body></html>`
}
