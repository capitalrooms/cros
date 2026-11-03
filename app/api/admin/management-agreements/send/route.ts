// /api/admin/management-agreements/send — send a saved agreement to the landlord to review (migration 253).
//   GET  ?id=…                       → { email, name, sentAt, sentTo, readyAt, readyName, reviewVersion, version }
//   POST { id, email, message? }     → emails the landlord a link to read it and press "ready to sign"
// Nothing goes out unless someone in the office presses Send (Harry: never auto-send to landlords).
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/sendEmail'
import { ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { dearFromText } from '@/lib/people'

export const dynamic = 'force-dynamic'
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function landlordEmail(s: ReturnType<typeof createServiceClient>, a: any): Promise<string> {
  if (a.review_sent_to) return a.review_sent_to
  if (a.onboarding_id) {
    const { data } = await s.from('landlord_onboarding').select('email').eq('id', a.onboarding_id).maybeSingle()
    if ((data as any)?.email) return (data as any).email
  }
  const pid = a.form?.pickedLandlordId
  if (pid) {
    const { data } = await s.from('people').select('email').eq('id', pid).maybeSingle()
    if ((data as any)?.email) return (data as any).email
  }
  return ''
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which agreement?' }, { status: 400 })
  const { data: a, error } = await s.from('management_agreements').select('*').eq('id', id ?? '').is('deleted_at', null).maybeSingle()
  if (error) return NextResponse.json({ error: /review_/.test(error.message) ? 'Needs migration 253 running in Supabase.' : error.message }, { status: 500 })
  if (!a) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
  return NextResponse.json({
    email: await landlordEmail(s, a), name: a.client_name, version: a.version,
    sentAt: a.review_sent_at, sentTo: a.review_sent_to, reviewVersion: a.review_version,
    readyAt: a.ready_at, readyName: a.ready_name, readyQuestions: a.ready_questions,
  })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const email = String(b.email ?? '').trim()
  const message = String(b.message ?? '').trim().slice(0, 3000)
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter the landlord’s email address.' }, { status: 400 })

  const s = createServiceClient()
  const { data: a } = await s.from('management_agreements').select('*').eq('id', String(b.id ?? '')).is('deleted_at', null).maybeSingle()
  if (!a) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
  if (!a.pdf_path) return NextResponse.json({ error: 'Generate the PDF first, then send it.' }, { status: 400 })

  const token = a.review_token || crypto.randomBytes(24).toString('base64url')
  const { error } = await s.from('management_agreements').update({
    review_token: token, review_sent_at: new Date().toISOString(), review_sent_to: email, review_sent_by: caller.email,
    review_version: a.version, ready_at: null, ready_name: null, ready_ip: null, ready_questions: null,
  }).eq('id', a.id)
  if (error) return NextResponse.json({ error: /review_/.test(error.message) ? 'Needs migration 253 running in Supabase.' : error.message }, { status: 500 })

  const name = a.agreement_type === 'rent_collection' ? 'rent collection agreement' : 'management agreement'
  const updated = (a.version ?? 1) > 1
  const sent = await sendEmail(email, `Your ${name} to review — Capital Rooms`, `
    <p>Dear ${esc(dearFromText(a.client_name))},</p>
    <p>${updated ? `Here is your updated ${name}, including the points we discussed.` : `Here is your ${name}.`} Please take a moment to read it through.</p>
    ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
    <p>When you’re happy with it, press <strong>“I’ve read it and I’m ready to sign”</strong> on the page and we’ll send it to you to sign online. If anything needs changing, just reply to this email.</p>
    ${ctaButton('Read your agreement', `${PORTAL_URL}/agreement/${token}`)}`,
    { req, replyTo: caller.email ?? undefined })
  if (!sent.ok) return NextResponse.json({ error: `The email didn’t send: ${sent.error}` }, { status: 502 })
  return NextResponse.json({ ok: true, sentTo: email })
}
