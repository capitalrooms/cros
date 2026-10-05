import { NextRequest, NextResponse, after } from 'next/server'
import { runSubmissionReview, notifyOfficeOfSubmission } from '@/lib/landlordOnboarding/review'
import { svc, loadRow, updateFormData, stripServerKeys, mergeDocuments } from '@/lib/landlordOnboarding/store'
import { missingAll, missingFor, type SectionKey } from '@/lib/landlordOnboarding/requirements'
import { mergePropertyDocs } from '@/lib/landlordOnboarding/propertyDocs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── GET → load the saved form (the UUID token is the access credential) ──────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data, error } = await svc()
    .from('landlord_onboarding')
    .select('id, full_name, email, phone, stage, entity_type, property_count, form_data, verified_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Server-only keys (agreement snapshot, review data) never go to the public form.
  const { __agreement, __review, ...form_data } = (data.form_data ?? {}) as Record<string, unknown>
  void __review
  const agreement_type = (__agreement as { agreementType?: string } | undefined)?.agreementType ?? null
  // "Reopen my form" is offered only while the submission waits for us (not yet verified)
  const { verified_at, ...rest } = data as typeof data & { verified_at: string | null }
  const can_reopen = rest.stage === 3 && !verified_at
  return NextResponse.json({ row: { ...rest, form_data, agreement_type, can_reopen } })
}

// ── PATCH → save progress. draft=true is the background auto-save (does not mark the
//    section complete); otherwise the section is marked complete if nothing is missing. ──
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const section = body.section as SectionKey | undefined
  const draft = body.draft === true

  const existing = await loadRow(token)
  if (!existing) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (existing.stage >= 3) return NextResponse.json({ error: 'Already submitted' }, { status: 409 })

  let missing: string[] = []
  const result = await updateFormData(token, (current) => {
    const client = stripServerKeys(body.form_data)
    const merged: Record<string, unknown> = {
      ...current,
      ...client,
      documents: mergeDocuments(current.documents, client.documents as Record<string, string[]> | undefined),
      property_docs: mergePropertyDocs(current.property_docs, client.property_docs),
    }
    const saved = new Set<string>((current.__sections_saved as string[] | undefined) ?? [])
    if (section && !draft) {
      missing = missingFor(section, merged)
      if (!missing.length) saved.add(section)
    }
    merged.__sections_saved = Array.from(saved)
    const extra: Record<string, unknown> = {}
    if (typeof client.entity_type === 'string' && client.entity_type) extra.entity_type = client.entity_type
    if (typeof client.property_count === 'string' && client.property_count) extra.property_count = client.property_count
    return { form_data: merged, extra }
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const { __agreement, __review, ...form_data } = result.form_data as Record<string, unknown>
  void __agreement; void __review
  return NextResponse.json({ ok: true, missing, sections_saved: result.form_data.__sections_saved, form_data })
}

// ── POST → final submit. Refused (400 + list) if anything required is missing. ──
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))

  const existing = await loadRow(token)
  if (!existing) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (existing.stage >= 3) return NextResponse.json({ error: 'Form already submitted' }, { status: 409 })

  let missing: { section: SectionKey; items: string[] }[] = []
  let wasUpdate = false
  const now = new Date().toISOString()
  const result = await updateFormData(token, (current) => {
    const client = stripServerKeys(body.form_data)
    const merged: Record<string, unknown> = {
      ...current,
      ...client,
      documents: mergeDocuments(current.documents, client.documents as Record<string, string[]> | undefined),
      property_docs: mergePropertyDocs(current.property_docs, client.property_docs),
    }
    missing = missingAll(merged)
    if (missing.length) return { form_data: current } // no change; reported below
    merged.__sections_saved = ['type', 'identity', 'ownership', 'aml', 'bank', 'compliance', 'declaration']
    // a reopened form sent again: keep every submission time, and tell the office it's an update
    wasUpdate = !!current.__submitted_at
    merged.__submissions = [...(Array.isArray(current.__submissions) ? current.__submissions as string[] : current.__submitted_at ? [current.__submitted_at as string] : []), now]
    merged.__submitted_at = now
    return {
      form_data: merged,
      extra: {
        entity_type: merged.entity_type || null,
        property_count: merged.property_count || null,
        stage: 3,
        docs_received_at: now,
      },
    }
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if (missing.length) return NextResponse.json({ error: 'Some required information is missing', missing }, { status: 400 })

  // Automated review + office notification run after the landlord has their confirmation.
  after(async () => {
    let review = null
    try { review = await runSubmissionReview(existing.id) } catch (e) { console.error('onboarding review failed', e) }
    try { await notifyOfficeOfSubmission(existing.id, review, wasUpdate) } catch (e) { console.error('onboarding notify failed', e) }
  })

  return NextResponse.json({ ok: true })
}
