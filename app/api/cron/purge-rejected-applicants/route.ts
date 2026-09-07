import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * GET /api/cron/purge-rejected-applicants
 *
 * Runs daily (see vercel.json). Permanently deletes rejected applicant records
 * that were rejected more than 30 days ago, per GDPR.
 *
 * "Rejected more than 30 days ago" = pipeline_stage = 'rejected' AND updated_at < now - 30 days.
 * updated_at is set to now() when we reject an applicant, so this is accurate.
 */
export async function GET(req: NextRequest) {
  // Allow Vercel cron (no auth header) or a secret header for manual runs
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization') || ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Count first so we can log it
  const { count } = await sb
    .from('applicants')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_stage', 'rejected')
    .lt('updated_at', thirtyDaysAgo)

  if (!count || count === 0) {
    return NextResponse.json({ ok: true, purged: 0, message: 'No records due for deletion' })
  }

  const { error } = await sb
    .from('applicants')
    .delete()
    .eq('pipeline_stage', 'rejected')
    .lt('updated_at', thirtyDaysAgo)

  if (error) {
    console.error('purge-rejected-applicants failed:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`purge-rejected-applicants: deleted ${count} records`)
  return NextResponse.json({ ok: true, purged: count })
}
