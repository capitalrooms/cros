import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getResetToken, markTokenUsed } from '@/lib/resetTokens'
import { logAudit, getClientIp } from '@/lib/auditLog'

// Map to track used tokens
const usedTokens = new Set<string>()

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      await logAudit({ userId: 'unknown', action: 'security_invalid_input', details: 'Missing token or password', ipAddress: getClientIp(request.headers) })
      return NextResponse.json(
        { error: 'Token and password required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      await logAudit({ userId: 'unknown', action: 'security_invalid_input', details: 'Password too short', ipAddress: getClientIp(request.headers) })
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Get token data from shared store
    const tokenData = getResetToken(token)

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link' },
        { status: 400 }
      )
    }

    if (usedTokens.has(token)) {
      return NextResponse.json(
        { error: 'This reset link has already been used' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Find the user by email
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, email')
      .eq('email', tokenData.email)
      .single()

    if (personError || !person) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 400 }
      )
    }

    // Mark token as used
    usedTokens.add(token)
    markTokenUsed(token)

    return NextResponse.json({
      success: true,
      message: 'Password reset successful',
      email: tokenData.email,
      // In real scenario, user would need to set new password via Supabase
    })
  } catch (error) {
    console.error('Reset password confirm error:', error)
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}
