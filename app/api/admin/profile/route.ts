import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin self-edit profile endpoint.
 *
 * GET  /api/admin/profile  — returns the current admin's people row
 * PATCH /api/admin/profile — updates first_name, last_name, salutation,
 *                            job_title, direct_phone
 *
 * Signature image is handled separately via POST /api/admin/upload-signature.
 *
 * Auth: reads the Bearer token from the Authorization header, extracts the
 * email from the JWT claims, and then updates ONLY that person's row.
 * Uses the service-role client so it can bypass RLS.
 */

function createServiceClient() {
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!sk) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, sk, {
    auth: { persistSession: false },
  })
}

async function getEmailFromRequest(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  if (!token) return null
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const email = await getEmailFromRequest(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('people')
    .select('id, email, first_name, last_name, full_name, salutation, role, job_title, direct_phone, signature_url')
    .eq('email', email)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ person: data })
}

export async function PATCH(req: NextRequest) {
  const email = await getEmailFromRequest(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { firstName, lastName, salutation, jobTitle, directPhone } = body

  if (!firstName || !String(firstName).trim()) {
    return NextResponse.json({ error: 'First name is required' }, { status: 400 })
  }

  const firstTrimmed = String(firstName).trim()
  const lastTrimmed  = String(lastName || '').trim()
  const fullName     = lastTrimmed ? `${firstTrimmed} ${lastTrimmed}` : firstTrimmed

  const validSalutations = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev', 'Mx', '']
  const sal = salutation && validSalutations.includes(salutation) ? salutation : null

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('people')
    .update({
      first_name:   firstTrimmed || null,
      last_name:    lastTrimmed  || null,
      full_name:    fullName,
      salutation:   sal,
      job_title:    typeof jobTitle    === 'string' ? (jobTitle.trim()    || null) : undefined,
      direct_phone: typeof directPhone === 'string' ? (directPhone.trim() || null) : undefined,
      updated_at:   new Date().toISOString(),
    })
    .eq('email', email)

  if (error) {
    console.error('[profile PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, firstName: firstTrimmed, lastName: lastTrimmed, fullName })
}
