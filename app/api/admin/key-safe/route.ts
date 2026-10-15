// GET /api/admin/key-safe?propertyId= · PUT { propertyId, code } — the office reads and sets a property's key safe
// code (kept in property_access_codes, migration 224 — see lib/access/keySafe).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { readKeySafe, writeKeySafe } from '@/lib/access/keySafe'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ keySafe: await readKeySafe(createServiceClient() as any, req.nextUrl.searchParams.get('propertyId')) })
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.propertyId) return NextResponse.json({ error: 'Missing property' }, { status: 400 })
  const r = await writeKeySafe(createServiceClient() as any, String(b.propertyId), b.code == null ? null : String(b.code).slice(0, 40), (admin as any).personId ?? null)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 500 })
}
