// POST /api/agreement/[token]/confirm { name, questions? } — the landlord has read the agreement and is ready to
// sign. Recorded with date, time and IP; whoever sent it is emailed (as the tenant move-in pack does).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/sendEmail'
import { tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { defaultSender } from '@/lib/email/sender'
import { agreementByToken } from '@/lib/managementAgreement/review'
import { clientIp } from '@/lib/movein/public'

export const dynamic = 'force-dynamic'
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const a = await agreementByToken((await params).token)
  if (!a) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  if (a.ready_at) return NextResponse.json({ ok: true, already: true })
  const b = await req.json().catch(() => ({}))
  const name = String(b.name || '').trim().slice(0, 120)
  const questions = String(b.questions || '').trim().slice(0, 4000) || null
  if (name.length < 2) return NextResponse.json({ error: 'Please type your full name to confirm.' }, { status: 400 })

  const { error } = await createServiceClient().from('management_agreements').update({
    ready_at: new Date().toISOString(), ready_name: name, ready_ip: clientIp(req), ready_questions: questions,
  }).eq('id', a.id)
  if (error) return NextResponse.json({ error: 'Could not save your confirmation. Please reply to our email instead.' }, { status: 500 })

  const props = (a.properties ?? []).map((p: string) => p.split('\n')[0]).join(', ')
  await sendEmail(a.review_sent_by || 'management@capitalrooms.co.uk', `Ready to sign: ${a.client_name || 'Landlord'} — agreement v${a.version}`, `
    <p><strong>${esc(a.client_name || 'The landlord')}</strong> has read their agreement and is ready to sign.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${tableRow('Properties', esc(props))}
      ${tableRow('Version', `v${a.version}`)}
      ${tableRow('Confirmed as', esc(name))}
      ${questions ? tableRow('Their questions', esc(questions).replace(/\n/g, '<br>')) : ''}
    </table>
    <p>Next: download the PDF and send it for signing (Adobe Sign).</p>
    ${ctaButton('Open agreements', `${PORTAL_URL}/admin/new-business/management-agreement`)}`,
    { sender: await defaultSender(), signature: false }).catch(() => {})
  return NextResponse.json({ ok: true })
}
