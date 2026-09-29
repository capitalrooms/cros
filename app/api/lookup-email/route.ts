import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/lookup-email?phone=07XXXXXXXXX
// Used by the login page when arriving via an SMS link (?phone=...).
// Returns only a masked hint — { hint: 'h•••y@c•••.co.uk' } or { hint: null } — never the address itself, so the
// route can't be used to harvest people's email addresses from phone numbers.

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ hint: null })

  // Normalise: strip spaces, ensure +44 format for UK numbers
  const normalised = phone.trim().replace(/\s+/g, '')

  const supabase = createServiceClient()

  // Try exact match first, then try with +44 prefix swap
  const candidates = [normalised]
  if (normalised.startsWith('07')) candidates.push('+44' + normalised.slice(1))
  if (normalised.startsWith('+44')) candidates.push('0' + normalised.slice(3))

  for (const candidate of candidates) {
    const { data } = await supabase
      .from('people')
      .select('email')
      .eq('phone', candidate)
      .maybeSingle()
    if (data?.email) return NextResponse.json({ hint: maskEmail(data.email) })
  }

  return NextResponse.json({ hint: null })
}

function maskEmail(e: string): string {
  const [user, domain = ''] = e.split('@')
  const [host, ...rest] = domain.split('.')
  const m = (x: string) => (x.length <= 2 ? x[0] + '•' : x[0] + '•••' + x[x.length - 1])
  return `${m(user)}@${m(host)}${rest.length ? '.' + rest.join('.') : ''}`
}
