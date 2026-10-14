'use client'
// The shared planner as a landlord sees it (14 Oct 2026, Harry: "list view … drop open to expand rather than starting
// expanded … in the onboarding landlord style"). The same board as the office's Shared planner (/api/planner/shared),
// drawn in the landlord-onboarding look (components/public): one line per item under its property, tap to open the
// notes and reply. preview = an administrator "viewing as" the landlord: the same screen, read only.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { uploadPhotos, type Photo } from '@/components/SharedPlanner'

interface Reply { id: string; body: string; author: string; createdAt: string; links: string[]; photos: Photo[] }
interface Entry { id: string; title: string; body: string; status: 'open' | 'done'; dueDate: string | null; createdAt: string; property: string | null; propertyId: string | null; author: string; links: string[]; photos: Photo[]; replies: Reply[] }

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const MUTED = '#6F6B64', RULE = '#D9D5CD'

function Attachments({ links, photos }: { links: string[]; photos: Photo[] }) {
  if (!links.length && !photos.length) return null
  return (
    <div className="mt-3 flex flex-col gap-2">
      {photos.length > 0 && <div className="flex flex-wrap gap-2">{photos.map(p => p.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <a key={p.path} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" className="h-20 w-20 object-cover" /></a>
      ))}</div>}
      {links.map(l => <a key={l} href={l} target="_blank" rel="noreferrer" className="pub-link block truncate text-[14px]">{l.replace(/^https?:\/\//, '')}</a>)}
    </div>
  )
}

export default function LandlordPlanner({ previewBoardId }: { previewBoardId?: string | null }) {
  const readOnly = !!previewBoardId
  const [boardId, setBoardId] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [props, setProps] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/planner/shared${previewBoardId ? `?board=${previewBoardId}` : ''}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Your planner didn’t load. Pull down to refresh.'); return }
    setBoardId(d.board?.id ?? null); setEntries(d.entries ?? []); if (!previewBoardId) setProps(d.properties ?? [])
  }, [previewBoardId])
  useEffect(() => { load() }, [load])

  async function post(body: Record<string, unknown>) {
    const r = await adminFetch('/api/planner/shared', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Not saved')
    return d
  }

  if (error) return <p className="pub-error">{error}</p>
  if (!entries) return <p className="pub-muted m-0 text-[15px]">Loading your planner…</p>
  if (!boardId) return <p className="pub-note">Your planner with Capital Rooms will appear here shortly.</p>

  const live = entries.filter(e => e.status === 'open')
  const done = entries.filter(e => e.status === 'done')
  // grouped under each property, in the order of their houses; anything general last
  const groups = Array.from(new Set(live.map(e => e.property ?? ''))).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'en', { numeric: true }))

  const row = (e: Entry) => <PlannerRow key={e.id} e={e} isOpen={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} readOnly={readOnly} boardId={boardId} post={post} reload={load} />

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="pub-eyebrow m-0">{live.length} open{done.length ? ` · ${done.length} done` : ''}</p>
        {!readOnly && !adding && <button type="button" className="pub-btn-ghost" onClick={() => setAdding(true)}>Add something</button>}
      </div>

      {adding && boardId && <Composer boardId={boardId} properties={props} onCancel={() => setAdding(false)}
        onSend={async v => { await post({ action: 'entry', boardId, ...v }); setAdding(false); await load() }} />}

      {live.length === 0 && <p className="pub-muted m-0 text-[15px]">Nothing open right now.</p>}
      {groups.map(g => (
        <div key={g || 'general'}>
          <p className="pub-eyebrow m-0 mb-3" style={{ color: '#111' }}>{g || 'General'}</p>
          <div style={{ borderTop: '1px solid #111' }}>{live.filter(e => (e.property ?? '') === g).map(row)}</div>
        </div>
      ))}

      {done.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDone(v => !v)} className="pub-eyebrow inline-flex min-h-[44px] items-center" style={{ color: '#111' }}>
            {showDone ? '− ' : '+ '}Done ({done.length})
          </button>
          {showDone && <div style={{ borderTop: '1px solid #111' }}>{done.map(row)}</div>}
        </div>
      )}
    </div>
  )
}

