// GET  /api/admin/applicants/merge — people with more than one live applicant record on the same email
// POST /api/admin/applicants/merge { keep, others[] } — one record kept: deposits, offers, documents, tenancies and
//      landlord updates moved onto it, gaps filled from the others, the others archived (lib/lettings/applicantRecord)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { duplicateApplicants, mergeApplicants } from '@/lib/lettings/applicantRecord'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  return NextResponse.json({ groups: await duplicateApplicants(createServiceClient()) })
}

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.keep || !Array.isArray(b.others) || !b.others.length) return NextResponse.json({ error: 'Choose which record to keep.' }, { status: 400 })
  try {
    const out = await mergeApplicants(createServiceClient(), String(b.keep), b.others.map(String), me.email)
    return NextResponse.json({ ok: true, ...out })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'The merge didn’t work' }, { status: 400 })
  }
}
