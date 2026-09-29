// GET  /api/admin/house-docs/[propertyId] — the house's certificates, current tenants, previous sends
// POST /api/admin/house-docs/[propertyId]
//   { action: 'preview', docKeys, message }                       → { html, subject }
//   { action: 'test' | 'send', docKeys, personIds, subject, message }
//     test → one copy to you; send → each chosen tenant gets their own email (paused while tenant messaging is off)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { getCommsLive } from '@/lib/comms'
import { sendEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { senderFor } from '@/lib/email/sender'
import { loadHouse, houseEmailHtml, defaultHouseSubject, defaultHouseMessage } from '@/lib/houseDocs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { propertyId } = await params
  const s = svc()
  const house = await loadHouse(s, propertyId)
  if (!house) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const { data: sends, error } = await s.from('house_document_sends').select('id, subject, documents, recipients, sent_at').eq('property_id', propertyId).order('sent_at', { ascending: false }).limit(20)
  return NextResponse.json({
    ...house, sends: sends ?? [], commsLive: await getCommsLive(),
    defaults: { subject: defaultHouseSubject(house.property.address), message: defaultHouseMessage },
    setupNeeded: error && (error.code === 'PGRST205' || error.code === '42P01') ? 'Run migration 188 in Supabase to keep a record of what was sent.' : null,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { propertyId } = await params
  const b = await req.json().catch(() => ({}))
  const s = svc()
  const house = await loadHouse(s, propertyId)
  if (!house) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const docs = house.documents.filter(d => (b.docKeys ?? []).includes(d.key) && d.url)
  const message = String(b.message || '').trim() || defaultHouseMessage
  const subject = String(b.subject || '').trim() || defaultHouseSubject(house.property.address)
  const sender = await senderFor(req)

  if (b.action === 'preview') {
    return NextResponse.json({ subject, html: await buildEmail(houseEmailHtml(house.tenants[0]?.firstName || 'Tenant', house.property.address, docs, message), { sender }) })
  }
  if (!docs.length) return NextResponse.json({ error: 'Tick at least one certificate that has a file uploaded.' }, { status: 400 })

  if (b.action === 'test') {
    const r = await sendEmail(sender.replyTo, `[TEST] ${subject}`, houseEmailHtml(sender.name.split(' ')[0] || 'there', house.property.address, docs, message), { req })
    return r.ok ? NextResponse.json({ ok: true, sentTo: [sender.replyTo] }) : NextResponse.json({ error: r.error || 'The email could not be sent.' }, { status: 502 })
  }
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (!(await getCommsLive())) return NextResponse.json({ error: 'Tenant messages are paused (Settings). Send a test to yourself instead.' }, { status: 409 })

  const chosen = house.tenants.filter(t => (b.personIds ?? []).includes(t.personId))
  if (!chosen.length) return NextResponse.json({ error: 'Pick at least one tenant.' }, { status: 400 })
  const recipients = []
  for (const t of chosen) {        // one email each — tenants never see each other's addresses
    const r = await sendEmail(t.email, subject, houseEmailHtml(t.firstName, house.property.address, docs, message), { req })
    recipients.push({ person_id: t.personId, name: t.name, email: t.email, ok: r.ok, ...(r.ok ? {} : { error: r.error }) })
  }
  const { error } = await s.from('house_document_sends').insert({
    property_id: propertyId, subject, sent_by: admin.personId, recipients,
    documents: docs.map(d => ({ key: d.key, label: d.label, url: d.url, next_due: d.nextDue })),
  })
  const failed = recipients.filter(r => !r.ok)
  return NextResponse.json({
    ok: failed.length === 0, sent: recipients.length - failed.length, failed: failed.map(f => f.name),
    warning: error ? 'Sent, but not recorded — run migration 188.' : null,
  })
}
