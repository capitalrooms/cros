// One inspection: save (PATCH), send to the landlord (POST {action:'send'}), delete a draft (DELETE). Migration 275.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { cleanAreas, sendInspection, setupError } from '@/lib/inspections'
import { senderFor } from '@/lib/email/sender'

export const dynamic = 'force-dynamic'
type P = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: P) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const up: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (['routine', 'check_in', 'check_out', 'other'].includes(b.kind)) up.kind = b.kind
  if (typeof b.inspected_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.inspected_on)) up.inspected_on = b.inspected_on
  if ('inspected_by' in b) up.inspected_by = String(b.inspected_by ?? '').trim().slice(0, 120) || null
  if ('overall' in b) up.overall = ['good', 'fair', 'needs_work'].includes(b.overall) ? b.overall : null
  if ('summary' in b) up.summary = String(b.summary ?? '').slice(0, 4000)
  if ('areas' in b) up.areas = cleanAreas(b.areas)
  const { error } = await (createServiceClient() as any).from('property_inspections').update(up).eq('id', id)
  const msg = setupError(error)
  if (msg) return NextResponse.json({ error: msg }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: P) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'send') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  try { return NextResponse.json({ ok: true, ...(await sendInspection(createServiceClient() as any, id, await senderFor(req))) }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not send' }, { status: 400 }) }
}

export async function DELETE(req: NextRequest, { params }: P) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data, error } = await (createServiceClient() as any).from('property_inspections').delete().eq('id', id).eq('status', 'draft').select('id')
  const msg = setupError(error)
  if (msg) return NextResponse.json({ error: msg }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: 'Only a draft can be deleted — this one has been sent to the landlord.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
