'use client'

// The shared planner (migration 200): a board between the office and one person. The office sees every board and
// starts new ones; a cleaner, contractor or lettings user sees their own. Entries carry notes, a property, a due
// date, links and photos; replies go underneath; either side ticks an entry off. Data: /api/planner/shared.

import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import LandlordPlanner from '@/components/LandlordPlanner'

export interface Photo { path: string; url: string | null }
interface Reply { id: string; body: string; author: string; createdAt: string; links: string[]; photos: Photo[] }
interface Entry {
  id: string; title: string; body: string; status: 'open' | 'done'; dueDate: string | null; createdAt: string
  property: string | null; author: string; links: string[]; photos: Photo[]; replies: Reply[]
}
interface Data {
  office: boolean; setupNeeded?: boolean
  boards?: { id: string; title: string; member: string; role: string; open: number; personId?: string }[]
  board: { id: string; title: string; member?: string; role?: string } | null
  entries: Entry[]
  people?: { id: string; name: string; role: string }[]
  properties?: { id: string; name: string }[]
}

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
const input = 'w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-base sm:text-sm text-neutral-900'   // 16px on phones so iPhone doesn't zoom in
const ROLE: Record<string, string> = { cleaner: 'Cleaner', contractor: 'Contractor', lettings: 'Lettings', landlord: 'Landlord' }

