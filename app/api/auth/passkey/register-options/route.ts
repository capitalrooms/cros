import { NextRequest, NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { email, displayName } = await request.json()

    if (!email || !displayName) {
      return NextResponse.json(
        { error: 'Email and display name required' },
        { status: 400 }
      )
    }

    // Generate WebAuthn registration options
    const options = await generateRegistrationOptions({
      rpID: 'localhost', // Change to your domain in production
      rpName: 'Capital Rooms',
      userName: email,
      userID: Buffer.from(email).toString('base64url'),
      userDisplayName: displayName,
      timeout: 60000,
      attestationType: 'direct',
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Use platform authenticator (Face ID, fingerprint, Windows Hello)
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    })

    // Store challenge in session (in production, use Redis or database)
    // For now, store in response and have client send it back
    return NextResponse.json({
      ...options,
      challenge: options.challenge,
    })
  } catch (error) {
    console.error('Registration options error:', error)
    return NextResponse.json(
      { error: 'Failed to generate registration options' },
      { status: 500 }
    )
  }
}
