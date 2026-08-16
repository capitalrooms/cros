import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Cron job: Auto-file acknowledgment notes that have expired (7 days without acknowledgment)
 * Triggered daily; marks status='filed' for notes past their expiration date
 */

const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== CRON_SECRET && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  try {
    // Get all active acknowledgment notes that have expired
    const now = new Date().toISOString()

    const { data: expiredNotes, error: fetchError } = await supabase
      .from('tenant_acknowledgment_notes')
      .select('id')
      .eq('status', 'active')
      .lt('expires_at', now)

    if (fetchError) throw fetchError

    if (!expiredNotes || expiredNotes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired notes to file',
        filed: 0,
      })
    }

    // Update all expired notes to status='filed'
    const { error: updateError, count } = await supabase
      .from('tenant_acknowledgment_notes')
      .update({ status: 'filed' })
      .eq('status', 'active')
      .lt('expires_at', now)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      message: `Auto-filed ${count} expired acknowledgment notes`,
      filed: count,
    })
  } catch (error) {
    console.error('Auto-file cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
