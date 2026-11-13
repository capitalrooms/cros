/**
 * "Your references are complete — we're preparing your paperwork" (13 Nov 2026, Harry: there was no way to tell a tenant
 * referencing had finished and we're now preparing their paperwork). From the letting file's Referencing step.
 *   POST { action: 'preview', look? } → { to, subject, html }
 *   POST { action: 'send', look? }    → sends to the tenant (and joint tenant), logs it on the file
 * Office and lettings staff. Sent only when someone presses Send — never on its own.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadLettingFile } from '@/lib/lettings/lettingFile'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { isWholeLet, oneLine, houseName } from '@/lib/lettings/letWording'
import { sendEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { themeByKey } from '@/lib/email/themes'
import { getElectedCommsLive } from '@/lib/comms'
import { dearName } from '@/lib/people'

export const dynamic = 'force-dynamic'

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const longDate = (s: string | null | undefined) => s ? new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
const LOOKS: Record<string, string> = { website: 'website', landlord: 'editorial' }

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const r = await loadLettingFile(s, tenancyId)
  if (!r.file) return NextResponse.json({ error: r.error || 'Letting file not found' }, { status: 404 })
  const f: any = r.file
  const t = f.tenancy

  const to = [f.tenant?.email, f.jointTenant?.email].filter((e: any) => typeof e === 'string' && e.includes('@'))
  const whole = isWholeLet(f.property.type, f.room.name)
  const house = houseName(f.property.address || f.property.name)
  const address = oneLine(f.property.address || f.property.name)
  // the one greeting rule (lib/people dearName): "Dear Ms Patel," — both names on a joint tenancy
  const ids = [f.tenant?.id, f.jointTenant?.id].filter(Boolean)
  const { data: ppl } = ids.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name').in('id', ids) : { data: [] as any[] }
  const dears = ids.map(id => (ppl ?? []).find((p: any) => p.id === id)).filter(Boolean).map((p: any) => dearName(p))
  const hello = dears.length > 1 ? `${dears[0]} and ${dears[1]}` : dears[0] ?? 'Sir or Madam'

  // what's still to do, in order — only the steps not already done
  const steps: [string, string][] = []
  steps.push(['Your tenancy agreement', `We’re preparing it now${t.rent_amount ? `, for ${gbp(Number(t.rent_amount))} a month` : ''}. It comes to you by email to sign online — no printing.`])
  if (!t.right_to_rent_checked_at) steps.push(['Right to Rent', 'We need to see your passport or share code before you move in, as the law requires. If we haven’t done this together yet, we’ll be in touch.'])
  if (!t.move_in_monies_received_at) {
    const m = f.money
    steps.push(['Your move-in payment', m?.amountDue > 0
      ? `${gbp(Number(m.amountDue))} — your first rent and deposit, less the holding deposit you’ve paid. The bank details and reference come with your agreement.`
      : 'Your first rent and deposit, less the holding deposit you’ve paid. We’ll send the exact amount, bank details and reference with your agreement.'])
  }
  steps.push(['Moving in', t.start_date ? `${longDate(t.start_date)}. We’ll arrange a time to meet you and hand over the keys.` : 'We’ll agree the date with you and arrange the key handover.'])

  const item = (n: number, title: string, line: string) => `<tr><td style="padding:0 0 18px;vertical-align:top;width:44px"><div style="width:32px;height:32px;border-radius:16px;background:#1F3B2E;color:#ffffff;font-weight:700;font-size:15px;line-height:32px;text-align:center">${n}</div></td><td style="padding:2px 0 18px;vertical-align:top"><div style="font-weight:700;font-size:17px;line-height:1.3">${esc(title)}</div><div style="font-size:15px;line-height:1.55;opacity:.85;margin-top:3px">${esc(line)}</div></td></tr>`
  const html = `<p style="margin:0 0 18px">Dear ${esc(hello)},</p>
<p style="margin:0 0 8px;font-size:22px;font-weight:700;line-height:1.3">Your references are complete 🎉</p>
<p style="margin:0 0 24px;line-height:1.6">Good news — referencing for <b>${esc(house)}</b>${whole || !f.room.name ? '' : ` (${esc(f.room.name)})`} is done, and we’re now preparing your paperwork. Here’s what happens next:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 8px">
${steps.map((x, i) => item(i + 1, x[0], x[1])).join('\n')}
</table>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;opacity:.8">There’s nothing you need to do right now — keep an eye out for your agreement. If anything’s changed, or you have a question, just reply to this email.</p>
<p style="margin:0">See you soon,<br>The Capital Rooms lettings team</p>`
  const subject = `Your references are complete — ${house}`
  const theme = themeByKey(LOOKS[String(b.look)] ?? 'website')

  if (b.action === 'preview') {
    return NextResponse.json({ to, subject, html: await buildEmail(html, { req, kind: 'referencing-complete', theme }), address, sentBefore: (f.events as any[]).find(e => e.kind === 'referencing_email')?.at ?? null })
  }
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (!to.length) return NextResponse.json({ error: 'There’s no email address for the tenant — add it on their profile first.' }, { status: 422 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages you send are switched off in Settings. Nothing was sent.' }, { status: 409 })
  const sent = await sendEmail(to, subject, html, { req, kind: 'referencing-complete', theme })
  if (!sent.ok) return NextResponse.json({ error: sent.error || 'The email didn’t send' }, { status: 502 })
  await logTenancyEvent(s as any, tenancyId, 'referencing_email', `“References complete — preparing your paperwork” emailed to ${to.join(', ')}`, me.email ?? null)
  return NextResponse.json({ ok: true, to })
}
