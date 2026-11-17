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
  board: { id: string; title: string; member?: string; role?: string; onBoard?: { personId: string; name: string; first: boolean; link: string }[] } | null
  entries: Entry[]
  people?: { id: string; name: string; role: string }[]
  properties?: { id: string; name: string }[]
}

const day = (iso: string | null | undefined) => !iso ? '' : new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })   // a missing date shows nothing, never a crash
const input = 'w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-base sm:text-sm text-neutral-900'   // 16px on phones so iPhone doesn't zoom in
const ROLE: Record<string, string> = { cleaner: 'Cleaner', contractor: 'Contractor', lettings: 'Lettings', landlord: 'Landlord' }

/** Planner requests: signed in as usual, or — opened from a planner link (/p/<token>) — carrying the link instead. */
export function plannerFetch(url: string, init: RequestInit = {}) {
  const link = typeof window !== 'undefined' ? (window as any).__crosPlannerLink as string | undefined : undefined
  if (!link) return adminFetch(url, init)
  const headers = new Headers(init.headers); headers.set('x-planner-link', link)
  return fetch(url, { ...init, headers })
}

// phone photos are often 3–8 MB — over what the server takes in one go (about 4 MB). Shrunk on the device first to a
// sharp 2000px JPEG (17 Nov 2026: "uploaded a pic … but it failed")
async function shrink(f: File): Promise<File> {
  if (f.size < 1_500_000 && /jpeg|png|webp/.test(f.type)) return f
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f
  } catch { return f }
}

