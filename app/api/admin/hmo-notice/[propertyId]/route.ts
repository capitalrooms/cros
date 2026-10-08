// GET  /api/admin/hmo-notice/[propertyId] — the HMO licence application notice, filled in: fields, warnings,
//      the tenants living there now, earlier sends, and whether tenant messages are live
// POST /api/admin/hmo-notice/[propertyId]
//   { action: 'pdf',  fields }             → the letter as a PDF (download / print / post)
//   { action: 'test', fields }             → the letter emailed to you only
//   { action: 'send', fields, personIds }  → each chosen tenant gets their own email with the letter attached
//                                             (paused while tenant messaging is off); recorded with the exact wording
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { getElectedCommsLive } from '@/lib/comms'
import { sendEmail } from '@/lib/sendEmail'
import { senderFor } from '@/lib/email/sender'
import { loadHouse } from '@/lib/houseDocs'
import { contentDisposition } from '@/lib/contentDisposition'
import { hmoNoticeDefaults, parseHmoNoticeFields, hmoNoticeGaps, renderHmoNotice, hmoNoticeSubject, hmoNoticeFilename, type HmoNoticeFields } from '@/lib/letters/hmoNotice'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const KEY = 'hmo_licence_notice'

function emailBody(firstName: string, f: HmoNoticeFields) {
  return `<p>Dear ${esc(firstName)},</p>
<p>Please find attached a notice that we will be ${f.kind === 'renewal' ? 'applying to renew the HMO licence' : 'applying for an HMO licence'} for <strong>${esc(f.propertyAddress)}</strong>. The application will go to ${esc(f.council.name)}${f.submitBy ? ` on or before ${esc(new Date(f.submitBy + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}.</p>
<p>You don’t need to do anything. If you have any questions, just reply to this email.</p>`
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { propertyId } = await params
  const s = svc()
  const [defaults, house, sends, commsLive] = await Promise.all([
    hmoNoticeDefaults(s, propertyId, await senderFor(req)),
    loadHouse(s, propertyId),
    s.from('house_document_sends').select('id, subject, documents, recipients, sent_at').eq('property_id', propertyId).order('sent_at', { ascending: false }).limit(50),
    getElectedCommsLive(),   // sent by you, so not held by the automatic-message pause
  ])
  if (!defaults || !house) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const earlier = ((sends.data ?? []) as any[]).filter(x => (x.documents ?? []).some((d: any) => d.key === KEY))
    .map(x => ({ id: x.id, sentAt: x.sent_at, recipients: x.recipients ?? [], fields: x.documents.find((d: any) => d.key === KEY)?.fields ?? null }))
  return NextResponse.json({ property: house.property, ...defaults, tenants: house.tenants, sends: earlier, commsLive })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { propertyId } = await params
  const b = await req.json().catch(() => ({}))
  const f = parseHmoNoticeFields(b.fields)
  if (!f) return NextResponse.json({ error: 'The letter details are missing.' }, { status: 400 })
  const s = svc()
  const { data: prop } = await s.from('properties').select('id').eq('id', propertyId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const gaps = hmoNoticeGaps(f)
  if (gaps.length && b.action !== 'pdf') return NextResponse.json({ error: `Add ${gaps.join(', ')} before sending.` }, { status: 400 })
  const pdf = await renderHmoNotice(f)
  const filename = hmoNoticeFilename(f)

  if (b.action === 'pdf') {
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(filename, 'attachment'), 'Content-Length': String(pdf.byteLength) } })
  }
  const attachments = [{ filename, content: pdf.toString('base64') }]
  const subject = hmoNoticeSubject(f)

  if (b.action === 'test') {
    const sender = await senderFor(req)
    const r = await sendEmail(sender.replyTo, `[TEST] ${subject}`, emailBody(sender.name.split(' ')[0] || 'there', f), { req, attachments })
    return r.ok ? NextResponse.json({ ok: true, sentTo: sender.replyTo }) : NextResponse.json({ error: r.error || 'The email could not be sent.' }, { status: 502 })
  }
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off (Settings). Download the letter or send a test to yourself instead.' }, { status: 409 })

  const house = await loadHouse(s, propertyId)
  const chosen = (house?.tenants ?? []).filter(t => (b.personIds ?? []).includes(t.personId))
  if (!chosen.length) return NextResponse.json({ error: 'Pick at least one tenant.' }, { status: 400 })
  const recipients = []
  for (const t of chosen) {        // one email each — tenants never see each other's addresses
    const r = await sendEmail(t.email, subject, emailBody(t.firstName, f), { req, attachments })
    recipients.push({ person_id: t.personId, name: t.name, email: t.email, ok: r.ok, ...(r.ok ? {} : { error: r.error }) })
  }
  // the record keeps the exact wording, so the letter each tenant got can be reproduced (proof the notice was served)
  const { error } = await s.from('house_document_sends').insert({
    property_id: propertyId, subject, sent_by: admin.personId, recipients,
    documents: [{ key: KEY, label: 'HMO licence application notice', url: null, fields: f }],
  })
  const failed = recipients.filter(r => !r.ok)
  return NextResponse.json({
    ok: failed.length === 0, sent: recipients.length - failed.length, failed: failed.map(x => x.name),
    warning: error ? 'Sent, but the record could not be saved.' : null,
  })
}
