import { requireAdmin } from '@/lib/adminAuth'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/sendEmail'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

// Stage definitions
const STAGE_TIMESTAMPS: Record<number, string> = {
  2: 'welcome_sent_at',
  3: 'docs_received_at',
  4: 'approval_sent_at',
  5: 'agreement_sent_at',
  6: 'onboarded_at',
}

// ── GET /api/landlord-onboarding/[id] → one record (admin review page) ────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await svc().from('landlord_onboarding').select('*').eq('id', id).maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ row: data })
}

// ── PATCH /api/landlord-onboarding/[id]  → advance stage / update fields ──────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
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
      await sendEmail(
        data.email,
        'Capital Rooms — Verification Complete',
        approvalEmailBody(data.full_name ?? data.name),
        { req }
      )
    } catch {
      // Non-fatal — row is already updated
    }
  }

  return NextResponse.json({ row: data })
}

// ── DELETE /api/landlord-onboarding/[id]  → remove record ─────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await svc()
    .from('landlord_onboarding')
    .delete()
    .eq('id', (await params).id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── Approval email body (wrapper applied automatically by sendEmail) ───────────

function approvalEmailBody(name: string) {
  return `
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
  <a href="mailto:management@capitalrooms.co.uk" style="color:#1a1a1a">management@capitalrooms.co.uk</a>.
</p>
<p style="margin:24px 0 0;font-size:15px;color:#333">Kind regards,</p>`
}
