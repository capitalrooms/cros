/**
 * /api/admin/landlord-updates — tell the landlord about their incoming tenant (lib/landlordUpdates, migration 228).
 *   GET  ?applicantId= | ?tenancyId= [&stage=]   → { landlord, letOnly, place, stages, sent, draft? }
 *   POST { applicantId?, tenancyId?, stage, to, subject, message, facts: [{label, value}], docIds: [] }
 *        → emails the landlord (our house email, the signed-in person signs it); when documents are shared, or it's an
 *          offer to review, a private page goes with it that stops working after 7 days. Logged on the letting file.
 *          attachStatement: true (let-only tenancies) attaches the lettings statement PDF — rent and deposit received,
 *          our letting fee, the balance to the landlord (lib/lettingsStatement/forTenancy).
 *        preview: true → { html, attachments } exactly what would go — nothing saved, nothing sent (the composer's
 *          live preview, 6 Nov 2026). extra: [{ name, data (base64) }] — files added from the computer (≤ 3 MB in all).
 * Office and lettings staff only. Nothing is sent without someone pressing Send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { deliverEmail } from '@/lib/sendEmail'
import { landlordCopyTo } from '@/lib/landlord/correspondence'
import { PORTAL_URL } from '@/lib/emailWrapper'
import { landlordUpdateHtml } from '@/lib/landlordUpdates/email'
import { lettingsStatementFor } from '@/lib/lettingsStatement/forTenancy'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { loadUpdateContext, stageStatus, draftFor, headlineFor, newShareToken, STAGES, STAGE_LABEL, SHARE_DAYS, type UpdateStage } from '@/lib/landlordUpdates/updates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  if (!to.length && b.preview !== true) return NextResponse.json({ error: 'Add the landlord’s email address' }, { status: 400 })
  if (!subject || !message) return NextResponse.json({ error: 'The email needs a subject and a message' }, { status: 400 })
  const facts = (Array.isArray(b.facts) ? b.facts : []).filter((f: any) => f && String(f.label ?? '').trim() && String(f.value ?? '').trim())
    .slice(0, 30).map((f: any) => ({ label: String(f.label).slice(0, 60), value: String(f.value).slice(0, 400) }))
  // only this tenant's own documents can be shared
  const known = new Set(c.docs.map(d => d.id))
  const docIds = (Array.isArray(b.docIds) ? b.docIds : []).map(String).filter((id: string) => known.has(id))
  // attachDocs (4 Nov 2026, Harry: "email the landlord reference … or just id or just right to rent doc"): the chosen
  // documents go on the email itself instead of a 7-day private page
  const attachDocs = !!b.attachDocs && docIds.length > 0
  const withPage = (docIds.length > 0 && !attachDocs) || stage === 'offer'
  const preview = b.preview === true

  // ── what goes with it: the statement, the chosen documents, files added from the computer ──
  const attachments: { filename: string; content: string }[] = []
  const names: string[] = []
  const used = new Set<string>()
  const nameFor = (want: string) => { let n = want.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Document.pdf', i = 2; const [b0, ext] = [n.replace(/(\.[a-z0-9]{2,5})$/i, ''), n.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '']; while (used.has(n.toLowerCase())) n = `${b0} (${i++})${ext}`; used.add(n.toLowerCase()); return n }
  let total = 0
  let statement = null as Awaited<ReturnType<typeof lettingsStatementFor>> | null
  if (b.attachStatement && c.tenancyId) {
    statement = await lettingsStatementFor(s as any, c.tenancyId)
    if ('error' in statement) return NextResponse.json({ error: `The statement couldn’t be made: ${statement.error}` }, { status: 400 })
    const n = nameFor(statement.filename); names.push(n); total += statement.buffer.length
    if (!preview) attachments.push({ filename: n, content: statement.buffer.toString('base64') })
  }
  if (attachDocs) {
    const { sharedDocs } = await import('@/lib/landlordUpdates/open')
    const { readStoredFile } = await import('@/lib/files/server')
    const failed: string[] = []
    for (const d of await sharedDocs(s as any, docIds)) {
      // "Signed tenancy agreement - Mr Ziqing Wang.pdf" rather than whatever the file was called when it was uploaded
      const ext = (String(d.fileName ?? '').match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.pdf').toLowerCase()
      // a report or piece of evidence keeps its own name ("Credit check"), as there can be several of one kind
      const stem = String(d.fileName ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/^(.*) — /, '').trim()
      const what = ['reference_report', 'referencing_evidence', 'other', 'guarantor_document'].includes(d.type ?? '') && stem && !/^report\b/i.test(stem) ? stem : d.label
      const n = nameFor(`${what}${c.tenant.name ? ` - ${c.tenant.name}` : ''}${ext}`)
      names.push(n)
      if (preview) continue
      try {
        if (!d.url) throw new Error('no file')
        const { bytes } = await readStoredFile(d.url)
        if (total + bytes.length > 18 * 1024 * 1024) { failed.push(`${d.label} (too large to email)`); continue }   // stay under the email size limit
        total += bytes.length
        attachments.push({ filename: n, content: Buffer.from(bytes).toString('base64') })
      } catch { failed.push(d.label) }
    }
    if (failed.length) return NextResponse.json({ error: `Couldn’t attach: ${failed.join(', ')}. Nothing was sent — untick ${failed.length === 1 ? 'it' : 'them'}, or send as a private page instead.` }, { status: 400 })
  }
  const extra = (Array.isArray(b.extra) ? b.extra : []).slice(0, 10).filter((x: any) => x && typeof x.data === 'string' && String(x.name ?? '').trim())
  let extraBytes = 0
  for (const x of extra) {
    extraBytes += Math.floor(String(x.data).length * 0.75)
    const n = nameFor(String(x.name).slice(0, 120)); names.push(n)
    if (!preview) attachments.push({ filename: n, content: String(x.data) })
  }
  if (extraBytes > 3 * 1024 * 1024) return NextResponse.json({ error: 'Files added from your computer come to more than 3 MB — add large ones to the letting file’s documents instead and tick them here.' }, { status: 400 })

  const headline = headlineFor(c, stage)
  const emailParts = { stage, message, facts, headline, statement: statement && !('error' in statement) ? statement.figures : null, attached: names }
  if (preview) {
    const html = await landlordUpdateHtml({ ...emailParts, link: withPage ? `${PORTAL_URL}/lu/preview` : null, until: withPage ? new Date(Date.now() + SHARE_DAYS * 86_400_000).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }) : null, req })
    return NextResponse.json({ html, attachments: names, to, subject })
  }

  const token = withPage ? newShareToken() : null
  const expires = withPage ? new Date(Date.now() + SHARE_DAYS * 86_400_000) : null
  const { data: row, error } = await s.from('landlord_updates').insert({
    applicant_id: c.applicantId, tenancy_id: c.tenancyId, landlord_id: c.landlord?.id ?? null, stage, sent_to: to, subject, facts,
    doc_ids: docIds, share_token: token, share_expires_at: expires?.toISOString() ?? null, sent_by: who.email,
  }).select('id').single()
  if (error) return missingTable(error) ? setup() : NextResponse.json({ error: error.message }, { status: 500 })

  const until = expires?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' })
  const link = token ? `${PORTAL_URL}/lu/${token}` : ''
  const html = await landlordUpdateHtml({ ...emailParts, link: link || null, until: until ?? null, req })

  // the landlord's copy-in list (an accountant …) gets it too (migration 239)
  const copy = c.landlord?.id ? (await landlordCopyTo(s as any, c.landlord.id)).cc.filter(e => !to.map((x: string) => x.toLowerCase()).includes(e)) : []
  const sent = await deliverEmail({ to, ...(copy.length ? { cc: copy } : {}), subject, html, attachments: attachments.length ? attachments : undefined }, { req })
  if (!sent.ok) {
    await s.from('landlord_updates').delete().eq('id', (row as any).id)   // nothing went out — no record of a send
    const e = await sent.json().catch(() => ({}))
    return NextResponse.json({ error: `The email didn’t send: ${(e as any)?.message ?? sent.statusText}` }, { status: 502 })
  }
  if (c.tenancyId) await logTenancyEvent(s, c.tenancyId, 'landlord_update', `Landlord told: ${STAGE_LABEL[stage]} → ${to.join(', ')}${docIds.length ? ` · ${docIds.length} document${docIds.length === 1 ? '' : 's'} ${attachDocs ? 'attached' : `shared for ${SHARE_DAYS} days`}` : ''}${names.length && (attachDocs || statement || extra.length) ? ` · attached: ${names.join(', ')}` : ''}`, who.email)
  return NextResponse.json({ ok: true, sentTo: to, link: link || null })
}
