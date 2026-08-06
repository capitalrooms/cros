import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Store reset tokens in memory (for dev purposes - in production use database)
const resetTokens = new Map<string, { email: string; createdAt: number }>()

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check if user exists
    const { data: person } = await supabase
      .from('people')
      .select('email')
      .eq('email', email)
      .single()

    if (!person) {
      // For security, don't reveal if email exists
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, a password reset link will be sent.',
      })
    }

    // Generate a secure random token (no email needed)
    const token = crypto.randomBytes(32).toString('hex')
    const now = Date.now()

    // Store token with expiry (1 hour)
    resetTokens.set(token, { email, createdAt: now })

    // Clean up old tokens
    for (const [key, value] of resetTokens.entries()) {
      if (now - value.createdAt > 3600000) {
        resetTokens.delete(key)
      }
    }

    // Build reset link
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`

    return NextResponse.json({
      success: true,
      message: 'Password reset link ready. No email needed - click the link below to reset your password:',
      resetLink: resetLink,
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}

// Export for use in reset-password-confirm
export function getResetToken(token: string) {
  return resetTokens.get(token)
}

export function markTokenUsed(token: string) {
  resetTokens.delete(token)
}
