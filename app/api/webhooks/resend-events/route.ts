// Opens, clicks, deliveries and bounces from Resend (13 Nov 2026 — Publish's report, as Mailchimp shows it). Resend
// signs every event (Svix); without the signing secret nothing is accepted. Matched to the send by the email's id
// (publication_sends.provider_id, migration 287). Set up once in Resend: Webhooks → this address, events
// email.delivered / email.opened / email.clicked / email.bounced; the signing secret goes in RESEND_EVENTS_SECRET.
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function verified(raw: string, h: Headers) {
  const secret = process.env.RESEND_EVENTS_SECRET
  if (!secret) return false
  const id = h.get('svix-id'), ts = h.get('svix-timestamp'), sig = h.get('svix-signature')
  if (!id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64')
  return sig.split(' ').some(part => { const v = part.split(',')[1] ?? ''; return v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)) })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verified(raw, req.headers)) return NextResponse.json({ error: 'Not signed' }, { status: 401 })
  const e = JSON.parse(raw || '{}')
  const id = e?.data?.email_id
  if (!id) return NextResponse.json({ ok: true })
  const s = createServiceClient()
  const { data: row } = await s.from('publication_sends').select('id, opens, clicks, links, opened_at, clicked_at').eq('provider_id', id).maybeSingle() as { data: any }
  if (!row) return NextResponse.json({ ok: true })        // not a Publish email — nothing to record
  const at = e.created_at ?? new Date().toISOString()
  const set: Record<string, unknown> = {}
  if (e.type === 'email.delivered') set.delivered_at = at
  if (e.type === 'email.opened') { set.opens = (row.opens ?? 0) + 1; if (!row.opened_at) set.opened_at = at }
  if (e.type === 'email.clicked') {
    const url = String(e.data?.click?.link ?? '').slice(0, 300)
    set.clicks = (row.clicks ?? 0) + 1; if (!row.clicked_at) set.clicked_at = at
    if (!row.opened_at) set.opened_at = at              // a click means it was opened, even if the open wasn't seen
    if (url) set.links = { ...(row.links ?? {}), [url]: ((row.links ?? {})[url] ?? 0) + 1 }
  }
  if (e.type === 'email.bounced') set.bounced = String(e.data?.bounce?.message ?? 'bounced').slice(0, 200)
  if (Object.keys(set).length) await s.from('publication_sends').update(set).eq('id', row.id)
  return NextResponse.json({ ok: true })
}
