// /api/admin/maintenance/arrange — arrange works on a room from its room page (24 Oct 2026, Harry: "arrange a
// contractor to visit for known issue e.g. get them to repaint room when room is empty or send to multiple to get
// quotes"). Office-raised, so approved straight away.
//   GET  ?roomId=                      → { contractors, window } — who can be sent, and when the room is empty
//   POST { roomId, title, details, category, when: 'empty' | 'asap' | 'from', from?, mode: 'assign' | 'quotes', contractorId? }
//        → { ticketId } — assign: the job goes to that contractor to book (the page then tells them through
//          /api/notify-job-raised); quotes: the page then asks several through /api/admin/quotes
// Office staff with Maintenance (lib/access/areas: /api/admin/maintenance).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { displayName, isTestEmail } from '@/lib/people'

export const dynamic = 'force-dynamic'

const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const full = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** When the room is empty: from the day after the current tenancy ends (or today, if nobody lives there) until the
 *  day before the next tenant moves in. Null while someone lives there with no end date. */
async function emptyWindow(s: ReturnType<typeof createServiceClient>, roomId: string) {
  const today = londonToday()
  const { data: lets } = await s.from('tenancies').select('start_date, end_date').eq('room_id', roomId).is('let_cancelled_at', null)
    .or(`end_date.is.null,end_date.gte.${today}`).order('start_date')
  const rows = (lets ?? []) as { start_date: string; end_date: string | null }[]
  const current = rows.find(t => t.start_date <= today)
  if (current && !current.end_date) return null
  const from = current ? addDays(current.end_date!, 1) : today
  const next = rows.find(t => t.start_date >= from)
  const to = next ? addDays(next.start_date, -1) : null
  if (to && to < from) return null   // the next tenant moves in the day after — no gap
  return { from, to, nextMoveIn: next?.start_date ?? null,
    text: `${from === today ? 'from today' : `from ${full(from)}`}${to ? ` to ${full(to)}` : ', until it’s let'}${next ? ` (the next tenant moves in on ${full(next.start_date)})` : ''}` }
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const roomId = req.nextUrl.searchParams.get('roomId') ?? ''
  const s = createServiceClient()
  const [{ data: people }, window] = await Promise.all([
    s.from('people').select('id, salutation, first_name, last_name, full_name, company, email').eq('role', 'contractor'),
    emptyWindow(s, roomId),
  ])
  const contractors = (people ?? []).map((p: any) => ({ id: p.id, name: p.company ? `${displayName(p)} · ${p.company}` : displayName(p), test: isTestEmail(p.email) }))
    .sort((a, b) => Number(a.test) - Number(b.test) || a.name.localeCompare(b.name))
  return NextResponse.json({ contractors, window })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const title = String(b.title ?? '').trim().slice(0, 200)
  const details = String(b.details ?? '').trim().slice(0, 4000)
  if (!title) return NextResponse.json({ error: 'Say what needs doing first.' }, { status: 400 })
  const mode = b.mode === 'quotes' ? 'quotes' : 'assign'
  const s = createServiceClient()
  const { data: room } = await s.from('rooms').select('id, name, property_id').eq('id', String(b.roomId ?? '')).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  let contractorId: string | null = null
  if (mode === 'assign') {
    const { data: c } = await s.from('people').select('id').eq('id', String(b.contractorId ?? '')).eq('role', 'contractor').maybeSingle()
    if (!c) return NextResponse.json({ error: 'Choose the contractor to send it to.' }, { status: 400 })
    contractorId = c.id
  }

  // when — written into the job, so the contractor sees it on the job sheet
  let whenText = 'As soon as possible.'
  if (b.when === 'empty') {
    const w = await emptyWindow(s, room.id)
    if (!w) return NextResponse.json({ error: 'Someone lives in this room with no end date, so there’s no empty spell to book into.' }, { status: 400 })
    whenText = `While the room is empty: ${w.text}. Book a date in that time — nobody will be living in ${room.name}.`
  } else if (b.when === 'from') {
    const from = String(b.from ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: 'Choose the date it can be done from.' }, { status: 400 })
    whenText = `On or after ${full(from)}.`
  }

  const { data: created, error } = await s.from('maintenance_tickets').insert({
    property_id: room.property_id, room_id: room.id, title, location: room.name,
    description: [details, `When: ${whenText}`].filter(Boolean).join('\n\n'),
    category: String(b.category || 'Decoration & Finishes').slice(0, 60), priority: 'low',
    raised_by_role: 'office', approved_at: new Date().toISOString(), approved_by: caller.personId ?? null,
    ...(contractorId ? { status: 'assigned', contractor_id: contractorId } : { status: 'reported', quote_requested: true }),
    admin_note: `Arranged from the room page by ${caller.email}.`,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ticketId: created.id })
}
