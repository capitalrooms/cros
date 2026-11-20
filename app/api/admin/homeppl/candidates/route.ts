// GET /api/admin/homeppl/candidates?name=… — the Homeppl applications for a name, to pick from. Office only; read only.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { findCandidates } from '@/lib/homeppl/candidates'
import { homepplReady } from '@/lib/homeppl/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!homepplReady()) return NextResponse.json({ error: 'Homeppl isn’t connected.' }, { status: 503 })
  const name = (req.nextUrl.searchParams.get('name') ?? '').trim()
  if (name.length < 2) return NextResponse.json({ error: 'Type at least two letters of the name.' }, { status: 400 })
  try { return NextResponse.json({ candidates: await findCandidates(name) }) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Homeppl couldn’t be reached' }, { status: 502 }) }
}
