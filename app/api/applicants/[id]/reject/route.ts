import { NextRequest, NextResponse } from 'next/server'
import { deliverEmail } from '@/lib/sendEmail'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { emailHtml, ctaButton } from '@/lib/emailTemplate'


export const runtime = 'nodejs'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return null

  const sb = adminClient()
  const { data: person } = await sb.from('people').select('role').eq('email', user.email).maybeSingle()
  if (!person) return null
  if (!['lettings', 'administrator', 'admin'].includes(person.role)) return null
  return user
}

/** Sign a token for the counter-offer link — stateless HMAC, no DB change needed */
function makeCounterOfferToken(applicantId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return crypto.createHmac('sha256', secret).update(applicantId).digest('hex')
}

/** Convert plain-text paragraphs (newline-separated) to <p> HTML blocks */
function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, '<br>'))
    .map(p => `<p style="margin:0 0 16px;line-height:1.75;">${p}</p>`)
    .join('\n')
}

/**
 * POST /api/applicants/[id]/reject
 * Body: { reason: 'asking_rent' | 'professionals_only' | 'other_applicant', subject: string, body: string }
 * - Sets pipeline_stage = 'rejected'
 * - Sends the (admin-edited) rejection email to the applicant
 * - For reason=asking_rent: appends a counter-offer CTA to the email
 * - Adds a GDPR footer noting 30-day data deletion
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { reason, subject, body: emailBody } = await req.json()
  if (!reason || !subject || !emailBody) {
    return NextResponse.json({ error: 'reason, subject, and body are required' }, { status: 400 })
  }

  const sb = adminClient()

  // Fetch applicant + room for asking rent
  const { data: applicant, error: fetchErr } = await sb
    .from('applicants')
    .select('id, full_name, email, pipeline_stage, rooms(name, current_asking_rent), properties(name, address)')
    .eq('id', params.id)
    .single()

  if (fetchErr || !applicant) {
    return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
  }

  if (!applicant.email) {
    return NextResponse.json({ error: 'Applicant has no email address' }, { status: 400 })
  }

  // Build email HTML
  const bodyHtml = textToHtml(emailBody)

  // For 'asking_rent': append counter-offer CTA
  let ctaSection = ''
  if (reason === 'asking_rent') {
    const askingRent = (applicant.rooms as any)?.current_asking_rent
    const rentStr = askingRent ? `£${Number(askingRent).toLocaleString()} per month` : 'the asking rent'
    const token = makeCounterOfferToken(params.id)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
    const counterOfferUrl = `${baseUrl}/api/applicants/counter-offer?id=${params.id}&token=${token}`

    ctaSection = `
      <div style="margin:24px 0;text-align:center;">
        ${ctaButton(`Yes — I'm happy to offer ${rentStr} →`, counterOfferUrl)}
      </div>
    `
  }

  // GDPR footer
  const gdprFooter = `
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;color:#aaa;line-height:1.6;">
      ${reason === 'asking_rent'
        ? 'If we don’t hear from you, your application will close and your personal details will be permanently deleted from our system within 30 days, in accordance with our privacy policy.'
        : 'As your application was not progressed, your personal details will be permanently deleted from our system within 30 days in accordance with our privacy policy.'}
    </p>
  `

  const fullHtml = await emailHtml(`${bodyHtml}${ctaSection}${gdprFooter}`, { req: req })

  // Send via Resend
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const emailRes = await deliverEmail({
        to: [applicant.email],
        subject,
        html: fullHtml,
      }, { req: req })
    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      console.error('Rejection email failed:', err)
      // nothing went out — leave them where they were, so the office can try again (16 Oct 2026)
      return NextResponse.json({ error: `The email didn’t send: ${(err as any)?.message || 'unknown error'} — nothing was changed.` }, { status: 502 })
    }
  }

  // Marked as declined only once they've been told
  const { error: updateErr } = await sb
    .from('applicants')
    .update({ pipeline_stage: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
