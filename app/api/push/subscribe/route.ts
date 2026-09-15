import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateEmail, validateUUID } from '@/lib/validation'

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
    const { endpoint, p256dh, auth: authKey, personId, email: bodyEmail, role } = await req.json()
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })
    }

    if (personId && !validateUUID(personId)) {
      return NextResponse.json({ error: 'Invalid personId format' }, { status: 400 })
    }

    if (bodyEmail && !validateEmail(bodyEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Use service role to bypass RLS for upsert
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { error: dbErr } = await supabase
      .from('push_subscriptions')
      .upsert(
        { endpoint, p256dh, auth: authKey, person_id: personId ?? null, email: bodyEmail ?? email, role: role ?? null },
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
