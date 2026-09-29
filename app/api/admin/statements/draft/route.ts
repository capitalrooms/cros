// GET /api/admin/statements/draft?propertyId=…&month=YYYY-MM
// A statement built from rent actually received and expenses logged — for the admin to check, then save.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { buildStatementDraft } from '@/lib/statements/draft'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('propertyId') || ''
  const month = req.nextUrl.searchParams.get('month') || ''
  if (!propertyId) return NextResponse.json({ error: 'Choose a property first.' }, { status: 400 })
  try {
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    return NextResponse.json({ draft: await buildStatementDraft(s, propertyId, month) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the statement' }, { status: 400 })
  }
}
