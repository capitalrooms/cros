// POST /api/notify/contacts — Quick notify to people picked or pasted by hand (17 Oct 2026): applicants, viewers,
// or anyone at a house that isn't on CROS (or whose tenants aren't recorded). Office staff only.
// Body: { recipients: [{ name?, email?, phone? }], subject, message, sms?: boolean, email?: boolean }
// Each person gets "Hi Jane, <message>" by text (lib/sms) and/or email (lib/sendEmail, from the signed-in person);
// failures are reported back per person (and lib/sms / lib/sendEmail tell the office too).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { sendEmail } from '@/lib/sendEmail'
import { sendSms } from '@/lib/sms'
import { messageHtml } from '@/lib/email/messageHtml'
import { getSmsSignOff } from '@/lib/auth'
import { hiName, personFromText } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const subject = String(b.subject ?? '').trim().slice(0, 150)
  const message = String(b.message ?? '').trim()
  const wantSms = b.sms !== false, wantEmail = b.email !== false
  const list = (Array.isArray(b.recipients) ? b.recipients : []).slice(0, 50)
    .map((r: any) => ({ name: String(r?.name ?? '').trim() || null, email: String(r?.email ?? '').trim().toLowerCase() || null, phone: String(r?.phone ?? '').trim() || null }))
    .filter((r: any) => r.email || r.phone)
  if (!list.length) return NextResponse.json({ error: 'Add at least one email address or mobile number' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Write a message' }, { status: 400 })
  if (message.length > 1200) return NextResponse.json({ error: 'Keep the message under 1,200 characters' }, { status: 400 })
  if (!wantSms && !wantEmail) return NextResponse.json({ error: 'Choose text or email' }, { status: 400 })

  const signOff = await getSmsSignOff(caller.email)
  const results: { who: string; text?: 'sent' | string; email?: 'sent' | string }[] = []
  for (const r of list) {
    const hi = r.name ? hiName(personFromText(r.name)) : 'there'
    const row: { who: string; text?: string; email?: string } = { who: r.name || r.email || r.phone || '' }
    if (wantSms && r.phone) {
      const s = await sendSms(r.phone, `Hi ${hi}, ${message} -${signOff}`)
      row.text = s.ok ? 'sent' : (s.error || 'failed')
    }
    if (wantEmail && r.email) {
      if (!isEmail(r.email)) row.email = 'not a valid address'
      else {
        const e = await sendEmail(r.email, subject || 'A message from Capital Rooms', messageHtml(`Hi ${hi},\n\n${message}`), { req })
        row.email = e.ok ? 'sent' : (e.error || 'failed')
      }
    }
    results.push(row)
  }
  const texted = results.filter(r => r.text === 'sent').length
  const emailed = results.filter(r => r.email === 'sent').length
  const failed = results.filter(r => (r.text && r.text !== 'sent') || (r.email && r.email !== 'sent'))
  return NextResponse.json({ ok: texted + emailed > 0, texted, emailed, failed }, { status: texted + emailed > 0 ? 200 : 422 })
}
