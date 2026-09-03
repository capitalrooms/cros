import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/settings — return all system settings */
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value, updated_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data || [] })
}

/** POST /api/admin/settings — update a setting key */
export async function POST(req: NextRequest) {
  // Auth check — admin only
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key, value } = await req.json()
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value: String(value), updated_by: (user.assignment as any).id, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key, value })
}
