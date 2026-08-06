/**
 * Confirm email for a test user
 * Run with: npx ts-node scripts/confirm-email.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function confirmEmail() {
  const email = 'lettings@capitalrooms.co.uk'

  console.log(`Confirming email for: ${email}\n`)

  try {
    // Use verifyOtp with email type - we'll generate a fake token
    // Actually, we need to use the admin API, but we only have anon key
    // The workaround is to sign in without confirmation by disabling it in settings

    // Alternative: Try to get the user to complete signup flow
    // For now, let's just try signing in with email link

    const { error } = await supabase.auth.signInWithOtp({ email })

    if (error) {
      console.error('Error:', error.message)
      console.log('\n⚠️  Email confirmation issue. Two solutions:\n')
      console.log('Solution 1: Disable email confirmation in Supabase')
      console.log('  1. Go to https://supabase.com/dashboard')
      console.log('  2. Open Capital Rooms project')
      console.log('  3. Go to Authentication → Providers')
      console.log('  4. In Email section, toggle OFF "Confirm email"')
      console.log('  5. Save changes\n')

      console.log('Solution 2: Use magic link sign-in')
      console.log(`  1. Run: npx ts-node scripts/send-magic-link.ts`)
      console.log(`  2. Check the server logs for the magic link URL`)
      console.log(`  3. Paste the URL in browser\n`)
    } else {
      console.log('✅ Magic link sent! Check server logs for the link.')
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err)
  }
}

confirmEmail()
