// /api/admin/portal-docs — Rightmove documents for a property (lib/portalDocs). Office staff.
//   GET ?propertyId=                       → { request | null (with links to view each file), landlord }
//   POST { propertyId, action: 'preview' } → the email to the landlord
//   POST { propertyId, action: 'send' }    → makes the link and emails it
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { newToken, BUCKET, OWNERSHIP_TYPES, oneLine } from '@/lib/portalDocs'
import { viewLink } from '@/lib/files/fileCrypt'
import { dearLine, landlordName } from '@/lib/people'
import { sendEmail } from '@/lib/sendEmail'
import { messageHtml } from '@/lib/email/messageHtml'
import { senderFor } from '@/lib/email/sender'
import { PORTAL_URL } from '@/lib/emailWrapper'

export const dynamic = 'force-dynamic'
const missing = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || /portal_authority/.test(e.message ?? ''))

async function house(s: any, propertyId: string) {
  const { data } = await s.from('properties').select('id, name, address, postcode, landlord_id, people!landlord_id(salutation, first_name, last_name, full_name, company, email)').eq('id', propertyId).maybeSingle()
  return data as any
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const pid = req.nextUrl.searchParams.get('propertyId') ?? ''
  const s = createServiceClient()
  const p = await house(s, pid)
  if (!p) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const { data, error } = await s.from('portal_authority_requests').select('*').eq('property_id', pid).order('created_at', { ascending: false }).limit(1)
  if (missing(error)) return NextResponse.json({ setupNeeded: true })
  const r = (data ?? [])[0] as any
  const link = (path: string | null) => path ? viewLink(BUCKET, path, 3600) : null
  return NextResponse.json({
    landlord: p.people ? { name: landlordName(p.people), email: p.people.email ?? null } : null,
    request: r ? { status: r.status, sentAt: r.created_at, sentTo: r.sent_to, completedAt: r.completed_at, link: `${PORTAL_URL}/portal-docs/${r.token}`,
      ownershipType: OWNERSHIP_TYPES.find(t => t.key === r.ownership_type)?.label ?? null,
      files: { letter: link(r.letter_path), ownership: link(r.ownership_path), id: link(r.id_path) } } : null,
  })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const p = await house(s, String(b.propertyId ?? ''))
  if (!p) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const ll = p.people
  if (!ll?.email?.includes('@')) return NextResponse.json({ error: 'This property’s landlord has no email address on file.' }, { status: 400 })
  const address = oneLine(p.address || p.name)
  const sender = await senderFor(req)
  const subject = `Rightmove — three documents for ${address.split(',')[0]}`
  const text = (link: string) => `${dearLine(ll)}

To advertise ${address} on Rightmove, Rightmove ask every agent for three things before the advert can go live:

1. A letter of authority, signed by you — we’ve written it for you. Print it (or copy it out by hand), sign at the bottom and take a clear photo.
2. Proof that you own the property — a Land Registry title, your insurance certificate, a solicitor’s completion letter or a mortgage letter.
3. Photo ID — your passport or driving licence.

It takes a couple of minutes on your phone here:
${link}

A good photo of each is fine; a scan is great too. Everything is kept private and only used for the listing.

Thank you,
${String(sender.name ?? '').split(' ')[0] || 'Capital Rooms'}`
  if (b.action === 'preview') return NextResponse.json({ to: ll.email, subject, text: text(`${PORTAL_URL}/portal-docs/…`) })
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const token = newToken()
  const { error } = await s.from('portal_authority_requests').insert({ token, property_id: p.id, landlord_id: p.landlord_id, sent_to: ll.email, created_by: me.email })
  if (missing(error)) return NextResponse.json({ error: 'Run migration 282 in Supabase first.' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const link = `${PORTAL_URL}/portal-docs/${token}`
  const r = await sendEmail(ll.email, subject, messageHtml(text(link)), { req, kind: 'portal-docs' })
  if (!r.ok) return NextResponse.json({ error: r.error || 'The email didn’t send', link }, { status: 502 })
  return NextResponse.json({ ok: true, to: ll.email, link })
}
