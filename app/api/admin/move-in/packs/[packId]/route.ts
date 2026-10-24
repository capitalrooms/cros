// PATCH /api/admin/move-in/packs/[packId]
//   { action: 'withdraw' } — cancel a pack's link (e.g. after re-sending corrected documents). The tenant sees "this
//                            pack has been replaced".
//   { action: 'remind' }   — the paperwork has gone quiet: email the tenant(s) a friendly reminder with the same link
//                            and the same documents attached again (15 Oct 2026). Logged as a 'sent' event "reminder:…".
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc, packLink, packReminderHtml, packReminderSubject, PACK_BUCKET } from '@/lib/movein/email'
import { loadPackContext, packFileName, GENERATED_KEYS, type GeneratedKey } from '@/lib/movein/pack'
import { getNewTenantCommsLive } from '@/lib/comms'
import { sendEmail } from '@/lib/sendEmail'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { packId } = await params
  const b = await req.json().catch(() => ({}))
  const s = svc()
  if (b.action === 'remind') return remind(req, s, packId)
  if (b.action !== 'withdraw') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const { error } = await s.from('tenancy_packs').update({ status: 'withdrawn' }).eq('id', packId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await s.from('tenancy_pack_events').insert({ pack_id: packId, event: 'withdrawn' })
  return NextResponse.json({ ok: true })
}

async function remind(req: NextRequest, s: ReturnType<typeof svc>, packId: string) {
  const { data: pack } = await s.from('tenancy_packs').select('id, tenancy_id, token, status, sent_at, first_viewed_at, documents').eq('id', packId).maybeSingle()
  if (!pack) return NextResponse.json({ error: 'Pack not found' }, { status: 404 })
  if (pack.status === 'withdrawn') return NextResponse.json({ error: 'This pack was withdrawn — send a new one instead.' }, { status: 409 })
  if (pack.status === 'confirmed') return NextResponse.json({ error: 'They’ve already confirmed this pack — no reminder needed.' }, { status: 409 })
  if (!(await getNewTenantCommsLive())) return NextResponse.json({ error: 'Tenant messages are paused (Settings) — chase them from your own email for now.' }, { status: 409 })
  const ctx = await loadPackContext(s, pack.tenancy_id)
  if (!ctx) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const to = ctx.tenant.emails
  if (!to.length) return NextResponse.json({ error: 'No email address on this tenancy.' }, { status: 400 })

  // the same agreement, check-in balance and prescribed information that were sent — read back from the pack, never regenerated
  const attachments: { filename: string; content: string }[] = []
  for (const d of (pack.documents ?? []) as { key: string; path?: string }[]) {
    if (!GENERATED_KEYS.includes(d.key as GeneratedKey) || !d.path) continue
    const { data: file } = await s.storage.from(PACK_BUCKET).download(d.path)
    if (file) attachments.push({ filename: packFileName(ctx, d.key as GeneratedKey), content: Buffer.from(await file.arrayBuffer()).toString('base64') })
  }
  const biz = await fetchPDFBizSettings()
  const res = await sendEmail(to, packReminderSubject(ctx), packReminderHtml(ctx, packLink(pack.token), { sentAt: pack.sent_at, opened: !!pack.first_viewed_at, phone: biz.phone }), { req, attachments })
  if (!res.ok) return NextResponse.json({ error: res.error || 'The reminder could not be sent.' }, { status: 502 })
  await s.from('tenancy_pack_events').insert({ pack_id: packId, event: 'sent', document_key: `reminder:${to.join(', ')}` })
  return NextResponse.json({ ok: true, sentTo: to })
}
