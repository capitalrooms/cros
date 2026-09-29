/**
 * GET  /api/admin/business-settings  → returns current settings row
 * POST /api/admin/business-settings  → update settings (body: Partial<BusinessSettings>)
 *
 * Admin-only. Service role bypasses RLS so changes land immediately.
 * After a successful POST, the in-process cache is invalidated so the
 * next email send picks up the new values within 5 minutes at most.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'
import { invalidateBusinessSettingsCache, BUSINESS_DEFAULTS } from '@/lib/emailWrapper'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role ?? '')) return null
  return user
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supa = serviceClient()
  const { data, error } = await supa
    .from('business_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return merged with defaults so the UI always has every field
  return NextResponse.json({ settings: { ...BUSINESS_DEFAULTS, ...(data ?? {}) } })
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Only allow whitelisted fields
  const ALLOWED = [
    'company_name', 'address_line1', 'address_line2', 'city', 'postcode',
    'email', 'phone', 'logo_url', 'logo_url_light', 'email_theme',
  ] as const
  type AllowedKey = typeof ALLOWED[number]

  const patch: Partial<Record<AllowedKey, string>> = {}
  for (const key of ALLOWED) {
    if (key in body && typeof body[key] === 'string') {
      patch[key] = body[key]
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supa = serviceClient()

  // Upsert — ensures row exists even if migration 129 hasn't seeded yet
  const { error } = await supa
    .from('business_settings')
    .upsert({
      id: SETTINGS_ID,
      ...BUSINESS_DEFAULTS,
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', SETTINGS_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bust the in-process cache so the next email uses the new settings
  invalidateBusinessSettingsCache()

  return NextResponse.json({ ok: true, updated: patch })
}
