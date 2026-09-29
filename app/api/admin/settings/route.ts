import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/serverAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/settings — return all system settings */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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
  // Only settings with a control on the Settings page can be changed from here, each checked
  const valid: Record<string, (v: string) => boolean> = {
    comms_live: v => v === 'true' || v === 'false',
    rent_grace_days: v => /^\d{1,2}$/.test(v) && Number(v) <= 31,
  }
  if (!valid[key]) return NextResponse.json({ error: `${key} can’t be changed here` }, { status: 400 })
  if (!valid[key](String(value))) return NextResponse.json({ error: 'That value isn’t allowed' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value: String(value), updated_by: (user.assignment as any).id, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key, value })
}
