// POST /api/auth/sign-in-log { email, ok } — the login page reports each password sign-in attempt, so wrong passwords
// are counted (lib/auth/signinGuard). Records only; it never changes what the person can do.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getClientIp } from '@/lib/auditLog'
import { logSignIn } from '@/lib/auth/signinGuard'

export async function POST(request: NextRequest) {
  const { email: raw, ok } = await request.json().catch(() => ({}))
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email || email.length > 254) return NextResponse.json({ error: 'email required' }, { status: 400 })
  await logSignIn(createServiceClient(), email, ok === true, getClientIp(request.headers))
  return NextResponse.json({ ok: true })
}
