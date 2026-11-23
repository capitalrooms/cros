// POST /api/auth/sign-in-check { email } — asked before a password sign-in: is this address (or this internet
// address) locked out after too many wrong passwords? Same shape whether or not the email has an account.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getClientIp } from '@/lib/auditLog'
import { signInLock } from '@/lib/auth/signinGuard'

export async function POST(request: NextRequest) {
  const { email: raw } = await request.json().catch(() => ({}))
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ locked: false, minutes: 0 })
  const lock = await signInLock(createServiceClient(), email, getClientIp(request.headers))
  return NextResponse.json(lock)
}
