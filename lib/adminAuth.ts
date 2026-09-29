// Server-side guard for admin API routes. Browser sessions live in localStorage (not cookies), so
// admin pages send the access token as a Bearer header (see lib/adminFetch.ts).
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_ROLES = ['administrator', 'admin']

export async function requireAdmin(req: NextRequest): Promise<{ email: string; personId: string } | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await svc.auth.getUser(token)
  if (!user?.email) return null
  const { data: person } = await svc.from('people').select('id, role').ilike('email', user.email).maybeSingle()
  if (!person || !ADMIN_ROLES.includes(person.role)) return null
  return { email: user.email, personId: person.id }
}
