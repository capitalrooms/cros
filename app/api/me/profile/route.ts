// /api/me/profile — anyone signed in changes their own name, title and phone (16 Nov 2026: the profile screens wrote to
// the people table from the browser, which it now refuses). Office staff also set the job title and direct line used
// in their email signature. Email, role and anything money- or identity-related are the office's, never here.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { SALUTATIONS } from '@/lib/people'

export const dynamic = 'force-dynamic'
const ANYONE = ['salutation', 'first_name', 'middle_name', 'last_name', 'full_name', 'preferred_name', 'phone']
const STAFF = ['job_title', 'direct_phone']

export async function POST(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me || me.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const allowed = [...ANYONE, ...(['administrator', 'admin', 'lettings'].includes(me.role) ? STAFF : [])]
  const row: Record<string, unknown> = {}
  for (const k of allowed) if (k in b) row[k] = typeof b[k] === 'string' ? (b[k] as string).trim() || null : b[k]
  if (row.salutation && !(SALUTATIONS as readonly string[]).includes(String(row.salutation))) return NextResponse.json({ error: `“${row.salutation}” isn’t one of the titles CROS knows.` }, { status: 400 })
  if (!Object.keys(row).length) return NextResponse.json({ ok: true })
  row.updated_at = new Date().toISOString()
  const s = createServiceClient()
  let { error } = await s.from('people').update(row).eq('id', me.personId)
  if (error && /preferred_name/.test(error.message)) { delete row.preferred_name; ({ error } = await s.from('people').update(row).eq('id', me.personId)) }
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
}
