/**
 * /api/planner/shared — the shared planner between the office and one person (migration 200).
 *   GET  ?board=<id>   → office: { boards, board, entries, people, properties }; anyone else: their own board
 *   POST { action: 'create_board', personId, title? }        office only — one live board per person
 *        { action: 'entry', boardId, title, body?, propertyId?, dueDate?, links?, photos? }
 *        { action: 'reply', entryId, body?, links?, photos? }
 *        { action: 'status', entryId, status: 'open'|'done' }
 *        { action: 'archive_board', boardId }               office only
 * The other side gets an in-app notification and a push for a new entry or reply. Office = administrator/admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, type Caller } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'planner-files'
const OFFICE = ['administrator', 'admin']
const isOffice = (c: Caller) => OFFICE.includes(c.role)
const name = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || '') : ''
const missing = (e: { message?: string } | null) => !!e && /planner_shared|schema cache|does not exist/.test(e.message ?? '')

function cleanLinks(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)
  return arr.map(x => String(x).trim()).filter(x => /^https?:\/\/[^\s]+$/i.test(x)).slice(0, 10)
}
function cleanPhotos(v: unknown, boardId: string): string[] {
  return (Array.isArray(v) ? v : []).map(String).filter(p => p.startsWith(`${boardId}/`) && !p.includes('..')).slice(0, 12)
}

type S = ReturnType<typeof createServiceClient>

async function boardFor(s: S, caller: Caller, boardId: string) {
  const { data } = await s.from('planner_shared_boards').select('*').eq('id', boardId).is('archived_at', null).maybeSingle() as { data: any }
  if (!data) return null
  return isOffice(caller) || data.member_person_id === caller.personId ? data : null
}

async function signed(s: S, paths: string[]) {
  if (!paths.length) return new Map<string, string>()
  const { data } = await s.storage.from(BUCKET).createSignedUrls(paths, 3600)
  return new Map((data ?? []).filter(d => d.signedUrl).map(d => [d.path!, d.signedUrl]))
}

async function loadBoard(s: S, board: any) {
  const { data: entries } = await s.from('planner_shared_entries')
    .select('*, properties(name), people!created_by(first_name, last_name, full_name)')
    .eq('board_id', board.id).order('status').order('created_at', { ascending: false }) as { data: any[] | null }
  const ids = (entries ?? []).map(e => e.id)
  const { data: replies } = ids.length
    ? await s.from('planner_shared_replies').select('*, people!author_id(first_name, last_name, full_name)').in('entry_id', ids).order('created_at') as { data: any[] | null }
    : { data: [] as any[] }
  const paths = [...(entries ?? []).flatMap(e => e.photos ?? []), ...(replies ?? []).flatMap(r => r.photos ?? [])]
  const urls = await signed(s, paths)
  const photo = (p: string) => ({ path: p, url: urls.get(p) ?? null })
  return (entries ?? []).map(e => ({
    id: e.id, title: e.title, body: e.body, status: e.status, dueDate: e.due_date, createdAt: e.created_at, doneAt: e.done_at,
    property: e.properties?.name ? String(e.properties.name).split('\n')[0] : null, propertyId: e.property_id,
    author: name(e.people), links: e.links ?? [], photos: (e.photos ?? []).map(photo),
    replies: (replies ?? []).filter(r => r.entry_id === e.id).map(r => ({
      id: r.id, body: r.body, author: name(r.people), mine: false, authorId: r.author_id, createdAt: r.created_at, links: r.links ?? [], photos: (r.photos ?? []).map(photo),
    })),
  }))
}

// the other side of the board hears about it
async function tell(s: S, caller: Caller, board: any, title: string, body: string) {
  const link = isOffice({ ...caller }) ? '/planner' : `/admin/planner/shared?board=${board.id}`
  let ids: string[]
  if (isOffice(caller)) ids = [board.member_person_id]
  else {
    const { data } = await s.from('people').select('id').in('role', OFFICE)
    ids = ((data ?? []) as any[]).map(p => p.id)
  }
  if (!ids.length) return
  await insertNotifications(s, ids, { title, body, type: 'planner', link })
  await sendServerPush({ personIds: ids, title, body, url: link, tag: `planner-${board.id}` })
}

export async function GET(req: NextRequest) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const s = createServiceClient()
  if (isOffice(caller)) {
    const { data: boards, error } = await s.from('planner_shared_boards')
      .select('*, people!member_person_id(id, first_name, last_name, full_name, company, role)').is('archived_at', null).order('created_at') as { data: any[] | null; error: any }
    if (error) return NextResponse.json(missing(error) ? { setupNeeded: true, boards: [] } : { error: error.message }, { status: missing(error) ? 200 : 500 })
    const ids = (boards ?? []).map(b => b.id)
    const { data: open } = ids.length ? await s.from('planner_shared_entries').select('board_id').in('board_id', ids).eq('status', 'open') : { data: [] as any[] }
    const want = req.nextUrl.searchParams.get('board')
    const board = (boards ?? []).find(b => b.id === want) ?? (boards ?? [])[0] ?? null
    const [{ data: people }, { data: properties }] = await Promise.all([
      s.from('people').select('id, first_name, last_name, full_name, company, role').in('role', ['cleaner', 'contractor', 'lettings', 'landlord']).order('first_name'),
      s.from('properties').select('id, name, address, property_code'),
    ])
    return NextResponse.json({
      office: true,
      boards: (boards ?? []).map(b => ({ id: b.id, title: b.title, kind: b.kind, member: name(b.people), role: b.people?.role, personId: b.member_person_id, open: ((open ?? []) as any[]).filter(o => o.board_id === b.id).length })),
      board: board ? { id: board.id, title: board.title, member: name(board.people), role: board.people?.role } : null,
      entries: board ? await loadBoard(s, board) : [],
      // staff first (cleaners, contractors, lettings), then landlords; properties in address order
      people: ((people ?? []) as any[]).map(p => ({ id: p.id, name: name(p), role: p.role }))
        .sort((a, b) => (a.role === 'landlord' ? 1 : 0) - (b.role === 'landlord' ? 1 : 0) || a.name.localeCompare(b.name)),
      properties: sortPropertiesNumerically((properties ?? []) as any[]).map((p: any) => ({ id: p.id, name: String(p.name ?? '').split('\n')[0] })),
    })
  }
  const { data: board, error } = await s.from('planner_shared_boards').select('*').eq('member_person_id', caller.personId).is('archived_at', null).maybeSingle() as { data: any; error: any }
  if (error) return NextResponse.json(missing(error) ? { setupNeeded: true, board: null, entries: [] } : { error: error.message }, { status: missing(error) ? 200 : 500 })
  return NextResponse.json({ office: false, board: board ? { id: board.id, title: board.title } : null, entries: board ? await loadBoard(s, board) : [] })
}

export async function POST(req: NextRequest) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const who = await s.from('people').select('first_name, last_name, full_name').eq('id', caller.personId).maybeSingle().then(r => name(r.data) || caller.email)

  if (b.action === 'create_board' || b.action === 'archive_board') {
    if (!isOffice(caller)) return NextResponse.json({ error: 'Only the office can do that' }, { status: 403 })
    if (b.action === 'archive_board') {
      const { error } = await s.from('planner_shared_boards').update({ archived_at: new Date().toISOString() }).eq('id', b.boardId)
      return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true })
    }
    const { data: p } = await s.from('people').select('id, first_name, last_name, full_name, company').eq('id', b.personId).maybeSingle()
    if (!p) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    const { data: existing } = await s.from('planner_shared_boards').select('id').eq('member_person_id', p.id).is('archived_at', null).maybeSingle()
    if (existing) return NextResponse.json({ boardId: existing.id })
    const { data, error } = await s.from('planner_shared_boards').insert({ member_person_id: p.id, title: String(b.title || `${name(p)} & Capital Rooms`).slice(0, 120), created_by: caller.email }).select('id').single()
    if (error) return NextResponse.json({ error: missing(error) ? 'Run migration 200 in Supabase first' : error.message }, { status: 400 })
    return NextResponse.json({ boardId: data.id })
  }

  if (b.action === 'entry') {
    const board = await boardFor(s, caller, String(b.boardId ?? ''))
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    const title = String(b.title ?? '').trim().slice(0, 200)
    if (!title) return NextResponse.json({ error: 'Give it a title' }, { status: 400 })
    const { data, error } = await s.from('planner_shared_entries').insert({
      board_id: board.id, title, body: String(b.body ?? '').trim().slice(0, 4000),
      property_id: b.propertyId || null, due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate ?? '')) ? b.dueDate : null,
      links: cleanLinks(b.links), photos: cleanPhotos(b.photos, board.id), created_by: caller.personId,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await tell(s, caller, board, isOffice(caller) ? '🗂️ New from Capital Rooms' : `🗂️ New from ${who}`, title)
    return NextResponse.json({ entryId: data.id })
  }

  if (b.action === 'reply' || b.action === 'status') {
    const { data: entry } = await s.from('planner_shared_entries').select('id, title, board_id').eq('id', String(b.entryId ?? '')).maybeSingle() as { data: any }
    const board = entry ? await boardFor(s, caller, entry.board_id) : null
    if (!entry || !board) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (b.action === 'status') {
      const done = b.status === 'done'
      const { error } = await s.from('planner_shared_entries').update({ status: done ? 'done' : 'open', done_at: done ? new Date().toISOString() : null, done_by: done ? caller.personId : null, updated_at: new Date().toISOString() }).eq('id', entry.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      if (done) await tell(s, caller, board, `✅ ${who} ticked off`, entry.title)
      return NextResponse.json({ ok: true })
    }
    const body = String(b.body ?? '').trim().slice(0, 4000)
    const links = cleanLinks(b.links), photos = cleanPhotos(b.photos, board.id)
    if (!body && !links.length && !photos.length) return NextResponse.json({ error: 'Write something, or add a link or photo' }, { status: 400 })
    const { error } = await s.from('planner_shared_replies').insert({ entry_id: entry.id, author_id: caller.personId, body, links, photos })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await s.from('planner_shared_entries').update({ updated_at: new Date().toISOString() }).eq('id', entry.id)
    await tell(s, caller, board, `💬 ${who} replied`, `${entry.title}: ${body || (photos.length ? 'a photo' : 'a link')}`.slice(0, 180))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
