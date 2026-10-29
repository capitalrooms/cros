import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST { unavailable_from: 'YYYY-MM-DD' | null, reason } — mark a house not available to let (e.g. subsidence works), or available again.
// From that date its empty rooms aren't counted as void (lib/voids, dashboard). Migration 248.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const from = b.unavailable_from ? String(b.unavailable_from).slice(0, 10) : null
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: 'Choose the date it stopped being available' }, { status: 400 })
  const reason = from ? String(b.reason ?? '').trim().slice(0, 200) || null : null
  const { data, error } = await createServiceClient().from('properties')
    .update({ unavailable_from: from, unavailable_reason: reason }).eq('id', id).select('id, unavailable_from, unavailable_reason')
  if (error) return NextResponse.json({ error: /unavailable_from/.test(error.message) ? 'Run migration 248 first (it adds the “not available” setting).' : error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  return NextResponse.json({ ok: true, ...data[0] })
}
