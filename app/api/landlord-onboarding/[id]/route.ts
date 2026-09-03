import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

async function sendEmail(to: string, subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: 'Capital Rooms <hello@capitalrooms.co.uk>', to, subject, html }),
  })
}

// Stage definitions
const STAGE_TIMESTAMPS: Record<number, string> = {
  2: 'welcome_sent_at',
  3: 'docs_received_at',
  4: 'approval_sent_at',
  5: 'agreement_sent_at',
  6: 'onboarded_at',
}

// ── PATCH /api/landlord-onboarding/[id]  → advance stage / update fields ──────
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await req.json()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  // Explicit field updates
  if (body.stage !== undefined) {
    updates.stage = body.stage
    const tsField = STAGE_TIMESTAMPS[body.stage]
    if (tsField) updates[tsField] = new Date().toISOString()
  }
  if (body.verification_notes !== undefined) updates.verification_notes = body.verification_notes
  if (body.verification_checks !== undefined) updates.verification_checks = body.verification_checks
  if (body.verified_by !== undefined) {
    updates.verified_by = body.verified_by
    updates.verified_at = new Date().toISOString()
  }
  if (body.docs_received !== undefined && body.docs_received) {
    updates.docs_received_at = new Date().toISOString()
  }

  const { data, error } = await svc()
    .from('landlord_onboarding')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send approval email when advancing to stage 4
  if (body.stage === 4 && data?.email) {
    try {
      await sendEmail(data.email, 'Capital Rooms — Verification Complete', approvalEmailHtml(data.name))
    } catch {
      // Non-fatal — row is already updated
    }
  }

  return NextResponse.json({ row: data })
}

// ── DELETE /api/landlord-onboarding/[id]  → remove record ─────────────────────
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await svc()
    .from('landlord_onboarding')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── Approval email HTML ────────────────────────────────────────────────────────

function approvalEmailHtml(name: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Verification Complete</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
  <tr>
    <td style="background:#1a1a1a;padding:32px 40px">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff">Capital Rooms</p>
      <p style="margin:6px 0 0;font-size:12px;color:#888;letter-spacing:0.2em;text-transform:uppercase">Specialist HMO Management · London</p>
    </td>
  </tr>
  <tr>
    <td style="padding:40px 40px 32px">
      <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">Dear ${name},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
        We are pleased to confirm that your identity and property documentation have been verified and our
        Anti-Money Laundering checks are now complete.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">
        The next step is for us to send you our management agreement for your review and signature.
        We will be in touch shortly with the relevant documentation.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#555;line-height:1.6">
        In the meantime, if you have any questions please contact us at
        <a href="mailto:hello@capitalrooms.co.uk" style="color:#1a1a1a">hello@capitalrooms.co.uk</a>.
      </p>
      <p style="margin:24px 0 0;font-size:15px;color:#333">Kind regards,</p>
      <p style="margin:4px 0 0;font-size:15px;color:#333;font-weight:600">The Capital Rooms Team</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8f8f8;border-top:1px solid #eee;padding:24px 40px">
      <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
        Capital Rooms Ltd · Member of The Property Ombudsman · ClientMoney Protect · Deposit Protection Service
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