export async function uploadPhotos(boardId: string, files: FileList | null): Promise<Photo[]> {
  const out: Photo[] = []
  for (const raw of Array.from(files ?? []).slice(0, 6)) {
    const f = await shrink(raw)
    const fd = new FormData(); fd.append('file', f); fd.append('boardId', boardId)
    const r = await plannerFetch('/api/planner/shared/upload', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? (r.status === 413 ? 'That photo is too big — try a screenshot of it' : 'Photo not uploaded — try again'))
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
          {/* share: type who — opens their board if there is one, starts one if not (17 Nov: no permanent list to wade through) */}
          <div className="rounded-xl border border-neutral-300 bg-white p-md space-y-sm">
            <p className="text-sm font-bold text-neutral-900">Share with…</p>
            <PersonSearch people={data.people ?? []} value="" post={post} onPick={async pid => {
              const had = (data.boards ?? []).find(b => b.personId === pid)
              if (had) { setBoardId(had.id); return }
              try { const d = await post({ action: 'create_board', personId: pid }); setBoardId(d.boardId); await load(d.boardId) } catch (e) { setError(e instanceof Error ? e.message : 'Not created') }
            }} />
            <p className="text-[11px] text-neutral-500">Type a name or email — anyone, including a friend not in CROS. They get a link to just their board, no sign-in.</p>
          </div>
          {(() => {
            const bs = [...(data.boards ?? [])].sort((x, y) => y.open - x.open)
            const active = bs.filter(b => b.open > 0 || b.id === board?.id), quiet = bs.filter(b => !(b.open > 0 || b.id === board?.id))
            const row = (b: typeof bs[number]) => (
              <button key={b.id} type="button" onClick={() => setBoardId(b.id)}
                className={`w-full rounded-lg px-md py-xs text-left ${board?.id === b.id ? 'bg-white ring-1 ring-neutral-900' : 'hover:bg-white'}`}>
                <span className="block truncate text-sm font-semibold text-neutral-900">{b.member}</span>
                <span className="block text-xs text-neutral-500">{ROLE[b.role] ?? b.role}{b.open ? ` · ${b.open} open` : ' · nothing open'}</span>
              </button>
            )
            return bs.length > 0 && (
              <div className="space-y-xs">
                {active.length > 0 && <p className="px-md text-[11px] font-bold uppercase tracking-wide text-neutral-500">Open boards</p>}
                {active.map(row)}
                {quiet.length > 0 && <details><summary className="cursor-pointer px-md py-xs text-xs font-semibold text-neutral-500">Nothing open · {quiet.length}</summary>{quiet.map(row)}</details>}
              </div>
            )
          })()}
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
        {mode === 'office' && board && (
          // who's on this board — one board, two or three people, each with their own link (migration 293)
          <div className="rounded-2xl border border-neutral-200 bg-white px-lg py-md space-y-sm">
            <p className="text-sm font-bold text-neutral-900">People on this board</p>
            <div className="flex flex-wrap gap-sm">{(board.onBoard ?? []).map(m => (
              <span key={m.personId} className="inline-flex items-center gap-xs rounded-full border border-neutral-200 py-0.5 pl-md pr-xs text-sm">
                {m.name}
                <button type="button" title="Copy their link — opens this board as them, no sign-in" className="rounded-full px-sm text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  onClick={async () => { await navigator.clipboard.writeText(m.link).catch(() => {}); alert(`${m.name}’s link is copied — paste it in a text or email. It opens this board as them, no sign-in.`) }}>Copy link</button>
                {!m.first && <button type="button" title="Take them off this board" className="rounded-full px-xs text-xs text-neutral-400 hover:text-red-700"
                  onClick={async () => { if (!confirm(`Take ${m.name} off this board? Their link stops working.`)) return; try { await post({ action: 'remove_member', boardId: board.id, personId: m.personId }); await load(board.id) } catch (e) { setError(e instanceof Error ? e.message : 'Not removed') } }}>✕</button>}
              </span>
            ))}</div>
            <div className="max-w-md"><PersonSearch people={data.people ?? []} value="" post={post} onPick={async pid => {
              try { const d = await post({ action: 'add_member', boardId: board.id, personId: pid }); await navigator.clipboard.writeText(d.link).catch(() => {}); await load(board.id); alert('Added — their own link is copied. Paste it in a text or email; it opens this board, no sign-in.') } catch (e) { setError(e instanceof Error ? e.message : 'Not added') }
            }} /></div>
            <p className="text-[11px] text-neutral-500">Add someone else to this same board — type a name or email. Everyone sees and edits the one list, and their notes carry their own name.</p>
          </div>
        )}
        {mode === 'office' && board && <EmailBoard key={board.id} boardId={board.id} member={board.member ?? "them"} post={post} />}
        {mode === 'office' && board && (() => {
          // the same item more than once (the board was shared more than once before 4 Nov 2026) — one press tidies it
          const keys = data.entries.map(e => `${String(e.title).trim().toLowerCase()}|${e.property ?? ''}`)
          const repeats = keys.length - new Set(keys).size
          return (
            <div className="flex flex-wrap items-center justify-between gap-sm rounded-2xl border border-neutral-200 bg-white px-lg py-sm">
              {repeats > 0
                ? <p className="text-sm font-semibold text-amber-800">{repeats} item{repeats === 1 ? ' is' : 's are'} on this board more than once (it was shared more than once).</p>
                : <p className="text-sm text-neutral-600">{data.entries.length} item{data.entries.length === 1 ? '' : 's'} shared with {board.member}.</p>}
              <span className="flex flex-wrap gap-sm">
                {repeats > 0 && <button type="button" className="rounded-xl bg-neutral-900 px-md py-xs text-sm font-bold text-white" onClick={async () => {
                  if (!confirm(`Remove the ${repeats} repeated item${repeats === 1 ? '' : 's'}? The first copy of each stays, with its notes. Anything ${board.member} has replied to is kept.`)) return
                  try { const d = await post({ action: 'remove_duplicates', boardId: board.id }); setError(''); await load(board.id); alert(`Removed ${d.removed} repeated item${d.removed === 1 ? '' : 's'}.`) } catch (e) { setError(e instanceof Error ? e.message : 'Not removed') }
                }}>Remove the repeats</button>}
                <button type="button" className="rounded-xl border border-neutral-300 px-md py-xs text-sm font-semibold text-red-700" onClick={async () => {
                  if (!confirm(`Stop sharing this board with ${board.member}? They won’t see it any more. Nothing is deleted — you can start a new board with them later.`)) return
                  try { await post({ action: 'archive_board', boardId: board.id }); setBoardId(undefined); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Not stopped') }
                }}>Stop sharing</button>
              </span>
            </div>
          )
        })()}
        {/* every board in the planner layout they see (4 Nov 2026 — it was only landlords') */}
        {mode === 'office' && board ? (
          // their board: the same grid they see in their app, editable here (components/LandlordPlanner)
          <div className="pub rounded-2xl border border-neutral-200 bg-white p-6 md:p-8">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" precedence="default" />
            <p className="pub-eyebrow m-0 mb-1">With {board.member} · what they see in their app</p>
            <div className="mb-6 flex flex-wrap items-baseline gap-3">
              <h2 className="pub-h2 m-0">{board.title && !/& Capital Rooms$/.test(board.title) ? board.title : 'Planner'}</h2>
              <button type="button" className="text-[13px] underline text-neutral-500" onClick={async () => {
                const nm = prompt('Name this board (everyone on it sees this)', board.title ?? ''); if (!nm?.trim()) return
                try { await post({ action: 'rename_board', boardId: board.id, title: nm.trim() }); await load(board.id) } catch (e) { setError(e instanceof Error ? e.message : 'Not renamed') }
              }}>Rename</button>
            </div>
            <LandlordPlanner key={board.id} officeBoardId={board.id} />
          </div>
        ) : !board ? (
          <p className="rounded-2xl border border-neutral-200 bg-white p-lg text-sm text-neutral-600">
            {mode === 'office' ? 'Type who you want to share with on the left — or pick an open board. Notes, jobs, photo ideas and links, and they reply in their app.' : 'Nothing shared with you yet — when the office adds something it appears here.'}
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

// A planner for anyone — a contractor we rarely use, a friend with a property — by name and email or mobile; the link is
// copied to send them (17 Nov 2026)
function NewPersonBoard({ post, onMade, startOpen = false }: { post: (b: Record<string, unknown>) => Promise<any>; onMade: (id: string) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [f, setF] = useState({ name: '', email: '', phone: '', kind: 'contractor' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-50">＋ New planner for anyone</button>
  return (
    <div className="space-y-sm rounded-xl border border-neutral-300 bg-white p-md">
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">New planner for anyone</p>
      <input className={input} placeholder="Their name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <input className={input} type="email" placeholder="Email (optional)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <input className={input} placeholder="Mobile (optional)" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
      <select className={input} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
        <option value="contractor">A contractor</option><option value="friend">A friend or owner — ideas for their property</option><option value="landlord">A landlord</option><option value="cleaner">A cleaner</option>
      </select>
      <button type="button" disabled={busy || !f.name.trim()} className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-bold text-white disabled:opacity-40" onClick={async () => {
        setBusy(true); setMsg('')
        try { const d = await post({ action: 'new_person_board', ...f }); await navigator.clipboard.writeText(d.link).catch(() => {}); setMsg('Made — the link is copied. Paste it in a text or email; it opens just this planner, no sign-in.'); onMade(d.boardId) }
        catch (e) { setMsg(e instanceof Error ? e.message : 'Not made') } finally { setBusy(false) }
      }}>{busy ? 'Making…' : 'Make planner and copy link'}</button>
      {msg && <p className="text-xs font-semibold text-neutral-700">{msg}</p>}
      <button type="button" onClick={() => setOpen(false)} className="w-full text-xs text-neutral-500">Close</button>
    </div>
  )
}

// Email the person their board (4 Nov 2026): a test to you first, word for word, then to them — their copy's button
// signs them straight into their planner.
export function EmailBoard({ boardId, member, post }: { boardId: string; member: string; post: (b: Record<string, unknown>) => Promise<any> }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [onFile, setOnFile] = useState('')
  const [to, setTo] = useState('')
  const [shown, setShown] = useState<{ to: string; subject: string; html: string } | null>(null)
  async function preview() {
    setMsg(null)
    try { setShown(await post({ action: 'email_board', boardId, message, show: true, to: elsewhere ? to.trim() : undefined })) }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t make the preview' }) }
  }
  const [asked, setAsked] = useState(false)   // look the address up once, when the panel opens
  useEffect(() => { if (!open || asked) return; setAsked(true); post({ action: 'email_board', boardId, preview: true }).then(d => { setOnFile(d.to ?? ''); setTo(d.to ?? '') }).catch(() => {}) }, [open, asked, boardId, post])
  const elsewhere = !!to.trim() && to.trim().toLowerCase() !== onFile.toLowerCase()
  async function send(test: boolean) {
    if (!test && !confirm(elsewhere
      ? `Send ${member}'s planner to ${to.trim()}?\n\nAnyone with the email can open this planner, so only send it to the right person.`
      : `Email ${member} their planner at ${to.trim() || onFile}, with a button that opens it (no sign-in)?`)) return
    setBusy(test ? 'test' : 'send'); setMsg(null)
    try { const d = await post({ action: 'email_board', boardId, message, test, to: elsewhere ? to.trim() : undefined }); setMsg({ ok: true, text: test ? `Test sent to ${d.to} — exactly what ${member} will get.` : `Sent to ${member} (${d.to}).` }) }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Not sent' }) }
    finally { setBusy('') }
  }
  if (!open) return (
    <div className="flex flex-wrap items-center justify-between gap-sm rounded-2xl border border-neutral-200 bg-white px-lg py-sm">
      <p className="text-sm text-neutral-700">Let {member} know it’s there — an email with a button that opens their planner. No sign-in, no account.</p>
      <div className="flex flex-wrap gap-sm">
        {/* a link that opens just this planner, no sign-in — to text or email to anyone, e.g. a contractor we rarely use (17 Nov 2026) */}
        <button type="button" onClick={async () => {
          try { const d = await post({ action: 'link', boardId }); await navigator.clipboard.writeText(d.link); setMsg({ ok: true, text: `Link copied — paste it in a text or email to ${member}. It opens just this planner, no sign-in.` }) }
          catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t make the link' }) }
        }} className="rounded-xl border border-neutral-300 px-md py-xs text-sm font-semibold">Copy planner link</button>
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-neutral-900 px-md py-xs text-sm font-bold text-white">Email them the board…</button>
      </div>
      {msg && <p className={`w-full text-sm font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  )
  return (
    <div className="space-y-sm rounded-2xl border-2 border-neutral-900 bg-white p-lg">
      <div className="flex items-start justify-between gap-md">
        <h2 className="text-lg font-bold text-neutral-900">Email {member} their planner</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-neutral-500">Close</button>
      </div>
      <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500">To
        <input type="email" className={`${input} mt-1 normal-case tracking-normal`} value={to} onChange={e => setTo(e.target.value)} placeholder={onFile || 'their email address'} />
      </label>
      {elsewhere && <p className="text-xs font-semibold text-amber-800">Not the address on their profile ({onFile || 'none'}). Anyone with the email can open this planner.</p>}
      <textarea rows={4} className={input} value={message} onChange={e => setMessage(e.target.value)} placeholder="A line from you (optional) — otherwise it says we’ve set up a shared planner for the two of you." />
      <p className="text-xs text-neutral-500">It shows the board’s name and what’s open on it, and a button that signs them straight in (no password needed). Send yourself a test first to see exactly what they’ll get — your copy’s button opens the board as you see it.</p>
      <div className="flex flex-wrap gap-sm">
        <button type="button" onClick={preview} disabled={!!busy} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold disabled:opacity-40">Preview the email</button>
        <button type="button" onClick={() => send(true)} disabled={!!busy} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold disabled:opacity-40">{busy === 'test' ? 'Sending…' : 'Send me a test'}</button>
        <button type="button" onClick={() => send(false)} disabled={!!busy} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy === 'send' ? 'Sending…' : `Send to ${to.trim() || member}`}</button>
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      {shown && (
        <div className="space-y-xs rounded-xl border border-neutral-300 bg-neutral-50 p-sm">
          <div className="flex items-start justify-between gap-sm text-xs"><span><b>To</b> {shown.to}<br /><b>Subject</b> {shown.subject}</span><button type="button" onClick={() => setShown(null)} className="font-semibold text-neutral-600">Hide</button></div>
          <iframe title="The email as they'll get it" srcDoc={shown.html} sandbox="" className="h-[620px] w-full rounded-lg border border-neutral-200 bg-white" />
          <p className="text-xs text-neutral-500">Exactly what they’ll get — nothing has been sent. In theirs, the button signs them straight into their planner.</p>
        </div>
      )}
    </div>
  )
}

// Share with: type a name or an email (17 Nov 2026, Harry: "just want to be able to type in harry.bu@hotmail.com"). An
// email that isn't in CROS yet adds them as a friend/owner and uses them.
function PersonSearch({ people, value, onPick, post }: { people: { id: string; name: string; role: string; email?: string }[]; value: string; onPick: (id: string) => void; post: (b: Record<string, unknown>) => Promise<any> }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const picked = people.find(p => p.id === value)
  const t = q.trim().toLowerCase()
  const hits = t.length < 2 ? [] : people.filter(p => p.name.toLowerCase().includes(t) || (p.email ?? '').toLowerCase().includes(t)).slice(0, 8)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim())
  if (picked) return (
    <div className={`${input} flex items-center justify-between gap-2`}>
      <span className="truncate">Share with <b>{picked.name}</b>{picked.email ? ` · ${picked.email}` : ''}</span>
      <button type="button" onClick={() => { onPick(''); setQ('') }} className="text-xs font-semibold text-neutral-500">Change</button>
    </div>
  )
  return (
    <div className="relative">
      <input className={input} placeholder="Share with — type a name or email" value={q} onChange={e => setQ(e.target.value)} />
      {(hits.length > 0 || isEmail) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          {hits.map(p => <button key={p.id} type="button" onClick={() => onPick(p.id)} className="block w-full px-md py-sm text-left text-sm hover:bg-neutral-50"><b>{p.name}</b> <span className="text-neutral-500">· {ROLE[p.role] ?? p.role}{p.email ? ` · ${p.email}` : ''}</span></button>)}
          {isEmail && !hits.some(p => (p.email ?? '').toLowerCase() === t) && (
            <button type="button" disabled={busy} onClick={async () => {
              setBusy(true)
              try { const d = await post({ action: 'new_person_board', name: q.trim().split('@')[0], email: q.trim(), kind: 'friend' }); people.push({ id: d.personId, name: q.trim(), role: 'landlord', email: q.trim() }); onPick(d.personId) } catch { /* shown on share */ } finally { setBusy(false) }
            }} className="block w-full border-t border-neutral-100 px-md py-sm text-left text-sm font-semibold hover:bg-neutral-50">{busy ? 'Adding…' : `＋ Share with ${q.trim()} (new — no sign-in needed)`}</button>
          )}
        </div>
      )}
    </div>
  )
}

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
          <p className="text-xs text-neutral-500">Do this once per board. After that it stays linked: anything you add or change on your planner board shows up for everyone on the shared board by itself — no resending.</p>
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">Close</button>
      </div>
      {!boards ? <p className="text-sm text-neutral-500">{err || 'Loading your planner…'}</p> : (
        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
          <select className={input} value={boardId} onChange={e => pick(e.target.value)}>
            <option value="">Which of your boards?</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.title} · {b.items.length} items</option>)}
          </select>
          <PersonSearch people={people} value={personId} onPick={setPersonId} post={post} />
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
