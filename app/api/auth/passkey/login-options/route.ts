import { NextRequest, NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { createClient } from '@supabase/supabase-js'

const RPID = 'localhost' // Change to your domain in production

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get all passkeys (we'll let the user select which one)
    const { data: passkeys } = await supabase
      .from('passkeys')
      .select('credential_id')

    const allowCredentials = (passkeys || []).map((pk) => ({
      id: Buffer.from(pk.credential_id, 'base64url'),
      type: 'public-key' as const,
    }))

    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: RPID,
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials,
    })

    return NextResponse.json({
      ...options,
      challenge: options.challenge,
    })
  } catch (error) {
    console.error('Login options error:', error)
    return NextResponse.json(
      { error: 'Failed to generate login options' },
      { status: 500 }
    )
  }
}
