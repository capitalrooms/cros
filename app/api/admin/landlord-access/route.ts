// /api/admin/landlord-access — what a landlord sees in their app, set by an administrator on their profile
// (lib/access/landlordSections; 14 Oct 2026).
//   GET  ?personId=           → { sections, custom, login: AccountStatus, boardId }
//   POST { personId, sections: string[] }  → saves the list; switching the planner on opens their board if none
//   POST { personId, action: 'send' }      → the standard sign-in email (lib/auth/accounts): set up a password if
//                                              they have no login yet, otherwise a reset link. Lands in their app.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdministrator } from '@/lib/adminAuth'
import { getClientIp } from '@/lib/auditLog'
import { getElectedCommsLive } from '@/lib/comms'
import { authUsersByEmail, statusOf, sendAccountEmail } from '@/lib/auth/accounts'
import { landlordSections, cleanLandlordSections } from '@/lib/access/landlordSections'

export const dynamic = 'force-dynamic'

async function load(s: ReturnType<typeof createServiceClient>, personId: string) {
  const { data: p } = await s.from('people').select('id, email, role, salutation, first_name, last_name, full_name, company, access_areas').eq('id', personId).maybeSingle() as { data: any }
  if (!p || p.role !== 'landlord') return null
  const { data: board } = await s.from('planner_shared_boards').select('id').eq('member_person_id', p.id).is('archived_at', null).maybeSingle()
  return { p, boardId: (board as any)?.id ?? null as string | null }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NextResponse.json({ error: 'Only an administrator can change what a landlord sees.' }, { status: 403 })
  const s = createServiceClient()
  const x = await load(s, String(req.nextUrl.searchParams.get('personId') ?? ''))
  if (!x) return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
  const users = x.p.email ? await authUsersByEmail(s) : new Map()
  return NextResponse.json({
    sections: landlordSections(x.p.access_areas, !!x.boardId),
    custom: Array.isArray(x.p.access_areas),
    login: statusOf(x.p.email ? users.get(String(x.p.email).toLowerCase()) : undefined),
    email: x.p.email ?? null,
    boardId: x.boardId,
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdministrator(req)
  if (!admin) return NextResponse.json({ error: 'Only an administrator can change what a landlord sees.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const x = await load(s, String(b.personId ?? ''))
  if (!x) return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
  const name = [x.p.salutation, x.p.first_name, x.p.last_name].filter(Boolean).join(' ') || x.p.company || x.p.email

  if (b.action === 'send') {
    if (!x.p.email) return NextResponse.json({ error: 'Add their email address first.' }, { status: 400 })
    if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Staff-chosen messages are paused (Settings) — turn them on to send.' }, { status: 409 })
    const r = await sendAccountEmail(s, x.p, req)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    await s.from('audit_logs').insert({ user_id: admin.personId, action: `account_${r.sent}`, details: x.p.email, ip_address: getClientIp(req.headers) })
    return NextResponse.json({ ok: true, sent: r.sent, to: x.p.email })
  }

  const sections = cleanLandlordSections(b.sections)
  const { error } = await s.from('people').update({ access_areas: sections }).eq('id', x.p.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let boardId = x.boardId
  if (sections.includes('planner') && !boardId) {
    const { data, error: be } = await s.from('planner_shared_boards')
      .insert({ member_person_id: x.p.id, title: `${name} & Capital Rooms`.slice(0, 120), created_by: admin.email }).select('id').single()
    if (be) return NextResponse.json({ error: `Saved, but the planner board wasn’t opened: ${be.message}` }, { status: 500 })
    boardId = (data as any).id
  }
  await s.from('audit_logs').insert({ user_id: admin.personId, action: 'landlord_app_sections', details: `${x.p.email ?? x.p.id}: ${sections.join(', ') || 'nothing'}`, ip_address: getClientIp(req.headers) })
  return NextResponse.json({ ok: true, sections, boardId })
}
