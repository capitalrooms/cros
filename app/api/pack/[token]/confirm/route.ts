// POST /api/pack/[token]/confirm { name, questions? } — the tenant confirms they've read the documents and are
// ready to sign. Recorded with date, time and IP; whoever sent the pack is emailed.
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/sendEmail'
import { tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { defaultSender } from '@/lib/email/sender'
import { svc } from '@/lib/movein/email'
import { packByToken, logPackEvent, clientIp } from '@/lib/movein/public'

export const dynamic = 'force-dynamic'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { pack } = await packByToken((await params).token)
  if (!pack || pack.status === 'withdrawn') return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  if (pack.confirmed_at) return NextResponse.json({ ok: true, already: true })
  const b = await req.json().catch(() => ({}))
  const name = String(b.name || '').trim().slice(0, 120)
  const questions = String(b.questions || '').trim().slice(0, 4000) || null
  if (name.length < 2) return NextResponse.json({ error: 'Please type your full name to confirm.' }, { status: 400 })

  const s = svc()
  const now = new Date().toISOString()
  const { error } = await s.from('tenancy_packs').update({
    status: 'confirmed', confirmed_at: now, confirmed_name: name, confirmed_ip: clientIp(req), tenant_questions: questions,
  }).eq('id', pack.id)
  if (error) return NextResponse.json({ error: 'Could not save your confirmation. Please reply to our email instead.' }, { status: 500 })
  await logPackEvent(req, pack.id, 'confirmed')

  const { data: sender } = pack.sent_by ? await s.from('people').select('email').eq('id', pack.sent_by).maybeSingle() : { data: null }
  const opened = (await s.from('tenancy_pack_events').select('document_key').eq('pack_id', pack.id).eq('event', 'opened_document')).data ?? []
  const openedKeys = new Set(opened.map((e: any) => e.document_key))
  const unopened = pack.documents.filter(d => d.available && !openedKeys.has(d.key)).map(d => d.label)
  await sendEmail((sender as any)?.email || 'management@capitalrooms.co.uk', `Ready to sign: ${pack.tenant_name} — ${pack.summary.address || ''}`, `
    <p><strong>${esc(pack.tenant_name)}</strong> has confirmed they’ve read their move-in pack and is ready to sign.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${tableRow('Property', esc(pack.summary.address || ''))}
      ${tableRow('Confirmed as', esc(name))}
      ${tableRow('Documents opened', `${openedKeys.size} of ${pack.documents.filter(d => d.available).length}`)}
      ${unopened.length ? tableRow('Not opened', esc(unopened.join(', '))) : ''}
      ${questions ? tableRow('Their questions', esc(questions).replace(/\n/g, '<br>')) : ''}
    </table>
    <p>Next: send the agreement for signing (Adobe Sign).</p>
    ${ctaButton('Open move-in pack', `${PORTAL_URL}/admin/move-in/${pack.tenancy_id}`)}`,
    { sender: await defaultSender(), signature: false }).catch(() => {})
  return NextResponse.json({ ok: true })
}
