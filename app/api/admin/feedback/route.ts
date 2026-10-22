// GET  /api/admin/feedback[?property=…] — tenant feedback forms by house: count, last answer, average per area, and
//      (for one house) every form with who sent it
// POST /api/admin/feedback { property_id } — AI summary of what the tenants think would improve that house most
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff } from '@/lib/portalAuth'
import { averages, type FeedbackRow } from '@/lib/feedback/areas'
import { summariseFeedback } from '@/lib/feedback/summarise'
import { displayName } from '@/lib/people'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const houseName = (p: any) => p?.name || String(p?.address ?? '').split(/\n|,/)[0] || 'House'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = svc()
  const one = req.nextUrl.searchParams.get('property')
  const q = s.from('tenant_feedback').select('id, property_id, person_id, ratings, comments, anything_else, created_at, properties(name, address), people(salutation, first_name, last_name, full_name, email)').order('created_at', { ascending: false }).limit(2000)
  const { data, error } = one ? await q.eq('property_id', one) : await q
  if (error) return NextResponse.json({ error: /does not exist|schema cache/.test(error.message) ? 'Run migration 237 to switch on tenant feedback.' : error.message, setup: true }, { status: 500 })

  const byHouse = new Map<string, any[]>()
  for (const r of (data ?? []) as any[]) byHouse.set(r.property_id, [...(byHouse.get(r.property_id) ?? []), r])
  const houses = [...byHouse.entries()].map(([id, rows]) => ({
    id, name: houseName(rows[0].properties), forms: rows.length, lastAt: rows[0].created_at,
    areas: averages(rows as FeedbackRow[]).filter(a => a.average !== null).map(a => ({ key: a.key, label: a.label, average: a.average, count: a.count })),
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  return NextResponse.json({
    houses,
    forms: one ? ((data ?? []) as any[]).map(r => ({ id: r.id, who: displayName(r.people), at: r.created_at, ratings: r.ratings, comments: r.comments, anything_else: r.anything_else })) : undefined,
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { property_id } = await req.json().catch(() => ({}))
  if (!property_id) return NextResponse.json({ error: 'Pick a house.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI isn’t set up (no ANTHROPIC_API_KEY).' }, { status: 500 })
  const s = svc()
  const [{ data: rows }, { data: prop }] = await Promise.all([
    s.from('tenant_feedback').select('ratings, comments, anything_else, created_at').eq('property_id', property_id).order('created_at', { ascending: false }).limit(200),
    s.from('properties').select('name, address').eq('id', property_id).maybeSingle(),
  ])
  if (!rows?.length) return NextResponse.json({ error: 'No feedback from this house yet.' }, { status: 400 })
  try {
    const out = await summariseFeedback(houseName(prop), rows as FeedbackRow[])
    if ('failed' in out) return NextResponse.json({ error: out.failed === 'refusal' ? 'The AI declined to summarise this feedback.' : 'The AI summary didn’t come out right — try again.' }, { status: 502 })
    return NextResponse.json({ summary: out.summary, basedOn: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: `The AI summary failed: ${e?.message ?? 'unknown error'}` }, { status: 502 })
  }
}
