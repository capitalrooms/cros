import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateEmail, validateUUID } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Store (or refresh) a device's push subscription against a person.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ userId: 'unknown', action: 'security_unauthorized_access', details: 'Unauthorized push/subscribe access', ipAddress: getClientIp(req.headers) })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { endpoint, p256dh, auth, personId, email, role } = await req.json()
    if (!endpoint || !p256dh || !auth) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: 'Missing subscription fields', ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })
    }

    if (personId && !validateUUID(personId)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid personId: ${personId}`, ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Invalid personId format' }, { status: 400 })
    }

    if (email && !validateEmail(email)) {
      await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid email: ${email}`, ipAddress: getClientIp(req.headers) })
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    const supabase = createClient()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { endpoint, p256dh, auth, person_id: personId ?? null, email: email ?? null, role: role ?? null },
        { onConflict: 'endpoint' }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
