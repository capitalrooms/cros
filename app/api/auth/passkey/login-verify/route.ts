import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { createClient } from '@supabase/supabase-js'

const RPID = 'localhost' // Change to your domain in production
const RPORIGINS = ['http://localhost:3002', 'http://192.168.1.125:3002'] // Add production URLs

export async function POST(request: NextRequest) {
  try {
    const { assertion } = await request.json()

    if (!assertion) {
      return NextResponse.json(
        { error: 'Assertion required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get passkey by credential ID
    const credentialIdBase64 = Buffer.from(assertion.id, 'base64url').toString('base64url')

    const { data: passkey } = await supabase
      .from('passkeys')
      .select('user_id, public_key, counter')
      .eq('credential_id', credentialIdBase64)
      .single()

    if (!passkey) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      )
    }

    // Verify the assertion
    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: assertion.clientExtensionResults?.hmacGetSecret?.enabled
          ? Buffer.from(assertion.response.clientDataJSON).toString('utf-8')
          : Buffer.from(assertion.response.clientDataJSON).toString('utf-8'),
        expectedOrigin: RPORIGINS,
        expectedRPID: RPID,
        credentialPublicKey: Buffer.from(passkey.public_key, 'base64url'),
        credentialID: Buffer.from(assertion.id, 'base64url'),
        signCount: passkey.counter,
      })
    } catch (verifyError) {
      console.error('Verification failed:', verifyError)
      return NextResponse.json(
        { error: 'Invalid assertion' },
        { status: 400 }
      )
    }

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Authentication verification failed' },
        { status: 400 }
      )
    }

    // Update last_used_at timestamp
    await supabase
      .from('passkeys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('credential_id', credentialIdBase64)

    // Get user info
    const { data: user } = await supabase
      .from('people')
      .select('id, email, full_name, role')
      .eq('id', passkey.user_id)
      .single()

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Create session/JWT token (in production, use secure session management)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
      },
      message: 'Successfully authenticated with passkey',
    })
  } catch (error) {
    console.error('Login verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify passkey' },
      { status: 500 }
    )
  }
}
