// Contractor-started quote requests (Nov 2026). A contractor asks the office to price work they've discussed, at any time,
// with or without open jobs. Nothing goes to other contractors until the office approves it.
//   GET  ?postcode=…     → houses on the system matching the postcode (address only, no tenant details)
//   GET                  → { houses: the contractor's own past houses, requests: their own requests }
//   POST { propertyId? | unlisted: { address, postcode? }, work, reason? } → saves it, emails the office
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()
const POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/

async function contractorCaller(req: NextRequest) {
  const c = await requireSignedIn(req)
  return c && (c.role === 'contractor' || isStaff(c)) ? c : null
}

export async function GET(req: NextRequest) {
  const c = await contractorCaller(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient() as any
  const postcode = (req.nextUrl.searchParams.get('postcode') ?? '').replace(/\s+/g, '').toUpperCase()

  if (postcode) {
    if (postcode.length < 3) return NextResponse.json({ houses: [] })
    const { data } = await s.from('properties').select('id, name, address, postcode').ilike('postcode', `${postcode}%`).limit(20)
    return NextResponse.json({ houses: data ?? [] })
  }

  // houses this contractor has worked at (address only)
  const { data: tickets } = await s.from('maintenance_tickets').select('property_id, properties(id, name, address, postcode)').eq('contractor_id', c.personId).not('property_id', 'is', null).limit(200)
  const seen = new Map<string, any>()
  for (const t of tickets ?? []) if (t.properties && !seen.has(t.property_id)) seen.set(t.property_id, t.properties)

  const { data: requests } = await s.from('contractor_quote_requests').select('id, property_id, unlisted_address, postcode, work, status, created_at, properties(name, address)').eq('contractor_id', c.personId).order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ houses: [...seen.values()], requests: requests ?? [] })
}

export async function POST(req: NextRequest) {
  const c = await contractorCaller(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as any
  const work = String(b.work ?? '').trim().slice(0, 2000)
  const reason = String(b.reason ?? '').trim().slice(0, 500) || null
  if (work.length < 5) return NextResponse.json({ error: 'Tell us what the work is, in a few words.' }, { status: 400 })

  const s = createServiceClient() as any
  let propertyId: string | null = null
  let unlistedAddress: string | null = null
  let postcode: string | null = null
  let houseLabel = ''

  if (b.propertyId) {
    const { data: p } = await s.from('properties').select('id, name, address, postcode').eq('id', String(b.propertyId)).maybeSingle()
    if (!p) return NextResponse.json({ error: 'That house isn’t on the system. Enter its address instead.' }, { status: 400 })
    propertyId = p.id
    houseLabel = [p.name, p.address].filter(Boolean).join(', ')
  } else {
    const address = String(b.unlisted?.address ?? '').trim().slice(0, 300)
    const pc = String(b.unlisted?.postcode ?? '').trim().toUpperCase().slice(0, 10) || null
    if (address.length < 5) return NextResponse.json({ error: 'Enter the house address.' }, { status: 400 })
    if (pc && !POSTCODE.test(pc)) return NextResponse.json({ error: 'That postcode doesn’t look right. Check it, or leave it blank.' }, { status: 400 })
    unlistedAddress = address
    postcode = pc
    houseLabel = [address, pc].filter(Boolean).join(', ')
  }

  // a double tap mustn't make two requests
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: dupe } = await s.from('contractor_quote_requests').select('id').eq('contractor_id', c.personId).eq('work', work).gte('created_at', since).maybeSingle()
  if (dupe) return NextResponse.json({ ok: true, id: dupe.id, duplicate: true })

  const { data: row, error } = await s.from('contractor_quote_requests').insert({
    contractor_id: c.personId, property_id: propertyId, unlisted_address: unlistedAddress, postcode, work, reason,
  }).select('id').single()
  if (error || !row) return NextResponse.json({ error: 'That didn’t save. Please try again in a moment.' }, { status: 500 })

  const { data: me } = await s.from('people').select('full_name, first_name, last_name').eq('id', c.personId).maybeSingle()
  const who = me?.full_name || [me?.first_name, me?.last_name].filter(Boolean).join(' ') || 'A contractor'
  const body = `<p style="margin:0 0 12px"><strong>${who}</strong> wants a quote for work at <strong>${houseLabel}</strong>.</p>
    <p style="margin:0 0 12px">${work.replace(/</g, '&lt;')}</p>
    ${reason ? `<p style="margin:0 0 12px;color:#4E6158">Why: ${reason.replace(/</g, '&lt;')}</p>` : ''}
    <p style="margin:0">Approve it to ask contractors for prices, or turn it down.</p>${officeButton('/admin/maintenance', 'Review the request')}`
  await deliverEmail({
    to: OFFICE_ALERT_EMAIL,
    subject: oneLine(`Quote request from ${who} — ${houseLabel}`),
    html: await buildEmail(body, { kind: 'office-notice-given' }),
  }).catch(e => console.error('Contractor quote request notify failed:', e))

  return NextResponse.json({ ok: true, id: row.id })
}
