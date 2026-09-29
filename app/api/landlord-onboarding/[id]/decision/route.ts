import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import type { ReviewerDecision } from '@/lib/aml/onboardingReport'

export const dynamic = 'force-dynamic'

// POST → record the reviewer's confirmed risk assessment for a submitted onboarding.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const level = b.risk_level
  if (!['low', 'medium', 'high'].includes(level)) return NextResponse.json({ error: 'Choose a risk level' }, { status: 400 })
  if (!String(b.risk_reason ?? '').trim()) return NextResponse.json({ error: 'Explain the reason for the risk level' }, { status: 400 })
  if (level !== 'low' && !String(b.risk_mitigation ?? '').trim()) return NextResponse.json({ error: 'Medium and high risk need the mitigation / enhanced checks recorded' }, { status: 400 })
  if (!b.documents_viewed) return NextResponse.json({ error: 'Confirm you have opened and examined each document' }, { status: 400 })

  const { data: me } = await svc().from('people').select('first_name, last_name, full_name').eq('id', admin.personId).maybeSingle()
  const reviewer = [me?.first_name, me?.last_name].filter(Boolean).join(' ') || me?.full_name || admin.email
  const now = new Date().toISOString()
  const decision: ReviewerDecision = {
    risk_level: level, risk_reason: String(b.risk_reason).trim(), risk_mitigation: String(b.risk_mitigation ?? '').trim() || undefined,
    identity_verified: b.identity_verified === true, documents_viewed: true, reviewer_name: reviewer, reviewed_at: now,
  }
  const { data: row } = await svc().from('landlord_onboarding').select('form_data, landlord_people_id').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await svc().from('landlord_onboarding').update({
    form_data: { ...(row.form_data ?? {}), __decision: decision },
    risk_level: level, risk_reason: decision.risk_reason, risk_mitigation: decision.risk_mitigation ?? null,
    identity_verified: decision.identity_verified, risk_assessed_by: admin.personId, risk_assessed_at: now,
    updated_at: now,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (row.landlord_people_id) {
    await svc().from('people').update({ aml_risk_level: level, aml_risk_notes: decision.risk_reason }).eq('id', row.landlord_people_id)
  }
  return NextResponse.json({ ok: true, decision })
}
