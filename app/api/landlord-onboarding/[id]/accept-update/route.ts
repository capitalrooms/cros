// POST /api/landlord-onboarding/[id]/accept-update — an existing landlord's re-verification (is_refresh) checked and
// accepted (22 Oct 2026). Their landlord record takes the details they confirmed — home address (it's printed on their
// statements), phone — and their AML risk level; the update is marked verified; they get a short thank-you. No new
// agreement: they already have one.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'
import { sendEmail } from '@/lib/sendEmail'
import { onboardingName, dearFromText } from '@/lib/people'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!row.is_refresh || !row.landlord_people_id) return NextResponse.json({ error: 'This is a new landlord, not an update — use Approve & send.' }, { status: 400 })
  if (row.stage < 3) return NextResponse.json({ error: 'The landlord hasn’t sent their update yet.' }, { status: 400 })
  const f = row.form_data ?? {}
  if (!f.__decision) return NextResponse.json({ error: 'Record your risk assessment decision first.' }, { status: 400 })
  if (f.__decision.risk_level === 'high' && body.confirm_high !== true) return NextResponse.json({ error: 'This client is rated HIGH risk — confirm enhanced due diligence is complete and senior approval given.' }, { status: 409 })

  const company = f.entity_type === 'company'
  const home = company ? t(f.registered_office) : [f.addr_line1, f.addr_line2, f.addr_town, f.addr_county, f.addr_postcode].map(t).filter(Boolean).join(', ')
  const { data: before } = await svc().from('people').select('home_address, phone, aml_risk_level').eq('id', row.landlord_people_id).maybeSingle()
  const patch: Record<string, unknown> = { aml_risk_level: f.__decision.risk_level, aml_risk_notes: f.__decision.risk_reason ?? null }
  if (home) patch.home_address = home
  if (t(f.contact_phone)) patch.phone = t(f.contact_phone)
  const { error: pErr } = await svc().from('people').update(patch).eq('id', row.landlord_people_id)
  if (pErr) return NextResponse.json({ error: `The landlord record couldn’t be updated: ${pErr.message}` }, { status: 500 })
  const now = new Date().toISOString()
  await svc().from('landlord_onboarding').update({ stage: Math.max(row.stage, 6), verified_at: row.verified_at ?? now, onboarded_at: now, approval_sent_at: now, updated_at: now }).eq('id', id)
  await logAudit({ userId: admin.personId, action: 'landlord_aml_update_accepted', table: 'people', recordId: row.landlord_people_id, details: JSON.stringify({ before, after: patch }) }).catch(() => null)

  const changed = home && home !== String(before?.home_address ?? '').trim()
  const html = `
<p style="margin:0 0 18px;font-size:15px;color:#333;line-height:1.6">Dear ${esc(dearFromText(onboardingName(row)))},</p>
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Thank you for updating your details. We have checked them and your records with us are now up to date.</p>
${changed ? `<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">Your statements and letters will now go to <strong>${esc(home)}</strong>.</p>` : ''}
<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6">If anything changes in the meantime — your address, your bank account, or the ownership of a property — just let us know.</p>
<p style="margin:24px 0 4px;font-size:15px;color:#333">Kind regards,</p>`
  const to = [...new Set([row.email, f.j_contact_email].filter(Boolean).map((e: string) => e.trim().toLowerCase()))]
  const sent = await sendEmail(to, 'Your details are up to date — thank you', html, { req })
  return NextResponse.json({ ok: true, addressChanged: !!changed, emailed: sent.ok ? to : [], emailError: sent.ok ? null : sent.error })
}
