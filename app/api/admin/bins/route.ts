// /api/admin/bins — bin days for the office (14 Nov 2026, lib/bins/lookup).
//   GET  ?propertyId=        → { day, schedule, source, sourceUrl, checkedAt, error, reports, ready }
//   POST { propertyId }      → look it up with the council now
//   PATCH { reportId }       → a tenant's report dealt with
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { refreshBins, binsReady } from '@/lib/bins/lookup'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('propertyId') ?? ''
  const s = createServiceClient()
  const { data: p } = await s.from('properties').select('bin_collection_day, bin_schedule, bin_source, bin_source_url, bin_checked_at, bin_lookup_error').eq('id', id).maybeSingle() as { data: any }
  const { data: reports } = await s.from('bin_reports').select('id, kind, left_out, note, created_at').eq('property_id', id).is('resolved_at', null).order('created_at', { ascending: false }).limit(5)
  return NextResponse.json({ ready: binsReady(), day: p?.bin_collection_day ?? null, schedule: p?.bin_schedule ?? null, source: p?.bin_source ?? null, sourceUrl: p?.bin_source_url ?? null, checkedAt: p?.bin_checked_at ?? null, error: p?.bin_lookup_error ?? null, reports: reports ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const r = await refreshBins(createServiceClient(), String(b.propertyId ?? ''))
  return NextResponse.json(r, { status: r.ok ? 200 : 422 })
}

export async function PATCH(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  await createServiceClient().from('bin_reports').update({ resolved_at: new Date().toISOString(), resolved_by: me.email }).eq('id', String(b.reportId ?? ''))
  return NextResponse.json({ ok: true })
}
