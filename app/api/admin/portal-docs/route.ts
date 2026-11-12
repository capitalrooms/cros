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
import { buildEmail } from '@/lib/emailWrapper'
import { themeByKey } from '@/lib/email/themes'
import { senderFor } from '@/lib/email/sender'
import { PORTAL_URL } from '@/lib/emailWrapper'

// two looks to choose from (12 Nov 2026, Harry: "one matching website and one matching current landlord stuff")
const LOOKS: Record<string, string> = { website: 'website', landlord: 'editorial' }
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

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
  const subject = `Required info for Rightmove advertising — ${address.split(',')[0]}`
  const first = String(sender.name ?? '').split(' ')[0] || 'Capital Rooms'
  // the email: a short intro, the three things as numbered blocks, one button — roomy, not a block of text
  const body = (link: string) => {
    const item = (n: number, title: string, line: string) => `<tr><td style="padding:0 0 18px;vertical-align:top;width:44px"><div style="width:32px;height:32px;border-radius:16px;background:#1F3B2E;color:#ffffff;font-weight:700;font-size:15px;line-height:32px;text-align:center">${n}</div></td><td style="padding:2px 0 18px;vertical-align:top"><div style="font-weight:700;font-size:17px;line-height:1.3">${title}</div><div style="font-size:15px;line-height:1.55;opacity:.85;margin-top:3px">${line}</div></td></tr>`
    return `<p style="margin:0 0 18px">${esc(dearLine(ll))}</p>
<p style="margin:0 0 26px;line-height:1.6">Before <b>${esc(address)}</b> can be advertised on Rightmove, they need three things from you. It takes about two minutes on your phone.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 8px">
${item(1, 'Sign the letter of authority', 'We’ve written it for you — sign it on screen with your finger, or print it and send a photo.')}
${item(2, 'Proof you own the property', 'A Land Registry title, insurance certificate, solicitor’s completion letter or mortgage letter.')}
${item(3, 'Photo ID', 'Your passport or driving licence.')}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td style="border-radius:999px;background:#1F3B2E"><a href="${link}" style="display:inline-block;padding:15px 30px;border-radius:999px;color:#ffffff !important;font-weight:700;font-size:16px;text-decoration:none">Add the three documents</a></td></tr></table>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;opacity:.8">A clear photo of each is fine; a scan is great too. You can stop and come back to the link any time. Everything is kept private and encrypted, and only used to list this property.</p>
<p style="margin:0">Thank you,<br>${esc(first)}</p>`
  }
  const theme = themeByKey(LOOKS[String(b.look)] ?? 'website')
  if (b.action === 'preview') return NextResponse.json({ to: ll.email, subject, html: await buildEmail(body(`${PORTAL_URL}/portal-docs/preview`), { req, kind: 'portal-docs', theme }) })
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const token = newToken()
  const { error } = await s.from('portal_authority_requests').insert({ token, property_id: p.id, landlord_id: p.landlord_id, sent_to: ll.email, created_by: me.email })
  if (missing(error)) return NextResponse.json({ error: 'Run migration 282 in Supabase first.' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const link = `${PORTAL_URL}/portal-docs/${token}`
  const r = await sendEmail(ll.email, subject, body(link), { req, kind: 'portal-docs', theme })
  if (!r.ok) return NextResponse.json({ error: r.error || 'The email didn’t send', link }, { status: 502 })
  return NextResponse.json({ ok: true, to: ll.email, link })
}
