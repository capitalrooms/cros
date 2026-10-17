/**
 * /api/lu/[token] — the landlord's private page for one update about their incoming tenant (migration 228).
 *   GET  → what we sent them: the place, the facts, the documents (names only) and, for an offer, their answer so far
 *   POST { answer: 'approved' | 'declined', note? } → their answer on an offer to review; the office is emailed
 * No sign-in: the link is the key, and it stops working after 7 days.
 */
import { NextRequest, NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail, tableRow, PORTAL_URL } from '@/lib/emailWrapper'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { STAGE_LABEL, type UpdateStage } from '@/lib/landlordUpdates/updates'
import { openUpdate, sharedDocs } from '@/lib/landlordUpdates/open'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await openUpdate(token)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: o.status })
  const { s, u } = o
  if (!u.first_viewed_at) await s.from('landlord_updates').update({ first_viewed_at: new Date().toISOString() }).eq('id', u.id)
  const docs = await sharedDocs(s, u.doc_ids ?? [])
  return NextResponse.json({
    stage: u.stage as UpdateStage, title: STAGE_LABEL[u.stage as UpdateStage], subject: u.subject, facts: u.facts ?? [],
    docs: docs.map(d => ({ id: d.id, label: d.label, fileName: d.fileName, kind: d.kind })),
    expires: u.share_expires_at, answer: u.answer, answerNote: u.answer_note, answeredAt: u.answered_at,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await openUpdate(token)
  if ('error' in o) return NextResponse.json({ error: o.error }, { status: o.status })
  const { s, u } = o
  if (u.stage !== 'offer') return NextResponse.json({ error: 'There’s nothing to answer on this page.' }, { status: 400 })
  if (u.answer) return NextResponse.json({ error: 'You’ve already answered — thank you. Reply to our email if anything has changed.' }, { status: 409 })
  const b = await req.json().catch(() => ({}))
  const answer = b.answer === 'approved' || b.answer === 'declined' ? b.answer : null
  if (!answer) return NextResponse.json({ error: 'Choose an answer' }, { status: 400 })
  const note = String(b.note ?? '').trim().slice(0, 2000) || null
  await s.from('landlord_updates').update({ answer, answer_note: note, answered_at: new Date().toISOString() }).eq('id', u.id)

  // tell the office straight away — whoever sent it, and the shared mailbox
  const name = (u.facts ?? []).find((f: any) => (f.label === 'Full name' || f.label === 'Name'))?.value ?? 'the applicant'
  const words = answer === 'approved' ? 'is happy for us to go ahead with' : 'would rather not go ahead with'
  const html = await buildEmail(`
    <p>The landlord ${words} the offer from <strong>${esc(name)}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
      ${tableRow('Offer', esc(u.subject ?? ''))}
      ${tableRow('Answer', answer === 'approved' ? 'Happy to go ahead' : 'Not this one')}
      ${note ? tableRow('Their note', esc(note).replace(/\n/g, '<br>')) : ''}
    </table>
    ${u.applicant_id ? `<p><a href="${PORTAL_URL}/admin/applicants">Open Applicants</a></p>` : ''}`, { signature: false })
  await deliverEmail({ to: [...new Set([u.sent_by, 'management@capitalrooms.co.uk'].filter(Boolean))], subject: `Landlord ${answer === 'approved' ? 'approved' : 'declined'}: ${u.subject ?? 'offer'}`, html })
  if (u.tenancy_id) await logTenancyEvent(s, u.tenancy_id, 'landlord_answer', `Landlord ${answer === 'approved' ? 'approved' : 'declined'} the offer${note ? `: ${note}` : ''}`, null)
  return NextResponse.json({ ok: true, answer })
}
