/**
 * /api/admin/property-remove — remove a property that was added by mistake (e.g. a duplicate).
 *   GET  ?id=<property>  → { canRemove, linked: [{ table, count }] }   what is attached to it
 *   POST { id, confirm }  → removes it, only when nothing at all is attached and `confirm` is its property code
 *   POST { id, confirm, action: 'merge', intoId } → a duplicate: moves everything to the kept property, then removes it
 * Administrators only. The removed row is kept in audit_logs (action 'property_removed') so it can be put back.
 * Anything with history — rooms, tenancies, certificates, documents, jobs, money — blocks removal.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// every table that points at a property (from the migrations); any row in any of them blocks removal
const LINKED = [
  'rooms', 'tenancies', 'applicants', 'holding_deposits', 'offers', 'cleans', 'cleaner_jobs', 'maintenance_tickets', 'assigned_jobs',
  'property_documents', 'documents', 'documents_pending', 'tenancy_documents', 'attachments', 'property_photos', 'property_photo_requests',
  'compliance_logs', 'compliance_cert_history', 'hmo_licence_history', 'property_policies', 'tenant_self_checks', 'tenant_self_check_issues',
  'tenant_acknowledgment_notes', 'house_document_sends', 'property_notes', 'property_tasks', 'property_cleaning_notes', 'pending_cleaner_notes',
  'communal_notices', 'property_appointments', 'admin_appointments', 'communications_log', 'sms_confirmations',
  'rent_charges', 'rent_increase_notices', 'landlord_statements', 'landlord_statement_rooms', 'landlord_statement_charges', 'statement_line_items',
  'purchases', 'recharge_expenses', 'house_contributions', 'bank_transactions', 'client_ledger_adjustments', 'arrears_actions',
  'early_move_out_requests', 'job_completion_log', 'ticket_messages', 'planner_shared_entries', 'valuations_log', 'property_data_corrections',
]

// further tables that point at a property — moved by a merge (they don't block removal on their own)
const MOVE_ALSO = [
  'let_only_occupants', 'supplier_invoices', 'generated_documents', 'notifications', 'visits', 'emergencies', 'ops_payee_rules',
  'capture_items', 'maintenance_diagnostic_attempts', 'people', 'property_appointments',
]

type S = ReturnType<typeof createServiceClient>

async function linked(s: S, id: string) {
  const out: { table: string; count: number }[] = []
  await Promise.all(LINKED.map(async table => {
    const { count, error } = await s.from(table).select('*', { count: 'exact', head: true }).eq('property_id', id)
    if (!error && count) out.push({ table, count })
  }))
  return out.sort((a, b) => a.table.localeCompare(b.table))
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const s = createServiceClient()
  const l = await linked(s, id)
  return NextResponse.json({ canRemove: l.length === 0, linked: l })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: p } = await s.from('properties').select('*').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
  if (!p) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  const code = String(p.property_code || '').trim()
  if (!code || String(b.confirm ?? '').trim().toUpperCase() !== code.toUpperCase()) return NextResponse.json({ error: `Type the property code (${code || 'none'}) to confirm` }, { status: 400 })

  // Merge a duplicate into the property to keep (15 Oct 2026 — two entries for 315 Eden House): every record moves to
  // the kept one, then this now-empty entry is removed exactly as below (a copy kept in the audit log). If anything
  // can't be moved, nothing is removed.
  if (b.action === 'merge') {
    const { data: into } = await s.from('properties').select('id, name, property_code').eq('id', String(b.intoId ?? '')).maybeSingle() as { data: any }
    if (!into || into.id === p.id) return NextResponse.json({ error: 'Choose the property to keep' }, { status: 400 })
    const moved: string[] = [], failed: string[] = []
    for (const table of [...new Set([...LINKED, ...MOVE_ALSO])]) {
      const { count, error: cErr } = await s.from(table).select('*', { count: 'exact', head: true }).eq('property_id', p.id)
      if (cErr || !count) continue
      const { error: uErr } = await s.from(table).update({ property_id: into.id }).eq('property_id', p.id)
      if (uErr) failed.push(`${table.replace(/_/g, ' ')}: ${uErr.message}`); else moved.push(`${count} ${table.replace(/_/g, ' ')}`)
    }
    // emergency cover lists houses by id
    const { data: cover } = await s.from('emergency_contractors').select('id, property_ids').contains('property_ids', [p.id])
    for (const c of (cover ?? []) as any[]) await s.from('emergency_contractors').update({ property_ids: [...new Set((c.property_ids as string[]).map(x => (x === p.id ? into.id : x)))] }).eq('id', c.id)
    if (failed.length) return NextResponse.json({ error: `Not merged — these couldn’t move: ${failed.join('; ')}. ${moved.length ? `Already moved: ${moved.join(', ')}.` : ''} Nothing was removed.` }, { status: 409 })
    const left = await linked(s, p.id)
    if (left.length) return NextResponse.json({ error: `Moved ${moved.join(', ') || 'nothing'}, but it still has ${left.map(x => `${x.count} ${x.table.replace(/_/g, ' ')}`).join(', ')} — nothing was removed`, linked: left }, { status: 409 })
    const { error: aErr2 } = await s.from('audit_logs').insert({ user_id: admin.personId, action: 'property_merged', table_name: 'properties', record_id: p.id, details: JSON.stringify({ removed: p, into: into.id, intoName: into.name, moved }) })
    if (aErr2) return NextResponse.json({ error: `Records moved (${moved.join(', ')}), but a copy couldn’t be kept, so the old entry was not removed: ${aErr2.message}` }, { status: 500 })
    const { error: dErr } = await s.from('properties').delete().eq('id', p.id)
    if (dErr) return NextResponse.json({ error: `Records moved (${moved.join(', ')}), but the old entry couldn’t be removed: ${dErr.message}` }, { status: 400 })
    return NextResponse.json({ ok: true, into: into.id, moved })
  }

  const l = await linked(s, p.id)
  if (l.length) return NextResponse.json({ error: `It still has ${l.map(x => `${x.count} ${x.table.replace(/_/g, ' ')}`).join(', ')} — only an empty property can be removed`, linked: l }, { status: 409 })

  // keep the record first; if that fails, nothing is removed
  const { error: aErr } = await s.from('audit_logs').insert({ user_id: admin.personId, action: 'property_removed', table_name: 'properties', record_id: p.id, details: JSON.stringify(p) })
  if (aErr) return NextResponse.json({ error: `Could not keep a copy first, so nothing was removed: ${aErr.message}` }, { status: 500 })
  const { error } = await s.from('properties').delete().eq('id', p.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
