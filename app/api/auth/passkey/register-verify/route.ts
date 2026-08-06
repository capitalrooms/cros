import { NextRequest, NextResponse } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { createClient } from '@supabase/supabase-js'

const RPID = 'localhost' // Change to your domain in production
const RPORIGINS = ['http://localhost:3002', 'http://192.168.1.125:3002'] // Add production URLs

export async function POST(request: NextRequest) {
  try {
    const { email, credential } = await request.json()

    if (!email || !credential) {
      return NextResponse.json(
        { error: 'Email and credential required' },
        { status: 400 }
      )
    }

    // Verify the credential with the server
    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: credential.clientExtensionResults?.hmacGetSecret?.enabled
          ? Buffer.from(credential.response.clientDataJSON).toString('utf-8')
          : Buffer.from(credential.response.clientDataJSON).toString('utf-8'),
        expectedOrigin: RPORIGINS,
        expectedRPID: RPID,
      })
    } catch (verifyError) {
      console.error('Verification failed:', verifyError)
      return NextResponse.json(
        { error: 'Invalid credential' },
        { status: 400 }
      )
    }

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Credential verification failed' },
        { status: 400 }
      )
    }

    // Get user from Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: user } = await supabase
      .from('people')
      .select('id')
      .eq('email', email)
      .single()

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Store passkey in database
    const { error: dbError } = await supabase
      .from('passkeys')
      .insert({
        user_id: user.id,
        credential_id: Buffer.from(verification.registrationInfo!.credentialID).toString('base64url'),
        public_key: Buffer.from(verification.registrationInfo!.credentialPublicKey).toString('base64url'),
        counter: verification.registrationInfo!.counter,
        device_name: getDeviceName(request),
        created_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save passkey' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Passkey registered successfully',
    })
  } catch (error) {
    console.error('Registration verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify passkey' },
      { status: 500 }
    )
  }
}

function getDeviceName(request: NextRequest): string {
  const ua = request.headers.get('user-agent') || ''

  if (ua.includes('iPhone') || ua.includes('iPad')) {
    return 'iPhone'
  } else if (ua.includes('Android')) {
    return 'Android'
  } else if (ua.includes('Windows')) {
    return 'Windows'
  } else if (ua.includes('Macintosh')) {
    return 'Mac'
  }

  return 'Device'
}
