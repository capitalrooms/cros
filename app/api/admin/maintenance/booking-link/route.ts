// POST /api/admin/maintenance/booking-link { ticketId, name, phone, email } — send a job to a contractor who isn't on
// the app (25 Oct 2026): they get a text and/or email with a link to book their own visit (lib/jobs/bookingLink,
// /book/<token>). Sending it gives them the job and approves it. Office staff with Maintenance (proxy.ts).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/sendEmail'
import { sendSms } from '@/lib/sms'
import { bookingLink, offAppContractor } from '@/lib/jobs/bookingLink'
import { loadQuoteJob } from '@/lib/quotes/quoteRequest'
import { senderFor } from '@/lib/email/sender'

export const dynamic = 'force-dynamic'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const name = String(b.name ?? '').trim().slice(0, 120)
  const phone = String(b.phone ?? '').trim().slice(0, 30)
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 200)
  if (!name) return NextResponse.json({ error: 'Add the contractor’s name.' }, { status: 400 })
  if (!phone && !email) return NextResponse.json({ error: 'Add their mobile or email, so the link can reach them.' }, { status: 400 })
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 })

  const s = createServiceClient()
  const { data: t } = await s.from('maintenance_tickets').select('id, status').eq('id', String(b.ticketId ?? '')).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (['completed', 'cancelled'].includes(t.status)) return NextResponse.json({ error: 'This job is closed.' }, { status: 409 })

  const who = await offAppContractor(s, { name, phone, email })
  if ('error' in who) return NextResponse.json({ error: who.error }, { status: 400 })
  const { error } = await s.from('maintenance_tickets').update({
    contractor_id: who.id, status: 'assigned', approved_at: new Date().toISOString(), approved_by: caller.personId ?? null,
  }).eq('id', t.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const job = await loadQuoteJob(s, t.id)
  const where = job ? [job.propertyName || job.propertyAddress].filter(Boolean).join('') : 'the property'
  const link = bookingLink(t.id, who.id)
  const first = name.split(/\s+/)[0]
  const via: string[] = []
  if (phone) {
    const r = await sendSms(phone, `Capital Rooms: hi ${first}, please book your visit for ${job?.title ?? 'a repair'} at ${where}. Pick a day and time here — no account needed: ${link}`, { asName: true })
    if (r.ok) via.push('text')
  }
  if (email) {
    const sender = await senderFor(req)
    const r = await sendEmail(email, `Please book your visit — ${job?.title ?? 'repair'} at ${where}`, `
      <p>Hi ${esc(first)},</p>
      <p>Could you book your visit for this job? Choose a day and time slot at the link — there’s nothing to sign up for. The tenants are told when you’re coming and given your mobile number, in case they need to arrange access.</p>
      <p style="margin:18px 0;padding:14px 16px;background:#f5f4f2;border-radius:10px"><strong>${esc(job?.title ?? 'Repair')}</strong><br>${esc(job?.propertyAddress ?? where)}${job?.roomName ? `<br>${esc(job.roomName)}` : ''}</p>
      <p><a href="${link}" style="display:inline-block;background:#181614;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Book my visit →</a></p>
      <p style="color:#6b6a64;font-size:13px">Need to move it later? Use the same link. If you can’t do the job at all, please use the link to say so.</p>`, { sender })
    if (r.ok) via.push('email')
  }
  return NextResponse.json({ ok: true, link, via, contractorId: who.id })
}
