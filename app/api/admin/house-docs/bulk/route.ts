// The yearly certificate round (Harry sends every house its new certificates in mid/late September, once all are in).
// GET  /api/admin/house-docs/bulk?since=YYYY-MM-DD — every house: certificates uploaded since then, current tenants, last send
// POST /api/admin/house-docs/bulk { propertyIds, since, action: 'test' | 'send', message? }
//   send → every current tenant of each chosen house gets their own email with that house's certificates
//   test → one example (the first chosen house) to you
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { getElectedCommsLive } from '@/lib/comms'
import { sendEmail } from '@/lib/sendEmail'
import { senderFor } from '@/lib/email/sender'
import { demoPropertyIds } from '@/lib/demoProperties'
import { loadHouse, houseEmailHtml, defaultHouseSubject, defaultHouseMessage } from '@/lib/houseDocs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const defaultSince = () => `${new Date().getFullYear()}-07-01`

async function houses(since: string) {
  const s = svc()
  const [{ data: props }, demo] = await Promise.all([s.from('properties').select('id, name').order('name'), demoPropertyIds(s)])
  const { data: sends } = await s.from('house_document_sends').select('property_id, sent_at').order('sent_at', { ascending: false })
  const out = []
  for (const p of (props ?? []).filter(p => !demo.has(p.id))) {
    const h = await loadHouse(s, p.id)
    if (!h) continue
    const fresh = h.documents.filter(d => d.url && d.uploadedAt && d.uploadedAt.slice(0, 10) >= since)
    out.push({
      ...h.property,
      fresh: fresh.map(d => ({ key: d.key, label: d.label, nextDue: d.nextDue })),
      older: h.documents.filter(d => d.url && !fresh.includes(d)).map(d => d.label),
      tenants: h.tenants.length,
      lastSent: (sends ?? []).find((x: any) => x.property_id === p.id)?.sent_at ?? null,
    })
  }
  return out
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const since = req.nextUrl.searchParams.get('since') || defaultSince()
  return NextResponse.json({ since, houses: await houses(since), commsLive: await getElectedCommsLive(), defaultMessage: defaultHouseMessage })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const since = String(b.since || defaultSince())
  const ids: string[] = Array.isArray(b.propertyIds) ? b.propertyIds : []
  if (!ids.length) return NextResponse.json({ error: 'Tick at least one house.' }, { status: 400 })
  const message = String(b.message || '').trim() || defaultHouseMessage
  const s = svc()

  if (b.action === 'test') {
    const h = await loadHouse(s, ids[0])
    const docs = h?.documents.filter(d => d.url && d.uploadedAt && d.uploadedAt.slice(0, 10) >= since) ?? []
    if (!h || !docs.length) return NextResponse.json({ error: 'That house has no certificates uploaded since the date chosen.' }, { status: 400 })
    const sender = await senderFor(req)
    const r = await sendEmail(sender.replyTo, `[TEST] ${defaultHouseSubject(h.property.address)}`, houseEmailHtml(sender.name.split(' ')[0] || 'there', h.property.address, docs, message), { req })
    return r.ok ? NextResponse.json({ ok: true, sentTo: sender.replyTo }) : NextResponse.json({ error: r.error || 'The email could not be sent.' }, { status: 502 })
  }
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off (Settings). Send a test to yourself instead.' }, { status: 409 })

  const results = []
  for (const id of ids) {
    const h = await loadHouse(s, id)
    if (!h) continue
    const docs = h.documents.filter(d => d.url && d.uploadedAt && d.uploadedAt.slice(0, 10) >= since)
    if (!docs.length || !h.tenants.length) { results.push({ house: h.property.name, sent: 0, skipped: !docs.length ? 'no new certificates' : 'no tenants' }); continue }
    const subject = defaultHouseSubject(h.property.address)
    const recipients = []
    for (const t of h.tenants) {
      const r = await sendEmail(t.email, subject, houseEmailHtml(t.firstName, h.property.address, docs, message), { req })
      recipients.push({ person_id: t.personId, name: t.name, email: t.email, ok: r.ok, ...(r.ok ? {} : { error: r.error }) })
    }
    await s.from('house_document_sends').insert({
      property_id: id, subject, sent_by: admin.personId, recipients,
      documents: docs.map(d => ({ key: d.key, label: d.label, url: d.url, next_due: d.nextDue })),
    })
    results.push({ house: h.property.name, sent: recipients.filter(r => r.ok).length, failed: recipients.filter(r => !r.ok).map(r => r.name) })
  }
  return NextResponse.json({ ok: true, results })
}
