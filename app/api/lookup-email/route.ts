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
// Used by the login page when arriving via an SMS link (?phone=...)
// Returns { email } or { email: null }

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ email: null })

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
    if (data?.email) return NextResponse.json({ email: data.email })
  }

  return NextResponse.json({ email: null })
}
