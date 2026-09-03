import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/admin/view-as-log — record an admin view-as session start */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { viewed_person_id, viewed_role } = await req.json()
  if (!viewed_person_id) return NextResponse.json({ error: 'viewed_person_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const adminPersonId = (user.assignment as any).id

  // Don't allow admin to view-as themselves
  if (adminPersonId === viewed_person_id) {
    return NextResponse.json({ error: 'Cannot view-as yourself' }, { status: 400 })
  }

  await supabase.from('admin_view_as_log').insert({
    admin_person_id: adminPersonId,
    viewed_person_id,
    viewed_role: viewed_role || null,
    was_writable: true,
  })

  return NextResponse.json({ ok: true })
}
