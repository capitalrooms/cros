import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { runSubmissionReview } from '@/lib/landlordOnboarding/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST → (re-)run the automated checks for a submitted onboarding form.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json({ review: await runSubmissionReview(id) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Review failed' }, { status: 500 })
  }
}
