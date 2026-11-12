// /api/admin/portal-docs — Required info for Rightmove advertising (lib/portalDocs, migrations 282–283). Office staff.
// Asked for from the landlord's page (choose which of their properties — one, several or all) or from a property.
//   GET ?landlordId= | ?propertyId=   → { landlord, properties (theirs, to choose from), requests (with links to each file) }
//   POST { propertyIds, action: 'preview' | 'send', look? } → the email (one letter for them all, ID once, proof of
//        ownership per property); every property must belong to the same landlord
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { newToken, BUCKET, OWNERSHIP_TYPES, oneLine, docsOnFile, listWords } from '@/lib/portalDocs'
import { viewLink } from '@/lib/files/fileCrypt'
import { dearLine, landlordName } from '@/lib/people'
import { sendEmail } from '@/lib/sendEmail'
import { buildEmail, PORTAL_URL } from '@/lib/emailWrapper'
import { themeByKey } from '@/lib/email/themes'
import { senderFor } from '@/lib/email/sender'

export const dynamic = 'force-dynamic'
// two looks to choose from (12 Nov 2026, Harry: "one matching website and one matching current landlord stuff")
const LOOKS: Record<string, string> = { website: 'website', landlord: 'editorial' }
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const missing = (e: any) => e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || /portal_authority|property_ids|ownership|on_file/.test(e.message ?? ''))
const street = (p: any) => oneLine(p?.address || p?.name).split(',')[0]
const LL = 'people!landlord_id(id, salutation, first_name, last_name, full_name, company, email)'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  let landlordId = req.nextUrl.searchParams.get('landlordId')
  const propertyId = req.nextUrl.searchParams.get('propertyId')
  if (!landlordId && propertyId) { const { data } = await s.from('properties').select('landlord_id').eq('id', propertyId).maybeSingle() as { data: any }; landlordId = data?.landlord_id ?? null }
  const { data: ll } = landlordId ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company, email').eq('id', landlordId).maybeSingle() as { data: any } : { data: null }
  const { data: props } = landlordId ? await s.from('properties').select('id, name, address').eq('landlord_id', landlordId).order('name') : { data: [] as any[] }
  let q = s.from('portal_authority_requests').select('*').order('created_at', { ascending: false }).limit(10)
  q = propertyId ? q.contains('property_ids', [propertyId]) : landlordId ? q.eq('landlord_id', landlordId) : q
  const { data: rows, error } = await q
  if (missing(error)) return NextResponse.json({ setupNeeded: true })
  const link = (path: string | null | undefined) => path ? viewLink(BUCKET, path, 3600) : null
  const fileLink = (f: any) => f?.path ? link(f.path) : f?.url ?? null
  const nameOf = new Map(((props ?? []) as any[]).map(p => [p.id, street(p)]))
  const requests = ((rows ?? []) as any[]).map(r => {
    const ids: string[] = r.property_ids?.length ? r.property_ids : [r.property_id]
    return {
      status: r.status, sentAt: r.created_at, sentTo: r.sent_to, completedAt: r.completed_at, link: `${PORTAL_URL}/portal-docs/${r.token}`,
      letter: link(r.letter_path), id: link(r.id_path) ?? fileLink(r.on_file?.id), idOnFile: !r.id_path && !!r.on_file?.id,
      properties: ids.map(id => {
        const own = r.ownership?.[id] ?? (id === r.property_id && r.ownership_path ? { type: r.ownership_type, path: r.ownership_path } : null)
        const kept = !own?.path ? r.on_file?.ownership?.[id] : null
        return { id, street: nameOf.get(id) ?? 'Property', ownershipType: kept ? kept.label : OWNERSHIP_TYPES.find(t => t.key === own?.type)?.label ?? null, ownership: link(own?.path) ?? fileLink(kept), onFile: !!kept }
      }),
    }
  })
  // what CROS already holds for this landlord, offered on the send screen so they aren't asked twice (12 Nov 2026)
  const onFile = await docsOnFile(s as any, landlordId, ((props ?? []) as any[]).map(p => p.id))
  return NextResponse.json({ landlord: ll ? { id: ll.id, name: landlordName(ll), email: ll.email ?? null } : null, properties: ((props ?? []) as any[]).map(p => ({ id: p.id, street: street(p), ownershipOnFile: onFile.ownership[p.id]?.label ?? null })), idOnFile: onFile.id?.label ?? null, requests })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const ids: string[] = [...new Set((Array.isArray(b.propertyIds) ? b.propertyIds : b.propertyId ? [b.propertyId] : []).map(String))].slice(0, 30) as string[]
  if (!ids.length) return NextResponse.json({ error: 'Choose at least one property' }, { status: 400 })
  const { data: props } = await s.from('properties').select(`id, name, address, postcode, landlord_id, ${LL}`).in('id', ids) as { data: any[] | null }
  const list = ids.map(id => (props ?? []).find(p => p.id === id)).filter(Boolean) as any[]
  if (!list.length) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  if (new Set(list.map(p => p.landlord_id)).size > 1) return NextResponse.json({ error: 'Those properties have different landlords — send one request per landlord.' }, { status: 400 })
  const ll = list[0].people
  if (!ll?.email?.includes('@')) return NextResponse.json({ error: 'This landlord has no email address on file.' }, { status: 400 })
  const streets = list.map(street)
  const many = list.length > 1
  // documents already on file that the office chose to use — the landlord isn't asked for them again
  const held = await docsOnFile(s as any, list[0].landlord_id, list.map(p => p.id))
  const use = b.useOnFile ?? {}
  const on_file: { id?: any; ownership: Record<string, any> } = { ownership: {} }
  if (use.id !== false && held.id) on_file.id = held.id
  const ownList: string[] | null = Array.isArray(use.ownership) ? use.ownership.map(String) : null
  for (const p of list) if (held.ownership[p.id] && (!ownList || ownList.includes(p.id))) on_file.ownership[p.id] = held.ownership[p.id]
  const needOwn = list.filter(p => !on_file.ownership[p.id])
  const needId = !on_file.id
  const sender = await senderFor(req)
  const subject = `Required info for Rightmove advertising — ${many ? `${list.length} properties` : streets[0]}`
  const first = String(sender.name ?? '').split(' ')[0] || 'Capital Rooms'
  // a short intro, the three things as numbered blocks, one button — roomy, not a block of text
  const body = (link: string) => {
    const item = (n: number, title: string, line: string) => `<tr><td style="padding:0 0 18px;vertical-align:top;width:44px"><div style="width:32px;height:32px;border-radius:16px;background:#1F3B2E;color:#ffffff;font-weight:700;font-size:15px;line-height:32px;text-align:center">${n}</div></td><td style="padding:2px 0 18px;vertical-align:top"><div style="font-weight:700;font-size:17px;line-height:1.3">${title}</div><div style="font-size:15px;line-height:1.55;opacity:.85;margin-top:3px">${line}</div></td></tr>`
    const steps: [string, string][] = [['Sign the letter of authority', `We’ve written it for you${many ? ', covering every property' : ''} — sign it on screen with your finger, or print it and send a photo.`]]
    if (needOwn.length) steps.push([needOwn.length > 1 ? 'Proof you own each property' : many ? `Proof you own ${street(needOwn[0])}` : 'Proof you own the property', 'A Land Registry title, insurance certificate, solicitor’s completion letter or mortgage letter.'])
    if (needId) steps.push(['Photo ID', 'Your passport or driving licence — just once.'])
    const kept = [on_file.id ? 'your photo ID' : '', Object.keys(on_file.ownership).length ? (Object.keys(on_file.ownership).length === list.length ? 'proof of ownership' : `proof of ownership for ${listWords(list.filter(p => on_file.ownership[p.id]).map(street))}`) : ''].filter(Boolean)
    const n = ['one thing', 'two things', 'three things'][steps.length - 1]
    return `<p style="margin:0 0 18px">${esc(dearLine(ll))}</p>
<p style="margin:0 0 ${many ? 14 : 26}px;line-height:1.6">Before ${many ? 'these properties' : `<b>${esc(streets[0])}</b>`} can be advertised on Rightmove, they need ${n} from you. It takes a few minutes on your phone.${kept.length ? ` We already have ${listWords(kept)} from you, so there’s no need to send ${kept.length > 1 ? 'those' : 'that'} again.` : ''}</p>
${many ? `<ul style="margin:0 0 24px;padding-left:20px;line-height:1.7">${streets.map(x => `<li><b>${esc(x)}</b></li>`).join('')}</ul>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 8px">
${steps.map((x, i) => item(i + 1, x[0], x[1])).join('\n')}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td style="border-radius:999px;background:#1F3B2E"><a href="${link}" style="display:inline-block;padding:15px 30px;border-radius:999px;color:#ffffff !important;font-weight:700;font-size:16px;text-decoration:none">Add the documents</a></td></tr></table>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;opacity:.8">A clear photo of each is fine; a scan is great too. You can stop and come back to the link any time. Everything is kept private and encrypted, and only used to list ${many ? 'these properties' : 'this property'}.</p>
<p style="margin:0">Thank you,<br>${esc(first)}</p>`
  }
  const theme = themeByKey(LOOKS[String(b.look)] ?? 'website')
  if (b.action === 'preview') return NextResponse.json({ to: ll.email, subject, html: await buildEmail(body(`${PORTAL_URL}/portal-docs/preview`), { req, kind: 'portal-docs', theme }) })
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const token = newToken()
  const { error } = await s.from('portal_authority_requests').insert({ token, property_id: list[0].id, property_ids: list.map(p => p.id), landlord_id: list[0].landlord_id, sent_to: ll.email, created_by: me.email, on_file })
  if (missing(error)) return NextResponse.json({ error: 'Run migration 283 in Supabase first.' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const link = `${PORTAL_URL}/portal-docs/${token}`
  const r = await sendEmail(ll.email, subject, body(link), { req, kind: 'portal-docs', theme })
  if (!r.ok) return NextResponse.json({ error: r.error || 'The email didn’t send', link }, { status: 502 })
  return NextResponse.json({ ok: true, to: ll.email, link })
}