function PlannerRow({ e, isOpen, onToggle, readOnly, boardId, post, reload }: {
  e: Entry; isOpen: boolean; onToggle: () => void; readOnly: boolean; boardId: string
  post: (b: Record<string, unknown>) => Promise<any>; reload: () => Promise<void>
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [first, ...rest] = (e.body || '').split('\n')
  const notes = e.replies.length
  const last = notes ? e.replies[notes - 1].createdAt : null
  // the line under the title: status line / first line of the notes, the due date, and how many notes
  const sub = [first?.trim(), e.dueDate ? `due ${day(e.dueDate)}` : '', notes ? `${notes} note${notes === 1 ? '' : 's'} · last ${day(last!)}` : ''].filter(Boolean).join(' · ')

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr('')
    try { await fn(); await reload() } catch (x) { setErr(x instanceof Error ? x.message : 'Not saved') } finally { setBusy(false) }
  }

  return (
    <div style={{ borderBottom: `1px solid ${RULE}` }}>
      <button type="button" onClick={onToggle} aria-expanded={isOpen}
        className="flex w-full items-center gap-4 bg-transparent py-5 text-left" style={{ color: '#111', minHeight: 64 }}>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] font-medium leading-snug md:text-[19px]" style={{ textDecoration: e.status === 'done' ? 'line-through' : 'none', textDecorationColor: '#B9B4AA' }}>{e.title}</span>
          {sub && <span className="truncate text-[13px]" style={{ color: MUTED }}>{sub}</span>}
        </span>
        <span className="pub-serif shrink-0 text-[28px] leading-none" aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-5 pb-8">
          {rest.join('\n').trim() && <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>{rest.join('\n').trim()}</p>}
          <Attachments links={e.links} photos={e.photos} />
          {e.replies.length > 0 && (
            <div className="flex flex-col gap-4" style={{ borderLeft: '1px solid #111', paddingLeft: 16 }}>
              {e.replies.map(r => (
                <div key={r.id}>
                  <p className="pub-eyebrow m-0 mb-1">{r.author} · {day(r.createdAt)}</p>
                  {r.body && <p className="m-0 whitespace-pre-wrap text-[15px] leading-relaxed">{r.body}</p>}
                  <Attachments links={r.links} photos={r.photos} />
                </div>
              ))}
            </div>
          )}
          {!readOnly && (
            <>
              <label className="pub-label">Add a note
                <textarea className="pub-input" value={reply} onChange={x => setReply(x.target.value)} placeholder="Write a reply…" />
              </label>
              {err && <p className="pub-error">{err}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="pub-btn" disabled={busy || !reply.trim()}
                  onClick={() => act(async () => { await post({ action: 'reply', entryId: e.id, body: reply }); setReply('') })}>{busy ? 'Saving…' : 'Reply'}</button>
                <button type="button" className="pub-btn-ghost" disabled={busy}
                  onClick={() => act(() => post({ action: 'status', entryId: e.id, status: e.status === 'open' ? 'done' : 'open' }))}>{e.status === 'open' ? 'Mark as done' : 'Reopen'}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Composer({ boardId, properties, onSend, onCancel }: {
  boardId: string; properties: { id: string; name: string }[]; onCancel: () => void
  onSend: (v: { title: string; body: string; links: string; photos: string[]; propertyId: string; dueDate: string }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? properties[0].id : '')
  const [dueDate, setDueDate] = useState('')
  const [links, setLinks] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function add(files: FileList | null) {
    setBusy(true); setErr('')
    try { setPhotos([...photos, ...(await uploadPhotos(boardId, files))]) } catch (x) { setErr(x instanceof Error ? x.message : 'Photo not added') } finally { setBusy(false) }
  }
  async function send() {
    setBusy(true); setErr('')
    try { await onSend({ title, body, links, photos: photos.map(p => p.path), propertyId, dueDate }) } catch (x) { setErr(x instanceof Error ? x.message : 'Not sent') } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-6 py-6" style={{ borderTop: '1px solid #111', borderBottom: '1px solid #111' }}>
      <label className="pub-label">What’s it about? *
        <input className="pub-input" value={title} onChange={x => setTitle(x.target.value)} placeholder="Gutter at the back needs clearing" />
      </label>
      {properties.length > 0 && (
        <label className="pub-label">Property
          <select className="pub-input" value={propertyId} onChange={x => setPropertyId(x.target.value)}>
            <option value="">General — not one property</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <label className="pub-label">Notes
        <textarea className="pub-input" value={body} onChange={x => setBody(x.target.value)} placeholder="Anything we should know" />
      </label>
      <div className="grid gap-6 md:grid-cols-2">
        <label className="pub-label">Needed by
          <input className="pub-input" type="date" value={dueDate} onChange={x => setDueDate(x.target.value)} />
        </label>
        <label className="pub-label">Links
          <input className="pub-input" value={links} onChange={x => setLinks(x.target.value)} placeholder="Paste a link" />
        </label>
      </div>
      {photos.length > 0 && <div className="flex flex-wrap gap-2">{photos.map(p => p.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.path} src={p.url} alt="" className="h-16 w-16 object-cover" />
      ))}</div>}
      {err && <p className="pub-error">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="pub-btn" disabled={busy || !title.trim()} onClick={send}>{busy ? 'Saving…' : 'Post'}</button>
        <label className="pub-btn-ghost cursor-pointer">Add photos<input type="file" accept="image/*" multiple className="hidden" onChange={x => add(x.target.files)} /></label>
        <button type="button" className="pub-eyebrow min-h-[44px]" style={{ color: '#111' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
