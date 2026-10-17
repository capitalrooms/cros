// The cleaner's page for one house (17 Oct 2026, Harry: "a little profile for each property they can add notes to …
// interact with the office"). One list of "notes for this house" shared with the office (property_cleaning_notes —
// the office adds them on Property notes; the cleaner adds and ticks them here or at the end of a clean), the usual
// rhythm worked out from the cleans themselves, and past visits with their notes.
//   GET   ?propertyId=          → { house, usual, notes, done, cleans }
//   POST  { propertyId, text }  → add a note for this house
//   PATCH { noteId }            → tick a note off
// Cleaners (they work across the portfolio) and the office.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'

export const dynamic = 'force-dynamic'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

async function who(req: NextRequest) {
  const me = await requireSignedIn(req)
  return me && (isStaff(me) || me.role === 'cleaner') ? me : null
}

export async function GET(req: NextRequest) {
  if (!(await who(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('propertyId') ?? ''
  const s = createServiceClient()
  const { data: house } = await s.from('properties').select('id, name, address, postcode, clean_frequency_weeks, communal_notes').eq('id', propertyId).maybeSingle()
  if (!house) return NextResponse.json({ error: 'House not found' }, { status: 404 })
  const [{ data: open }, { data: done }, { data: cleans }] = await Promise.all([
    s.from('property_cleaning_notes').select('id, note_title, note_content, cleaning_type, created_at, created_by').eq('property_id', propertyId).eq('is_completed', false).eq('is_deleted', false).order('created_at'),
    s.from('property_cleaning_notes').select('id, note_title, note_content, completed_at').eq('property_id', propertyId).eq('is_completed', true).eq('is_deleted', false).order('completed_at', { ascending: false }).limit(8),
    s.from('cleans').select('id, clean_date, clean_time, duration_hours, status, notes, cleaner_note, admin_note, completed_at').eq('property_id', propertyId).neq('status', 'cancelled').order('clean_date', { ascending: false }).limit(12),
  ])
  // the usual visit: the most common weekday and time of the recent cleans
  const recent = ((cleans ?? []) as any[]).filter(c => c.clean_time).slice(0, 6)
  const mode = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const usual = {
    day: mode(recent.map(c => DAYS[new Date(`${c.clean_date}T12:00:00`).getDay()])),
    time: mode(recent.map(c => String(c.clean_time).slice(0, 5))),
    hours: mode(((cleans ?? []) as any[]).filter(c => c.duration_hours).map(c => String(c.duration_hours))),
    everyWeeks: (house as any).clean_frequency_weeks ?? null,
  }
  return NextResponse.json({ house, usual, notes: open ?? [], done: done ?? [], cleans: cleans ?? [] })
}

export async function POST(req: NextRequest) {
  const me = await who(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const text = String(b.text ?? '').trim().slice(0, 1000)
  if (!b.propertyId || !text) return NextResponse.json({ error: 'Write the note' }, { status: 400 })
  const { error } = await createServiceClient().from('property_cleaning_notes').insert({
    property_id: String(b.propertyId), cleaning_type: me.role === 'cleaner' ? 'reminder' : 'office',
    note_title: me.role === 'cleaner' ? 'Note from the cleaner' : 'Note from the office', note_content: text,
    created_by: me.personId, is_completed: false, is_deleted: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const me = await who(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 })
  const { error } = await createServiceClient().from('property_cleaning_notes').update({ is_completed: true, completed_by: me.personId, completed_at: new Date().toISOString() }).eq('id', String(b.noteId))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
