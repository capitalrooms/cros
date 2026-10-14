import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logAudit, getClientIp } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getEmailFromBearer(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!token) return null
  try {
    const svc = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data, error } = await svc.auth.getUser(token)
    return error || !data.user?.email ? null : data.user.email
  } catch { return null }
}

// Store (or refresh) a device's push subscription against a person.
export async function POST(req: NextRequest) {
  const email = await getEmailFromBearer(req)
  if (!email) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized push/subscribe access', ipAddress: getClientIp(req.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Who the device belongs to comes ONLY from the signed-in caller's own record — never from the request body.
    // (Before 14 Oct 2026 the body's personId / email / role were trusted, so any signed-in user could register a
    // device as an administrator and receive office notifications, or as another person and receive theirs.)
    const { endpoint, p256dh, auth: authKey } = await req.json()
    if (!endpoint || !p256dh || !authKey || typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) {
      return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })
    }

    // Use service role to bypass RLS for upsert
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data: me } = await supabase.from('people').select('id, email, role').ilike('email', email).order('created_at').limit(1).maybeSingle()
    if (!me) return NextResponse.json({ error: 'No account found for you' }, { status: 403 })
    const { error: dbErr } = await supabase
      .from('push_subscriptions')
      .upsert(
        { endpoint, p256dh, auth: authKey, person_id: me.id, email: me.email, role: me.role ?? null },
        { onConflict: 'endpoint' }
      )
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
