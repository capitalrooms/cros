// POST /api/admin/move-in/[tenancyId]/send
//   { action: 'preview', docs, message }           → { html, from, subject }
//   { action: 'link' | 'test' | 'send', docs, parking?, to?, cc?, subject, message }
//     link → create the pack and its private link only (e.g. to paste into your own email)
//     test → create the pack and email it to YOU (the signed-in admin), not the tenant
//     send → create the pack and email the tenant (blocked while tenant messaging is paused)
// Creating a pack snapshots the documents and figures, and stores the generated agreement and check-in balance,
// so what the tenant opens later is exactly what was sent.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdmin } from '@/lib/adminAuth'
import { getNewTenantCommsLive } from '@/lib/comms'
import { sendEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { senderFor } from '@/lib/email/sender'
import { loadPackContext, moneySummary, renderAgreement, renderCheckIn, packFileName, type PackDoc } from '@/lib/movein/pack'
import { svc, newPackToken, packLink, packEmailHtml, defaultPackSubject, PACK_BUCKET } from '@/lib/movein/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const split = (v: unknown) => String(v || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  const action = String(b.action || '')
  const s = svc()
  const ctx = await loadPackContext(s, tenancyId)
  if (!ctx) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })

  const wanted: string[] = Array.isArray(b.docs) ? b.docs : ctx.documents.filter(d => d.include).map(d => d.key)
  const docs = ctx.documents.filter(d => wanted.includes(d.key))
  const message = String(b.message || '').trim()
  const sender = await senderFor(req)

  if (action === 'preview') {
    const html = await buildEmail(packEmailHtml(ctx, docs, packLink('your-private-link'), message), { sender })
    return NextResponse.json({ html, from: sender.from, subject: defaultPackSubject(ctx) })
  }
  if (!['link', 'test', 'send'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const missing = [!ctx.startDate && 'move-in date', !ctx.rentMonthly && 'monthly rent', !ctx.tenant.email && 'tenant email'].filter(Boolean)
  if (missing.length) return NextResponse.json({ error: `Add the ${missing.join(', ')} first.` }, { status: 400 })
  if (!docs.length) return NextResponse.json({ error: 'Pick at least one document.' }, { status: 400 })

  let to = split(b.to).length ? split(b.to) : [ctx.tenant.email]
  const cc = split(b.cc)
  if (action === 'test') to = [sender.replyTo]
  if (action === 'send') {
    if (!(await getNewTenantCommsLive())) return NextResponse.json({ error: 'Tenant messages are paused (Settings). Send a test to yourself, or create the link and send it from your own email.' }, { status: 409 })
    const bad = [...to, ...cc].find(e => !EMAIL.test(e))
    if (bad) return NextResponse.json({ error: `“${bad}” isn’t a valid email address.` }, { status: 400 })
  }

  // ── Create the pack: generated files stored, documents + figures snapshotted ──
  const packId = randomUUID()
  const token = newPackToken()
  const generated: Partial<Record<'agreement' | 'check_in', Buffer>> = {}
  if (docs.some(d => d.key === 'agreement')) generated.agreement = await renderAgreement(ctx, { parking: !!b.parking })
  if (docs.some(d => d.key === 'check_in')) generated.check_in = await renderCheckIn(ctx)
  const snapshot = docs.map((d: PackDoc) => ({
    key: d.key, label: d.label, group: d.group, source: d.source, available: d.available,
    ...(d.source === 'generated' ? { path: `tenancy-packs/${packId}/${d.key}.pdf` } : { url: d.url }),
  }))
  const { error: insErr } = await s.from('tenancy_packs').insert({
    id: packId, tenancy_id: tenancyId, token, tenant_name: ctx.tenant.name, tenant_email: ctx.tenant.email,
    documents: snapshot, summary: { ...moneySummary(ctx), address: ctx.address, firstName: ctx.tenant.firstName }, message: message || null,
    sent_by: admin.personId, status: 'sent',
  })
  if (insErr) {
    const setup = insErr.code === 'PGRST205' || insErr.code === '42P01'
    return NextResponse.json({ error: setup ? 'Run migration 187 in Supabase to send packs.' : insErr.message }, { status: 500 })
  }
  // Store the generated files at the paths the pack record points to (record first, so a failed save never
  // leaves orphan files); if storing fails the pack is withdrawn so its link can't show missing documents.
  // The property's certificates are copied in too, so the pack keeps working even if a certificate on the
  // property is later replaced or deleted.
  const copied: Record<string, string> = {}
  for (const d of docs.filter(x => x.source === 'property' && x.available && x.url)) {
    try {
      const res = await fetch(d.url!, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) continue
      const path = `tenancy-packs/${packId}/${d.key}.pdf`
      const { error } = await s.storage.from(PACK_BUCKET).upload(path, Buffer.from(await res.arrayBuffer()), { contentType: res.headers.get('content-type') || 'application/pdf', upsert: true })
      if (!error) copied[d.key] = path
    } catch { /* keep the property link as the fallback */ }
  }
  if (Object.keys(copied).length) {
    await s.from('tenancy_packs').update({ documents: snapshot.map(x => copied[x.key] ? { ...x, path: copied[x.key] } : x) }).eq('id', packId)
  }
  for (const [key, pdf] of Object.entries(generated)) {
    const { error } = await s.storage.from(PACK_BUCKET).upload(`tenancy-packs/${packId}/${key}.pdf`, pdf!, { contentType: 'application/pdf', upsert: true })
    if (error) {
      await s.from('tenancy_packs').update({ status: 'withdrawn' }).eq('id', packId)
      return NextResponse.json({ error: `Could not store the ${key === 'agreement' ? 'agreement' : 'check-in balance'}: ${error.message}` }, { status: 500 })
    }
  }
  const link = packLink(token)
  if (action === 'link') return NextResponse.json({ ok: true, link, packId })

  const subject = String(b.subject || '').trim() || defaultPackSubject(ctx)
  const res = await sendEmail(to, action === 'test' ? `[TEST] ${subject}` : subject, packEmailHtml(ctx, docs, link, message), {
    req, cc: action === 'send' && cc.length ? cc : undefined,
    attachments: Object.entries(generated).map(([key, pdf]) => ({ filename: packFileName(ctx, key as 'agreement' | 'check_in'), content: pdf!.toString('base64') })),
  })
  if (!res.ok) return NextResponse.json({ error: res.error || 'The email could not be sent.', link }, { status: 502 })
  await s.from('tenancy_pack_events').insert({ pack_id: packId, event: 'sent', document_key: action === 'test' ? `test:${to[0]}` : to.join(', ') })
  return NextResponse.json({ ok: true, link, packId, sentTo: to })
}
