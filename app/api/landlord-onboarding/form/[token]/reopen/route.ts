// POST /api/landlord-onboarding/form/[token]/reopen — "Reopen my form" on the thank-you screen.
// Only while the submission is waiting for us (stage 3, not yet verified): the form goes back to editable (stage 2)
// with everything kept; sending it again re-runs the checks and tells the office it was updated.
// Once we've verified or approved it, it can't be reopened online — the landlord emails us instead.
import { NextRequest, NextResponse } from 'next/server'
import { svc, updateFormData } from '@/lib/landlordOnboarding/store'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data: row } = await svc().from('landlord_onboarding').select('id, stage, verified_at').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if ((row as any).stage < 3) return NextResponse.json({ ok: true, alreadyOpen: true })   // nothing to reopen: carry on
  if ((row as any).stage !== 3 || (row as any).verified_at) {
    return NextResponse.json({ error: 'We’ve already started checking your information, so it can’t be reopened online. Email harry@capitalrooms.co.uk with any changes and we’ll update it for you.' }, { status: 409 })
  }
  const now = new Date().toISOString()
  const result = await updateFormData(token, (current, r) => {
    if (r.stage !== 3) return { form_data: current }
    const reopened = Array.isArray(current.__reopened_at) ? (current.__reopened_at as string[]) : []
    return { form_data: { ...current, __reopened_at: [...reopened, now] }, extra: { stage: 2 } }
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
