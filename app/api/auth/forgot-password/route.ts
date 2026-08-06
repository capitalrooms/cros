import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createResetToken } from '@/lib/resetTokens'

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

    // Generate and store reset token
    const token = createResetToken(email)

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
