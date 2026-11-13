/**
 * The agreement's terms on an onboarding (13 Nov 2026, Harry: "I cannot now amend the let fee which apparently was set
 * wrong … we should always be able to see the original proposed agreement alongside their proposed changes and then if
 * needed can change things … then we can resend. System too rigid").
 *   GET  → { original, current, history, fields } — the terms as first sent, as they stand now, and every change
 *   POST { changes: { managementFee?, letFee?, epcCost?, floatAmount?, agreementDate?, commencementDate? }, reason }
 *        → the terms change; the version goes up, the old PDF is dropped (a fresh one is made on preview / resend /
 *          approve), and the change is kept in the history with who, when and why. The first-sent copy never changes.
 * Office only. Changing terms sends nothing — "Send the form link again" (or Approve & send) sends the new agreement.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/landlordOnboarding/store'

export const dynamic = 'force-dynamic'

const FIELDS: { key: string; label: string; kind: 'pct' | 'text' | 'money' | 'date' }[] = [
  { key: 'managementFee', label: 'Management fee (%)', kind: 'pct' },
  { key: 'letFee', label: 'Let fee', kind: 'text' },
  { key: 'epcCost', label: 'EPC (if needed), £', kind: 'money' },
  { key: 'floatAmount', label: 'Working float, £', kind: 'money' },
  { key: 'agreementDate', label: 'Agreement date', kind: 'date' },
  { key: 'commencementDate', label: 'Start date', kind: 'date' },
]

async function load(id: string) {
  const { data } = await svc().from('landlord_onboarding').select('id, stage, approval_sent_at, form_data, updated_at').eq('id', id).maybeSingle()
  return data as any
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const row = await load((await params).id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const a = row.form_data?.__agreement
  if (!a) return NextResponse.json({ none: true })
  const original = row.form_data?.__agreement_original ?? a
  return NextResponse.json({
    fields: FIELDS, original, current: a, history: row.form_data?.__agreement_history ?? [],
    agreementType: a.agreementType, serviceType: a.service_type, version: a.version ?? 1, sentAt: a.sent_at ?? null,
    submitted: row.stage >= 3, approvalSentAt: row.approval_sent_at,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = (await params).id
  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason ?? '').trim().slice(0, 300)
  if (reason.length < 3) return NextResponse.json({ error: 'Say why — e.g. “let fee agreed on the phone as £250”. It stays on the record.' }, { status: 400 })
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await load(id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const f = row.form_data ?? {}
    const a = f.__agreement
    if (!a) return NextResponse.json({ error: 'There’s no agreement on this record to change.' }, { status: 409 })
    const changed: Record<string, { from: unknown; to: unknown }> = {}
    const next = { ...a }
    for (const fld of FIELDS) {
      if (!(fld.key in (b.changes ?? {}))) continue
      let v: any = b.changes[fld.key]
      if (fld.kind === 'pct' || fld.kind === 'money') { v = String(v ?? '').replace(/[£%,\s]/g, ''); if (v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) return NextResponse.json({ error: `${fld.label} must be a number` }, { status: 400 }); v = fld.kind === 'pct' ? Number(v) : String(Number(v)) }
      else if (fld.kind === 'date') { v = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return NextResponse.json({ error: `${fld.label} must be a date` }, { status: 400 }) }
      else v = String(v ?? '').trim().slice(0, 120)
      if (String(a[fld.key] ?? '') !== String(v)) { changed[fld.key] = { from: a[fld.key] ?? null, to: v }; next[fld.key] = v }
    }
    if (!Object.keys(changed).length) return NextResponse.json({ error: 'Nothing has changed.' }, { status: 400 })
    next.version = Number(a.version ?? 1) + 1
    next.pdf_path = null            // the old PDF no longer matches — a fresh one is made when it's previewed or sent
    next.changed_at = new Date().toISOString()
    const form_data = {
      ...f,
      __agreement_original: f.__agreement_original ?? a,   // the terms as first sent never change
      __agreement: next,
      __agreement_history: [...(f.__agreement_history ?? []), { version: next.version, at: next.changed_at, by: admin.email, reason, changes: changed }],
    }
    let q = svc().from('landlord_onboarding').update({ form_data, updated_at: next.changed_at }).eq('id', id)
    q = row.updated_at ? q.eq('updated_at', row.updated_at) : q.is('updated_at', null)
    const { data, error } = await q.select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (data?.length) return NextResponse.json({ ok: true, version: next.version, changes: changed })
    await new Promise(r => setTimeout(r, 120))     // the landlord's form saved at the same moment — try again
  }
  return NextResponse.json({ error: 'The record was busy saving — please try again.' }, { status: 409 })
}
