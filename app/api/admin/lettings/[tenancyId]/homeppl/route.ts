// The tenant's referencing at Homeppl, on their letting file (6 Nov 2026 — lib/homeppl).
//   GET                          → { view } read only: the check's status and how many documents are in CROS yet
//   POST { action: 'bring_in' }  → copies every document + the finished report in, ticks sent/passed to match
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { homepplReady } from '@/lib/homeppl/client'
import { homepplFor, bringInFromHomeppl } from '@/lib/homeppl/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!homepplReady()) return NextResponse.json({ view: { connected: false } })
  const { tenancyId } = await params
  try { return NextResponse.json({ view: await homepplFor(createServiceClient(), tenancyId) }) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t reach Homeppl' }, { status: 502 }) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!homepplReady()) return NextResponse.json({ error: 'Homeppl isn’t connected' }, { status: 400 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'bring_in') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  try { return NextResponse.json({ ok: true, result: await bringInFromHomeppl(createServiceClient(), tenancyId, caller.email) }) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t bring the documents in' }, { status: 502 }) }
}
