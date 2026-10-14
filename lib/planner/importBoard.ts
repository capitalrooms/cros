// Bring a board from the office's own Planner (/admin/planner — saved as landlord-docs/planner/boards.json) into the
// shared planner with someone (14 Oct 2026, Harry: "convert an existing board to a landlord board … I may have been
// working on something then do not want to recreate it all over again"). Server only.
//   item            → entry (title; the heading becomes the property when it names one, else leads the title)
//   status/person/date → a first line on the entry ("In progress · Damian · 5 Sep"); "Done" → done; a date like
//                     "5 Sep" also becomes the due date
//   updates         → replies, with their dates, links and photos (photos copied into planner-files)
// The private board is left exactly as it was. Only the items ticked on the screen come across.
import type { SupabaseClient } from '@supabase/supabase-js'
import { oneLine } from '@/lib/lettings/letWording'

const STATUS: Record<string, string> = { discuss: 'To discuss', discussed: 'Discussed', progress: 'In progress', done: 'Done', parked: 'Parked' }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export interface PrivateItem { id: string; groupName: string; title: string; status: string; responsible?: string; date?: string; updates?: { id: string; author?: string; when?: string; body?: string; links?: string[]; images?: string[] }[] }
export interface PrivateBoard { id: string; title: string; subtitle?: string; items: PrivateItem[] }

export async function loadPrivateBoards(s: SupabaseClient): Promise<PrivateBoard[]> {
  const { data } = await s.storage.from('landlord-docs').download('planner/boards.json')
  if (!data) return []
  try { return (JSON.parse(await data.text()).boards ?? []) as PrivateBoard[] } catch { return [] }
}

/** "5 Sep" / "12 September" → this year's date (last year's if that would be well in the future); else null. */
export function dayMonth(s?: string | null): string | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{2,4}))?$/i)
  if (!m) return null
  const mon = MONTHS.indexOf(m[2].toLowerCase()); if (mon < 0) return null
  const now = new Date()
  let year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear()
  let d = new Date(Date.UTC(year, mon, Number(m[1]), 12))
  if (!m[3] && d.getTime() - now.getTime() > 200 * 86_400_000) { year -= 1; d = new Date(Date.UTC(year, mon, Number(m[1]), 12)) }
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** The one property a heading names ("Willis Road" → 4 Willis Road), or null when none or several match. */
function propertyFor(group: string, props: { id: string; text: string }[]): string | null {
  const g = group.trim().toLowerCase()
  if (!g) return null
  const hits = props.filter(p => p.text.includes(g))
  return hits.length === 1 ? hits[0].id : null
}

/** A planner photo (an uploaded file's link, or a picture kept inside the note) → a private copy in planner-files. */
async function copyPhoto(s: SupabaseClient, boardId: string, src: string): Promise<string | null> {
  try {
    let bytes: ArrayBuffer, type = 'image/jpeg'
    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;]+);base64,(.*)$/); if (!m) return null
      type = m[1]; bytes = Buffer.from(m[2], 'base64').buffer as ArrayBuffer
    } else {
      const path = src.match(/\/storage\/v1\/object\/(?:public|sign)\/property-documents\/([^?]+)/)?.[1]
      if (path) {
        const { data } = await s.storage.from('property-documents').download(decodeURIComponent(path))
        if (!data) return null
        type = data.type || type; bytes = await data.arrayBuffer()
      } else {
        const r = await fetch(src); if (!r.ok) return null
        type = r.headers.get('content-type') || type; bytes = await r.arrayBuffer()
      }
    }
    const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')
    const dest = `${boardId}/imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await s.storage.from('planner-files').upload(dest, Buffer.from(bytes), { contentType: type })
    return error ? null : dest
  } catch { return null }
}

export async function importItems(s: SupabaseClient, opts: { boardId: string; authorId: string; items: PrivateItem[] }): Promise<{ entries: number; replies: number; photosMissed: number }> {
  const { data: props } = await s.from('properties').select('id, name, address')
  const plist = ((props ?? []) as any[]).map(p => ({ id: p.id, text: `${oneLine(p.name)} | ${oneLine(p.address)}`.toLowerCase() }))
  let entries = 0, replies = 0, photosMissed = 0
  for (const it of opts.items) {
    const propertyId = propertyFor(it.groupName, plist)
    const date = it.date && it.date !== '—' ? it.date.trim() : ''
    const due = dayMonth(date)
    // a date like "5 Sep" becomes the due date; anything else ("Spring 26", "Nov") stays in the line
    const line = [it.status !== 'done' ? STATUS[it.status] : '', (it.responsible ?? '').trim(), due ? '' : date].filter(Boolean).join(' · ')
    const { data: e, error } = await s.from('planner_shared_entries').insert({
      board_id: opts.boardId,
      title: (propertyId || !it.groupName ? it.title : `${it.groupName} — ${it.title}`).slice(0, 300),
      body: line,
      property_id: propertyId,
      due_date: due,
      status: it.status === 'done' ? 'done' : 'open',
      done_at: it.status === 'done' ? new Date().toISOString() : null,
      created_by: opts.authorId,
    }).select('id').single()
    if (error || !e) throw new Error(error?.message ?? 'An item wasn’t copied')
    entries++
    for (const u of it.updates ?? []) {
      const photos: string[] = []
      for (const img of u.images ?? []) { const p = await copyPhoto(s, opts.boardId, img); if (p) photos.push(p); else photosMissed++ }
      const when = dayMonth(u.when)
      await s.from('planner_shared_replies').insert({
        entry_id: (e as any).id, author_id: opts.authorId, body: String(u.body ?? ''),
        links: (u.links ?? []).filter(l => /^https?:\/\//i.test(l)).slice(0, 10), photos,
        ...(when ? { created_at: `${when}T12:00:00Z` } : {}),
      })
      replies++
    }
  }
  return { entries, replies, photosMissed }
}