export async function uploadPhotos(boardId: string, files: FileList | null): Promise<Photo[]> {
  const out: Photo[] = []
  for (const f of Array.from(files ?? []).slice(0, 6)) {
    const fd = new FormData(); fd.append('file', f); fd.append('boardId', boardId)
    const r = await adminFetch('/api/planner/shared/upload', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Photo not uploaded')
    out.push({ path: d.path, url: d.url })
  }
  return out
}

function Attachments({ links, photos }: { links: string[]; photos: Photo[] }) {
  if (!links.length && !photos.length) return null
  return (
    <div className="mt-sm space-y-xs">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-sm">
          {photos.map(p => p.url && (
            <a key={p.path} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover border border-neutral-200" /></a>
          ))}
        </div>
      )}
      {links.map(l => <a key={l} href={l} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-blue-700 hover:underline">{l.replace(/^https?:\/\//, '')}</a>)}
    </div>
  )
}

function Composer({ boardId, placeholder, onSend, withTitle, properties }: {
  boardId: string; placeholder: string; withTitle?: boolean; properties?: { id: string; name: string }[]
  onSend: (v: { title: string; body: string; links: string; photos: string[]; propertyId: string; dueDate: string }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [links, setLinks] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function add(files: FileList | null) {
    setBusy(true); setErr('')
    try { setPhotos([...photos, ...(await uploadPhotos(boardId, files))]) } catch (e) { setErr(e instanceof Error ? e.message : 'Photo not uploaded') }
    finally { setBusy(false) }
  }
  async function send() {
    setBusy(true); setErr('')
    try {
      await onSend({ title, body, links, photos: photos.map(p => p.path), propertyId, dueDate })
      setTitle(''); setBody(''); setLinks(''); setPhotos([]); setPropertyId(''); setDueDate('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Not sent') }
    finally { setBusy(false) }
  }
  return (
    <div className="space-y-sm">
      {withTitle && <input className={input} placeholder="Note — e.g. Gutter at the back needs clearing" value={title} onChange={e => setTitle(e.target.value)} />}
      <textarea rows={withTitle ? 3 : 2} className={input} placeholder={placeholder} value={body} onChange={e => setBody(e.target.value)} />
      {withTitle && (
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
          {properties && (
            <select className={input} value={propertyId} onChange={e => setPropertyId(e.target.value)}>
              <option value="">No property</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-sm text-sm text-neutral-600">Due <input type="date" className={input} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
        </div>
      )}
      <input className={input} placeholder="Links (optional) — paste one or more" value={links} onChange={e => setLinks(e.target.value)} />
      {photos.length > 0 && <div className="flex flex-wrap gap-sm">{photos.map(p => p.url && <img key={p.path} src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover" />)}</div>}
      {err && <p className="text-xs text-red-700">{err}</p>}
      <div className="flex flex-wrap items-center gap-sm">
        <label className="cursor-pointer rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
          Add photos<input type="file" accept="image/*" multiple className="hidden" onChange={e => add(e.target.files)} />
        </label>
        <button type="button" onClick={send} disabled={busy || (withTitle ? !title.trim() : !body.trim() && !links.trim() && !photos.length)}
          className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Sending…' : withTitle ? 'Post' : 'Reply'}</button>
      </div>
    </div>
  )
}

export default function SharedPlanner({ mode, initialBoard }: { mode: 'office' | 'member'; initialBoard?: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [boardId, setBoardId] = useState<string | undefined>(initialBoard)
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [startWith, setStartWith] = useState('')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async (id?: string) => {
    const r = await adminFetch(`/api/planner/shared${id ? `?board=${id}` : ''}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load the planner'); return }
    setData(d); setError('')
  }, [])
  useEffect(() => { load(boardId) }, [load, boardId])

  async function post(body: Record<string, unknown>) {
    const r = await adminFetch('/api/planner/shared', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Not saved')
    return d
  }

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-800">{error}</p>
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>
  if (data.setupNeeded) return <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-md text-sm text-amber-900">The shared planner needs migration 200 running in Supabase.</p>

  const open = data.entries.filter(e => e.status === 'open')
  const done = data.entries.filter(e => e.status === 'done')
  const board = data.board

  return (
    <div className={mode === 'office' ? 'grid grid-cols-1 gap-lg lg:grid-cols-[260px_minmax(0,1fr)]' : ''}>
      {mode === 'office' && (
        <aside className="space-y-sm">
          {(data.boards ?? []).map(b => (
            <button key={b.id} type="button" onClick={() => setBoardId(b.id)}
              className={`w-full rounded-xl border px-md py-sm text-left ${board?.id === b.id ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-white/60 hover:bg-white'}`}>
              <span className="block text-sm font-bold text-neutral-900">{b.member}</span>
              <span className="block text-xs text-neutral-500">{ROLE[b.role] ?? b.role}{b.open ? ` · ${b.open} open` : ''}</span>
            </button>
          ))}
          <div className="rounded-xl border border-dashed border-neutral-300 p-md space-y-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Start a board with</p>
            <select className={input} value={startWith} onChange={e => setStartWith(e.target.value)}>
              <option value="">Choose a person…</option>
              {(data.people ?? []).filter(p => !(data.boards ?? []).some(b => b.member === p.name)).map(p => <option key={p.id} value={p.id}>{p.name} · {ROLE[p.role] ?? p.role}</option>)}
            </select>
            <button type="button" disabled={!startWith} className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-bold text-white disabled:opacity-40"
              onClick={async () => { try { const d = await post({ action: 'create_board', personId: startWith }); setStartWith(''); setBoardId(d.boardId) } catch (e) { setError(e instanceof Error ? e.message : 'Not created') } }}>
              Start board
            </button>
            <p className="text-[11px] text-neutral-500">Landlord boards are for chosen project landlords only.</p>
          </div>
          <button type="button" onClick={() => setImporting(true)}
            className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
            ⇪ Bring in a board from your planner
            <span className="block text-xs font-normal text-neutral-500">Share what you’ve already written — nothing to retype</span>
          </button>
        </aside>
      )}

      <section className="min-w-0 space-y-md">
        {mode === 'office' && importing && (
          <ImportPanel people={data.people ?? []} preselect={data.board?.id ? (data.boards ?? []).find(b => b.id === data.board!.id)?.personId : undefined}
            post={post} onClose={() => setImporting(false)}
            onDone={async id => { setImporting(false); setBoardId(id); await load(id) }} />
        )}
        {mode === 'office' && board && board.role === 'landlord' ? (
          // a landlord's board: the same grid they see in their app, editable here (components/LandlordPlanner)
          <div className="pub rounded-2xl border border-neutral-200 bg-white p-6 md:p-8">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" precedence="default" />
            <p className="pub-eyebrow m-0 mb-1">With {board.member} · what they see in their app</p>
            <h2 className="pub-h2 mb-6">Planner</h2>
            <LandlordPlanner key={board.id} officeBoardId={board.id} />
          </div>
        ) : !board ? (
          <p className="rounded-2xl border border-neutral-200 bg-white p-lg text-sm text-neutral-600">
            {mode === 'office' ? 'Start a board with someone to share notes, jobs and photo ideas with them.' : 'Nothing shared with you yet — when the office adds something it appears here.'}
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
              <h2 className="text-lg font-bold text-neutral-900">{mode === 'office' ? `With ${board.member}` : 'With Capital Rooms'}</h2>
              <p className="mb-md text-xs text-neutral-500">{mode === 'office' ? 'They get a notification for each new entry and reply.' : 'The office gets a notification when you post or reply.'}</p>
              <Composer boardId={board.id} withTitle placeholder="Description (optional)" properties={mode === 'office' ? data.properties : undefined}
                onSend={async v => { await post({ action: 'entry', boardId: board.id, ...v }); await load(board.id) }} />
            </div>

            {open.length === 0 && <p className="text-sm text-neutral-500">Nothing open.</p>}
            {open.map(e => <EntryCard key={e.id} e={e} boardId={board.id} post={post} reload={() => load(board.id)} />)}

            {done.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowDone(v => !v)} className="text-sm font-semibold text-neutral-500 hover:text-neutral-800">{showDone ? '▼' : '▶'} Done ({done.length})</button>
                {showDone && <div className="mt-sm space-y-md opacity-75">{done.map(e => <EntryCard key={e.id} e={e} boardId={board.id} post={post} reload={() => load(board.id)} />)}</div>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function EntryCard({ e, boardId, post, reload }: { e: Entry; boardId: string; post: (b: Record<string, unknown>) => Promise<any>; reload: () => Promise<void> }) {
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)
  async function toggle() {
    setBusy(true)
    try { await post({ action: 'status', entryId: e.id, status: e.status === 'open' ? 'done' : 'open' }); await reload() } finally { setBusy(false) }
  }
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <h3 className="font-bold text-neutral-900">{e.title}</h3>
          <p className="text-xs text-neutral-500">{[e.property, e.dueDate ? `due ${day(e.dueDate)}` : '', `${e.author} · ${day(e.createdAt)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={toggle} disabled={busy}
          className={`shrink-0 rounded-xl px-md py-xs text-sm font-bold ${e.status === 'open' ? 'border border-green-700 text-green-800 hover:bg-green-50' : 'border border-neutral-300 text-neutral-600'}`}>
          {e.status === 'open' ? '✓ Done' : 'Reopen'}
        </button>
      </div>
      {e.body && <p className="mt-sm whitespace-pre-wrap text-sm text-neutral-800">{e.body}</p>}
      <Attachments links={e.links} photos={e.photos} />
      {e.replies.length > 0 && (
        <div className="mt-md space-y-sm border-t border-neutral-100 pt-md">
          {e.replies.map(r => (
            <div key={r.id} className="rounded-xl bg-neutral-50 px-md py-sm">
              <p className="text-xs font-semibold text-neutral-600">{r.author} · {day(r.createdAt)}</p>
              {r.body && <p className="whitespace-pre-wrap text-sm text-neutral-800">{r.body}</p>}
              <Attachments links={r.links} photos={r.photos} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-md">
        {replying
          ? <Composer boardId={boardId} placeholder="Reply…" onSend={async v => { await post({ action: 'reply', entryId: e.id, body: v.body, links: v.links, photos: v.photos }); setReplying(false); await reload() }} />
          : <button type="button" onClick={() => setReplying(true)} className="text-sm font-semibold text-blue-700 hover:underline">Reply</button>}
      </div>
    </article>
  )
}

// ── Bring a board in from the office's own Planner (lib/planner/importBoard) ──────────────────────────────────────
interface PItem { id: string; groupName: string; title: string; status: string; responsible?: string; date?: string; updates?: { body?: string; images?: string[] }[] }
interface PBoard { id: string; title: string; subtitle?: string; items: PItem[] }
const PSTATUS: Record<string, string> = { discuss: 'To discuss', discussed: 'Discussed', progress: 'In progress', done: 'Done', parked: 'Parked' }

function ImportPanel({ people, preselect, post, onClose, onDone }: {
  people: { id: string; name: string; role: string }[]; preselect?: string
  post: (b: Record<string, unknown>) => Promise<any>; onClose: () => void; onDone: (boardId: string) => Promise<void>
}) {
  const [boards, setBoards] = useState<PBoard[] | null>(null)
  const [boardId, setBoardId] = useState('')
  const [personId, setPersonId] = useState(preselect ?? '')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    adminFetch('/api/admin/planner').then(r => r.json()).then(d => setBoards((d.boards ?? []) as PBoard[])).catch(() => setErr('Your planner didn’t load'))
  }, [])
  const src = boards?.find(b => b.id === boardId) ?? null
  function pick(id: string) {
    setBoardId(id)
    const b = boards?.find(x => x.id === id)
    setTicked(new Set((b?.items ?? []).map(i => i.id)))
    // a board named after someone ("Richard") — suggest them
    if (b && !personId) { const first = b.title.trim().split(/\s+/)[0].toLowerCase(); const hit = people.filter(p => p.name.toLowerCase().split(/\s+/).includes(first)); if (hit.length === 1) setPersonId(hit[0].id) }
  }
  const groups = src ? Array.from(new Set(src.items.map(i => i.groupName))) : []
  const who = people.find(p => p.id === personId)
  async function go() {
    if (!src || !personId || !ticked.size) return
    setBusy(true); setErr('')
    try {
      const d = await post({ action: 'import_board', personId, plannerBoardId: src.id, itemIds: [...ticked] })
      await onDone(d.boardId)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Not shared') }
    finally { setBusy(false) }
  }
  return (
    <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg space-y-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Bring in a board from your planner</h2>
          <p className="text-xs text-neutral-500">Everything ticked is copied across — items, notes, links and photos. Your own planner board stays exactly as it is.</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">Close</button>
      </div>
      {!boards ? <p className="text-sm text-neutral-500">{err || 'Loading your planner…'}</p> : (
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
          <select className={input} value={boardId} onChange={e => pick(e.target.value)}>
            <option value="">Which of your boards?</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.title} · {b.items.length} items</option>)}
          </select>
          <select className={input} value={personId} onChange={e => setPersonId(e.target.value)}>
            <option value="">Share with…</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name} · {ROLE[p.role] ?? p.role}</option>)}
          </select>
        </div>
      )}
      {src && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="text-sm text-neutral-700"><strong>Untick anything {who ? who.name : 'they'} shouldn’t see</strong> — your notes on each item go across too.</p>
            <div className="flex gap-sm text-xs font-semibold">
              <button type="button" className="text-blue-700 hover:underline" onClick={() => setTicked(new Set(src.items.map(i => i.id)))}>Tick all</button>
              <button type="button" className="text-blue-700 hover:underline" onClick={() => setTicked(new Set())}>Untick all</button>
            </div>
          </div>
          <div className="max-h-[50dvh] space-y-md overflow-y-auto rounded-xl border border-neutral-200 p-md">
            {groups.map(g => (
              <div key={g}>
                <p className="mb-xs text-xs font-bold uppercase tracking-wide text-neutral-500">{g}</p>
                <ul className="space-y-xs">
                  {src.items.filter(i => i.groupName === g).map(i => {
                    const on = ticked.has(i.id)
                    const last = i.updates?.length ? i.updates[i.updates.length - 1].body : ''
                    return (
                      <li key={i.id}>
                        <label className={`flex cursor-pointer gap-sm rounded-lg px-sm py-xs ${on ? 'bg-neutral-50' : 'opacity-50'}`}>
                          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={on}
                            onChange={() => setTicked(t => { const n = new Set(t); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n })} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-neutral-900">{i.title}</span>
                            <span className="block text-xs text-neutral-500">{[PSTATUS[i.status] ?? i.status, i.responsible, i.date && i.date !== '—' ? i.date : '', i.updates?.length ? `${i.updates.length} note${i.updates.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
                            {last && <span className="block truncate text-xs text-neutral-400">“{last}”</span>}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button type="button" onClick={go} disabled={busy || !personId || !ticked.size}
            className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-bold text-white disabled:opacity-40">
            {busy ? 'Sharing…' : `Share ${ticked.size} item${ticked.size === 1 ? '' : 's'}${who ? ` with ${who.name}` : ''}`}
          </button>
          <p className="text-xs text-neutral-500">They get one notification. Shared items can be ticked off and replied to by both of you.</p>
        </>
      )}
    </div>
  )
}
