import { agreedRent } from '@/lib/lettings/holdingDeposit'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'

const PIPELINE_STAGES = ['invited','applied','offer_sent','referencing','referencing_passed','docs_uploaded','converted'] as const
type PipelineStage = typeof PIPELINE_STAGES[number]

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) return null
  if (!['lettings', 'administrator', 'admin'].includes(user.assignment?.role)) return null
  return user
}

// ── GET /api/applicants/[id] ──────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sb = adminClient()
  const { data, error } = await sb
    .from('applicants')
    .select('*, rooms(name, current_asking_rent), properties(name, address), viewings(viewing_date, viewing_slot)')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // the agreed rent (offer / accepted lower offer / tenancy) — what every form should start from, never the advert
  return NextResponse.json({ ...data, agreed_rent: await agreedRent(sb as any, data as any) })
}

// ── PATCH /api/applicants/[id] — advance stage or update notes ────────────────
export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const sb = adminClient()

  // If advancing stage, validate it's a forward move
  if (body.pipeline_stage) {
    const { data: current } = await sb.from('applicants').select('pipeline_stage').eq('id', params.id).single()
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const currentIdx = PIPELINE_STAGES.indexOf(current.pipeline_stage as PipelineStage)
    const newIdx     = PIPELINE_STAGES.indexOf(body.pipeline_stage as PipelineStage)
    // Allow going backwards only if explicitly forced (admin override)
    if (newIdx < currentIdx && !body.force) {
      return NextResponse.json({ error: `Cannot move backwards from ${current.pipeline_stage} to ${body.pipeline_stage} without force:true` }, { status: 400 })
    }
  }

  const allowed = ['pipeline_stage','admin_notes','reviewed_at','reviewed_by','offer_id']
  const update: Record<string,any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await sb.from('applicants').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
