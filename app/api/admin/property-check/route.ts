// /api/admin/property-check — Property check (lib/propertyCheck). New Business access.
//   POST { address, postcode }      → { report, id? }   runs a check (~7 Property Insights credits + one AI answer) and keeps it
//   GET                              → { checks }        the last 50 kept
//   PATCH { id, status?, notes? }    → { ok }            interested / not for us, and notes
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { checkProperty } from '@/lib/propertyCheck'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const POSTCODE = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i
const noTable = (m?: string) => /property_checks|does not exist|schema cache/i.test(m ?? '')

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'You don’t have access.' }, { status: 403 })
  const { data, error } = await createServiceClient().from('property_checks').select('id, address, postcode, status, notes, created_at, report').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ checks: [], setupNeeded: noTable(error.message) })
  return NextResponse.json({ checks: data })
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'You don’t have access.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { address?: string; postcode?: string }
  const address = String(b.address ?? '').trim(), postcode = String(b.postcode ?? '').trim()
  if (!address || !POSTCODE.test(postcode.replace(/\s+/g, ''))) return NextResponse.json({ error: 'Pick an address with a postcode.' }, { status: 400 })
  const s = createServiceClient()
  const report = await checkProperty(s, { address, postcode })
  const { data, error } = await s.from('property_checks').insert({ address, postcode: report.postcode, report, created_by: me.personId }).select('id').single()
  await logAudit({ userId: me.personId, action: 'property_check', table: 'property_checks', recordId: (data as any)?.id, details: address }).catch(() => false)
  return NextResponse.json({ report, id: (data as any)?.id ?? null, saved: !error, setupNeeded: !!error && noTable(error.message) })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'You don’t have access.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; status?: string; notes?: string }
  const row: Record<string, unknown> = {}
  if (b.status && ['new', 'interested', 'not_for_us'].includes(b.status)) row.status = b.status
  if (typeof b.notes === 'string') row.notes = b.notes.slice(0, 4000) || null
  const { error } = await createServiceClient().from('property_checks').update(row).eq('id', String(b.id ?? ''))
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
}
