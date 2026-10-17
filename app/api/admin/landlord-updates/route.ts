/**
 * /api/admin/landlord-updates — tell the landlord about their incoming tenant (lib/landlordUpdates, migration 228).
 *   GET  ?applicantId= | ?tenancyId= [&stage=]   → { landlord, letOnly, place, stages, sent, draft? }
 *   POST { applicantId?, tenancyId?, stage, to, subject, message, facts: [{label, value}], docIds: [] }
 *        → emails the landlord (our house email, the signed-in person signs it); when documents are shared, or it's an
 *          offer to review, a private page goes with it that stops working after 7 days. Logged on the letting file.
 * Office and lettings staff only. Nothing is sent without someone pressing Send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail, tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { loadUpdateContext, stageStatus, draftFor, newShareToken, STAGES, STAGE_LABEL, SHARE_DAYS, type UpdateStage } from '@/lib/landlordUpdates/updates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const setup = () => NextResponse.json({ setupNeeded: true, error: 'Landlord updates need migration 228 running in Supabase first.' }, { status: 503 })
const missingTable = (e: any) => /landlord_updates/.test(String(e?.message ?? ''))

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const q = req.nextUrl.searchParams
  const probe = await s.from('landlord_updates').select('id').limit(1)
  if (probe.error && missingTable(probe.error)) return setup()
  const c = await loadUpdateContext(s, { applicantId: q.get('applicantId'), tenancyId: q.get('tenancyId') })
  if (!c) return NextResponse.json({ error: 'Nothing found for this tenant' }, { status: 404 })
  const stage = q.get('stage') as UpdateStage | null
  return NextResponse.json({
    landlord: c.landlord, letOnly: c.letOnly, place: c.place, tenant: c.tenant.name, tenancyId: c.tenancyId, applicantId: c.applicantId,
    stages: stageStatus(c).map(x => ({ ...x, label: STAGE_LABEL[x.stage] })),
    sent: c.sent,
    ...(stage && STAGES.includes(stage) ? { draft: draftFor(c, stage) } : {}),
  })
}

export async function POST(req: NextRequest) {
  const who = await requireStaff(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const b = await req.json().catch(() => ({}))
  const stage = b.stage as UpdateStage
  if (!STAGES.includes(stage)) return NextResponse.json({ error: 'Which update is this?' }, { status: 400 })
  const c = await loadUpdateContext(s, { applicantId: b.applicantId ?? null, tenancyId: b.tenancyId ?? null })
  if (!c) return NextResponse.json({ error: 'Nothing found for this tenant' }, { status: 404 })

  const to = String(b.to ?? '').split(/[\s,;]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
  const subject = String(b.subject ?? '').trim()
  const message = String(b.message ?? '').trim()
  if (!to.length) return NextResponse.json({ error: 'Add the landlord’s email address' }, { status: 400 })
  if (!subject || !message) return NextResponse.json({ error: 'The email needs a subject and a message' }, { status: 400 })
  const facts = (Array.isArray(b.facts) ? b.facts : []).filter((f: any) => f && String(f.label ?? '').trim() && String(f.value ?? '').trim())
    .slice(0, 30).map((f: any) => ({ label: String(f.label).slice(0, 60), value: String(f.value).slice(0, 400) }))
  // only this tenant's own documents can be shared
  const known = new Set(c.docs.map(d => d.id))
  const docIds = (Array.isArray(b.docIds) ? b.docIds : []).map(String).filter((id: string) => known.has(id))
  const withPage = docIds.length > 0 || stage === 'offer'
  const token = withPage ? newShareToken() : null
  const expires = withPage ? new Date(Date.now() + SHARE_DAYS * 86_400_000) : null

  const { data: row, error } = await s.from('landlord_updates').insert({
    applicant_id: c.applicantId, tenancy_id: c.tenancyId, landlord_id: c.landlord?.id ?? null, stage, sent_to: to, subject, facts,
    doc_ids: docIds, share_token: token, share_expires_at: expires?.toISOString() ?? null, sent_by: who.email,
  }).select('id').single()
  if (error) return missingTable(error) ? setup() : NextResponse.json({ error: error.message }, { status: 500 })

  const until = expires?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' })
  const link = token ? `${PORTAL_URL}/lu/${token}` : ''
  const paras = esc(message).split(/\n{2,}/)
  const signOff = paras.length > 1 && /^(kind regards|best wishes|regards|many thanks|yours)/i.test(paras[paras.length - 1]) ? paras.pop()! : ''
  const html = await buildEmail(`
    ${paras.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
    ${facts.length ? `<table style="width:100%;border-collapse:collapse;margin:14px 0 18px;">${facts.map((f: any) => tableRow(esc(f.label), esc(f.value))).join('')}</table>` : ''}
    ${link ? ctaButton(stage === 'offer' ? 'Review the offer' : 'View the tenant’s documents', link) : ''}
    ${link ? `<p style="color:#78716c;font-size:12.5px;text-align:center;margin-top:-10px;">This private link works until ${until}.</p>` : ''}
    ${signOff ? `<p>${signOff}</p>` : ''}`, { req })

  const sent = await deliverEmail({ to, subject, html }, { req })
  if (!sent.ok) {
    await s.from('landlord_updates').delete().eq('id', (row as any).id)   // nothing went out — no record of a send
    const e = await sent.json().catch(() => ({}))
    return NextResponse.json({ error: `The email didn’t send: ${(e as any)?.message ?? sent.statusText}` }, { status: 502 })
  }
  if (c.tenancyId) await logTenancyEvent(s, c.tenancyId, 'landlord_update', `Landlord told: ${STAGE_LABEL[stage]} → ${to.join(', ')}${docIds.length ? ` · ${docIds.length} document${docIds.length === 1 ? '' : 's'} shared for ${SHARE_DAYS} days` : ''}`, who.email)
  return NextResponse.json({ ok: true, sentTo: to, link: link || null })
}
